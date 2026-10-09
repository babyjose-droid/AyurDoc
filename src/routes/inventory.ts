import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { requireRole } from '../middleware/requireAuth'
import { audit } from '../lib/audit'

export default async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Medicines CRUD ──────────────────────────────────────────────────────────

  fastify.get('/medicines', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request: any, reply: any) => {
      const q = request.query as any
      const where: any = { clinicId: request.user.clinicId, isActive: true }
      if (q.search) where.name = { contains: q.search, mode: 'insensitive' }
      if (q.category) where.category = q.category
      if (q.lowStock === 'true') where.stockQty = { lte: prisma.clinicMedicine.fields.reorderLevel }
      const medicines = await (prisma as any).clinicMedicine.findMany({
        where, orderBy: { name: 'asc' },
        take: parseInt(q.limit || '50')
      })
      return reply.send({ success: true, data: medicines })
    }
  )

  fastify.post('/medicines', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request: any, reply: any) => {
      const body = request.body as any
      const medicine = await (prisma as any).clinicMedicine.create({
        data: {
          clinicId: request.user.clinicId,
          name: body.name,
          genericName: body.genericName,
          brandName: body.brandName,
          manufacturer: body.manufacturer,
          form: body.form || 'tablet',
          category: body.category || 'proprietary',
          unit: body.unit || 'strip',
          purchasePrice: body.purchasePrice || 0,
          sellingPrice: body.sellingPrice || 0,
          gstRate: body.gstRate || 0,
          stockQty: body.stockQty || 0,
          reorderLevel: body.reorderLevel || 10,
          batchNumber: body.batchNumber,
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
          hsn: body.hsn,
        }
      })
      if (body.stockQty > 0) {
        await (prisma as any).stockMovement.create({
          data: { clinicId: request.user.clinicId, medicineId: medicine.id, type: 'PURCHASE', quantity: body.stockQty, balanceAfter: body.stockQty, notes: 'Opening stock' }
        })
      }
      return reply.status(201).send({ success: true, data: medicine })
    }
  )

  fastify.get('/medicines/:id', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request: any, reply: any) => {
      const { id } = request.params as { id: string }
      const medicine = await (prisma as any).clinicMedicine.findFirst({
        where: { id, clinicId: request.user.clinicId },
        include: { stockMovements: { orderBy: { createdAt: 'desc' }, take: 20 } }
      })
      if (!medicine) return reply.status(404).send({ success: false, error: 'Medicine not found' })
      return reply.send({ success: true, data: medicine })
    }
  )

  fastify.patch('/medicines/:id', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request: any, reply: any) => {
      const { id } = request.params as { id: string }
      const body = request.body as any
      const medicine = await (prisma as any).clinicMedicine.update({
        where: { id },
        data: {
          name: body.name, genericName: body.genericName, brandName: body.brandName,
          manufacturer: body.manufacturer, form: body.form, category: body.category,
          unit: body.unit, purchasePrice: body.purchasePrice, sellingPrice: body.sellingPrice,
          gstRate: body.gstRate, reorderLevel: body.reorderLevel,
          batchNumber: body.batchNumber, expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
          hsn: body.hsn, isActive: body.isActive,
        }
      })
      return reply.send({ success: true, data: medicine })
    }
  )

  fastify.delete('/medicines/:id', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request: any, reply: any) => {
      const { id } = request.params as { id: string }
      await (prisma as any).clinicMedicine.update({ where: { id }, data: { isActive: false } })
      return reply.send({ success: true })
    }
  )

  // ─── Stock Adjustments ───────────────────────────────────────────────────────

  fastify.post('/medicines/:id/stock', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') },
    async (request: any, reply: any) => {
      const { id } = request.params as { id: string }
      const body = request.body as any
      const medicine = await (prisma as any).clinicMedicine.findFirst({ where: { id, clinicId: request.user.clinicId } })
      if (!medicine) return reply.status(404).send({ success: false, error: 'Medicine not found' })
      const qty = parseFloat(body.quantity)
      const newStock = parseFloat(medicine.stockQty) + (body.type === 'PURCHASE' ? qty : -qty)
      if (newStock < 0) return reply.status(400).send({ success: false, error: 'Insufficient stock' })
      await (prisma as any).clinicMedicine.update({ where: { id }, data: { stockQty: newStock } })
      await (prisma as any).stockMovement.create({
        data: { clinicId: request.user.clinicId, medicineId: id, type: body.type, quantity: qty, balanceAfter: newStock, notes: body.notes }
      })
      return reply.send({ success: true, data: { stockQty: newStock } })
    }
  )

  // ─── Stock Movements ─────────────────────────────────────────────────────────

  fastify.get('/medicines/:id/movements', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'STAFF') },
    async (request: any, reply: any) => {
      const { id } = request.params as { id: string }
      const movements = await (prisma as any).stockMovement.findMany({
        where: { medicineId: id }, orderBy: { createdAt: 'desc' }, take: 50
      })
      return reply.send({ success: true, data: movements })
    }
  )

  // ─── Inventory Summary ───────────────────────────────────────────────────────

  fastify.get('/summary', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request: any, reply: any) => {
      const clinicId = request.user.clinicId
      const [total, lowStock, expired] = await Promise.all([
        (prisma as any).clinicMedicine.count({ where: { clinicId, isActive: true } }),
        (prisma as any).clinicMedicine.findMany({ where: { clinicId, isActive: true }, select: { id: true, name: true, stockQty: true, reorderLevel: true, unit: true } }),
        (prisma as any).clinicMedicine.findMany({ where: { clinicId, isActive: true, expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }, select: { id: true, name: true, expiryDate: true, stockQty: true } })
      ])
      const lowStockItems = lowStock.filter((m: any) => parseFloat(m.stockQty) <= parseFloat(m.reorderLevel))
      const totalValue = (await (prisma as any).clinicMedicine.aggregate({ where: { clinicId, isActive: true }, _sum: { stockQty: true } }))._sum.stockQty || 0
      return reply.send({ success: true, data: { totalMedicines: total, lowStockCount: lowStockItems.length, lowStockItems, expiringItems: expired, totalStockUnits: totalValue } })
    }
  )

  // ─── Bulk import via CSV ─────────────────────────────────────────────────────

  fastify.post('/medicines/bulk-import', { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN') },
    async (request: any, reply: any) => {
      const body = request.body as any
      const medicines = body.medicines as any[]
      if (!Array.isArray(medicines) || medicines.length === 0) {
        return reply.status(400).send({ success: false, error: 'No medicines provided' })
      }
      const created = await Promise.all(medicines.map(m =>
        (prisma as any).clinicMedicine.create({
          data: {
            clinicId: request.user.clinicId,
            name: m.name, genericName: m.genericName, brandName: m.brandName,
            manufacturer: m.manufacturer, form: m.form || 'tablet', category: m.category || 'proprietary',
            unit: m.unit || 'strip', purchasePrice: m.purchasePrice || 0, sellingPrice: m.sellingPrice || 0,
            gstRate: m.gstRate || 0, stockQty: m.stockQty || 0, reorderLevel: m.reorderLevel || 10,
            expiryDate: m.expiryDate ? new Date(m.expiryDate) : null,
          }
        }).catch(() => null)
      ))
      const success = created.filter(Boolean).length
      return reply.send({ success: true, data: { imported: success, failed: medicines.length - success } })
    }
  )
}
