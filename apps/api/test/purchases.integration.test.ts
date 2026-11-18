import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-purchases-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const operator = { email: 'op-proc@local', password: 'secret', role: 'Operator' }

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

describe('purchases HTTP', () => {
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
    const supplier = (
      await request({ method: 'POST', url: '/api/suppliers', payload: { name: 'Acme' } })
    ).json() as { id: string }
    const item = (
      await request({
        method: 'POST',
        url: '/api/items',
        payload: { sku: 'CEM-50', name: 'Cimento CP-II', unit: 'saco' },
      })
    ).json() as { id: string }
    const warehouse = (
      await request({ method: 'POST', url: '/api/warehouses', payload: { name: 'Depot A' } })
    ).json() as { id: string }
    return { supplier, item, warehouse }
  }

  beforeEach(() => {
    clearTables()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('C8 GET /api/purchases on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/purchases' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('C9 POST /api/purchases creates Purchase without writing Stock or Movement', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()
    const movementsBefore = (await request({ method: 'GET', url: '/api/movements' })).json()

    const response = await request({
      method: 'POST',
      url: '/api/purchases',
      payload: {
        supplierId: supplier.id,
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 12.5,
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.supplierId).toBe(supplier.id)
    expect(body.itemId).toBe(item.id)
    expect(body.warehouseId).toBe(warehouse.id)
    expect(body.quantity).toBe(12.5)
    expect(body.createdAt).toMatch(ISO_8601)
    expect('status' in body).toBe(false)
    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'id',
      'itemId',
      'quantity',
      'supplierId',
      'warehouseId',
    ])

    const list = await request({ method: 'GET', url: '/api/purchases' })
    expect(list.statusCode).toBe(200)
    expect(list.json<unknown>()).toEqual([body])
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)
  })

  test('C10 POST /api/purchases with blank ids or missing quantity returns 400 and persists nothing', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const cases = [
      { supplierId: '', itemId: item.id, warehouseId: warehouse.id, quantity: 12.5 },
      { supplierId: supplier.id, itemId: '', warehouseId: warehouse.id, quantity: 12.5 },
      { supplierId: supplier.id, itemId: item.id, warehouseId: '', quantity: 12.5 },
      { supplierId: '   ', itemId: item.id, warehouseId: warehouse.id, quantity: 12.5 },
      { supplierId: supplier.id, itemId: '   ', warehouseId: warehouse.id, quantity: 12.5 },
      { supplierId: supplier.id, itemId: item.id, warehouseId: '   ', quantity: 12.5 },
      { supplierId: supplier.id, itemId: item.id, warehouseId: warehouse.id },
    ]

    for (const payload of cases) {
      const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()
      const purchasesBefore = (await request({ method: 'GET', url: '/api/purchases' })).json()

      const response = await request({ method: 'POST', url: '/api/purchases', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'supplierId, itemId, warehouseId, and a positive quantity are required',
        statusCode: 400,
      })
      expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
      expect((await request({ method: 'GET', url: '/api/purchases' })).json<unknown>()).toEqual(purchasesBefore)
    }
  })

  test('C11 POST /api/purchases with quantity 0, -1, NaN or Infinity returns 400', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    for (const quantity of [0, -1]) {
      const response = await request({
        method: 'POST',
        url: '/api/purchases',
        payload: {
          supplierId: supplier.id,
          itemId: item.id,
          warehouseId: warehouse.id,
          quantity,
        },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'quantity must be a positive number',
        statusCode: 400,
      })
    }
  })

  test('C12 POST /api/purchases with missing Supplier, Item, or Warehouse returns 400 and persists nothing', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const cases = [
      { supplierId: 'missing', itemId: item.id, warehouseId: warehouse.id, quantity: 12.5 },
      { supplierId: supplier.id, itemId: 'missing', warehouseId: warehouse.id, quantity: 12.5 },
      { supplierId: supplier.id, itemId: item.id, warehouseId: 'missing', quantity: 12.5 },
    ]

    for (const payload of cases) {
      const response = await request({ method: 'POST', url: '/api/purchases', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'Supplier, Item, or Warehouse not found',
        statusCode: 400,
      })
    }

    expect((await request({ method: 'GET', url: '/api/purchases' })).json<unknown>()).toEqual([])
  })

  test('C13 DELETE /api/purchases/:id without Movement returns 204 and leaves Stock unchanged', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/purchases',
      payload: {
        supplierId: supplier.id,
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 12.5,
      },
    })
    const { id } = created.json() as { id: string }
    const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()

    const deleted = await request({ method: 'DELETE', url: `/api/purchases/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = (await request({ method: 'GET', url: '/api/purchases' })).json() as { id: string }[]
    expect(list.find((row) => row.id === id)).toBeUndefined()
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
  })

  test('C14 DELETE /api/purchases/:id with Movement returns 409 and keeps Purchase, Movement and Stock', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/purchases',
      payload: {
        supplierId: supplier.id,
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 12.5,
      },
    })
    const { id } = created.json() as { id: string }
    const received = await request({ method: 'POST', url: `/api/purchases/${id}/receipts` })
    expect(received.statusCode).toBe(201)
    const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()
    const movementsBefore = (await request({ method: 'GET', url: '/api/movements' })).json()

    const response = await request({ method: 'DELETE', url: `/api/purchases/${id}` })
    expect(response.statusCode).toBe(409)
    expect(response.json<unknown>()).toEqual({
      error: 'Purchase has Movement',
      statusCode: 409,
    })

    const purchases = (await request({ method: 'GET', url: '/api/purchases' })).json() as {
      id: string
    }[]
    expect(purchases.some((row) => row.id === id)).toBe(true)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
  })

  test('C15 DELETE /api/purchases/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/purchases/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Purchase not found',
      statusCode: 404,
    })
  })

  test('C16 POST /api/purchases/:id/receipts creates receipt Movement and raises Stock by 12.5', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/purchases',
      payload: {
        supplierId: supplier.id,
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 12.5,
      },
    })
    const purchase = created.json() as { id: string }

    const response = await request({
      method: 'POST',
      url: `/api/purchases/${purchase.id}/receipts`,
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.type).toBe('receipt')
    expect(body.itemId).toBe(item.id)
    expect(body.quantity).toBe(12.5)
    expect(body.warehouseId).toBe(warehouse.id)
    expect(body.toWarehouseId).toBeNull()
    expect(body.jobId).toBeNull()
    expect(body.purchaseId).toBe(purchase.id)
    expect(body.createdAt).toMatch(ISO_8601)

    const stock = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      itemId: string
      warehouseId: string
      quantity: number
    }[]
    expect(stock).toHaveLength(1)
    expect(stock[0]?.itemId).toBe(item.id)
    expect(stock[0]?.warehouseId).toBe(warehouse.id)
    expect(stock[0]?.quantity).toBe(12.5)

    const movements = (await request({ method: 'GET', url: '/api/movements' })).json() as Record<
      string,
      unknown
    >[]
    expect(movements).toHaveLength(1)
    expect(movements[0]).toEqual(body)
  })

  test('C17 POST /api/purchases/:id/receipts a second time returns 409 and the unique on purchase_id holds', async () => {
    const { supplier, item, warehouse } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/purchases',
      payload: {
        supplierId: supplier.id,
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 12.5,
      },
    })
    const purchase = created.json() as { id: string }
    const first = await request({ method: 'POST', url: `/api/purchases/${purchase.id}/receipts` })
    expect(first.statusCode).toBe(201)
    const stockAfterFirst = (await request({ method: 'GET', url: '/api/stock' })).json()

    const second = await request({ method: 'POST', url: `/api/purchases/${purchase.id}/receipts` })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'Purchase already received',
      statusCode: 409,
    })

    const movements = (await request({ method: 'GET', url: '/api/movements' })).json() as {
      purchaseId: string
    }[]
    expect(movements.filter((row) => row.purchaseId === purchase.id)).toHaveLength(1)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockAfterFirst)

    const sqlite = new Database(dbFile)
    const indexes = sqlite.query('PRAGMA index_list(movements)').all() as {
      name: string
      unique: number
    }[]
    sqlite.close()
    expect(
      indexes.some((index) => index.name === 'movements_purchase_id_unique' && index.unique === 1),
    ).toBe(true)
  })

  test('C18 POST /api/purchases/:id/receipts missing Purchase returns 404 and persists nothing', async () => {
    const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()
    const movementsBefore = (await request({ method: 'GET', url: '/api/movements' })).json()

    const response = await request({
      method: 'POST',
      url: '/api/purchases/00000000-0000-4000-8000-000000000000/receipts',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Purchase not found',
      statusCode: 404,
    })
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)
  })

  test('C26 Operator posts Supplier, Purchase, and Receipt from Purchase', async () => {
    const { item, warehouse } = await seedRefs()
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

    const supplier = await app.inject({
      method: 'POST',
      url: '/api/suppliers',
      headers: { cookie: operatorCookie },
      payload: { name: 'Bulk Co' },
    })
    expect(supplier.statusCode).toBe(201)

    const purchase = await app.inject({
      method: 'POST',
      url: '/api/purchases',
      headers: { cookie: operatorCookie },
      payload: {
        supplierId: (supplier.json() as { id: string }).id,
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 12.5,
      },
    })
    expect(purchase.statusCode).toBe(201)

    const receipt = await app.inject({
      method: 'POST',
      url: `/api/purchases/${(purchase.json() as { id: string }).id}/receipts`,
      headers: { cookie: operatorCookie },
    })
    expect(receipt.statusCode).toBe(201)
  })
})
