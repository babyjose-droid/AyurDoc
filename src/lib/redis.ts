import Redis from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })
  }
  return redis
}

// OTP key format: otp:{clinicId}:{mobile}
export const OTP_KEY = (clinicId: string, mobile: string) =>
  `otp:${clinicId}:${mobile}`

// Lockout key
export const OTP_LOCK_KEY = (clinicId: string, mobile: string) =>
  `otp_lock:${clinicId}:${mobile}`

// Attempt count key
export const OTP_ATTEMPTS_KEY = (clinicId: string, mobile: string) =>
  `otp_attempts:${clinicId}:${mobile}`

// Session key
export const SESSION_KEY = (sessionId: string) => `session:${sessionId}`

// Resend count key
export const OTP_RESEND_KEY = (clinicId: string, mobile: string) =>
  `otp_resend:${clinicId}:${mobile}`
