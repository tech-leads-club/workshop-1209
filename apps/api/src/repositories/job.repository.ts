import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { jobs } from '../db/schema'

export type JobRecord = {
  id: string
  name: string
  createdAt: string
}

export class JobRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(): Promise<JobRecord[]> {
    const rows = await this.db.select().from(jobs)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
    }))
  }

  async create(job: JobRecord): Promise<void> {
    await this.db.insert(jobs).values({
      id: job.id,
      name: job.name,
      createdAt: job.createdAt,
    })
  }

  async updateById(id: string, name: string): Promise<JobRecord | undefined> {
    const updated = await this.db
      .update(jobs)
      .set({ name })
      .where(eq(jobs.id, id))
      .returning()
    const row = updated[0]
    if (!row) {
      return undefined
    }
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
    }
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(jobs)
      .where(eq(jobs.id, id))
      .returning({ id: jobs.id })
    return deleted.length > 0
  }
}
