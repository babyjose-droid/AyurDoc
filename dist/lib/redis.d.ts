import Redis from 'ioredis';
export declare function getRedis(): Redis;
export declare const OTP_KEY: (clinicId: string, mobile: string) => string;
export declare const OTP_LOCK_KEY: (clinicId: string, mobile: string) => string;
export declare const OTP_ATTEMPTS_KEY: (clinicId: string, mobile: string) => string;
export declare const SESSION_KEY: (sessionId: string) => string;
export declare const OTP_RESEND_KEY: (clinicId: string, mobile: string) => string;
//# sourceMappingURL=redis.d.ts.map