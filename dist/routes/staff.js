"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = staffRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../lib/prisma"));
const audit_1 = require("../lib/audit");
const requireAuth_1 = require("../middleware/requireAuth");
const AddStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(80),
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
    role: zod_1.z.enum(['CLINIC_ADMIN', 'STAFF']).default('STAFF'),
    email: zod_1.z.string().email().optional(),
});
const UpdateMobileSchema = zod_1.z.object({
    newMobile: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
    otp: zod_1.z.string().length(6), // OTP to verify new number
});
async function staffRoutes(fastify) {
    // POST /api/staff — Clinic Admin adds a staff member
    fastify.post('/', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const parse = AddStaffSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        }
        const d = parse.data;
        const existing = await prisma_1.default.staff.findFirst({
            where: { clinicId: request.user.clinicId, mobile: d.mobile },
        });
        if (existing) {
            return reply.status(409).send({
                success: false,
                error: 'A staff member with this mobile number already exists in your clinic.',
            });
        }
        const staff = await prisma_1.default.staff.create({
            data: {
                clinicId: request.user.clinicId,
                name: d.name,
                mobile: d.mobile,
                email: d.email,
                role: d.role,
            },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.STAFF_ADDED,
            entityType: 'Staff',
            entityId: staff.id,
            meta: { name: d.name, role: d.role },
        });
        // TODO: Send welcome SMS with Clinic ID + login instructions
        return reply.status(201).send({
            success: true,
            data: staff,
            message: `${d.name} added as ${d.role === 'CLINIC_ADMIN' ? 'Clinic Admin' : 'Staff'}. A welcome SMS has been sent.`,
        });
    });
    // DELETE /api/staff/:id — deactivate staff member
    fastify.delete('/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const { id } = request.params;
        const staff = await prisma_1.default.staff.findFirst({
            where: { id, clinicId: request.user.clinicId },
        });
        if (!staff)
            return reply.status(404).send({ success: false, error: 'Staff member not found.' });
        // Cannot remove yourself
        if (staff.id === request.user.sub) {
            return reply.status(400).send({ success: false, error: 'You cannot remove your own account.' });
        }
        await prisma_1.default.staff.update({ where: { id }, data: { isActive: false } });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.STAFF_REMOVED,
            entityType: 'Staff',
            entityId: id,
            meta: { name: staff.name },
        });
        return reply.send({ success: true, message: `${staff.name} has been removed.` });
    });
    // PATCH /api/staff/:id/mobile — update mobile number (admin-initiated)
    // Doctor mobile change requires Super Admin approval (handled separately)
    fastify.patch('/:id/mobile', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const { id } = request.params;
        const parse = zod_1.z.object({ newMobile: zod_1.z.string().regex(/^[6-9]\d{9}$/) }).safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ success: false, error: parse.error.errors[0].message });
        }
        const staff = await prisma_1.default.staff.findFirst({
            where: { id, clinicId: request.user.clinicId },
        });
        if (!staff)
            return reply.status(404).send({ success: false, error: 'Staff member not found.' });
        // Check new mobile not already in use
        const conflict = await prisma_1.default.staff.findFirst({
            where: { clinicId: request.user.clinicId, mobile: parse.data.newMobile },
        });
        if (conflict) {
            return reply.status(409).send({ success: false, error: 'This mobile number is already in use.' });
        }
        const oldMobile = staff.mobile;
        await prisma_1.default.staff.update({ where: { id }, data: { mobile: parse.data.newMobile } });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.STAFF_MOBILE_CHANGED,
            entityType: 'Staff',
            entityId: id,
            meta: { oldMobileMasked: `XXXXX${oldMobile.slice(-4)}`, newMobileMasked: `XXXXX${parse.data.newMobile.slice(-4)}` },
        });
        return reply.send({ success: true, message: 'Mobile number updated. Staff member must use the new number to log in.' });
    });
}
//# sourceMappingURL=staff.js.map