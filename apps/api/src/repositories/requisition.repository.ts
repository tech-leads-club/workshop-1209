import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { items, jobs, requisitions } from '../db/schema'

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
