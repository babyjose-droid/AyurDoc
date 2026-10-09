"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = patientRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../lib/prisma"));
const branding_1 = require("../lib/branding");
const audit_1 = require("../lib/audit");
const requireAuth_1 = require("../middleware/requireAuth");
const CreatePatientSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/).optional(),
    email: zod_1.z.string().email().optional(),
    dateOfBirth: zod_1.z.string().optional().transform(v => v ? new Date(v) : undefined),
    gender: zod_1.z.enum(['M', 'F', 'OTHER']).optional(),
    address: zod_1.z.string().max(300).optional(),
    occupation: zod_1.z.string().max(100).optional(),
});
const ListPatientsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().default(1),
    limit: zod_1.z.coerce.number().max(50).default(20),
});
async function patientRoutes(fastify) {
    // POST /api/patients
    fastify.post('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const parse = CreatePatientSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        }
        const patientCode = await (0, branding_1.generatePatientCode)(request.user.clinicId);
        const patient = await prisma_1.default.patient.create({
            data: {
                clinicId: request.user.clinicId,
                patientCode,
                name: parse.data.name,
                mobile: parse.data.mobile,
                email: parse.data.email,
                dateOfBirth: parse.data.dateOfBirth,
                gender: parse.data.gender,
                address: parse.data.address,
                occupation: parse.data.occupation,
            },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.PATIENT_REGISTERED,
            entityType: 'Patient',
            entityId: patient.id,
            meta: { patientCode, name: parse.data.name },
        });
        return reply.status(201).send({ success: true, data: patient });
    });
    // GET /api/patients
    fastify.get('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const query = ListPatientsQuerySchema.parse(request.query);
        const skip = (query.page - 1) * query.limit;
        const where = {
            clinicId: request.user.clinicId,
            isActive: true,
        };
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { mobile: { contains: query.search } },
                { patientCode: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        const [total, patients] = await Promise.all([
            prisma_1.default.patient.count({ where }),
            prisma_1.default.patient.findMany({
                where,
                skip,
                take: query.limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, patientCode: true, name: true, mobile: true,
                    gender: true, dateOfBirth: true, occupation: true, createdAt: true,
                },
            }),
        ]);
        return reply.send({
            success: true,
            data: patients,
            pagination: { total, page: query.page, limit: query.limit, pages: Math.ceil(total / query.limit) },
        });
    });
    // GET /api/patients/:id
    fastify.get('/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const patient = await prisma_1.default.patient.findFirst({
            where: { id, clinicId: request.user.clinicId },
        });
        if (!patient)
            return reply.status(404).send({ success: false, error: 'Patient not found.' });
        return reply.send({ success: true, data: patient });
    });
}
//# sourceMappingURL=patient.js.map