"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.requireVerifiedDoctor = requireVerifiedDoctor;
exports.requireSameClinic = requireSameClinic;
const redis_1 = require("../lib/redis");
const prisma_1 = __importDefault(require("../lib/prisma"));
// Verify JWT and check session is still active in Redis
async function requireAuth(request, reply) {
    try {
        // fastify-jwt attaches jwtVerify to the request
        await request.jwtVerify();
        const payload = request.user;
        // Check Redis session
        const redis = (0, redis_1.getRedis)();
        const session = await redis.get((0, redis_1.SESSION_KEY)(payload.sessionId));
        if (!session) {
            return reply.status(401).send({ success: false, error: 'Session expired. Please log in again.' });
        }
        // Check clinic is still active
        const clinic = await prisma_1.default.clinic.findUnique({
            where: { id: payload.clinicId },
            select: { status: true, subscriptionExpiry: true },
        });
        if (!clinic || clinic.status === 'SUSPENDED') {
            return reply.status(403).send({ success: false, error: 'Clinic account suspended.' });
        }
        if (clinic.status === 'LAPSED') {
            // Allow read-only access for lapsed clinics (handled per route)
            request.user = { ...payload, role: payload.role }; // role remains, lapsed enforced per route
        }
    }
    catch (err) {
        return reply.status(401).send({ success: false, error: 'Unauthorized. Invalid or expired token.' });
    }
}
// Role-based access factory
function requireRole(...roles) {
    return async (request, reply) => {
        await requireAuth(request, reply);
        if (reply.sent)
            return;
        if (!roles.includes(request.user.role)) {
            return reply.status(403).send({
                success: false,
                error: `Access denied. Required role: ${roles.join(' or ')}.`,
            });
        }
    };
}
// Must be DOCTOR and VERIFIED
async function requireVerifiedDoctor(request, reply) {
    await requireRole('DOCTOR')(request, reply);
    if (reply.sent)
        return;
    const doctor = await prisma_1.default.doctor.findUnique({
        where: { id: request.user.sub },
        select: { status: true },
    });
    if (!doctor || doctor.status !== 'VERIFIED') {
        return reply.status(403).send({
            success: false,
            error: 'Doctor verification is pending. Prescriptions cannot be issued until verified.',
        });
    }
}
// Enforce clinic_id scoping — user can only access their own clinic data
async function requireSameClinic(request, reply, clinicId) {
    if (request.user.clinicId !== clinicId && request.user.role !== 'SUPER_ADMIN') {
        reply.status(403).send({ success: false, error: 'Access denied. Cross-clinic access not permitted.' });
        return false;
    }
    return true;
}
//# sourceMappingURL=requireAuth.js.map