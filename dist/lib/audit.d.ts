interface AuditParams {
    clinicId?: string;
    userId?: string;
    userRole?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    meta?: object;
    ipAddress?: string;
}
export declare function audit(params: AuditParams): Promise<void>;
export declare const AUDIT: {
    readonly LOGIN_OTP_SENT: "LOGIN_OTP_SENT";
    readonly LOGIN_OTP_FAILED: "LOGIN_OTP_FAILED";
    readonly LOGIN_SUCCESS: "LOGIN_SUCCESS";
    readonly LOGIN_LOCKED: "LOGIN_LOCKED";
    readonly LOGOUT: "LOGOUT";
    readonly LOGOUT_ALL_DEVICES: "LOGOUT_ALL_DEVICES";
    readonly CLINIC_REGISTERED: "CLINIC_REGISTERED";
    readonly CLINIC_UPDATED: "CLINIC_UPDATED";
    readonly CLINIC_LOGO_UPLOADED: "CLINIC_LOGO_UPLOADED";
    readonly DOCTOR_CREATED: "DOCTOR_CREATED";
    readonly DOCTOR_CERT_UPLOADED: "DOCTOR_CERT_UPLOADED";
    readonly DOCTOR_VERIFIED: "DOCTOR_VERIFIED";
    readonly DOCTOR_REJECTED: "DOCTOR_REJECTED";
    readonly DOCTOR_SUSPENDED: "DOCTOR_SUSPENDED";
    readonly DOCTOR_PROFILE_UPDATED: "DOCTOR_PROFILE_UPDATED";
    readonly STAFF_ADDED: "STAFF_ADDED";
    readonly STAFF_REMOVED: "STAFF_REMOVED";
    readonly STAFF_MOBILE_CHANGED: "STAFF_MOBILE_CHANGED";
    readonly PATIENT_REGISTERED: "PATIENT_REGISTERED";
    readonly PATIENT_UPDATED: "PATIENT_UPDATED";
};
export {};
//# sourceMappingURL=audit.d.ts.map