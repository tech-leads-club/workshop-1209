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
    sqlite.exec('DELETE FROM movements')
    sqlite.exec('DELETE FROM stock')
    sqlite.exec('DELETE FROM purchases')
    sqlite.exec('DELETE FROM assignments')
    sqlite.exec('DELETE FROM suppliers')
    sqlite.exec('DELETE FROM jobs')
    sqlite.exec('DELETE FROM warehouses')
    sqlite.exec('DELETE FROM items')
    sqlite.close()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('requisition routes without a session return 401', async () => {
    const urls = [
      { method: 'GET', url: '/api/requisitions' },
      { method: 'POST', url: '/api/requisitions', payload: {} },
      { method: 'DELETE', url: '/api/requisitions/missing' },
    ]
    for (const opts of urls) {
      const response = await app.inject(opts)
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'Unauthorized', statusCode: 401 })
    }
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

  test('unique index on purchase_id rejects a duplicate and allows two nulls', async () => {
    const { item, job } = await seedItemAndJob()
    const payload = { itemId: item.id, jobId: job.id, quantity: 12.5 }
    const first = await request({ method: 'POST', url: '/api/requisitions', payload })
    const second = await request({ method: 'POST', url: '/api/requisitions', payload })
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    const firstBody = first.json() as { id: string; purchaseId: null }
    const secondBody = second.json() as { id: string; purchaseId: null }
    expect(firstBody.purchaseId).toBeNull()
    expect(secondBody.purchaseId).toBeNull()

    const supplier = (
      await request({ method: 'POST', url: '/api/suppliers', payload: { name: 'Acme' } })
    ).json() as { id: string }
    const warehouse = (
      await request({ method: 'POST', url: '/api/warehouses', payload: { name: 'Depot A' } })
    ).json() as { id: string }
    const purchase = (
      await request({
        method: 'POST',
        url: '/api/purchases',
        payload: {
          supplierId: supplier.id,
          itemId: item.id,
          warehouseId: warehouse.id,
          quantity: 12.5,
        },
      })
    ).json() as { id: string }

    const sqlite = new Database(dbFile)
    const indexes = sqlite.query('PRAGMA index_list(requisitions)').all() as {
      name: string
      unique: number
    }[]
    expect(
      indexes.some((index) => index.name === 'requisitions_purchase_id_unique' && index.unique === 1),
    ).toBe(true)

    sqlite.query('UPDATE requisitions SET purchase_id = ? WHERE id = ?').run(purchase.id, firstBody.id)
    expect(() => {
      sqlite.query('UPDATE requisitions SET purchase_id = ? WHERE id = ?').run(purchase.id, secondBody.id)
    }).toThrow(/UNIQUE constraint failed/)

    const kept = sqlite
      .query('SELECT purchase_id FROM requisitions WHERE id = ?')
      .get(secondBody.id) as { purchase_id: string | null }
    expect(kept.purchase_id).toBeNull()
    sqlite.close()
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

  test('DELETE /api/jobs/:id returns 409 when a Requisition references the Job', async () => {
    const { item, job } = await seedItemAndJob()
    const created = await request({
      method: 'POST',
      url: '/api/requisitions',
      payload: { itemId: item.id, jobId: job.id, quantity: 12.5 },
    })
    expect(created.statusCode).toBe(201)

    const response = await request({ method: 'DELETE', url: `/api/jobs/${job.id}` })
    expect(response.statusCode).toBe(409)
    expect((response.json() as { statusCode: number }).statusCode).toBe(409)

    const jobs = (await request({ method: 'GET', url: '/api/jobs' })).json() as { id: string }[]
    expect(jobs.some((row) => row.id === job.id)).toBe(true)
  })

  test('DELETE /api/requisitions/:id returns 404 when the id does not exist', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/requisitions/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: 'Requisition not found',
      statusCode: 404,
    })
  })

  test('DELETE /api/requisitions/:id returns 204 when purchaseId is null', async () => {
    const { item, job } = await seedItemAndJob()
    const created = (
      await request({
        method: 'POST',
        url: '/api/requisitions',
        payload: { itemId: item.id, jobId: job.id, quantity: 12.5 },
      })
    ).json() as { id: string }

    const response = await request({
      method: 'DELETE',
      url: `/api/requisitions/${created.id}`,
    })
    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect((await request({ method: 'GET', url: '/api/requisitions' })).json()).toEqual([])
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
