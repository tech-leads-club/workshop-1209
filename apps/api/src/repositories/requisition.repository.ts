import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { items, jobs, purchases, requisitions, suppliers, warehouses } from '../db/schema'
import type { PurchaseRecord } from './purchase.repository'

export type RequisitionRecord = {
  id: string
  itemId: string
  jobId: string
  quantity: number
  purchaseId: string | null
  createdAt: string
}

export class RequisitionRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<RequisitionRecord[]> {
    const rows = await this.db.select().from(requisitions)
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      jobId: row.jobId,
      quantity: row.quantity,
      purchaseId: row.purchaseId,
      createdAt: row.createdAt,
    }))
  }

  async existsItem(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, id))
      .limit(1)
    return rows.length > 0
  }

  async existsJob(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)
    return rows.length > 0
  }

  async findById(id: string): Promise<RequisitionRecord | undefined> {
    const rows = await this.db.select().from(requisitions).where(eq(requisitions.id, id)).limit(1)
    const row = rows[0]
    if (!row) {
      return undefined
    }
    return {
      id: row.id,
      itemId: row.itemId,
      jobId: row.jobId,
      quantity: row.quantity,
      purchaseId: row.purchaseId,
      createdAt: row.createdAt,
    }
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(requisitions)
      .where(eq(requisitions.id, id))
      .returning({ id: requisitions.id })
    return deleted.length > 0
  }

  async existsSupplier(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, id))
      .limit(1)
    return rows.length > 0
  }

  async existsWarehouse(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.id, id))
      .limit(1)
    return rows.length > 0
  }

  async createPurchase(purchase: PurchaseRecord): Promise<void> {
    await this.db.insert(purchases).values({
      id: purchase.id,
      supplierId: purchase.supplierId,
      itemId: purchase.itemId,
      warehouseId: purchase.warehouseId,
      quantity: purchase.quantity,
      createdAt: purchase.createdAt,
    })
  }

  async setPurchaseId(id: string, purchaseId: string): Promise<void> {
    await this.db.update(requisitions).set({ purchaseId }).where(eq(requisitions.id, id))
  }

  async create(requisition: RequisitionRecord): Promise<void> {
    await this.db.insert(requisitions).values({
      id: requisition.id,
      itemId: requisition.itemId,
      jobId: requisition.jobId,
      quantity: requisition.quantity,
      purchaseId: requisition.purchaseId,
      createdAt: requisition.createdAt,
    })
  }
}
