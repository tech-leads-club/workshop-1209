import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-movements-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const operator = { email: 'op-mov@local', password: 'secret', role: 'Operator' }

function clearTables() {
  const sqlite = new Database(dbFile)
  sqlite.exec('DELETE FROM movements')
  sqlite.exec('DELETE FROM stock')
  sqlite.exec('DELETE FROM purchases')
  sqlite.exec('DELETE FROM suppliers')
  sqlite.exec('DELETE FROM jobs')
  sqlite.exec('DELETE FROM warehouses')
  sqlite.exec('DELETE FROM items')
  sqlite.close()
}

describe('movements HTTP', () => {
  let app: Awaited<ReturnType<typeof createServer>>
  let cookie = ''

  beforeAll(async () => {
    container.clear()
    app = await createServer()
    cookie = (await login(app)).cookie
  })

  function request(opts: Pick<InjectOptions, 'method' | 'url' | 'payload'>) {
    return app.inject({
      ...opts,
      headers: { cookie },
    })
  }

  async function seedRefs() {
    const item = (
      await request({
        method: 'POST',
        url: '/api/items',
        payload: { sku: 'CEM-50', name: 'Cimento CP-II', unit: 'saco' },
      })
    ).json() as { id: string }
    const warehouseA = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: { name: 'Depot A' },
      })
    ).json() as { id: string }
    const warehouseB = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: { name: 'Depot B' },
      })
    ).json() as { id: string }
    const job = (
      await request({
        method: 'POST',
        url: '/api/jobs',
        payload: { name: 'Site A' },
      })
    ).json() as { id: string; quantity?: unknown }
    return { item, warehouseA, warehouseB, job }
  }

  beforeEach(() => {
    clearTables()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('GET /api/movements on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/movements' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('POST /api/receipts creates a receipt Movement', async () => {
    const { item, warehouseA } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 12.5 },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.type).toBe('receipt')
    expect(body.warehouseId).toBe(warehouseA.id)
    expect(body.itemId).toBe(item.id)
    expect(body.quantity).toBe(12.5)
    expect(body.toWarehouseId).toBeNull()
    expect(body.jobId).toBeNull()
    expect(body.purchaseId).toBeNull()
    expect(typeof body.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(body.createdAt as string))).toBe(false)
  })

  test('GET /api/movements contains the persisted Receipt', async () => {
    const { item, warehouseA } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 12.5 },
    })
    const movement = created.json() as Record<string, unknown>
    const response = await request({ method: 'GET', url: '/api/movements' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(movement)
  })

  test('C19 POST /api/receipts returns purchaseId null and Stock rises by 3', async () => {
    const { item, warehouseA } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 3 },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.type).toBe('receipt')
    expect(body.purchaseId).toBeNull()
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      warehouseId: string
      itemId: string
      quantity: number
    }[]
    expect(stock).toHaveLength(1)
    expect(stock[0]?.warehouseId).toBe(warehouseA.id)
    expect(stock[0]?.itemId).toBe(item.id)
    expect(stock[0]?.quantity).toBe(3)
  })

  test('GET /api/stock after Receipt includes quantity 12.5', async () => {
    const { item, warehouseA } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 12.5 },
    })
    const response = await request({ method: 'GET', url: '/api/stock' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as { warehouseId: string; itemId: string; quantity: number }[]
    expect(list).toHaveLength(1)
    expect(list[0]?.warehouseId).toBe(warehouseA.id)
    expect(list[0]?.itemId).toBe(item.id)
    expect(list[0]?.quantity).toBe(12.5)
  })

  test('two Receipts add to the same Stock row', async () => {
    const { item, warehouseA } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 4 },
    })
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 12.5 },
    })
    const list = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      quantity: number
    }[]
    expect(list).toHaveLength(1)
    expect(list[0]?.quantity).toBe(16.5)
  })

  test('POST /api/receipts with invalid quantity returns 400 and persists nothing', async () => {
    const { item, warehouseA } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 0 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'quantity must be a positive number',
      statusCode: 400,
    })
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual([])
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual([])
  })

  test('POST /api/receipts with blank ids returns 400 and persists nothing', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: '   ', itemId: 'item-1', quantity: 12.5 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'warehouseId, itemId, and a positive quantity are required',
      statusCode: 400,
    })
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual([])
  })

  test('POST /api/receipts with missing Warehouse or Item returns 400', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: 'missing', itemId: 'missing', quantity: 12.5 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'Warehouse or Item not found',
      statusCode: 400,
    })
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual([])
  })

  test('POST /api/receipts without a session returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: 'w', itemId: 'i', quantity: 1 },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json<unknown>()).toEqual({ error: 'Unauthorized', statusCode: 401 })
  })

  test('POST /api/transfers moves quantity between Warehouses', async () => {
    const { item, warehouseA, warehouseB } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 10 },
    })
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        itemId: item.id,
        quantity: 3,
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.type).toBe('transfer')
    expect(body.warehouseId).toBe(warehouseA.id)
    expect(body.toWarehouseId).toBe(warehouseB.id)
    expect(body.quantity).toBe(3)
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      warehouseId: string
      quantity: number
    }[]
    expect(stock.find((row) => row.warehouseId === warehouseA.id)?.quantity).toBe(7)
    expect(stock.find((row) => row.warehouseId === warehouseB.id)?.quantity).toBe(3)
  })

  test('POST /api/transfers with insufficient Stock leaves balances unchanged', async () => {
    const { item, warehouseA, warehouseB } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 2 },
    })
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        itemId: item.id,
        quantity: 3,
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({ error: 'Insufficient Stock', statusCode: 400 })
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      warehouseId: string
      quantity: number
    }[]
    expect(stock).toHaveLength(1)
    expect(stock[0]?.quantity).toBe(2)
    expect((await request({ method: 'GET', url: '/api/movements' })).json()).toHaveLength(1)
  })

  test('POST /api/transfers with the same Warehouse returns 400', async () => {
    const { item, warehouseA } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseA.id,
        itemId: item.id,
        quantity: 3,
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'fromWarehouseId and toWarehouseId must differ',
      statusCode: 400,
    })
  })

  test('POST /api/transfers with blank ids returns 400', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: { fromWarehouseId: '', toWarehouseId: 'b', itemId: 'i', quantity: 3 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'fromWarehouseId, toWarehouseId, itemId, and a positive quantity are required',
      statusCode: 400,
    })
  })

  test('POST /api/transfers with invalid quantity returns 400', async () => {
    const { item, warehouseA, warehouseB } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        itemId: item.id,
        quantity: 0,
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'quantity must be a positive number',
      statusCode: 400,
    })
  })

  test('POST /api/transfers with missing Warehouse or Item returns 400', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromWarehouseId: 'missing',
        toWarehouseId: 'also-missing',
        itemId: 'missing',
        quantity: 3,
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'Warehouse or Item not found',
      statusCode: 400,
    })
  })

  test('POST /api/transfers equal to source Stock leaves source at 0', async () => {
    const { item, warehouseA, warehouseB } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 3 },
    })
    const response = await request({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        itemId: item.id,
        quantity: 3,
      },
    })
    expect(response.statusCode).toBe(201)
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      warehouseId: string
      quantity: number
    }[]
    expect(stock.find((row) => row.warehouseId === warehouseA.id)?.quantity).toBe(0)
    expect(stock.find((row) => row.warehouseId === warehouseB.id)?.quantity).toBe(3)
  })

  test('POST /api/issues subtracts Stock and leaves Job without quantity', async () => {
    const { item, warehouseA, job } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 10 },
    })
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: job.id, quantity: 2 },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.type).toBe('issue')
    expect(body.jobId).toBe(job.id)
    expect(body.quantity).toBe(2)
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      quantity: number
    }[]
    expect(stock[0]?.quantity).toBe(8)
    const jobs = (await request({ method: 'GET', url: '/api/jobs' })).json() as Record<
      string,
      unknown
    >[]
    expect(jobs).toHaveLength(1)
    expect('quantity' in (jobs[0] ?? {})).toBe(false)
  })

  test('POST /api/issues to 0 keeps the Stock row', async () => {
    const { item, warehouseA, job } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 2 },
    })
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: job.id, quantity: 2 },
    })
    expect(response.statusCode).toBe(201)
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      quantity: number
    }[]
    expect(stock).toHaveLength(1)
    expect(stock[0]?.quantity).toBe(0)
  })

  test('POST /api/issues with insufficient Stock leaves Stock unchanged', async () => {
    const { item, warehouseA, job } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 1 },
    })
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: job.id, quantity: 2 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({ error: 'Insufficient Stock', statusCode: 400 })
    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      quantity: number
    }[]
    expect(stock[0]?.quantity).toBe(1)
  })

  test('POST /api/issues with blank ids returns 400', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: '', itemId: 'i', jobId: 'j', quantity: 2 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'warehouseId, itemId, jobId, and a positive quantity are required',
      statusCode: 400,
    })
  })

  test('POST /api/issues with invalid quantity returns 400', async () => {
    const { item, warehouseA, job } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: job.id, quantity: 0 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'quantity must be a positive number',
      statusCode: 400,
    })
  })

  test('POST /api/issues with missing Warehouse or Item returns 400', async () => {
    const { job } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: 'missing', itemId: 'missing', jobId: job.id, quantity: 2 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'Warehouse or Item not found',
      statusCode: 400,
    })
  })

  test('POST /api/issues with missing Job returns 400', async () => {
    const { item, warehouseA } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: 'missing', quantity: 2 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'Job not found',
      statusCode: 400,
    })
  })

  test('DELETE /api/jobs/:id after Issue returns 409 Job has Movement', async () => {
    const { item, warehouseA, job } = await seedRefs()
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 2 },
    })
    await request({
      method: 'POST',
      url: '/api/issues',
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: job.id, quantity: 2 },
    })
    const response = await request({ method: 'DELETE', url: `/api/jobs/${job.id}` })
    expect(response.statusCode).toBe(409)
    expect(response.json<unknown>()).toEqual({ error: 'Job has Movement', statusCode: 409 })
    const jobs = (await request({ method: 'GET', url: '/api/jobs' })).json() as { id: string }[]
    expect(jobs.some((row) => row.id === job.id)).toBe(true)
    expect((await request({ method: 'GET', url: '/api/movements' })).json()).toHaveLength(2)
  })

  test('Operator posts Receipt, Transfer, and Issue', async () => {
    const { item, warehouseA, warehouseB, job } = await seedRefs()
    const createdUser = await request({
      method: 'POST',
      url: '/api/users',
      payload: operator,
    })
    expect(createdUser.statusCode).toBe(201)
    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: operator.email, password: operator.password },
    })
    expect(signedIn.statusCode).toBe(200)
    const operatorCookie = signedIn.cookies
      .map((entry) => `${entry.name}=${entry.value}`)
      .join('; ')

    const receipt = await app.inject({
      method: 'POST',
      url: '/api/receipts',
      headers: { cookie: operatorCookie },
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 10 },
    })
    expect(receipt.statusCode).toBe(201)

    const transfer = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      headers: { cookie: operatorCookie },
      payload: {
        fromWarehouseId: warehouseA.id,
        toWarehouseId: warehouseB.id,
        itemId: item.id,
        quantity: 3,
      },
    })
    expect(transfer.statusCode).toBe(201)

    const issue = await app.inject({
      method: 'POST',
      url: '/api/issues',
      headers: { cookie: operatorCookie },
      payload: { warehouseId: warehouseA.id, itemId: item.id, jobId: job.id, quantity: 2 },
    })
    expect(issue.statusCode).toBe(201)
  })

  test('DELETE and PATCH /api/movements are 404 and leave Movements unchanged', async () => {
    const { item, warehouseA } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouseA.id, itemId: item.id, quantity: 12.5 },
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/movements/${id}` })
    expect(deleted.statusCode).toBe(404)

    const patched = await request({
      method: 'PATCH',
      url: `/api/movements/${id}`,
      payload: { quantity: 1 },
    })
    expect(patched.statusCode).toBe(404)

    const list = (await request({ method: 'GET', url: '/api/movements' })).json() as {
      id: string
      quantity: number
    }[]
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(id)
    expect(list[0]?.quantity).toBe(12.5)
  })
})
