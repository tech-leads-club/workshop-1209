import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-stock-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')
const { items, stock, warehouses } = await import('../src/db/schema')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const itemPayload = { sku: 'CEM-50', name: 'Cimento CP-II', unit: 'saco' }
const warehousePayload = { name: 'Central' }

function clearTables() {
  const sqlite = new Database(dbFile)
  sqlite.exec('DELETE FROM movements')
  sqlite.exec('DELETE FROM stock')
  sqlite.exec('DELETE FROM warehouses')
  sqlite.exec('DELETE FROM items')
  sqlite.close()
}

describe('warehouses and stock HTTP', () => {
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

  test('GET /api/warehouses on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/warehouses' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('GET /api/stock on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/stock' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('POST /api/warehouses creates Warehouse', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/warehouses',
      payload: warehousePayload,
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.name).toBe('Central')
    expect(typeof body.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(body.createdAt as string))).toBe(false)
    expect('quantity' in body).toBe(false)
  })

  test('GET /api/warehouses contains the created Warehouse', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/warehouses',
      payload: warehousePayload,
    })
    const warehouse = created.json() as Record<string, unknown>
    const response = await request({ method: 'GET', url: '/api/warehouses' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(warehouse.id)
    expect(list[0]?.name).toBe('Central')
    expect(list[0]?.createdAt).toBe(warehouse.createdAt)
  })

  test('POST /api/warehouses trims name', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/warehouses',
      payload: { name: '  Central  ' },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { name: string }).name).toBe('Central')
  })

  test('warehouses table has no quantity column', () => {
    const { columns } = getTableConfig(warehouses)
    expect(columns.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'name',
    ])

    const sqlite = new Database(dbFile)
    const info = sqlite.query('PRAGMA table_info(warehouses)').all() as { name: string }[]
    sqlite.close()
    expect(info.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'name',
    ])
  })

  test('POST /api/warehouses with blank or whitespace name returns 400 and does not persist', async () => {
    for (const name of ['', '   ']) {
      clearTables()

      const response = await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: { name },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'name is required',
        statusCode: 400,
      })

      const list = await request({ method: 'GET', url: '/api/warehouses' })
      expect(list.json<unknown>()).toEqual([])
    }
  })

  test('POST /api/warehouses duplicate name returns 409 and keeps one row', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/warehouses',
      payload: warehousePayload,
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/warehouses',
      payload: warehousePayload,
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'Warehouse already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/warehouses' })
    const rows = list.json() as { name: string }[]
    expect(rows.filter((row) => row.name === 'Central')).toHaveLength(1)
  })

  test('DELETE /api/warehouses/:id returns 204 and removes the Warehouse', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/warehouses',
      payload: warehousePayload,
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/warehouses/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await request({ method: 'GET', url: '/api/warehouses' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('DELETE /api/warehouses/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/warehouses/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Warehouse not found',
      statusCode: 404,
    })
  })

  test('stock table has quantity and unique warehouse plus item', () => {
    const { columns } = getTableConfig(stock)
    expect(columns.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'item_id',
      'quantity',
      'warehouse_id',
    ])

    const sqlite = new Database(dbFile)
    const info = sqlite.query('PRAGMA table_info(stock)').all() as { name: string }[]
    const indexes = sqlite.query('PRAGMA index_list(stock)').all() as {
      name: string
      unique: number
    }[]
    sqlite.close()
    expect(info.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'item_id',
      'quantity',
      'warehouse_id',
    ])
    expect(
      indexes.some(
        (index) => index.name === 'stock_warehouse_item_unique' && index.unique === 1,
      ),
    ).toBe(true)
  })

  test('Receipt creates quantity in a Warehouse without putting quantity on the Item', async () => {
    const item = (
      await request({ method: 'POST', url: '/api/items', payload: itemPayload })
    ).json() as { id: string }
    const warehouse = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: warehousePayload,
      })
    ).json() as { id: string }

    const receipt = await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouse.id, itemId: item.id, quantity: 12.5 },
    })
    expect(receipt.statusCode).toBe(201)

    const response = await request({ method: 'GET', url: '/api/stock' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]?.warehouseId).toBe(warehouse.id)
    expect(list[0]?.itemId).toBe(item.id)
    expect(list[0]?.quantity).toBe(12.5)

    const catalog = await request({ method: 'GET', url: '/api/items' })
    const listed = catalog.json() as Record<string, unknown>[]
    expect(listed).toHaveLength(1)
    expect('quantity' in (listed[0] ?? {})).toBe(false)

    const { columns } = getTableConfig(items)
    expect(columns.map((column) => column.name)).not.toContain('quantity')
  })

  test('GET /api/stock contains Stock created by Receipt', async () => {
    const item = (
      await request({ method: 'POST', url: '/api/items', payload: itemPayload })
    ).json() as { id: string }
    const warehouse = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: warehousePayload,
      })
    ).json() as { id: string }

    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouse.id, itemId: item.id, quantity: 4 },
    })

    const response = await request({ method: 'GET', url: '/api/stock' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]?.warehouseId).toBe(warehouse.id)
    expect(list[0]?.itemId).toBe(item.id)
    expect(list[0]?.quantity).toBe(4)
  })

  test('POST /api/stock returns 404 and persists no Stock', async () => {
    const item = (
      await request({ method: 'POST', url: '/api/items', payload: itemPayload })
    ).json() as { id: string }
    const warehouse = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: warehousePayload,
      })
    ).json() as { id: string }

    const response = await request({
      method: 'POST',
      url: '/api/stock',
      payload: { warehouseId: warehouse.id, itemId: item.id, quantity: 12.5 },
    })
    expect(response.statusCode).toBe(404)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual([])
  })

  test('DELETE /api/stock/:id returns 404 and leaves Stock unchanged', async () => {
    const item = (
      await request({ method: 'POST', url: '/api/items', payload: itemPayload })
    ).json() as { id: string }
    const warehouse = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: warehousePayload,
      })
    ).json() as { id: string }
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouse.id, itemId: item.id, quantity: 3 },
    })
    const listed = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      id: string
    }[]

    const deleted = await request({ method: 'DELETE', url: `/api/stock/${listed[0]?.id}` })
    expect(deleted.statusCode).toBe(404)

    const after = (await request({ method: 'GET', url: '/api/stock' })).json() as {
      quantity: number
    }[]
    expect(after).toHaveLength(1)
    expect(after[0]?.quantity).toBe(3)
  })

  test('DELETE /api/warehouses/:id with Stock returns 409', async () => {
    const item = (
      await request({ method: 'POST', url: '/api/items', payload: itemPayload })
    ).json() as { id: string }
    const warehouse = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: warehousePayload,
      })
    ).json() as { id: string }
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouse.id, itemId: item.id, quantity: 1 },
    })

    const response = await request({
      method: 'DELETE',
      url: `/api/warehouses/${warehouse.id}`,
    })
    expect(response.statusCode).toBe(409)
    expect(response.json<unknown>()).toEqual({
      error: 'Warehouse has Stock',
      statusCode: 409,
    })
  })

  test('DELETE /api/items/:id with Stock returns 409', async () => {
    const item = (
      await request({ method: 'POST', url: '/api/items', payload: itemPayload })
    ).json() as { id: string }
    const warehouse = (
      await request({
        method: 'POST',
        url: '/api/warehouses',
        payload: warehousePayload,
      })
    ).json() as { id: string }
    await request({
      method: 'POST',
      url: '/api/receipts',
      payload: { warehouseId: warehouse.id, itemId: item.id, quantity: 1 },
    })

    const response = await request({
      method: 'DELETE',
      url: `/api/items/${item.id}`,
    })
    expect(response.statusCode).toBe(409)
    expect(response.json<unknown>()).toEqual({
      error: 'Item has Stock',
      statusCode: 409,
    })
  })
})
