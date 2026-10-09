import type { OtpVerifyResult } from '../types';
export declare function generateAndSendOtp(clinicId: string, mobile: string): Promise<{
    sent: boolean;
    isResend: boolean;
    cooldownRemaining?: number;
    lockedUntil?: Date;
}>;
export declare function verifyOtp(clinicId: string, mobile: string, otp: string): Promise<OtpVerifyResult>;
//# sourceMappingURL=otp.d.ts.map