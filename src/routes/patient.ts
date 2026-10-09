import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { generatePatientCode } from '../lib/branding'
import { audit, AUDIT } from '../lib/audit'
import { requireRole } from '../middleware/requireAuth'

const CreatePatientSchema = z.object({
  name:        z.string().min(2).max(120),
  mobile:      z.string().regex(/^[6-9]\d{9}$/).optional(),
  email:       z.string().email().optional(),
  dateOfBirth: z.string().optional().transform(v => v ? new Date(v) : undefined),
  gender:      z.enum(['M', 'F', 'OTHER']).optional(),
  address:     z.string().max(300).optional(),
  occupation:  z.string().max(100).optional(),
})

const ListPatientsQuerySchema = z.object({
  search:   z.string().optional(),
  page:     z.coerce.number().default(1),
  limit:    z.coerce.number().max(50).default(20),
})

export default async function patientRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/patients
  fastify.post(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const parse = CreatePatientSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const patientCode = await generatePatientCode(request.user.clinicId)

      const patient = await prisma.patient.create({
        data: {
          clinicId:    request.user.clinicId,
          patientCode,
          name:        parse.data.name,
          mobile:      parse.data.mobile,
          email:       parse.data.email,
          dateOfBirth: parse.data.dateOfBirth,
          gender:      parse.data.gender,
          address:     parse.data.address,
          occupation:  parse.data.occupation,
        },
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.PATIENT_REGISTERED,
        entityType: 'Patient',
        entityId: patient.id,
        meta: { patientCode, name: parse.data.name },
      })

      return reply.status(201).send({ success: true, data: patient })
    }
  )

  // GET /api/patients
  fastify.get(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const query = ListPatientsQuerySchema.parse(request.query)
      const skip = (query.page - 1) * query.limit

      const where: Record<string, unknown> = {
        clinicId: request.user.clinicId,
        isActive: true,
      }

      if (query.search) {
        where.OR = [
          { name:        { contains: query.search, mode: 'insensitive' } },
          { mobile:      { contains: query.search } },
          { patientCode: { contains: query.search, mode: 'insensitive' } },
        ]
      }

      const [total, patients] = await Promise.all([
        prisma.patient.count({ where }),
        prisma.patient.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, patientCode: true, name: true, mobile: true,
            gender: true, dateOfBirth: true, occupation: true, createdAt: true,
          },
        }),
      ])

      return reply.send({
        success: true,
        data: patients,
        pagination: { total, page: query.page, limit: query.limit, pages: Math.ceil(total / query.limit) },
      })
    }
  )

  // GET /api/patients/:id
  fastify.get(
    '/:id',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const patient = await prisma.patient.findFirst({
        where: { id, clinicId: request.user.clinicId },
      })

      if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found.' })

      return reply.send({ success: true, data: patient })
    }
  )
}
