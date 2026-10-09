import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { generateClinicId } from '../lib/branding'
import { uploadFile, buildS3Key, validateMimeType, getPresignedUrl } from '../lib/s3'
import { audit, AUDIT } from '../lib/audit'
import { requireRole } from '../middleware/requireAuth'
import { TIER_LIMITS } from '../types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const RegisterClinicSchema = z.object({
  name:         z.string().min(2).max(120),
  addressLine1: z.string().min(5).max(200),
  addressLine2: z.string().max(200).optional(),
  city:         z.string().min(2).max(80),
  state:        z.string().min(2).max(80),
  pincode:      z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  phone:        z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  email:        z.string().email(),
  // First staff member who will be Clinic Admin
  adminName:   z.string().min(2).max(80),
  adminMobile: z.string().regex(/^[6-9]\d{9}$/),
})

const UpdateClinicSchema = z.object({
  name:         z.string().min(2).max(120).optional(),
  addressLine1: z.string().min(5).max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city:         z.string().min(2).max(80).optional(),
  state:        z.string().min(2).max(80).optional(),
  pincode:      z.string().regex(/^\d{6}$/).optional(),
  phone:        z.string().regex(/^[6-9]\d{9}$/).optional(),
  email:        z.string().email().optional(),
  workingHours: z.any().optional(),
  consultationTypes: z.array(z.string()).optional(),
  gstNumber:    z.string().optional(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function clinicRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/clinics/register
  // Public — no auth required (first-time registration)
  fastify.post('/register', async (request, reply) => {
    const parse = RegisterClinicSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.errors[0].message,
      })
    }

    const d = parse.data

    // Check mobile not already registered as Clinic Admin
    const existingStaff = await prisma.staff.findFirst({
      where: { mobile: d.adminMobile },
    })
    if (existingStaff) {
      return reply.status(409).send({
        success: false,
        error: 'This mobile number is already registered on the platform.',
      })
    }

    const clinicId = await generateClinicId()

    const clinic = await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      // Create clinic
      const c = await tx.clinic.create({
        data: {
          clinicId,
          name: d.name,
          addressLine1: d.addressLine1,
          addressLine2: d.addressLine2,
          city: d.city,
          state: d.state,
          pincode: d.pincode,
          phone: d.phone,
          email: d.email,
        },
      })

      // Create Clinic Admin staff record
      await tx.staff.create({
        data: {
          clinicId: c.id,
          name: d.adminName,
          mobile: d.adminMobile,
          role: 'CLINIC_ADMIN',
        },
      })

      return c
    })

    await audit({
      clinicId: clinic.id,
      action: AUDIT.CLINIC_REGISTERED,
      entityType: 'Clinic',
      entityId: clinic.id,
      meta: { clinicId, name: d.name },
      ipAddress: request.ip,
    })

    // TODO: Send welcome SMS/email with clinicId and login instructions

    return reply.status(201).send({
      success: true,
      data: {
        clinicId: clinic.clinicId,   // AYR-XXXXX — share this with all staff
        internalId: clinic.id,
        name: clinic.name,
        message: `Your Clinic ID is ${clinic.clinicId}. Share this with your doctors and staff so they can log in.`,
      },
    })
  })

  // GET /api/clinics/me — get current clinic details
  fastify.get(
    '/me',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const clinic = await prisma.clinic.findUnique({
        where: { id: request.user.clinicId },
        select: {
          id: true, clinicId: true, name: true,
          addressLine1: true, addressLine2: true, city: true, state: true, pincode: true,
          phone: true, email: true, logoUrl: true,
          status: true, tier: true, subscriptionExpiry: true,
          workingHours: true, consultationTypes: true, gstNumber: true,
          createdAt: true,
        },
      })

      if (!clinic) return reply.status(404).send({ success: false, error: 'Clinic not found.' })

      let logoUrl = null
      if (clinic?.logoUrl) {
        try { logoUrl = await getPresignedUrl('clinicAssets', clinic.logoUrl, 3600) } catch {}
      }
      return reply.send({ success: true, data: { ...clinic, logoPresignedUrl: logoUrl } })
    }
  )

  // PATCH /api/clinics/me — update clinic settings
  fastify.patch(
    '/me',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const parse = UpdateClinicSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const updated = await prisma.clinic.update({
        where: { id: request.user.clinicId },
        data: parse.data,
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.CLINIC_UPDATED,
        entityType: 'Clinic',
        entityId: request.user.clinicId,
        meta: { fields: Object.keys(parse.data) },
      })

      return reply.send({ success: true, data: updated })
    }
  )

  // POST /api/clinics/me/logo — upload clinic logo
  fastify.post(
    '/me/logo',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const data = await request.file()
      if (!data) {
        return reply.status(400).send({ success: false, error: 'No file uploaded.' })
      }

      if (!validateMimeType('logo', data.mimetype)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid file type. Allowed: PNG, JPG, SVG, WebP.',
        })
      }

      const buffer = await data.toBuffer()
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ success: false, error: 'Logo must be under 10MB.' })
      }

      const key = buildS3Key('logos', request.user.clinicId, data.filename)
      await uploadFile('clinicAssets', key, buffer, data.mimetype, {
        clinicId: request.user.clinicId,
        uploadedBy: request.user.sub,
      })

      await prisma.clinic.update({
        where: { id: request.user.clinicId },
        data: { logoUrl: key },
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.CLINIC_LOGO_UPLOADED,
        entityType: 'Clinic',
        entityId: request.user.clinicId,
      })

      return reply.send({ success: true, data: { logoKey: key } })
    }
  )

  // GET /api/clinics/me/staff — list all staff and doctors
  fastify.get(
    '/me/staff',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const [doctors, staff] = await Promise.all([
        prisma.doctor.findMany({
          where: { clinicId: request.user.clinicId },
          select: {
            id: true, name: true, mobile: true, qualification: true,
            specialization: true, status: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.staff.findMany({
          where: { clinicId: request.user.clinicId, role: { not: 'DOCTOR' } },
          select: { id: true, name: true, mobile: true, role: true, isActive: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])

      return reply.send({ success: true, data: { doctors, staff } })
    }
  )

  // GET /api/clinics/me/limits — check subscription tier limits
  fastify.get(
    '/me/limits',
    { preHandler: requireRole('CLINIC_ADMIN', 'DOCTOR') },
    async (request, reply) => {
      const clinic = await prisma.clinic.findUnique({
        where: { id: request.user.clinicId },
        select: { tier: true, subscriptionExpiry: true },
      })

      if (!clinic) return reply.status(404).send({ success: false, error: 'Clinic not found.' })

      const limits = TIER_LIMITS[clinic.tier as keyof typeof TIER_LIMITS]
      const doctorCount = await prisma.doctor.count({
        where: { clinicId: request.user.clinicId, isActive: true },
      })

      return reply.send({
        success: true,
        data: {
          tier: clinic.tier,
          subscriptionExpiry: clinic.subscriptionExpiry,
          limits,
          usage: { doctors: doctorCount },
          canAddDoctor: doctorCount < limits.maxDoctors,
        },
      })
    }
  )
}