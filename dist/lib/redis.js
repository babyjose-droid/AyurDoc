"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTP_RESEND_KEY = exports.SESSION_KEY = exports.OTP_ATTEMPTS_KEY = exports.OTP_LOCK_KEY = exports.OTP_KEY = void 0;
exports.getRedis = getRedis;
const ioredis_1 = __importDefault(require("ioredis"));
let redis = null;
function getRedis() {
    if (!redis) {
        redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });
        redis.on('error', (err) => {
            console.error('[Redis] Connection error:', err.message);
        });
    }
    return redis;
}
// OTP key format: otp:{clinicId}:{mobile}
const OTP_KEY = (clinicId, mobile) => `otp:${clinicId}:${mobile}`;
exports.OTP_KEY = OTP_KEY;
// Lockout key
const OTP_LOCK_KEY = (clinicId, mobile) => `otp_lock:${clinicId}:${mobile}`;
exports.OTP_LOCK_KEY = OTP_LOCK_KEY;
// Attempt count key
const OTP_ATTEMPTS_KEY = (clinicId, mobile) => `otp_attempts:${clinicId}:${mobile}`;
exports.OTP_ATTEMPTS_KEY = OTP_ATTEMPTS_KEY;
// Session key
const SESSION_KEY = (sessionId) => `session:${sessionId}`;
exports.SESSION_KEY = SESSION_KEY;
// Resend count key
const OTP_RESEND_KEY = (clinicId, mobile) => `otp_resend:${clinicId}:${mobile}`;
exports.OTP_RESEND_KEY = OTP_RESEND_KEY;
//# sourceMappingURL=redis.js.map