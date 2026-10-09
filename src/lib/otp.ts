import { getRedis, OTP_KEY, OTP_LOCK_KEY, OTP_ATTEMPTS_KEY, OTP_RESEND_KEY } from './redis'
import type { OtpVerifyResult } from '../types'

const OTP_EXPIRY     = parseInt(process.env.OTP_EXPIRY_SECONDS  || '300')   // 5 min
const MAX_ATTEMPTS   = parseInt(process.env.OTP_MAX_ATTEMPTS     || '3')
const RESEND_COOLDOWN = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30')
const MAX_RESENDS    = parseInt(process.env.OTP_MAX_RESENDS      || '3')
const LOCKOUT_SECS   = parseInt(process.env.OTP_LOCKOUT_MINUTES  || '15') * 60

// Generate a cryptographically random 6-digit OTP
function generateOtp(): string {
  const digits = '0123456789'
  let otp = ''
  // Use crypto.getRandomValues equivalent in Node
  const { randomInt } = require('crypto')
  for (let i = 0; i < 6; i++) {
    otp += digits[randomInt(0, 10)]
  }
  return otp
}

// Send OTP via MSG91 (or log in dev)
async function sendSms(mobile: string, otp: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[OTP DEV] Mobile: ${mobile} | OTP: ${otp}`)
    return true
  }

  const authKey  = process.env.MSG91_AUTH_KEY!
  const templateId = process.env.MSG91_TEMPLATE_ID!

  try {
    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${mobile}`,  // India country code
        otp,
      }),
    })
    const data = await response.json() as { type: string }
    return data.type === 'success'
  } catch (err) {
    console.error('[OTP] SMS send failed:', err)
    return false
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateAndSendOtp(
  clinicId: string,
  mobile: string
): Promise<{ sent: boolean; isResend: boolean; cooldownRemaining?: number; lockedUntil?: Date }> {
  const redis = getRedis()

  // Check if locked
  const lockExpiry = await redis.get(OTP_LOCK_KEY(clinicId, mobile))
  if (lockExpiry) {
    return {
      sent: false,
      isResend: false,
      lockedUntil: new Date(parseInt(lockExpiry)),
    }
  }

  // Check resend cooldown
  const resendData = await redis.get(OTP_RESEND_KEY(clinicId, mobile))
  if (resendData) {
    const parsed = JSON.parse(resendData) as { count: number; lastSentAt: number }
    const secondsSinceLast = Math.floor((Date.now() - parsed.lastSentAt) / 1000)
    if (secondsSinceLast < RESEND_COOLDOWN) {
      return {
        sent: false,
        isResend: true,
        cooldownRemaining: RESEND_COOLDOWN - secondsSinceLast,
      }
    }
    if (parsed.count >= MAX_RESENDS) {
      // Lock the account for lockout period
      await redis.set(
        OTP_LOCK_KEY(clinicId, mobile),
        Date.now() + LOCKOUT_SECS * 1000,
        'EX',
        LOCKOUT_SECS
      )
      return {
        sent: false,
        isResend: true,
        lockedUntil: new Date(Date.now() + LOCKOUT_SECS * 1000),
      }
    }
  }

  const otp = generateOtp()
  const key = OTP_KEY(clinicId, mobile)

  // Store OTP hash (never store plaintext in prod — hash it)
  const { createHash } = require('crypto')
  const otpHash = createHash('sha256').update(otp).digest('hex')

  await redis.set(key, otpHash, 'EX', OTP_EXPIRY)

  // Reset attempt counter
  await redis.del(OTP_ATTEMPTS_KEY(clinicId, mobile))

  // Update resend tracking
  const existing = resendData ? JSON.parse(resendData) as { count: number; lastSentAt: number } : null
  await redis.set(
    OTP_RESEND_KEY(clinicId, mobile),
    JSON.stringify({
      count: existing ? existing.count + 1 : 1,
      lastSentAt: Date.now(),
    }),
    'EX',
    OTP_EXPIRY
  )

  const sent = await sendSms(mobile, otp)
  return { sent, isResend: !!resendData }
}

export async function verifyOtp(
  clinicId: string,
  mobile: string,
  otp: string
): Promise<OtpVerifyResult> {
  const redis = getRedis()

  // Check lockout
  const lockExpiry = await redis.get(OTP_LOCK_KEY(clinicId, mobile))
  if (lockExpiry) {
    return { success: false, reason: 'LOCKED', lockedUntil: new Date(parseInt(lockExpiry)) }
  }

  const storedHash = await redis.get(OTP_KEY(clinicId, mobile))
  if (!storedHash) {
    return { success: false, reason: 'EXPIRED' }
  }

  const { createHash } = require('crypto')
  const inputHash = createHash('sha256').update(otp).digest('hex')

  if (inputHash !== storedHash) {
    // Increment attempts
    const attemptsKey = OTP_ATTEMPTS_KEY(clinicId, mobile)
    const attempts = await redis.incr(attemptsKey)
    await redis.expire(attemptsKey, OTP_EXPIRY)

    if (attempts >= MAX_ATTEMPTS) {
      // Lock
      await redis.set(
        OTP_LOCK_KEY(clinicId, mobile),
        Date.now() + LOCKOUT_SECS * 1000,
        'EX',
        LOCKOUT_SECS
      )
      await redis.del(OTP_KEY(clinicId, mobile))
      return {
        success: false,
        reason: 'LOCKED',
        lockedUntil: new Date(Date.now() + LOCKOUT_SECS * 1000),
      }
    }

    return { success: false, reason: 'INVALID' }
  }

  // ✓ Valid — clean up
  await redis.del(OTP_KEY(clinicId, mobile))
  await redis.del(OTP_ATTEMPTS_KEY(clinicId, mobile))
  await redis.del(OTP_RESEND_KEY(clinicId, mobile))

  return { success: true }
}
