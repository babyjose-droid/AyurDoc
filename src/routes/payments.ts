import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { requireRole } from '../middleware/requireAuth'
import { audit } from '../lib/audit'
import crypto from 'crypto'

const Razorpay = require('razorpay')

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

export default async function paymentRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/payments/create-order — create Razorpay order for invoice
  fastify.post('/create-order', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') },
    async (request: any, reply: any) => {
      const { invoiceId } = request.body as { invoiceId: string }
      const invoice = await (prisma as any).invoice.findFirst({
        where: { id: invoiceId, clinicId: request.user.clinicId }
      })
      if (!invoice) return reply.status(404).send({ success: false, error: 'Invoice not found' })
      if (invoice.status === 'PAID') return reply.status(400).send({ success: false, error: 'Invoice already paid' })

      const amountPaise = Math.round(Number(invoice.total) * 100)
      const order = await rzp.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: invoice.invoiceNumber,
        notes: { invoiceId, clinicId: request.user.clinicId }
      })

      // Save order ID to invoice
      await (prisma as any).invoice.update({
        where: { id: invoiceId },
        data: { paymentRef: order.id, status: 'SENT' }
      })

      return reply.send({
        success: true,
        data: {
          orderId: order.id,
          amount: amountPaise,
          currency: 'INR',
          keyId: process.env.RAZORPAY_KEY_ID,
          invoiceNumber: invoice.invoiceNumber,
          description: 'Payment for ' + invoice.invoiceNumber,
        }
      })
    }
  )

  // POST /api/payments/verify — verify payment after Razorpay callback
  fastify.post('/verify', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') },
    async (request: any, reply: any) => {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = request.body as any

      // Verify signature
      const body = razorpay_order_id + '|' + razorpay_payment_id
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(body)
        .digest('hex')

      if (expectedSignature !== razorpay_signature) {
        return reply.status(400).send({ success: false, error: 'Payment verification failed' })
      }

      // Mark invoice as paid
      const invoice = await (prisma as any).invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: 'UPI',
          paymentRef: razorpay_payment_id,
        }
      })

      await audit({
        clinicId: request.user.clinicId,
        userId: request.user.sub,
        userRole: request.user.role,
        action: 'PAYMENT_RECEIVED_ONLINE',
        entityType: 'Invoice',
        entityId: invoiceId,
        meta: { paymentId: razorpay_payment_id, orderId: razorpay_order_id, amount: invoice.total }
      })

      return reply.send({ success: true, data: { paymentId: razorpay_payment_id } })
    }
  )

  // POST /api/payments/webhook — Razorpay webhook (no auth)
  fastify.post('/webhook', async (request: any, reply: any) => {
    const signature = request.headers['x-razorpay-signature']
    const body = JSON.stringify(request.body)
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(body)
      .digest('hex')

    if (signature !== expectedSignature) {
      return reply.status(400).send({ error: 'Invalid signature' })
    }

    const event = request.body as any
    if (event.event === 'payment.captured') {
      const invoiceId = event.payload.payment.entity.notes?.invoiceId
      if (invoiceId) {
        await (prisma as any).invoice.update({
          where: { id: invoiceId },
          data: { status: 'PAID', paidAt: new Date(), paymentMethod: 'UPI', paymentRef: event.payload.payment.entity.id }
        }).catch(() => {})
      }
    }
    return reply.send({ status: 'ok' })
  })
}
