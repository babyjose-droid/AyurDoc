"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndSendOtp = generateAndSendOtp;
exports.verifyOtp = verifyOtp;
const redis_1 = require("./redis");
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY_SECONDS || '300'); // 5 min
const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3');
const RESEND_COOLDOWN = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30');
const MAX_RESENDS = parseInt(process.env.OTP_MAX_RESENDS || '3');
const LOCKOUT_SECS = parseInt(process.env.OTP_LOCKOUT_MINUTES || '15') * 60;
// Generate a cryptographically random 6-digit OTP
function generateOtp() {
    const digits = '0123456789';
    let otp = '';
    // Use crypto.getRandomValues equivalent in Node
    const { randomInt } = require('crypto');
    for (let i = 0; i < 6; i++) {
        otp += digits[randomInt(0, 10)];
    }
    return otp;
}
// Send OTP via MSG91 (or log in dev)
async function sendSms(mobile, otp) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[OTP DEV] Mobile: ${mobile} | OTP: ${otp}`);
        return true;
    }
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    try {
        const response = await fetch('https://control.msg91.com/api/v5/otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authkey: authKey,
            },
            body: JSON.stringify({
                template_id: templateId,
                mobile: `91${mobile}`, // India country code
                otp,
            }),
        });
        const data = await response.json();
        return data.type === 'success';
    }
    catch (err) {
        console.error('[OTP] SMS send failed:', err);
        return false;
    }
}
// ─── Public API ──────────────────────────────────────────────────────────────
async function generateAndSendOtp(clinicId, mobile) {
    const redis = (0, redis_1.getRedis)();
    // Check if locked
    const lockExpiry = await redis.get((0, redis_1.OTP_LOCK_KEY)(clinicId, mobile));
    if (lockExpiry) {
        return {
            sent: false,
            isResend: false,
            lockedUntil: new Date(parseInt(lockExpiry)),
        };
    }
    // Check resend cooldown
    const resendData = await redis.get((0, redis_1.OTP_RESEND_KEY)(clinicId, mobile));
    if (resendData) {
        const parsed = JSON.parse(resendData);
        const secondsSinceLast = Math.floor((Date.now() - parsed.lastSentAt) / 1000);
        if (secondsSinceLast < RESEND_COOLDOWN) {
            return {
                sent: false,
                isResend: true,
                cooldownRemaining: RESEND_COOLDOWN - secondsSinceLast,
            };
        }
        if (parsed.count >= MAX_RESENDS) {
            // Lock the account for lockout period
            await redis.set((0, redis_1.OTP_LOCK_KEY)(clinicId, mobile), Date.now() + LOCKOUT_SECS * 1000, 'EX', LOCKOUT_SECS);
            return {
                sent: false,
                isResend: true,
                lockedUntil: new Date(Date.now() + LOCKOUT_SECS * 1000),
            };
        }
    }
    const otp = generateOtp();
    const key = (0, redis_1.OTP_KEY)(clinicId, mobile);
    // Store OTP hash (never store plaintext in prod — hash it)
    const { createHash } = require('crypto');
    const otpHash = createHash('sha256').update(otp).digest('hex');
    await redis.set(key, otpHash, 'EX', OTP_EXPIRY);
    // Reset attempt counter
    await redis.del((0, redis_1.OTP_ATTEMPTS_KEY)(clinicId, mobile));
    // Update resend tracking
    const existing = resendData ? JSON.parse(resendData) : null;
    await redis.set((0, redis_1.OTP_RESEND_KEY)(clinicId, mobile), JSON.stringify({
        count: existing ? existing.count + 1 : 1,
        lastSentAt: Date.now(),
    }), 'EX', OTP_EXPIRY);
    const sent = await sendSms(mobile, otp);
    return { sent, isResend: !!resendData };
}
async function verifyOtp(clinicId, mobile, otp) {
    const redis = (0, redis_1.getRedis)();
    // Check lockout
    const lockExpiry = await redis.get((0, redis_1.OTP_LOCK_KEY)(clinicId, mobile));
    if (lockExpiry) {
        return { success: false, reason: 'LOCKED', lockedUntil: new Date(parseInt(lockExpiry)) };
    }
    const storedHash = await redis.get((0, redis_1.OTP_KEY)(clinicId, mobile));
    if (!storedHash) {
        return { success: false, reason: 'EXPIRED' };
    }
    const { createHash } = require('crypto');
    const inputHash = createHash('sha256').update(otp).digest('hex');
    if (inputHash !== storedHash) {
        // Increment attempts
        const attemptsKey = (0, redis_1.OTP_ATTEMPTS_KEY)(clinicId, mobile);
        const attempts = await redis.incr(attemptsKey);
        await redis.expire(attemptsKey, OTP_EXPIRY);
        if (attempts >= MAX_ATTEMPTS) {
            // Lock
            await redis.set((0, redis_1.OTP_LOCK_KEY)(clinicId, mobile), Date.now() + LOCKOUT_SECS * 1000, 'EX', LOCKOUT_SECS);
            await redis.del((0, redis_1.OTP_KEY)(clinicId, mobile));
            return {
                success: false,
                reason: 'LOCKED',
                lockedUntil: new Date(Date.now() + LOCKOUT_SECS * 1000),
            };
        }
        return { success: false, reason: 'INVALID' };
    }
    // ✓ Valid — clean up
    await redis.del((0, redis_1.OTP_KEY)(clinicId, mobile));
    await redis.del((0, redis_1.OTP_ATTEMPTS_KEY)(clinicId, mobile));
    await redis.del((0, redis_1.OTP_RESEND_KEY)(clinicId, mobile));
    return { success: true };
}
//# sourceMappingURL=otp.js.map