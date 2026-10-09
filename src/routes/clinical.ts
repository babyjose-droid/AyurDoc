import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { uploadFile, buildS3Key, validateMimeType } from '../lib/s3'
import { requireRole } from '../middleware/requireAuth'

const MedicalHistorySchema = z.object({
  pastIllnesses:      z.array(z.string()).optional().default([]),
  surgeries:          z.array(z.string()).optional().default([]),
  allergies:          z.array(z.string()).optional().default([]),
  currentMedications: z.array(z.string()).optional().default([]),
  familyHistory:      z.string().optional(),
  sleepHours:         z.number().min(0).max(24).optional(),
  exerciseFrequency:  z.string().optional(),
  smokingStatus:      z.enum(['never', 'former', 'current']).optional(),
  alcoholStatus:      z.enum(['never', 'occasional', 'regular']).optional(),
  dietPreference:     z.enum(['vegetarian', 'non-vegetarian', 'vegan']).optional(),
  stressLevel:        z.enum(['low', 'medium', 'high']).optional(),
})

export default async function clinicalRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Medical History ────────────────────────────────────────────────────────

  // PUT /api/patients/:id/history — upsert medical history
  fastify.put('/patients/:id/history',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const parse = MedicalHistorySchema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ success: false, error: parse.error.errors[0].message })

      const patient = await prisma.patient.findFirst({ where: { id, clinicId: request.user.clinicId } })
      if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found.' })

      const history = await prisma.medicalHistory.upsert({
        where: { patientId: id },
        create: { patientId: id, ...parse.data },
        update: parse.data,
      })

      return reply.send({ success: true, data: history })
    }
  )

  // GET /api/patients/:id/history
  fastify.get('/patients/:id/history',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const patient = await prisma.patient.findFirst({ where: { id, clinicId: request.user.clinicId } })
      if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found.' })

      const history = await prisma.medicalHistory.findUnique({ where: { patientId: id } })
      return reply.send({ success: true, data: history || {} })
    }
  )

  // ─── Lab Reports ────────────────────────────────────────────────────────────

  // POST /api/patients/:id/lab-reports — upload a lab report
  fastify.post('/patients/:id/lab-reports',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const query = request.query as { visitId?: string; reportType?: string; reportDate?: string }

      const patient = await prisma.patient.findFirst({ where: { id, clinicId: request.user.clinicId } })
      if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found.' })

      const data = await request.file()
      if (!data) return reply.status(400).send({ success: false, error: 'No file uploaded.' })

      if (!validateMimeType('labReport', data.mimetype)) {
        return reply.status(400).send({ success: false, error: 'Allowed: PDF, JPG, PNG.' })
      }

      const buffer = await data.toBuffer()
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ success: false, error: 'File must be under 10MB.' })
      }

      const key = buildS3Key('lab-reports', request.user.clinicId, data.filename, id)
      await uploadFile('patientDocs', key, buffer, data.mimetype, {
        patientId: id, clinicId: request.user.clinicId,
      })

      const report = await prisma.labReport.create({
        data: {
          patientId:  id,
          clinicId:   request.user.clinicId,
          visitId:    query.visitId,
          reportType: query.reportType || 'OTHER',
          fileName:   data.filename,
          s3Key:      key,
          mimeType:   data.mimetype,
          reportDate: query.reportDate ? new Date(query.reportDate) : null,
        },
      })

      return reply.status(201).send({ success: true, data: report })
    }
  )

  // GET /api/patients/:id/lab-reports
  fastify.get('/patients/:id/lab-reports',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const patient = await prisma.patient.findFirst({ where: { id, clinicId: request.user.clinicId } })
      if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found.' })

      const reports = await prisma.labReport.findMany({
        where: { patientId: id },
        orderBy: { uploadedAt: 'desc' },
      })

      return reply.send({ success: true, data: reports })
    }
  )

  // ─── Visit Patients (full detail) ──────────────────────────────────────────

  // GET /api/patients/:id/visits — all visits for a patient
  fastify.get('/patients/:id/visits',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const patient = await prisma.patient.findFirst({ where: { id, clinicId: request.user.clinicId } })
      if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found.' })

      const visits = await prisma.visit.findMany({
        where: { patientId: id },
        orderBy: { visitDate: 'desc' },
        include: {
          doctor: { select: { id: true, name: true, qualification: true } },
          signOffs: { select: { section: true } },
          _count: { select: { aiPlans: true } },
        },
      })

      return reply.send({ success: true, data: visits })
    }
  )
}
