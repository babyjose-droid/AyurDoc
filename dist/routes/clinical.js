"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = clinicalRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../lib/prisma"));
const s3_1 = require("../lib/s3");
const requireAuth_1 = require("../middleware/requireAuth");
const MedicalHistorySchema = zod_1.z.object({
    pastIllnesses: zod_1.z.array(zod_1.z.string()).optional().default([]),
    surgeries: zod_1.z.array(zod_1.z.string()).optional().default([]),
    allergies: zod_1.z.array(zod_1.z.string()).optional().default([]),
    currentMedications: zod_1.z.array(zod_1.z.string()).optional().default([]),
    familyHistory: zod_1.z.string().optional(),
    sleepHours: zod_1.z.number().min(0).max(24).optional(),
    exerciseFrequency: zod_1.z.string().optional(),
    smokingStatus: zod_1.z.enum(['never', 'former', 'current']).optional(),
    alcoholStatus: zod_1.z.enum(['never', 'occasional', 'regular']).optional(),
    dietPreference: zod_1.z.enum(['vegetarian', 'non-vegetarian', 'vegan']).optional(),
    stressLevel: zod_1.z.enum(['low', 'medium', 'high']).optional(),
});
async function clinicalRoutes(fastify) {
    // ─── Medical History ────────────────────────────────────────────────────────
    // PUT /api/patients/:id/history — upsert medical history
    fastify.put('/patients/:id/history', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const parse = MedicalHistorySchema.safeParse(request.body);
        if (!parse.success)
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        const patient = await prisma_1.default.patient.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found.' });
        const history = await prisma_1.default.medicalHistory.upsert({
            where: { patientId: id },
            create: { patientId: id, ...parse.data },
            update: parse.data,
        });
        return reply.send({ success: true, data: history });
    });
    // GET /api/patients/:id/history
    fastify.get('/patients/:id/history', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const patient = await prisma_1.default.patient.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found.' });
        const history = await prisma_1.default.medicalHistory.findUnique({ where: { patientId: id } });
        return reply.send({ success: true, data: history || {} });
    });
    // ─── Lab Reports ────────────────────────────────────────────────────────────
    // POST /api/patients/:id/lab-reports — upload a lab report
    fastify.post('/patients/:id/lab-reports', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const query = request.query;
        const patient = await prisma_1.default.patient.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found.' });
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ success: false, error: 'No file uploaded.' });
        if (!(0, s3_1.validateMimeType)('labReport', data.mimetype)) {
            return reply.status(400).send({ success: false, error: 'Allowed: PDF, JPG, PNG.' });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > 10 * 1024 * 1024) {
            return reply.status(400).send({ success: false, error: 'File must be under 10MB.' });
        }
        const key = (0, s3_1.buildS3Key)('lab-reports', request.user.clinicId, data.filename, id);
        await (0, s3_1.uploadFile)('patientDocs', key, buffer, data.mimetype, {
            patientId: id, clinicId: request.user.clinicId,
        });
        const report = await prisma_1.default.labReport.create({
            data: {
                patientId: id,
                clinicId: request.user.clinicId,
                visitId: query.visitId,
                reportType: query.reportType || 'OTHER',
                fileName: data.filename,
                s3Key: key,
                mimeType: data.mimetype,
                reportDate: query.reportDate ? new Date(query.reportDate) : null,
            },
        });
        return reply.status(201).send({ success: true, data: report });
    });
    // GET /api/patients/:id/lab-reports
    fastify.get('/patients/:id/lab-reports', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const patient = await prisma_1.default.patient.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found.' });
        const reports = await prisma_1.default.labReport.findMany({
            where: { patientId: id },
            orderBy: { uploadedAt: 'desc' },
        });
        return reply.send({ success: true, data: reports });
    });
    // ─── Visit Patients (full detail) ──────────────────────────────────────────
    // GET /api/patients/:id/visits — all visits for a patient
    fastify.get('/patients/:id/visits', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const patient = await prisma_1.default.patient.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found.' });
        const visits = await prisma_1.default.visit.findMany({
            where: { patientId: id },
            orderBy: { visitDate: 'desc' },
            include: {
                doctor: { select: { id: true, name: true, qualification: true } },
                signOffs: { select: { section: true } },
                _count: { select: { aiPlans: true } },
            },
        });
        return reply.send({ success: true, data: visits });
    });
}
//# sourceMappingURL=clinical.js.map