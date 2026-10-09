export type UserRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'STAFF';
export type DoctorStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type ClinicStatus = 'ACTIVE' | 'SUSPENDED' | 'LAPSED';
export type SubscriptionTier = 'SOLO' | 'CLINIC' | 'MULTI_CENTER';
export interface JwtPayload {
    sub: string;
    clinicId: string;
    role: UserRole;
    sessionId: string;
    iat?: number;
    exp?: number;
}
export interface OtpVerifyResult {
    success: boolean;
    reason?: 'INVALID' | 'EXPIRED' | 'LOCKED' | 'MAX_ATTEMPTS';
    lockedUntil?: Date;
}
export interface BrandingContext {
    clinicName: string;
    clinicAddress: string;
    clinicPhone: string;
    clinicEmail: string;
    clinicLogoUrl: string | null;
    doctorName: string;
    doctorQualification: string;
    doctorRegistrationNumber: string;
    doctorSignatureUrl: string | null;
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export declare const TIER_LIMITS: Record<SubscriptionTier, {
    maxDoctors: number;
    maxPatientsPerMonth: number;
}>;
//# sourceMappingURL=index.d.ts.map