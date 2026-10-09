import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UserRole, JwtPayload } from '../types'
import { getRedis, SESSION_KEY } from '../lib/redis'
import prisma from '../lib/prisma'

// Extend @fastify/jwt to type the decoded payload correctly
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

// Verify JWT and check session is still active in Redis
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // fastify-jwt attaches jwtVerify to the request
    await request.jwtVerify()
    const payload = request.user as JwtPayload

    // Check Redis session
    const redis = getRedis()
    const session = await redis.get(SESSION_KEY(payload.sessionId))
    if (!session) {
      return reply.status(401).send({ success: false, error: 'Session expired. Please log in again.' })
    }

    // Check clinic is still active
    const clinic = await prisma.clinic.findUnique({
      where: { id: payload.clinicId },
      select: { status: true, subscriptionExpiry: true },
    })

    if (!clinic || clinic.status === 'SUSPENDED') {
      return reply.status(403).send({ success: false, error: 'Clinic account suspended.' })
    }

    if (clinic.status === 'LAPSED') {
      // Allow read-only access for lapsed clinics (handled per route)
      request.user = { ...payload, role: payload.role } // role remains, lapsed enforced per route
    }
  } catch (err) {
    return reply.status(401).send({ success: false, error: 'Unauthorized. Invalid or expired token.' })
  }
}

// Role-based access factory
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply)
    if (reply.sent) return

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      })
    }
  }
}

// Must be DOCTOR and VERIFIED
export async function requireVerifiedDoctor(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireRole('DOCTOR')(request, reply)
  if (reply.sent) return

  const doctor = await prisma.doctor.findUnique({
    where: { id: request.user.sub },
    select: { status: true },
  })

  if (!doctor || doctor.status !== 'VERIFIED') {
    return reply.status(403).send({
      success: false,
      error: 'Doctor verification is pending. Prescriptions cannot be issued until verified.',
    })
  }
}

// Enforce clinic_id scoping — user can only access their own clinic data
export async function requireSameClinic(
  request: FastifyRequest,
  reply: FastifyReply,
  clinicId: string
): Promise<boolean> {
  if (request.user.clinicId !== clinicId && request.user.role !== 'SUPER_ADMIN') {
    reply.status(403).send({ success: false, error: 'Access denied. Cross-clinic access not permitted.' })
    return false
  }
  return true
}
