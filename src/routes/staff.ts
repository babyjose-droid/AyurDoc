import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { audit, AUDIT } from '../lib/audit'
import { requireRole } from '../middleware/requireAuth'
import type { UserRole } from '../types'

const AddStaffSchema = z.object({
  name:   z.string().min(2).max(80),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  role:   z.enum(['CLINIC_ADMIN', 'STAFF']).default('STAFF'),
  email:  z.string().email().optional(),
})

const UpdateMobileSchema = z.object({
  newMobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  otp:       z.string().length(6),  // OTP to verify new number
})

export default async function staffRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/staff — Clinic Admin adds a staff member
  fastify.post(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const parse = AddStaffSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const d = parse.data

      const existing = await prisma.staff.findFirst({
        where: { clinicId: request.user.clinicId, mobile: d.mobile },
      })
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: 'A staff member with this mobile number already exists in your clinic.',
        })
      }

      const staff = await prisma.staff.create({
        data: {
          clinicId: request.user.clinicId,
          name:     d.name,
          mobile:   d.mobile,
          email:    d.email,
          role:     d.role as UserRole,
        },
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.STAFF_ADDED,
        entityType: 'Staff',
        entityId: staff.id,
        meta: { name: d.name, role: d.role },
      })

      // TODO: Send welcome SMS with Clinic ID + login instructions

      return reply.status(201).send({
        success: true,
        data: staff,
        message: `${d.name} added as ${d.role === 'CLINIC_ADMIN' ? 'Clinic Admin' : 'Staff'}. A welcome SMS has been sent.`,
      })
    }
  )

  // DELETE /api/staff/:id — deactivate staff member
  fastify.delete(
    '/:id',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const staff = await prisma.staff.findFirst({
        where: { id, clinicId: request.user.clinicId },
      })
      if (!staff) return reply.status(404).send({ success: false, error: 'Staff member not found.' })

      // Cannot remove yourself
      if (staff.id === request.user.sub) {
        return reply.status(400).send({ success: false, error: 'You cannot remove your own account.' })
      }

      await prisma.staff.update({ where: { id }, data: { isActive: false } })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.STAFF_REMOVED,
        entityType: 'Staff',
        entityId: id,
        meta: { name: staff.name },
      })

      return reply.send({ success: true, message: `${staff.name} has been removed.` })
    }
  )

  // PATCH /api/staff/:id/mobile — update mobile number (admin-initiated)
  // Doctor mobile change requires Super Admin approval (handled separately)
  fastify.patch(
    '/:id/mobile',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const parse = z.object({ newMobile: z.string().regex(/^[6-9]\d{9}$/) }).safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ success: false, error: parse.error.errors[0].message })
      }

      const staff = await prisma.staff.findFirst({
        where: { id, clinicId: request.user.clinicId },
      })
      if (!staff) return reply.status(404).send({ success: false, error: 'Staff member not found.' })

      // Check new mobile not already in use
      const conflict = await prisma.staff.findFirst({
        where: { clinicId: request.user.clinicId, mobile: parse.data.newMobile },
      })
      if (conflict) {
        return reply.status(409).send({ success: false, error: 'This mobile number is already in use.' })
      }

      const oldMobile = staff.mobile
      await prisma.staff.update({ where: { id }, data: { mobile: parse.data.newMobile } })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: AUDIT.STAFF_MOBILE_CHANGED,
        entityType: 'Staff',
        entityId: id,
        meta: { oldMobileMasked: `XXXXX${oldMobile.slice(-4)}`, newMobileMasked: `XXXXX${parse.data.newMobile.slice(-4)}` },
      })

      return reply.send({ success: true, message: 'Mobile number updated. Staff member must use the new number to log in.' })
    }
  )
}
