"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClinicId = generateClinicId;
exports.generatePatientCode = generatePatientCode;
exports.getBrandingContext = getBrandingContext;
const prisma_1 = __importDefault(require("./prisma"));
const s3_1 = require("./s3");
const PREFIX = process.env.CLINIC_ID_PREFIX || 'AYR';
// Generate the next clinic ID: AYR-00001, AYR-00002, etc.
async function generateClinicId() {
    // Count existing clinics and increment — wrapped in a transaction for safety
    const result = await prisma_1.default.$queryRaw `
    SELECT COUNT(*) as count FROM clinics
  `;
    const next = Number(result[0].count) + 1;
    return `${PREFIX}-${String(next).padStart(5, '0')}`;
}
// Generate the next patient code scoped to a clinic: SRD-0001, SRD-0002, etc.
async function generatePatientCode(clinicId) {
    const result = await prisma_1.default.$queryRaw `
    SELECT COUNT(*) as count FROM patients WHERE "clinicId" = ${clinicId}
  `;
    const next = Number(result[0].count) + 1;
    // Use first 3 letters of clinicId suffix as prefix
    return `PAT-${String(next).padStart(4, '0')}`;
}
// Assemble branding context for a doctor — used in PDF generation, invoices
async function getBrandingContext(clinicId, doctorId) {
    const clinic = await prisma_1.default.clinic.findUnique({
        where: { id: clinicId },
        select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            pincode: true,
            phone: true,
            email: true,
            logoUrl: true,
        },
    });
    if (!clinic)
        return null;
    const doctor = await prisma_1.default.doctor.findFirst({
        where: { id: doctorId, clinicId },
        select: {
            name: true,
            qualification: true,
            registrationNumber: true,
            signatureUrl: true,
        },
    });
    if (!doctor)
        return null;
    const address = [clinic.addressLine1, clinic.addressLine2, clinic.city, clinic.state, clinic.pincode]
        .filter(Boolean)
        .join(', ');
    return {
        clinicName: clinic.name,
        clinicAddress: address,
        clinicPhone: clinic.phone,
        clinicEmail: clinic.email,
        clinicLogoUrl: clinic.logoUrl ? await (0, s3_1.getPresignedUrl)('clinicAssets', clinic.logoUrl, 3600).catch(() => null) : null,
        doctorName: doctor.name,
        doctorQualification: doctor.qualification,
        doctorRegistrationNumber: doctor.registrationNumber,
        doctorSignatureUrl: doctor.signatureUrl ? await (0, s3_1.getPresignedUrl)('clinicAssets', doctor.signatureUrl, 3600).catch(() => null) : null,
    };
}
//# sourceMappingURL=branding.js.map