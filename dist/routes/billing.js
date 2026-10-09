"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = billingRoutes;
const prisma_1 = __importDefault(require("../lib/prisma"));
const requireAuth_1 = require("../middleware/requireAuth");
const audit_1 = require("../lib/audit");
async function generateInvoiceNumber(clinicId) {
    const count = await prisma_1.default.invoice.count({ where: { clinicId } });
    const num = String(count + 1).padStart(4, '0');
    const year = new Date().getFullYear().toString().slice(-2);
    return `INV-${year}-${num}`;
}
async function billingRoutes(fastify) {
    // ─── Service Catalog ────────────────────────────────────────────────────────
    fastify.get('/services', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const services = await prisma_1.default.serviceCatalog.findMany({
            where: { clinicId: request.user.clinicId, isActive: true },
            orderBy: { category: 'asc' }
        });
        return reply.send({ success: true, data: services });
    });
    fastify.post('/services', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const body = request.body;
        const service = await prisma_1.default.serviceCatalog.create({
            data: {
                clinicId: request.user.clinicId,
                name: body.name,
                description: body.description,
                category: body.category || 'General',
                price: body.price,
                gstRate: body.gstRate || 0,
            }
        });
        return reply.status(201).send({ success: true, data: service });
    });
    fastify.patch('/services/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const service = await prisma_1.default.serviceCatalog.update({
            where: { id },
            data: { name: body.name, description: body.description, price: body.price, gstRate: body.gstRate, isActive: body.isActive }
        });
        return reply.send({ success: true, data: service });
    });
    fastify.delete('/services/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const { id } = request.params;
        await prisma_1.default.serviceCatalog.update({ where: { id }, data: { isActive: false } });
        return reply.send({ success: true });
    });
    // ─── Invoices ────────────────────────────────────────────────────────────────
    fastify.post('/invoices', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const body = request.body;
        const lineItems = body.lineItems || [];
        const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const discount = body.discount || 0;
        const tax = body.tax || 0;
        const total = subtotal - discount + tax;
        const invoiceNumber = await generateInvoiceNumber(request.user.clinicId);
        const invoice = await prisma_1.default.invoice.create({
            data: {
                clinicId: request.user.clinicId,
                patientId: body.patientId,
                visitId: body.visitId,
                invoiceNumber,
                lineItems,
                subtotal,
                discount,
                tax,
                total,
                notes: body.notes,
                dueDate: body.dueDate ? new Date(body.dueDate) : null,
            }
        });
        await (0, audit_1.audit)({ clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role, action: 'INVOICE_CREATED', entityType: 'Invoice', entityId: invoice.id, meta: { total } });
        return reply.status(201).send({ success: true, data: invoice });
    });
    fastify.get('/invoices', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const query = request.query;
        const where = { clinicId: request.user.clinicId };
        if (query.patientId)
            where.patientId = query.patientId;
        if (query.status)
            where.status = query.status;
        const [total, invoices] = await Promise.all([
            prisma_1.default.invoice.count({ where }),
            prisma_1.default.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, take: parseInt(query.limit || '20'), skip: (parseInt(query.page || '1') - 1) * parseInt(query.limit || '20') })
        ]);
        return reply.send({ success: true, data: invoices, pagination: { total } });
    });
    fastify.get('/invoices/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const invoice = await prisma_1.default.invoice.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!invoice)
            return reply.status(404).send({ success: false, error: 'Invoice not found' });
        return reply.send({ success: true, data: invoice });
    });
    fastify.patch('/invoices/:id', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const invoice = await prisma_1.default.invoice.update({
            where: { id },
            data: {
                status: body.status,
                notes: body.notes,
                discount: body.discount,
                lineItems: body.lineItems,
                dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
            }
        });
        return reply.send({ success: true, data: invoice });
    });
    // POST /api/invoices/:id/record-payment
    fastify.post('/invoices/:id/record-payment', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const invoice = await prisma_1.default.invoice.update({
            where: { id },
            data: {
                status: 'PAID',
                paidAt: new Date(),
                paymentMethod: body.paymentMethod,
                paymentRef: body.paymentRef,
            }
        });
        await (0, audit_1.audit)({ clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role, action: 'PAYMENT_RECORDED', entityType: 'Invoice', entityId: id, meta: { paymentMethod: body.paymentMethod, amount: invoice.total } });
        return reply.send({ success: true, data: invoice });
    });
    // GET /api/billing/summary — collection report
    fastify.get('/summary', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const query = request.query;
        const from = query.from ? new Date(query.from) : new Date(new Date().setDate(1));
        const to = query.to ? new Date(query.to) : new Date();
        const where = { clinicId: request.user.clinicId, createdAt: { gte: from, lte: to } };
        const [total, paid, pending, cancelled] = await Promise.all([
            prisma_1.default.invoice.aggregate({ where, _sum: { total: true }, _count: true }),
            prisma_1.default.invoice.aggregate({ where: { ...where, status: 'PAID' }, _sum: { total: true }, _count: true }),
            prisma_1.default.invoice.aggregate({ where: { ...where, status: 'SENT' }, _sum: { total: true }, _count: true }),
            prisma_1.default.invoice.aggregate({ where: { ...where, status: 'CANCELLED' }, _count: true }),
        ]);
        return reply.send({
            success: true,
            data: {
                period: { from, to },
                totalInvoices: total._count,
                totalAmount: total._sum.total || 0,
                collected: paid._sum.total || 0,
                paidCount: paid._count,
                pending: pending._sum.total || 0,
                pendingCount: pending._count,
                cancelledCount: cancelled._count,
            }
        });
    });
    // GET /api/billing/invoices/:id/pdf
    fastify.get('/invoices/:id/pdf', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF', 'DOCTOR') }, async (request, reply) => {
        const { id } = request.params;
        const invoice = await prisma_1.default.invoice.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!invoice)
            return reply.status(404).send({ success: false, error: 'Invoice not found' });
        const clinic = await prisma_1.default.clinic.findUnique({ where: { id: request.user.clinicId } });
        const { getPresignedUrl } = require('../lib/s3');
        let logoUrl = '';
        if (clinic?.logoUrl) {
            try {
                logoUrl = await getPresignedUrl('clinicAssets', clinic.logoUrl, 300);
            }
            catch { }
        }
        const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
        const rows = lineItems.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.name || ''}</td>
          <td style="text-align:center">${item.quantity || 1}</td>
          <td style="text-align:right">₹${Number(item.unitPrice || 0).toLocaleString('en-IN')}</td>
          <td style="text-align:right">₹${Number(item.total || (item.quantity * item.unitPrice) || 0).toLocaleString('en-IN')}</td>
        </tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #20281F; margin: 0; padding: 0; }
        .header { background: #163829; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
        .clinic-name { font-size: 18px; font-weight: bold; }
        .clinic-sub { font-size: 11px; color: #C9C2AC; margin-top: 2px; }
        .content { padding: 20px 30px; }
        .invoice-title { font-size: 22px; font-weight: bold; color: #1F4D38; margin-bottom: 4px; }
        .invoice-meta { display: flex; justify-content: space-between; margin: 16px 0; padding: 12px; background: #F5F2EA; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #163829; color: white; padding: 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #E2DCCB; }
        .totals { margin-top: 16px; float: right; width: 220px; }
        .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
        .totals .grand { font-weight: bold; font-size: 14px; border-top: 2px solid #163829; padding-top: 8px; margin-top: 4px; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; background: ${invoice.status === 'PAID' ? '#EEF2EA' : '#FEF3C7'}; color: ${invoice.status === 'PAID' ? '#1F4D38' : '#92400E'}; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2DCCB; font-size: 11px; color: #6B7280; text-align: center; }
      </style></head><body>
      <div class="header">
        <div>
          ${logoUrl ? `<img src="${logoUrl}" style="height:48px;width:48px;object-fit:contain;border-radius:8px;background:white;padding:4px;float:left;margin-right:12px" />` : ''}
          <div class="clinic-name">${clinic?.name || ''}</div>
          <div class="clinic-sub">${clinic?.addressLine1 || ''}${clinic?.city ? ', ' + clinic.city : ''}, ${clinic?.state || ''}</div>
          <div class="clinic-sub">${clinic?.phone || ''} · ${clinic?.email || ''}</div>
        </div>
        <div style="text-align:right">
          <div class="clinic-sub">INVOICE</div>
          <div style="font-size:20px;font-weight:bold">${invoice.invoiceNumber}</div>
          <div class="clinic-sub">Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div class="content">
        <div class="invoice-meta">
          <div>
            <div style="font-size:10px;color:#6B7280;margin-bottom:2px">STATUS</div>
            <span class="status-badge">${invoice.status}</span>
          </div>
          ${invoice.paidAt ? `<div><div style="font-size:10px;color:#6B7280;margin-bottom:2px">PAID ON</div><div style="font-weight:bold">${new Date(invoice.paidAt).toLocaleDateString('en-IN')}</div></div>` : ''}
          ${invoice.paymentMethod ? `<div><div style="font-size:10px;color:#6B7280;margin-bottom:2px">PAYMENT MODE</div><div style="font-weight:bold">${invoice.paymentMethod}</div></div>` : ''}
          ${invoice.paymentRef ? `<div><div style="font-size:10px;color:#6B7280;margin-bottom:2px">REFERENCE</div><div style="font-weight:bold">${invoice.paymentRef}</div></div>` : ''}
        </div>
        <table>
          <thead><tr><th>#</th><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="overflow:hidden">
          <div class="totals">
            <div><span>Subtotal</span><span>₹${Number(invoice.subtotal).toLocaleString('en-IN')}</span></div>
            ${Number(invoice.discount) > 0 ? `<div style="color:#DC2626"><span>Discount</span><span>-₹${Number(invoice.discount).toLocaleString('en-IN')}</span></div>` : ''}
            ${Number(invoice.tax) > 0 ? `<div><span>Tax</span><span>₹${Number(invoice.tax).toLocaleString('en-IN')}</span></div>` : ''}
            <div class="grand"><span>Total</span><span style="color:#1F4D38">₹${Number(invoice.total).toLocaleString('en-IN')}</span></div>
          </div>
        </div>
        ${invoice.notes ? `<div style="margin-top:30px;padding:10px;background:#F5F2EA;border-radius:6px;clear:both"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
        <div class="footer">
          <p>Thank you for choosing ${clinic?.name || 'our clinic'}. This is a computer-generated invoice.</p>
        </div>
      </div></body></html>`;
        reply.header('Content-Type', 'text/html');
        return reply.send(html);
    });
    // POST /api/billing/invoices/:id/partial-payment
    fastify.post('/invoices/:id/partial-payment', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        const invoice = await prisma_1.default.invoice.findFirst({ where: { id, clinicId: request.user.clinicId } });
        if (!invoice)
            return reply.status(404).send({ success: false, error: 'Invoice not found' });
        if (invoice.status === 'PAID')
            return reply.status(400).send({ success: false, error: 'Invoice already fully paid' });
        const paidSoFar = Number(invoice.amountPaid || 0);
        const newPaid = paidSoFar + Number(body.amount);
        const remaining = Number(invoice.total) - newPaid;
        const status = remaining <= 0 ? 'PAID' : 'SENT';
        const updated = await prisma_1.default.invoice.update({
            where: { id },
            data: {
                amountPaid: newPaid,
                status,
                paidAt: status === 'PAID' ? new Date() : invoice.paidAt,
                paymentMethod: body.paymentMethod,
                paymentRef: body.paymentRef,
                notes: invoice.notes ? invoice.notes + '\nPartial: ₹' + body.amount + ' via ' + body.paymentMethod : 'Partial: ₹' + body.amount + ' via ' + body.paymentMethod,
            }
        });
        await (0, audit_1.audit)({ clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role, action: 'PARTIAL_PAYMENT', entityType: 'Invoice', entityId: id, meta: { amount: body.amount, remaining, paymentMethod: body.paymentMethod } });
        return reply.send({ success: true, data: { ...updated, remaining: Math.max(0, remaining) } });
    });
    // GET /api/billing/summary/export?format=csv|pdf
    fastify.get('/summary/export', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN') }, async (request, reply) => {
        const query = request.query;
        const from = query.from ? new Date(query.from) : new Date(new Date().setDate(1));
        const to = query.to ? new Date(query.to) : new Date();
        const invoices = await prisma_1.default.invoice.findMany({
            where: { clinicId: request.user.clinicId, createdAt: { gte: from, lte: to } },
            orderBy: { createdAt: 'asc' }
        });
        const patientIds = [...new Set(invoices.map((i) => i.patientId).filter(Boolean))];
        const patients = await prisma_1.default.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true, mobile: true, patientCode: true } });
        const patMap = {};
        patients.forEach((p) => { patMap[p.id] = p; });
        if (query.format === 'csv') {
            const rows = ['Invoice No,Date,Patient Name,Patient Code,Mobile,Status,Subtotal,Discount,Total,Paid,Payment Method,Reference'];
            invoices.forEach((inv) => {
                const pt = patMap[inv.patientId] || {};
                rows.push([
                    inv.invoiceNumber,
                    new Date(inv.createdAt).toLocaleDateString('en-IN'),
                    pt.name || '',
                    pt.patientCode || '',
                    pt.mobile || '',
                    inv.status,
                    inv.subtotal,
                    inv.discount,
                    inv.total,
                    inv.amountPaid || (inv.status === 'PAID' ? inv.total : 0),
                    inv.paymentMethod || '',
                    inv.paymentRef || ''
                ].join(','));
            });
            reply.header('Content-Type', 'text/csv');
            reply.header('Content-Disposition', 'attachment; filename="collection-report.csv"');
            return reply.send(rows.join('\n'));
        }
        // PDF report
        const clinic = await prisma_1.default.clinic.findUnique({ where: { id: request.user.clinicId } });
        const totalAmount = invoices.reduce((s, i) => s + Number(i.total), 0);
        const collected = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + Number(i.total), 0);
        const pending = invoices.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED').reduce((s, i) => s + Number(i.total), 0);
        const rows = invoices.map((inv) => `
        <tr>
          <td>${inv.invoiceNumber}</td>
          <td>${new Date(inv.createdAt).toLocaleDateString('en-IN')}</td>
          <td><span style="padding:2px 8px;border-radius:10px;font-size:10px;background:${inv.status === 'PAID' ? '#EEF2EA' : '#FEF3C7'};color:${inv.status === 'PAID' ? '#1F4D38' : '#92400E'}">${inv.status}</span></td>
          <td style="text-align:right">₹${Number(inv.total).toLocaleString('en-IN')}</td>
          <td style="text-align:center">${inv.paymentMethod || '-'}</td>
        </tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:Arial,sans-serif;font-size:12px;color:#20281F}.header{background:#163829;color:white;padding:20px 30px}.content{padding:20px 30px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#163829;color:white;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #E2DCCB}.summary-card{display:inline-block;padding:12px 20px;background:#F5F2EA;border-radius:8px;margin-right:12px;margin-bottom:12px;min-width:140px}</style>
      </head><body>
      <div class="header">
        <div style="font-size:18px;font-weight:bold">${clinic?.name || ''}</div>
        <div style="font-size:11px;color:#C9C2AC">Collection Report · ${from.toLocaleDateString('en-IN')} to ${to.toLocaleDateString('en-IN')}</div>
      </div>
      <div class="content">
        <div style="margin-bottom:20px">
          <div class="summary-card"><div style="font-size:10px;color:#6B7280">TOTAL BILLED</div><div style="font-size:20px;font-weight:bold;color:#163829">₹${totalAmount.toLocaleString('en-IN')}</div><div style="font-size:10px;color:#6B7280">${invoices.length} invoices</div></div>
          <div class="summary-card"><div style="font-size:10px;color:#6B7280">COLLECTED</div><div style="font-size:20px;font-weight:bold;color:#1F4D38">₹${collected.toLocaleString('en-IN')}</div><div style="font-size:10px;color:#6B7280">${invoices.filter((i) => i.status === 'PAID').length} paid</div></div>
          <div class="summary-card"><div style="font-size:10px;color:#6B7280">PENDING</div><div style="font-size:20px;font-weight:bold;color:#92400E">₹${pending.toLocaleString('en-IN')}</div><div style="font-size:10px;color:#6B7280">${invoices.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED').length} invoices</div></div>
        </div>
        <table><thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th style="text-align:right">Amount</th><th style="text-align:center">Mode</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div></body></html>`;
        reply.header('Content-Type', 'text/html');
        return reply.send(html);
    });
}
//# sourceMappingURL=billing.js.map