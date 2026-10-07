import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-requisitions-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('requisitions HTTP', () => {
  let app: Awaited<ReturnType<typeof createServer>>
  let cookie = ''

  beforeAll(async () => {
    container.clear()
    app = await createServer()
    cookie = (await login(app)).cookie
  })

  function request(opts: { method: string; url: string; payload?: unknown }) {
    return app.inject({
      ...opts,
      headers: { cookie },
    })
  }

  async function seedItemAndJob() {
    const item = (
      await request({
        method: 'POST',
        url: '/api/items',
        payload: { sku: 'CEM-50', name: 'Cement', unit: 'bag' },
      })
    ).json() as { id: string }
    const job = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site A' } })
    ).json() as { id: string }
    return { item, job }
  }

  beforeEach(() => {
    const sqlite = new Database(dbFile)
    sqlite.exec('DELETE FROM requisitions')
    sqlite.exec('DELETE FROM items')
    sqlite.exec('DELETE FROM jobs')
    sqlite.close()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('POST /api/requisitions returns 201 with purchaseId null', async () => {
    const { item, job } = await seedItemAndJob()
    const response = await request({
      method: 'POST',
      url: '/api/requisitions',
      payload: { itemId: item.id, jobId: job.id, quantity: 12.5 },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.itemId).toBe(item.id)
    expect(body.jobId).toBe(job.id)
    expect(body.quantity).toBe(12.5)
    expect(body.purchaseId).toBeNull()
    expect(body.createdAt).toMatch(ISO_8601)
    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'id',
      'itemId',
      'jobId',
      'purchaseId',
      'quantity',
    ])
  })
})
