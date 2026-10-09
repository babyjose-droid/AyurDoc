"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = doctorRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../lib/prisma"));
const s3_1 = require("../lib/s3");
const audit_1 = require("../lib/audit");
const requireAuth_1 = require("../middleware/requireAuth");
const types_1 = require("../types");
// ─── Schemas ──────────────────────────────────────────────────────────────────
const CreateDoctorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/),
    email: zod_1.z.string().email().optional(),
    qualification: zod_1.z.string().min(2).max(120), // "BAMS, MD (Ayurveda)"
    specialization: zod_1.z.string().max(120).optional(),
    yearsExperience: zod_1.z.number().int().min(0).max(60).optional(),
    registrationNumber: zod_1.z.string().min(3).max(80),
    registrationState: zod_1.z.string().max(80).optional(),
    consultationFee: zod_1.z.number().positive().optional(),
});
const UpdateDoctorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120).optional(),
    email: zod_1.z.string().email().optional(),
    qualification: zod_1.z.string().min(2).max(120).optional(),
    specialization: zod_1.z.string().max(120).optional(),
    yearsExperience: zod_1.z.number().int().min(0).max(60).optional(),
    consultationFee: zod_1.z.number().positive().optional(),
});
const VerifyDoctorSchema = zod_1.z.object({
    action: zod_1.z.enum(['APPROVE', 'REJECT']),
    reason: zod_1.z.string().max(500).optional(), // required for REJECT
});
// ─── Routes ───────────────────────────────────────────────────────────────────
async function doctorRoutes(fastify) {
    // POST /api/doctors — Clinic Admin adds a new doctor
    fastify.post('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const parse = CreateDoctorSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        }
        const d = parse.data;
        // Check tier limit
        const clinic = await prisma_1.default.clinic.findUnique({
            where: { id: request.user.clinicId },
            select: { tier: true },
        });
        if (!clinic)
            return reply.status(404).send({ success: false, error: 'Clinic not found.' });
        const doctorCount = await prisma_1.default.doctor.count({
            where: { clinicId: request.user.clinicId, isActive: true },
        });
        if (doctorCount >= types_1.TIER_LIMITS[clinic.tier].maxDoctors) {
            return reply.status(403).send({
                success: false,
                error: `Your ${clinic.tier} plan allows a maximum of ${types_1.TIER_LIMITS[clinic.tier].maxDoctors} doctor(s). Please upgrade your plan.`,
            });
        }
        // Check mobile not already in this clinic
        const existing = await prisma_1.default.doctor.findFirst({
            where: { clinicId: request.user.clinicId, mobile: d.mobile },
        });
        if (existing) {
            return reply.status(409).send({
                success: false,
                error: 'A doctor with this mobile number already exists in your clinic.',
            });
        }
        const doctor = await prisma_1.default.doctor.create({
            data: {
                clinicId: request.user.clinicId,
                name: d.name,
                mobile: d.mobile,
                email: d.email,
                qualification: d.qualification,
                specialization: d.specialization,
                yearsExperience: d.yearsExperience,
                registrationNumber: d.registrationNumber,
                registrationState: d.registrationState,
                consultationFee: d.consultationFee,
                status: 'PENDING',
            },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.DOCTOR_CREATED,
            entityType: 'Doctor',
            entityId: doctor.id,
            meta: { name: d.name, registrationNumber: d.registrationNumber },
        });
        // TODO: Send welcome SMS to doctor with Clinic ID + login instructions
        return reply.status(201).send({
            success: true,
            data: doctor,
            message: `Dr. ${d.name} added. They will receive an SMS with login instructions. Verification is pending.`,
        });
    });
    // GET /api/doctors — list doctors in current clinic
    fastify.get('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const doctors = await prisma_1.default.doctor.findMany({
            where: { clinicId: request.user.clinicId },
            select: {
                id: true, name: true, mobile: true, email: true,
                qualification: true, specialization: true, yearsExperience: true,
                registrationNumber: true, registrationState: true,
                status: true, isActive: true, verifiedAt: true,
                consultationFee: true, signatureUrl: true,
                certificates: { select: { id: true, type: true, fileName: true, uploadedAt: true } },
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
        return reply.send({ success: true, data: doctors });
    });
    // GET /api/doctors/me — doctor views own profile
    fastify.get('/me', { preHandler: (0, requireAuth_1.requireRole)('DOCTOR') }, async (request, reply) => {
        const doctor = await prisma_1.default.doctor.findUnique({
            where: { id: request.user.sub },
            include: {
                certificates: { select: { id: true, type: true, fileName: true, uploadedAt: true } },
                clinic: {
                    select: {
                        clinicId: true, name: true, addressLine1: true, addressLine2: true,
                        city: true, state: true, phone: true, logoUrl: true,
                    },
                },
            },
        });
        if (!doctor)
            return reply.status(404).send({ success: false, error: 'Doctor not found.' });
        return reply.send({ success: true, data: doctor });
    });
    // PATCH /api/doctors/me — doctor updates own profile
    fastify.patch('/me', { preHandler: (0, requireAuth_1.requireRole)('DOCTOR') }, async (request, reply) => {
        const parse = UpdateDoctorSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        }
        const updated = await prisma_1.default.doctor.update({
            where: { id: request.user.sub },
            data: parse.data,
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.DOCTOR_PROFILE_UPDATED,
            entityType: 'Doctor',
            entityId: request.user.sub,
            meta: { fields: Object.keys(parse.data) },
        });
        return reply.send({ success: true, data: updated });
    });
    // POST /api/doctors/me/certificates — upload a certificate
    fastify.post('/me/certificates', { preHandler: (0, requireAuth_1.requireRole)('DOCTOR') }, async (request, reply) => {
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ success: false, error: 'No file uploaded.' });
        }
        if (!(0, s3_1.validateMimeType)('certificate', data.mimetype)) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid file type. Allowed: PDF, JPG, PNG.',
            });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > 5 * 1024 * 1024) {
            return reply.status(400).send({ success: false, error: 'Certificate must be under 5MB.' });
        }
        // Type from query param: DEGREE | REGISTRATION | OTHER
        const certType = request.query.type || 'OTHER';
        const key = (0, s3_1.buildS3Key)('certificates', request.user.clinicId, data.filename, request.user.sub);
        await (0, s3_1.uploadFile)('clinicAssets', key, buffer, data.mimetype, {
            doctorId: request.user.sub,
            clinicId: request.user.clinicId,
            type: certType,
        });
        const cert = await prisma_1.default.certificate.create({
            data: {
                doctorId: request.user.sub,
                type: certType,
                fileName: data.filename,
                s3Key: key,
                mimeType: data.mimetype,
            },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.DOCTOR_CERT_UPLOADED,
            entityType: 'Certificate',
            entityId: cert.id,
            meta: { type: certType, fileName: data.filename },
        });
        return reply.status(201).send({
            success: true,
            data: cert,
            message: 'Certificate uploaded. Awaiting Super Admin verification.',
        });
    });
    // POST /api/doctors/me/signature — upload signature/stamp image
    fastify.post('/me/signature', { preHandler: (0, requireAuth_1.requireRole)('DOCTOR') }, async (request, reply) => {
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ success: false, error: 'No file uploaded.' });
        if (!(0, s3_1.validateMimeType)('signature', data.mimetype)) {
            return reply.status(400).send({ success: false, error: 'Allowed: PNG, JPG only.' });
        }
        const buffer = await data.toBuffer();
        const key = (0, s3_1.buildS3Key)('signatures', request.user.clinicId, data.filename, request.user.sub);
        await (0, s3_1.uploadFile)('clinicAssets', key, buffer, data.mimetype);
        await prisma_1.default.doctor.update({
            where: { id: request.user.sub },
            data: { signatureUrl: key },
        });
        return reply.send({ success: true, data: { signatureKey: key } });
    });
    // ─── Super Admin routes ────────────────────────────────────────────────────
    // GET /api/doctors/pending — Super Admin: list all pending verifications
    fastify.get('/pending', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN') }, async (request, reply) => {
        const pending = await prisma_1.default.doctor.findMany({
            where: { status: 'PENDING' },
            include: {
                clinic: { select: { clinicId: true, name: true, city: true } },
                certificates: { select: { id: true, type: true, fileName: true, s3Key: true, uploadedAt: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        return reply.send({ success: true, data: pending, count: pending.length });
    });
    // POST /api/doctors/:id/verify — Super Admin approves or rejects
    fastify.post('/:id/verify', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN') }, async (request, reply) => {
        const { id } = request.params;
        const parse = VerifyDoctorSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        }
        const { action, reason } = parse.data;
        if (action === 'REJECT' && !reason) {
            return reply.status(400).send({
                success: false,
                error: 'A rejection reason is required.',
            });
        }
        const doctor = await prisma_1.default.doctor.findUnique({ where: { id } });
        if (!doctor)
            return reply.status(404).send({ success: false, error: 'Doctor not found.' });
        const newStatus = action === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
        const updated = await prisma_1.default.doctor.update({
            where: { id },
            data: {
                status: newStatus,
                rejectionReason: reason,
                verifiedAt: action === 'APPROVE' ? new Date() : null,
                verifiedByAdminId: request.user.sub,
            },
        });
        await (0, audit_1.audit)({
            clinicId: doctor.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: action === 'APPROVE' ? audit_1.AUDIT.DOCTOR_VERIFIED : audit_1.AUDIT.DOCTOR_REJECTED,
            entityType: 'Doctor',
            entityId: id,
            meta: { action, reason, doctorName: doctor.name },
        });
        // TODO: Send SMS to doctor with verification result
        return reply.send({
            success: true,
            data: updated,
            message: action === 'APPROVE'
                ? `Dr. ${doctor.name} has been verified and can now issue prescriptions.`
                : `Dr. ${doctor.name} has been rejected. Reason: ${reason}`,
        });
    });
    // GET /api/doctors/:id
    fastify.get('/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const doctor = await prisma_1.default.doctor.findFirst({ where: { id, clinicId: request.user.clinicId }, include: { certificates: true } });
        if (!doctor)
            return reply.status(404).send({ success: false, error: 'Doctor not found.' });
        return reply.send({ success: true, data: doctor });
    });
    // PATCH /api/doctors/:id
    fastify.patch('/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const doctor = await prisma_1.default.doctor.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!doctor)
            return reply.status(404).send({ success: false, error: 'Doctor not found.' });
        const updated = await prisma_1.default.doctor.update({ where: { id }, data: { name: body.name, qualification: body.qualification, specialization: body.specialization, registrationNumber: body.registrationNumber, registrationState: body.registrationState, yearsExperience: body.yearsExperience, consultationFee: body.consultationFee } });
        return reply.send({ success: true, data: updated });
    });
    // POST /api/doctors/:id/signature
    fastify.post('/:id/signature', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR') }, async (request, reply) => {
        const { id } = request.params;
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ success: false, error: 'No file uploaded.' });
        const buffer = await data.toBuffer();
        const key = 'signatures/' + id + '/' + Date.now() + '-' + data.filename;
        await (0, s3_1.uploadFile)('clinicAssets', key, buffer, data.mimetype);
        await prisma_1.default.doctor.update({ where: { id }, data: { signatureUrl: key } });
        return reply.send({ success: true, data: { signatureUrl: key } });
    });
    // PATCH /api/doctors/:id
}
//# sourceMappingURL=doctor.js.map