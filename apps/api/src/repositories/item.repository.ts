import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { items } from '../db/schema'

export type ItemRecord = {
  id: string
  sku: string
  name: string
  unit: string
  createdAt: string
}

export class ItemRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<ItemRecord[]> {
    const rows = await this.db.select().from(items)
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      createdAt: row.createdAt,
    }))
  }

  async create(item: ItemRecord): Promise<void> {
    await this.db.insert(items).values({
      id: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      createdAt: item.createdAt,
    })
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(items)
      .where(eq(items.id, id))
      .returning({ id: items.id })
    return deleted.length > 0
  }

  async update(
    id: string,
    fields: { name: string; unit: string },
  ): Promise<ItemRecord | undefined> {
    const updated = await this.db
      .update(items)
      .set({ name: fields.name, unit: fields.unit })
      .where(eq(items.id, id))
      .returning()
    const row = updated[0]
    if (!row) return undefined
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      createdAt: row.createdAt,
    }
  }
}
