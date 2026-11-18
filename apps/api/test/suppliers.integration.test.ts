import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-suppliers-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function clearTables() {
  const sqlite = new Database(dbFile)
  sqlite.exec('DELETE FROM movements')
  sqlite.exec('DELETE FROM stock')
  sqlite.exec('DELETE FROM purchases')
  sqlite.exec('DELETE FROM suppliers')
  sqlite.exec('DELETE FROM warehouses')
  sqlite.exec('DELETE FROM items')
  sqlite.close()
}

describe('suppliers HTTP', () => {
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

  beforeEach(() => {
    clearTables()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('C1 GET /api/suppliers on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/suppliers' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('C2 POST /api/suppliers trims name, lists the record, leaves purchases empty and stock unchanged', async () => {
    const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()

    const response = await request({
      method: 'POST',
      url: '/api/suppliers',
      payload: { name: '  Acme  ' },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.name).toBe('Acme')
    expect(body.createdAt).toMatch(ISO_8601)
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'id', 'name'])

    const list = await request({ method: 'GET', url: '/api/suppliers' })
    expect(list.statusCode).toBe(200)
    expect(list.json<unknown>()).toEqual([body])

    const purchases = await request({ method: 'GET', url: '/api/purchases' })
    expect(purchases.statusCode).toBe(200)
    expect(purchases.json<unknown>()).toEqual([])

    const stockAfter = await request({ method: 'GET', url: '/api/stock' })
    expect(stockAfter.json<unknown>()).toEqual(stockBefore)
  })

  test('C3 POST /api/suppliers duplicate name returns 409 and keeps one Acme', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/suppliers',
      payload: { name: 'Acme' },
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/suppliers',
      payload: { name: 'Acme' },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'Supplier already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/suppliers' })
    const rows = list.json() as { name: string }[]
    expect(rows.filter((row) => row.name === 'Acme')).toHaveLength(1)
  })

  test('C4 POST /api/suppliers with blank or whitespace name returns 400', async () => {
    for (const name of ['', '   ']) {
      clearTables()

      const response = await request({
        method: 'POST',
        url: '/api/suppliers',
        payload: { name },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'name is required',
        statusCode: 400,
      })

      const list = await request({ method: 'GET', url: '/api/suppliers' })
      expect(list.json<unknown>()).toEqual([])
    }
  })

  test('C5 DELETE /api/suppliers/:id returns 204 and removes the Supplier', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/suppliers',
      payload: { name: 'Acme' },
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/suppliers/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await request({ method: 'GET', url: '/api/suppliers' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('C6 DELETE /api/suppliers/:id with a Purchase returns 409 and keeps both', async () => {
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

    const response = await request({ method: 'DELETE', url: `/api/suppliers/${supplier.id}` })
    expect(response.statusCode).toBe(409)
    expect(response.json<unknown>()).toEqual({
      error: 'Supplier has Purchase',
      statusCode: 409,
    })

    const suppliers = (await request({ method: 'GET', url: '/api/suppliers' })).json() as {
      id: string
    }[]
    expect(suppliers.some((row) => row.id === supplier.id)).toBe(true)
    const purchases = (await request({ method: 'GET', url: '/api/purchases' })).json() as {
      id: string
    }[]
    expect(purchases.some((row) => row.id === purchase.id)).toBe(true)
  })

  test('C7 DELETE /api/suppliers/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/suppliers/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Supplier not found',
      statusCode: 404,
    })
  })
})
