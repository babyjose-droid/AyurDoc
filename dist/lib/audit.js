"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT = void 0;
exports.audit = audit;
const prisma_1 = __importDefault(require("./prisma"));
async function audit(params) {
    try {
        await prisma_1.default.auditLog.create({
            data: {
                clinicId: params.clinicId,
                userId: params.userId,
                userRole: params.userRole,
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId,
                meta: params.meta ? JSON.parse(JSON.stringify(params.meta)) : undefined,
                ipAddress: params.ipAddress,
            },
        });
    }
    catch (err) {
        console.error('[Audit] Failed to write audit log:', err);
    }
}
exports.AUDIT = {
    LOGIN_OTP_SENT: 'LOGIN_OTP_SENT',
    LOGIN_OTP_FAILED: 'LOGIN_OTP_FAILED',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_LOCKED: 'LOGIN_LOCKED',
    LOGOUT: 'LOGOUT',
    LOGOUT_ALL_DEVICES: 'LOGOUT_ALL_DEVICES',
    CLINIC_REGISTERED: 'CLINIC_REGISTERED',
    CLINIC_UPDATED: 'CLINIC_UPDATED',
    CLINIC_LOGO_UPLOADED: 'CLINIC_LOGO_UPLOADED',
    DOCTOR_CREATED: 'DOCTOR_CREATED',
    DOCTOR_CERT_UPLOADED: 'DOCTOR_CERT_UPLOADED',
    DOCTOR_VERIFIED: 'DOCTOR_VERIFIED',
    DOCTOR_REJECTED: 'DOCTOR_REJECTED',
    DOCTOR_SUSPENDED: 'DOCTOR_SUSPENDED',
    DOCTOR_PROFILE_UPDATED: 'DOCTOR_PROFILE_UPDATED',
    STAFF_ADDED: 'STAFF_ADDED',
    STAFF_REMOVED: 'STAFF_REMOVED',
    STAFF_MOBILE_CHANGED: 'STAFF_MOBILE_CHANGED',
    PATIENT_REGISTERED: 'PATIENT_REGISTERED',
    PATIENT_UPDATED: 'PATIENT_UPDATED',
};
//# sourceMappingURL=audit.js.map