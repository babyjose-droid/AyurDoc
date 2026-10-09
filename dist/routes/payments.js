"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = paymentRoutes;
const prisma_1 = __importDefault(require("../lib/prisma"));
const requireAuth_1 = require("../middleware/requireAuth");
const audit_1 = require("../lib/audit");
const crypto_1 = __importDefault(require("crypto"));
const Razorpay = require('razorpay');
const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});
async function paymentRoutes(fastify) {
    // POST /api/payments/create-order — create Razorpay order for invoice
    fastify.post('/create-order', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const { invoiceId } = request.body;
        const invoice = await prisma_1.default.invoice.findFirst({
            where: { id: invoiceId, clinicId: request.user.clinicId }
        });
        if (!invoice)
            return reply.status(404).send({ success: false, error: 'Invoice not found' });
        if (invoice.status === 'PAID')
            return reply.status(400).send({ success: false, error: 'Invoice already paid' });
        const amountPaise = Math.round(Number(invoice.total) * 100);
        const order = await rzp.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: invoice.invoiceNumber,
            notes: { invoiceId, clinicId: request.user.clinicId }
        });
        // Save order ID to invoice
        await prisma_1.default.invoice.update({
            where: { id: invoiceId },
            data: { paymentRef: order.id, status: 'SENT' }
        });
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
        });
    });
    // POST /api/payments/verify — verify payment after Razorpay callback
    fastify.post('/verify', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = request.body;
        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto_1.default
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(body)
            .digest('hex');
        if (expectedSignature !== razorpay_signature) {
            return reply.status(400).send({ success: false, error: 'Payment verification failed' });
        }
        // Mark invoice as paid
        const invoice = await prisma_1.default.invoice.update({
            where: { id: invoiceId },
            data: {
                status: 'PAID',
                paidAt: new Date(),
                paymentMethod: 'UPI',
                paymentRef: razorpay_payment_id,
            }
        });
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId,
            userId: request.user.sub,
            userRole: request.user.role,
            action: 'PAYMENT_RECEIVED_ONLINE',
            entityType: 'Invoice',
            entityId: invoiceId,
            meta: { paymentId: razorpay_payment_id, orderId: razorpay_order_id, amount: invoice.total }
        });
        return reply.send({ success: true, data: { paymentId: razorpay_payment_id } });
    });
    // POST /api/payments/webhook — Razorpay webhook (no auth)
    fastify.post('/webhook', async (request, reply) => {
        const signature = request.headers['x-razorpay-signature'];
        const body = JSON.stringify(request.body);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
            .update(body)
            .digest('hex');
        if (signature !== expectedSignature) {
            return reply.status(400).send({ error: 'Invalid signature' });
        }
        const event = request.body;
        if (event.event === 'payment.captured') {
            const invoiceId = event.payload.payment.entity.notes?.invoiceId;
            if (invoiceId) {
                await prisma_1.default.invoice.update({
                    where: { id: invoiceId },
                    data: { status: 'PAID', paidAt: new Date(), paymentMethod: 'UPI', paymentRef: event.payload.payment.entity.id }
                }).catch(() => { });
            }
        }
        return reply.send({ status: 'ok' });
    });
}
//# sourceMappingURL=payments.js.map