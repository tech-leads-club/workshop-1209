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

  test('GET /api/requisitions on an empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/requisitions' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
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

  test('POST /api/requisitions with missing itemId, jobId, or quantity 0, -1, or "12.5" returns 400', async () => {
    const { item, job } = await seedItemAndJob()
    const cases = [
      { jobId: job.id, quantity: 12.5 },
      { itemId: item.id, quantity: 12.5 },
      { itemId: item.id, jobId: job.id },
      { itemId: item.id, jobId: job.id, quantity: 0 },
      { itemId: item.id, jobId: job.id, quantity: -1 },
      { itemId: item.id, jobId: job.id, quantity: '12.5' },
    ]

    for (const payload of cases) {
      const response = await request({ method: 'POST', url: '/api/requisitions', payload })
      expect(response.statusCode).toBe(400)
      expect((response.json() as { statusCode: number }).statusCode).toBe(400)
      expect((await request({ method: 'GET', url: '/api/requisitions' })).json()).toEqual([])
    }
  })

  test('POST /api/requisitions with a missing Item or Job returns 400', async () => {
    const { item, job } = await seedItemAndJob()
    const cases = [
      { itemId: 'missing', jobId: job.id, quantity: 12.5 },
      { itemId: item.id, jobId: 'missing', quantity: 12.5 },
    ]

    for (const payload of cases) {
      const response = await request({ method: 'POST', url: '/api/requisitions', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'Item or Job not found',
        statusCode: 400,
      })
    }

    expect((await request({ method: 'GET', url: '/api/requisitions' })).json()).toEqual([])
  })

  test('DELETE /api/items/:id returns 409 when a Requisition references the Item', async () => {
    const { item, job } = await seedItemAndJob()
    const created = await request({
      method: 'POST',
      url: '/api/requisitions',
      payload: { itemId: item.id, jobId: job.id, quantity: 12.5 },
    })
    expect(created.statusCode).toBe(201)

    const response = await request({ method: 'DELETE', url: `/api/items/${item.id}` })
    expect(response.statusCode).toBe(409)
    expect((response.json() as { statusCode: number }).statusCode).toBe(409)

    const items = (await request({ method: 'GET', url: '/api/items' })).json() as { id: string }[]
    expect(items.some((row) => row.id === item.id)).toBe(true)
  })

  test('GET /api/requisitions returns the saved Requisition', async () => {
    const { item, job } = await seedItemAndJob()
    const created = (
      await request({
        method: 'POST',
        url: '/api/requisitions',
        payload: { itemId: item.id, jobId: job.id, quantity: 12.5 },
      })
    ).json()

    const response = await request({ method: 'GET', url: '/api/requisitions' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([created])
  })
})
