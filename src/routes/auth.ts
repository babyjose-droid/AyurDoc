import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma'
import { generateAndSendOtp, verifyOtp } from '../lib/otp'
import { getRedis, SESSION_KEY } from '../lib/redis'
import { audit, AUDIT } from '../lib/audit'
import { requireAuth } from '../middleware/requireAuth'
import type { JwtPayload, UserRole } from '../types'

// ─── Input schemas ────────────────────────────────────────────────────────────

const RequestOtpSchema = z.object({
  clinicId: z.string().min(2).max(20),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
})

const VerifyOtpSchema = z.object({
  clinicId: z.string(),
  mobile: z.string(),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  deviceType: z.enum(['web', 'mobile']).default('web'),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findUserByClinicAndMobile(
  clinicId: string,
  mobile: string
): Promise<{ id: string; role: UserRole; name: string } | null> {
  // ADMIN clinic ID = Super Admin login
  if (clinicId === 'ADMIN') {
    const sa = await prisma.staff.findFirst({
      where: { mobile, role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, name: true, role: true },
    })
    if (sa) return { id: sa.id, role: 'SUPER_ADMIN' as const, name: sa.name }
    return null
  }
  // Look up clinic by clinicId string
  const clinic = await prisma.clinic.findUnique({
    where: { clinicId },
    select: { id: true, status: true },
  })
  if (!clinic || clinic.status === 'SUSPENDED') return null

  // Check doctors first
  const doctor = await prisma.doctor.findFirst({
    where: { clinicId: clinic.id, mobile, isActive: true },
    select: { id: true, name: true },
  })
  if (doctor) return { id: doctor.id, role: 'DOCTOR', name: doctor.name }

  // Check staff
  const staff = await prisma.staff.findFirst({
    where: { clinicId: clinic.id, mobile, isActive: true },
    select: { id: true, role: true, name: true },
  })
  if (staff) return { id: staff.id, role: staff.role as UserRole, name: staff.name }

  return null
}

async function createSession(
  fastify: FastifyInstance,
  clinicId: string,
  userId: string,
  role: UserRole,
  deviceType: 'web' | 'mobile',
  ipAddress?: string
): Promise<string> {
  const sessionId = randomUUID()
  const expirySeconds = deviceType === 'mobile' ? 30 * 24 * 60 * 60 : 8 * 60 * 60
  const expiresAt = new Date(Date.now() + expirySeconds * 1000)

  // Store in Redis
  const redis = getRedis()
  await redis.set(
    SESSION_KEY(sessionId),
    JSON.stringify({ clinicId, userId, role, createdAt: Date.now() }),
    'EX',
    expirySeconds
  )

  // Log session to DB
  await prisma.session.create({
    data: {
      id: sessionId,
      clinicId,
      userId,
      userRole: role,
      ipAddress,
      expiresAt,
    },
  })

  return sessionId
}

// ─── Route registration ───────────────────────────────────────────────────────

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/auth/request-otp
  // Step 1: validate Clinic ID + mobile, send OTP
  fastify.post('/request-otp', async (request, reply) => {
    const parse = RequestOtpSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.errors[0].message,
      })
    }

    const { clinicId, mobile } = parse.data

    // Verify that this mobile belongs to a user in this clinic
    const user = await findUserByClinicAndMobile(clinicId, mobile)
    if (!user) {
      // Return same message to prevent user enumeration
      return reply.status(200).send({
        success: true,
        message: 'If this Clinic ID and mobile number are registered, an OTP has been sent.',
      })
    }

    const result = await generateAndSendOtp(clinicId, mobile)

    await audit({
      action: result.sent ? AUDIT.LOGIN_OTP_SENT : AUDIT.LOGIN_OTP_FAILED,
      meta: { clinicId, mobileMasked: `XXXXX${mobile.slice(-4)}`, sent: result.sent },
      ipAddress: request.ip,
    })

    if (result.lockedUntil) {
      return reply.status(429).send({
        success: false,
        error: 'Too many attempts. Account temporarily locked.',
        lockedUntil: result.lockedUntil,
      })
    }

    if (result.cooldownRemaining) {
      return reply.status(429).send({
        success: false,
        error: `Please wait ${result.cooldownRemaining} seconds before requesting another OTP.`,
        cooldownRemaining: result.cooldownRemaining,
      })
    }

    return reply.send({
      success: true,
      message: 'OTP sent to your registered mobile number.',
      expiresInSeconds: 300,
    })
  })

  // POST /api/auth/verify-otp
  // Step 2: verify OTP and issue JWT
  fastify.post('/verify-otp', async (request, reply) => {
    const parse = VerifyOtpSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.errors[0].message,
      })
    }

    const { clinicId, mobile, otp, deviceType } = parse.data

    const otpResult = await verifyOtp(clinicId, mobile, otp)

    if (!otpResult.success) {
      await audit({
        action: AUDIT.LOGIN_OTP_FAILED,
        meta: { clinicId, reason: otpResult.reason, mobileMasked: `XXXXX${mobile.slice(-4)}` },
        ipAddress: request.ip,
      })

      if (otpResult.reason === 'LOCKED') {
        return reply.status(429).send({
          success: false,
          error: 'Account locked due to too many failed attempts.',
          lockedUntil: otpResult.lockedUntil,
        })
      }

      const messages: Record<string, string> = {
        INVALID: 'Invalid OTP. Please try again.',
        EXPIRED: 'OTP has expired. Please request a new one.',
        MAX_ATTEMPTS: 'Maximum attempts exceeded.',
      }

      return reply.status(401).send({
        success: false,
        error: messages[otpResult.reason || 'INVALID'] || 'Invalid OTP.',
      })
    }

    // OTP valid — find user and issue JWT
    // For ADMIN login, get clinic from the super admin's own record
    let clinicLookupId = clinicId;
    if (clinicId === 'ADMIN') {
      const sa = await prisma.staff.findFirst({
        where: { mobile, role: 'SUPER_ADMIN' },
        select: { clinicId: true }
      });
      if (sa) clinicLookupId = (await prisma.clinic.findUnique({ where: { id: sa.clinicId }, select: { clinicId: true } }))?.clinicId || clinicId;
    }
    const clinic = await prisma.clinic.findUnique({
      where: { clinicId: clinicLookupId },
      select: { id: true, name: true, status: true },
    })

    if (!clinic) {
      return reply.status(404).send({ success: false, error: 'Clinic not found.' })
    }

    const user = await findUserByClinicAndMobile(clinicId, mobile)
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' })
    }

    const sessionId = await createSession(
      fastify,
      clinic.id,
      user.id,
      user.role,
      deviceType,
      request.ip
    )

    const payload: JwtPayload = {
      sub: user.id,
      clinicId: clinic.id,
      role: user.role,
      sessionId,
    }

    const expiresIn = deviceType === 'mobile' ? '30d' : '24h'
    const token = fastify.jwt.sign(payload, { expiresIn })

    await audit({
      clinicId: clinic.id,
      userId: user.id,
      userRole: user.role,
      action: AUDIT.LOGIN_SUCCESS,
      meta: { deviceType, mobileMasked: `XXXXX${mobile.slice(-4)}` },
      ipAddress: request.ip,
    })

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
    })
  })

  // POST /api/auth/logout
  fastify.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    const redis = getRedis()
    await redis.del(SESSION_KEY(request.user.sessionId))

    await prisma.session.update({
      where: { id: request.user.sessionId },
      data: { revokedAt: new Date() },
    })

    await audit({
      clinicId: request.user.clinicId,
      userId: request.user.sub,
      userRole: request.user.role,
      action: AUDIT.LOGOUT,
      ipAddress: request.ip,
    })

    return reply.send({ success: true, message: 'Logged out successfully.' })
  })

  // POST /api/auth/logout-all
  // Revoke all sessions for this user across all devices
  fastify.post('/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    const sessions = await prisma.session.findMany({
      where: {
        userId: request.user.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    })

    const redis = getRedis()
    await Promise.all(sessions.map((s: { id: string }) => redis.del(SESSION_KEY(s.id))))
    await prisma.session.updateMany({
      where: { userId: request.user.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await audit({
      clinicId: request.user.clinicId,
      userId: request.user.sub,
      userRole: request.user.role,
      action: AUDIT.LOGOUT_ALL_DEVICES,
      ipAddress: request.ip,
    })

    return reply.send({ success: true, message: 'Logged out from all devices.' })
  })

  // GET /api/auth/me — return current user context
  fastify.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const { sub, clinicId, role } = request.user

    if (role === 'DOCTOR') {
      const doctor = await prisma.doctor.findUnique({
        where: { id: sub },
        select: {
          id: true, name: true, qualification: true, specialization: true,
          status: true, registrationNumber: true,
          clinic: { select: { clinicId: true, name: true, logoUrl: true, status: true } },
        },
      })
      return reply.send({ success: true, data: { ...doctor, role } })
    }

    const staff = await prisma.staff.findUnique({
      where: { id: sub },
      select: {
        id: true, name: true, role: true,
        clinic: { select: { clinicId: true, name: true, logoUrl: true, status: true } },
      },
    })
    return reply.send({ success: true, data: { ...staff, role } })
  })
}
