"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = visitRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../lib/prisma"));
const audit_1 = require("../lib/audit");
const requireAuth_1 = require("../middleware/requireAuth");
const CreateVisitSchema = zod_1.z.object({
    patientId: zod_1.z.string().uuid(),
    doctorId: zod_1.z.string().uuid(),
    chiefComplaint: zod_1.z.string().max(500).optional(),
    workingDiagnosis: zod_1.z.string().max(500).optional(),
    visitDate: zod_1.z.string().optional(),
});
const UpdateVisitSchema = zod_1.z.object({
    chiefComplaint: zod_1.z.string().max(500).optional(),
    workingDiagnosis: zod_1.z.string().max(500).optional(),
    notes: zod_1.z.string().optional(),
    status: zod_1.z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});
async function visitRoutes(fastify) {
    // POST /api/visits — create a new visit
    fastify.post('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const parse = CreateVisitSchema.safeParse(request.body);
        if (!parse.success)
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        const d = parse.data;
        // Verify patient and doctor belong to clinic
        const [patient, doctor] = await Promise.all([
            prisma_1.default.patient.findFirst({ where: { id: d.patientId, clinicId: request.user.clinicId } }),
            prisma_1.default.doctor.findFirst({ where: { id: d.doctorId, clinicId: request.user.clinicId } }),
        ]);
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found in this clinic.' });
        if (!doctor)
            return reply.status(404).send({ success: false, error: 'Doctor not found in this clinic.' });
        const visit = await prisma_1.default.visit.create({
            data: {
                clinicId: request.user.clinicId,
                patientId: d.patientId,
                doctorId: d.doctorId,
                chiefComplaint: d.chiefComplaint,
                workingDiagnosis: d.workingDiagnosis,
                visitDate: d.visitDate ? new Date(d.visitDate) : new Date(),
            },
            include: {
                patient: { select: { id: true, name: true, patientCode: true, gender: true, dateOfBirth: true } },
                doctor: { select: { id: true, name: true, qualification: true } },
            },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role,
            action: 'VISIT_CREATED', entityType: 'Visit', entityId: visit.id,
            meta: { patientId: d.patientId, doctorId: d.doctorId },
        });
        return reply.status(201).send({ success: true, data: visit });
    });
    // GET /api/visits — list visits for clinic
    fastify.get('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const query = request.query;
        const limit = parseInt(query.limit || '20');
        const skip = (parseInt(query.page || '1') - 1) * limit;
        const where = { clinicId: request.user.clinicId };
        if (query.patientId)
            where.patientId = query.patientId;
        if (query.doctorId)
            where.doctorId = query.doctorId;
        if (query.status)
            where.status = query.status;
        const [total, visits] = await Promise.all([
            prisma_1.default.visit.count({ where }),
            prisma_1.default.visit.findMany({
                where, skip, take: limit,
                orderBy: { visitDate: 'desc' },
                include: {
                    patient: { select: { id: true, name: true, patientCode: true } },
                    doctor: { select: { id: true, name: true, qualification: true } },
                    signOffs: { select: { section: true } },
                    _count: { select: { aiPlans: true, labReports: true } },
                },
            }),
        ]);
        return reply.send({ success: true, data: visits, pagination: { total, limit, page: parseInt(query.page || '1') } });
    });
    // GET /api/visits/:id — get visit details
    fastify.get('/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const visit = await prisma_1.default.visit.findFirst({
            where: { id, clinicId: request.user.clinicId },
            include: {
                patient: true,
                doctor: { select: { id: true, name: true, qualification: true, registrationNumber: true, signatureUrl: true } },
                labReports: true,
                doshaAssessment: true,
                tongueAnalysis: true,
                eyeAnalysis: true,
                aiPlans: true,
                signOffs: true,
                chatMessages: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!visit)
            return reply.status(404).send({ success: false, error: 'Visit not found.' });
        return reply.send({ success: true, data: visit });
    });
    // PATCH /api/visits/:id
    fastify.patch('/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const parse = UpdateVisitSchema.safeParse(request.body);
        if (!parse.success)
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        const visit = await prisma_1.default.visit.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!visit)
            return reply.status(404).send({ success: false, error: 'Visit not found.' });
        const updated = await prisma_1.default.visit.update({ where: { id }, data: parse.data });
        return reply.send({ success: true, data: updated });
    });
    // PATCH /api/visits/:id/clinical-notes
    fastify.patch('/:id/clinical-notes', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        console.log('PATCH clinical-notes visitId:', id, 'body:', JSON.stringify(body));
        try {
            const visit = await prisma_1.default.visit.update({
                where: { id },
                data: {
                    chiefComplaint: body.chiefComplaint,
                    medicalHistoryNote: body.medicalHistoryNote,
                    examination: body.examination,
                    ayurvedicDiagnosis: body.ayurvedicDiagnosis,
                    workingDiagnosis: body.ayurvedicDiagnosis,
                }
            });
            console.log('clinical-notes saved OK for', id);
            return reply.send({ success: true, data: visit });
        }
        catch (err) {
            console.error('clinical-notes FAILED:', err.message);
            return reply.status(500).send({ success: false, error: err.message });
        }
    });
}
//# sourceMappingURL=visits.js.map