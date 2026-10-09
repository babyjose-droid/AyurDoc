import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { uploadFile, buildS3Key, validateMimeType } from '../lib/s3'
import { audit, AUDIT } from '../lib/audit'
import { requireRole, requireVerifiedDoctor } from '../middleware/requireAuth'
import { TIER_LIMITS } from '../types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateDoctorSchema = z.object({
  name:               z.string().min(2).max(120),
  mobile:             z.string().regex(/^[6-9]\d{9}$/),
  email:              z.string().email().optional(),
  qualification:      z.string().min(2).max(120),  // "BAMS, MD (Ayurveda)"
  specialization:     z.string().max(120).optional(),
  yearsExperience:    z.number().int().min(0).max(60).optional(),
  registrationNumber: z.string().min(3).max(80),
  registrationState:  z.string().max(80).optional(),
  consultationFee:    z.number().positive().optional(),

})

const UpdateDoctorSchema = z.object({
  name:            z.string().min(2).max(120).optional(),
  email:           z.string().email().optional(),
  qualification:   z.string().min(2).max(120).optional(),
  specialization:  z.string().max(120).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  consultationFee: z.number().positive().optional(),
})

const VerifyDoctorSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(500).optional(),  // required for REJECT
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function doctorRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/doctors — Clinic Admin adds a new doctor
  fastify.post(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const parse = CreateDoctorSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const d = parse.data

      // Check tier limit
      const clinic = await prisma.clinic.findUnique({
        where: { id: request.user.clinicId },
        select: { tier: true },
      })
      if (!clinic) return reply.status(404).send({ success: false, error: 'Clinic not found.' })

      const doctorCount = await prisma.doctor.count({
        where: { clinicId: request.user.clinicId, isActive: true },
      })
      if (doctorCount >= TIER_LIMITS[clinic.tier as keyof typeof TIER_LIMITS].maxDoctors) {
        return reply.status(403).send({
          success: false,
          error: `Your ${clinic.tier} plan allows a maximum of ${TIER_LIMITS[clinic.tier as keyof typeof TIER_LIMITS].maxDoctors} doctor(s). Please upgrade your plan.`,
        })
      }

      // Check mobile not already in this clinic
      const existing = await prisma.doctor.findFirst({
        where: { clinicId: request.user.clinicId, mobile: d.mobile },
      })
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'A doctor with this mobile number already exists in your clinic.',
        })
      }

      const doctor = await prisma.doctor.create({
        data: {
          clinicId:           request.user.clinicId,
          name:               d.name,
          mobile:             d.mobile,
          email:              d.email,
          qualification:      d.qualification,
          specialization:     d.specialization,
          yearsExperience:    d.yearsExperience,
          registrationNumber: d.registrationNumber,
          registrationState:  d.registrationState,
          consultationFee:    d.consultationFee,
          status:             'PENDING',
        },
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.DOCTOR_CREATED,
        entityType: 'Doctor',
        entityId: doctor.id,
        meta: { name: d.name, registrationNumber: d.registrationNumber },
      })

      // TODO: Send welcome SMS to doctor with Clinic ID + login instructions

      return reply.status(201).send({
        success: true,
        data: doctor,
        message: `Dr. ${d.name} added. They will receive an SMS with login instructions. Verification is pending.`,
      })
    }
  )

  // GET /api/doctors — list doctors in current clinic
  fastify.get(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') },
    async (request, reply) => {
      const doctors = await prisma.doctor.findMany({
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
      })

      return reply.send({ success: true, data: doctors })
    }
  )

  // GET /api/doctors/me — doctor views own profile
  fastify.get(
    '/me',
    { preHandler: requireRole('DOCTOR') },
    async (request, reply) => {
      const doctor = await prisma.doctor.findUnique({
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
      })

      if (!doctor) return reply.status(404).send({ success: false, error: 'Doctor not found.' })

      return reply.send({ success: true, data: doctor })
    }
  )

  // PATCH /api/doctors/me — doctor updates own profile
  fastify.patch(
    '/me',
    { preHandler: requireRole('DOCTOR') },
    async (request, reply) => {
      const parse = UpdateDoctorSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const updated = await prisma.doctor.update({
        where: { id: request.user.sub },
        data: parse.data,
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.DOCTOR_PROFILE_UPDATED,
        entityType: 'Doctor',
        entityId: request.user.sub,
        meta: { fields: Object.keys(parse.data) },
      })

      return reply.send({ success: true, data: updated })
    }
  )

  // POST /api/doctors/me/certificates — upload a certificate
  fastify.post(
    '/me/certificates',
    { preHandler: requireRole('DOCTOR') },
    async (request, reply) => {
      const data = await request.file()
      if (!data) {
        return reply.status(400).send({ success: false, error: 'No file uploaded.' })
      }

      if (!validateMimeType('certificate', data.mimetype)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid file type. Allowed: PDF, JPG, PNG.',
        })
      }

      const buffer = await data.toBuffer()
      if (buffer.length > 5 * 1024 * 1024) {
        return reply.status(400).send({ success: false, error: 'Certificate must be under 5MB.' })
      }

      // Type from query param: DEGREE | REGISTRATION | OTHER
      const certType = (request.query as Record<string, string>).type || 'OTHER'

      const key = buildS3Key('certificates', request.user.clinicId, data.filename, request.user.sub)
      await uploadFile('clinicAssets', key, buffer, data.mimetype, {
        doctorId: request.user.sub,
        clinicId: request.user.clinicId,
        type: certType,
      })

      const cert = await prisma.certificate.create({
        data: {
          doctorId: request.user.sub,
          type:     certType,
          fileName: data.filename,
          s3Key:    key,
          mimeType: data.mimetype,
        },
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.DOCTOR_CERT_UPLOADED,
        entityType: 'Certificate',
        entityId: cert.id,
        meta: { type: certType, fileName: data.filename },
      })

      return reply.status(201).send({
        success: true,
        data: cert,
        message: 'Certificate uploaded. Awaiting Super Admin verification.',
      })
    }
  )

  // POST /api/doctors/me/signature — upload signature/stamp image
  fastify.post(
    '/me/signature',
    { preHandler: requireRole('DOCTOR') },
    async (request, reply) => {
      const data = await request.file()
      if (!data) return reply.status(400).send({ success: false, error: 'No file uploaded.' })

      if (!validateMimeType('signature', data.mimetype)) {
        return reply.status(400).send({ success: false, error: 'Allowed: PNG, JPG only.' })
      }

      const buffer = await data.toBuffer()
      const key = buildS3Key('signatures', request.user.clinicId, data.filename, request.user.sub)
      await uploadFile('clinicAssets', key, buffer, data.mimetype)

      await prisma.doctor.update({
        where: { id: request.user.sub },
        data: { signatureUrl: key },
      })

      return reply.send({ success: true, data: { signatureKey: key } })
    }
  )

  // ─── Super Admin routes ────────────────────────────────────────────────────

  // GET /api/doctors/pending — Super Admin: list all pending verifications
  fastify.get(
    '/pending',
    { preHandler: requireRole('SUPER_ADMIN') },
    async (request, reply) => {
      const pending = await prisma.doctor.findMany({
        where: { status: 'PENDING' },
        include: {
          clinic: { select: { clinicId: true, name: true, city: true } },
          certificates: { select: { id: true, type: true, fileName: true, s3Key: true, uploadedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      })

      return reply.send({ success: true, data: pending, count: pending.length })
    }
  )

  // POST /api/doctors/:id/verify — Super Admin approves or rejects
  fastify.post(
    '/:id/verify',
    { preHandler: requireRole('SUPER_ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const parse = VerifyDoctorSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const { action, reason } = parse.data

      if (action === 'REJECT' && !reason) {
        return reply.status(400).send({
          success: false,
          error: 'A rejection reason is required.',
        })
      }

      const doctor = await prisma.doctor.findUnique({ where: { id } })
      if (!doctor) return reply.status(404).send({ success: false, error: 'Doctor not found.' })

      const newStatus = action === 'APPROVE' ? 'VERIFIED' : 'REJECTED'

      const updated = await prisma.doctor.update({
        where: { id },
        data: {
          status:               newStatus,
          rejectionReason:      reason,
          verifiedAt:           action === 'APPROVE' ? new Date() : null,
          verifiedByAdminId:    request.user.sub,
        },
      })

      await audit({
        clinicId: doctor.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: action === 'APPROVE' ? AUDIT.DOCTOR_VERIFIED : AUDIT.DOCTOR_REJECTED,
        entityType: 'Doctor',
        entityId: id,
        meta: { action, reason, doctorName: doctor.name },
      })

      // TODO: Send SMS to doctor with verification result

      return reply.send({
        success: true,
        data: updated,
        message: action === 'APPROVE'
          ? `Dr. ${doctor.name} has been verified and can now issue prescriptions.`
          : `Dr. ${doctor.name} has been rejected. Reason: ${reason}`,
      })
    }
  )
  // GET /api/doctors/:id
  fastify.get('/:id', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    const doctor = await (prisma as any).doctor.findFirst({ where: { id, clinicId: request.user.clinicId }, include: { certificates: true } })
    if (!doctor) return reply.status(404).send({ success: false, error: 'Doctor not found.' })
    return reply.send({ success: true, data: doctor })
  })

  // PATCH /api/doctors/:id
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    const body = request.body as any
    const doctor = await (prisma as any).doctor.findFirst({ where: { id, clinicId: request.user.clinicId } })
    if (!doctor) return reply.status(404).send({ success: false, error: 'Doctor not found.' })
    const updated = await (prisma as any).doctor.update({ where: { id }, data: { name: body.name, qualification: body.qualification, specialization: body.specialization, registrationNumber: body.registrationNumber, registrationState: body.registrationState, yearsExperience: body.yearsExperience, consultationFee: body.consultationFee } })
    return reply.send({ success: true, data: updated })
  })

  // POST /api/doctors/:id/signature
  fastify.post('/:id/signature', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR') }, async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    const data = await request.file()
    if (!data) return reply.status(400).send({ success: false, error: 'No file uploaded.' })
    const buffer = await data.toBuffer()
    const key = 'signatures/' + id + '/' + Date.now() + '-' + data.filename
    await uploadFile('clinicAssets', key, buffer, data.mimetype)
    await (prisma as any).doctor.update({ where: { id }, data: { signatureUrl: key } })
    return reply.send({ success: true, data: { signatureUrl: key } })
  })



  // PATCH /api/doctors/:id
}
