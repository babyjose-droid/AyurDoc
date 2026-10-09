"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = authRoutes;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../lib/prisma"));
const otp_1 = require("../lib/otp");
const redis_1 = require("../lib/redis");
const audit_1 = require("../lib/audit");
const requireAuth_1 = require("../middleware/requireAuth");
// ─── Input schemas ────────────────────────────────────────────────────────────
const RequestOtpSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(2).max(20),
    mobile: zod_1.z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
});
const VerifyOtpSchema = zod_1.z.object({
    clinicId: zod_1.z.string(),
    mobile: zod_1.z.string(),
    otp: zod_1.z.string().length(6, 'OTP must be 6 digits'),
    deviceType: zod_1.z.enum(['web', 'mobile']).default('web'),
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
async function findUserByClinicAndMobile(clinicId, mobile) {
    // ADMIN clinic ID = Super Admin login
    if (clinicId === 'ADMIN') {
        const sa = await prisma_1.default.staff.findFirst({
            where: { mobile, role: 'SUPER_ADMIN', isActive: true },
            select: { id: true, name: true, role: true },
        });
        if (sa)
            return { id: sa.id, role: 'SUPER_ADMIN', name: sa.name };
        return null;
    }
    // Look up clinic by clinicId string
    const clinic = await prisma_1.default.clinic.findUnique({
        where: { clinicId },
        select: { id: true, status: true },
    });
    if (!clinic || clinic.status === 'SUSPENDED')
        return null;
    // Check doctors first
    const doctor = await prisma_1.default.doctor.findFirst({
        where: { clinicId: clinic.id, mobile, isActive: true },
        select: { id: true, name: true },
    });
    if (doctor)
        return { id: doctor.id, role: 'DOCTOR', name: doctor.name };
    // Check staff
    const staff = await prisma_1.default.staff.findFirst({
        where: { clinicId: clinic.id, mobile, isActive: true },
        select: { id: true, role: true, name: true },
    });
    if (staff)
        return { id: staff.id, role: staff.role, name: staff.name };
    return null;
}
async function createSession(fastify, clinicId, userId, role, deviceType, ipAddress) {
    const sessionId = (0, crypto_1.randomUUID)();
    const expirySeconds = deviceType === 'mobile' ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    // Store in Redis
    const redis = (0, redis_1.getRedis)();
    await redis.set((0, redis_1.SESSION_KEY)(sessionId), JSON.stringify({ clinicId, userId, role, createdAt: Date.now() }), 'EX', expirySeconds);
    // Log session to DB
    await prisma_1.default.session.create({
        data: {
            id: sessionId,
            clinicId,
            userId,
            userRole: role,
            ipAddress,
            expiresAt,
        },
    });
    return sessionId;
}
// ─── Route registration ───────────────────────────────────────────────────────
async function authRoutes(fastify) {
    // POST /api/auth/request-otp
    // Step 1: validate Clinic ID + mobile, send OTP
    fastify.post('/request-otp', async (request, reply) => {
        const parse = RequestOtpSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({
                success: false,
                error: parse.error.errors[0].message,
            });
        }
        const { clinicId, mobile } = parse.data;
        // Verify that this mobile belongs to a user in this clinic
        const user = await findUserByClinicAndMobile(clinicId, mobile);
        if (!user) {
            // Return same message to prevent user enumeration
            return reply.status(200).send({
                success: true,
                message: 'If this Clinic ID and mobile number are registered, an OTP has been sent.',
            });
        }
        const result = await (0, otp_1.generateAndSendOtp)(clinicId, mobile);
        await (0, audit_1.audit)({
            action: result.sent ? audit_1.AUDIT.LOGIN_OTP_SENT : audit_1.AUDIT.LOGIN_OTP_FAILED,
            meta: { clinicId, mobileMasked: `XXXXX${mobile.slice(-4)}`, sent: result.sent },
            ipAddress: request.ip,
        });
        if (result.lockedUntil) {
            return reply.status(429).send({
                success: false,
                error: 'Too many attempts. Account temporarily locked.',
                lockedUntil: result.lockedUntil,
            });
        }
        if (result.cooldownRemaining) {
            return reply.status(429).send({
                success: false,
                error: `Please wait ${result.cooldownRemaining} seconds before requesting another OTP.`,
                cooldownRemaining: result.cooldownRemaining,
            });
        }
        return reply.send({
            success: true,
            message: 'OTP sent to your registered mobile number.',
            expiresInSeconds: 300,
        });
    });
    // POST /api/auth/verify-otp
    // Step 2: verify OTP and issue JWT
    fastify.post('/verify-otp', async (request, reply) => {
        const parse = VerifyOtpSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({
                success: false,
                error: parse.error.errors[0].message,
            });
        }
        const { clinicId, mobile, otp, deviceType } = parse.data;
        const otpResult = await (0, otp_1.verifyOtp)(clinicId, mobile, otp);
        if (!otpResult.success) {
            await (0, audit_1.audit)({
                action: audit_1.AUDIT.LOGIN_OTP_FAILED,
                meta: { clinicId, reason: otpResult.reason, mobileMasked: `XXXXX${mobile.slice(-4)}` },
                ipAddress: request.ip,
            });
            if (otpResult.reason === 'LOCKED') {
                return reply.status(429).send({
                    success: false,
                    error: 'Account locked due to too many failed attempts.',
                    lockedUntil: otpResult.lockedUntil,
                });
            }
            const messages = {
                INVALID: 'Invalid OTP. Please try again.',
                EXPIRED: 'OTP has expired. Please request a new one.',
                MAX_ATTEMPTS: 'Maximum attempts exceeded.',
            };
            return reply.status(401).send({
                success: false,
                error: messages[otpResult.reason || 'INVALID'] || 'Invalid OTP.',
            });
        }
        // OTP valid — find user and issue JWT
        // For ADMIN login, get clinic from the super admin's own record
        let clinicLookupId = clinicId;
        if (clinicId === 'ADMIN') {
            const sa = await prisma_1.default.staff.findFirst({
                where: { mobile, role: 'SUPER_ADMIN' },
                select: { clinicId: true }
            });
            if (sa)
                clinicLookupId = (await prisma_1.default.clinic.findUnique({ where: { id: sa.clinicId }, select: { clinicId: true } }))?.clinicId || clinicId;
        }
        const clinic = await prisma_1.default.clinic.findUnique({
            where: { clinicId: clinicLookupId },
            select: { id: true, name: true, status: true },
        });
        if (!clinic) {
            return reply.status(404).send({ success: false, error: 'Clinic not found.' });
        }
        const user = await findUserByClinicAndMobile(clinicId, mobile);
        if (!user) {
            return reply.status(404).send({ success: false, error: 'User not found.' });
        }
        const sessionId = await createSession(fastify, clinic.id, user.id, user.role, deviceType, request.ip);
        const payload = {
            sub: user.id,
            clinicId: clinic.id,
            role: user.role,
            sessionId,
        };
        const expiresIn = deviceType === 'mobile' ? '30d' : '24h';
        const token = fastify.jwt.sign(payload, { expiresIn });
        await (0, audit_1.audit)({
            clinicId: clinic.id,
            userId: user.id,
            userRole: user.role,
            action: audit_1.AUDIT.LOGIN_SUCCESS,
            meta: { deviceType, mobileMasked: `XXXXX${mobile.slice(-4)}` },
            ipAddress: request.ip,
        });
        return reply.send({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                clinicId: clinic.id,
                clinicName: clinic.name,
            },
            expiresIn,
        });
    });
    // POST /api/auth/logout
    fastify.post('/logout', { preHandler: requireAuth_1.requireAuth }, async (request, reply) => {
        const redis = (0, redis_1.getRedis)();
        await redis.del((0, redis_1.SESSION_KEY)(request.user.sessionId));
        await prisma_1.default.session.update({
            where: { id: request.user.sessionId },
            data: { revokedAt: new Date() },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.LOGOUT,
            ipAddress: request.ip,
        });
        return reply.send({ success: true, message: 'Logged out successfully.' });
    });
    // POST /api/auth/logout-all
    // Revoke all sessions for this user across all devices
    fastify.post('/logout-all', { preHandler: requireAuth_1.requireAuth }, async (request, reply) => {
        const sessions = await prisma_1.default.session.findMany({
            where: {
                userId: request.user.sub,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            select: { id: true },
        });
        const redis = (0, redis_1.getRedis)();
        await Promise.all(sessions.map((s) => redis.del((0, redis_1.SESSION_KEY)(s.id))));
        await prisma_1.default.session.updateMany({
            where: { userId: request.user.sub, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: audit_1.AUDIT.LOGOUT_ALL_DEVICES,
            ipAddress: request.ip,
        });
        return reply.send({ success: true, message: 'Logged out from all devices.' });
    });
    // GET /api/auth/me — return current user context
    fastify.get('/me', { preHandler: requireAuth_1.requireAuth }, async (request, reply) => {
        const { sub, clinicId, role } = request.user;
        if (role === 'DOCTOR') {
            const doctor = await prisma_1.default.doctor.findUnique({
                where: { id: sub },
                select: {
                    id: true, name: true, qualification: true, specialization: true,
                    status: true, registrationNumber: true,
                    clinic: { select: { clinicId: true, name: true, logoUrl: true, status: true } },
                },
            });
            return reply.send({ success: true, data: { ...doctor, role } });
        }
        const staff = await prisma_1.default.staff.findUnique({
            where: { id: sub },
            select: {
                id: true, name: true, role: true,
                clinic: { select: { clinicId: true, name: true, logoUrl: true, status: true } },
            },
        });
        return reply.send({ success: true, data: { ...staff, role } });
    });
}
//# sourceMappingURL=auth.js.map