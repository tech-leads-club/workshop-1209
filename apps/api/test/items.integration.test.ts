import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-items-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')
const { items } = await import('../src/db/schema')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const payload = { sku: 'CEM-50', name: 'Cimento CP-II', unit: 'saco' }

describe('items HTTP', () => {
  let app: Awaited<ReturnType<typeof createServer>>

  beforeAll(async () => {
    container.clear()
    app = await createServer()
  })

  beforeEach(async () => {
    const sqlite = new Database(dbFile)
    sqlite.exec('DELETE FROM items')
    sqlite.close()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('GET /api/items on empty table returns 200 []', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/items' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  test('GET /health returns 200 { status: ok }', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  test('POST /api/items creates Item without quantity', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.sku).toBe('CEM-50')
    expect(body.name).toBe('Cimento CP-II')
    expect(body.unit).toBe('saco')
    expect(typeof body.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(body.createdAt as string))).toBe(false)
    expect('quantity' in body).toBe(false)
  })

  test('GET /api/items contains the created Item without quantity', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const item = created.json() as Record<string, unknown>
    const response = await app.inject({ method: 'GET', url: '/api/items' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(item.id)
    expect(list[0]?.sku).toBe('CEM-50')
    expect(list[0]?.name).toBe('Cimento CP-II')
    expect(list[0]?.unit).toBe('saco')
    expect(list[0]?.createdAt).toBe(item.createdAt)
    expect('quantity' in (list[0] ?? {})).toBe(false)
  })

  test('POST /api/items trims sku, name, and unit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: {
        sku: '  CEM-50  ',
        name: '  Cimento CP-II  ',
        unit: '  saco  ',
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as { sku: string; name: string; unit: string }
    expect(body.sku).toBe('CEM-50')
    expect(body.name).toBe('Cimento CP-II')
    expect(body.unit).toBe('saco')
  })

  test('items table has no quantity column', () => {
    const { columns } = getTableConfig(items)
    expect(columns.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'name',
      'sku',
      'unit',
    ])

    const sqlite = new Database(dbFile)
    const info = sqlite.query('PRAGMA table_info(items)').all() as { name: string }[]
    sqlite.close()
    expect(info.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'name',
      'sku',
      'unit',
    ])
  })

  test('POST /api/items with blank or whitespace sku, name, or unit returns 400 and does not persist', async () => {
    const cases = [
      { sku: '', name: payload.name, unit: payload.unit },
      { sku: payload.sku, name: '', unit: payload.unit },
      { sku: payload.sku, name: payload.name, unit: '' },
      { sku: '   ', name: payload.name, unit: payload.unit },
      { sku: payload.sku, name: '   ', unit: payload.unit },
      { sku: payload.sku, name: payload.name, unit: '   ' },
    ]

    for (const input of cases) {
      const sqlite = new Database(dbFile)
      sqlite.exec('DELETE FROM items')
      sqlite.close()

      const response = await app.inject({
        method: 'POST',
        url: '/api/items',
        payload: input,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'sku, name, and unit are required',
        statusCode: 400,
      })

      const list = await app.inject({ method: 'GET', url: '/api/items' })
      expect(list.statusCode).toBe(200)
      expect(list.json()).toEqual([])
    }
  })

  test('POST /api/items duplicate sku returns 409 and keeps one row', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    expect(second.statusCode).toBe(409)
    expect(second.json()).toEqual({
      error: 'SKU already exists',
      statusCode: 409,
    })

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { sku: string }[]
    expect(rows.filter((row) => row.sku === 'CEM-50')).toHaveLength(1)
  })

  test('POST /api/items concurrent duplicate sku returns 201 and 409 with one row', async () => {
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/items', payload }),
      app.inject({ method: 'POST', url: '/api/items', payload }),
    ])
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409])

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { sku: string }[]
    expect(rows.filter((row) => row.sku === 'CEM-50')).toHaveLength(1)
  })

  test('POST /api/items treats ABC and abc as distinct skus', async () => {
    const upper = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { sku: 'ABC', name: 'Upper', unit: 'un' },
    })
    expect(upper.statusCode).toBe(201)

    const lower = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload: { sku: 'abc', name: 'Lower', unit: 'un' },
    })
    expect(lower.statusCode).toBe(201)

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    expect(list.json()).toHaveLength(2)
  })

  test('DELETE /api/items/:id returns 204 and removes the Item', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const { id } = created.json() as { id: string }

    const deleted = await app.inject({ method: 'DELETE', url: `/api/items/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('DELETE /api/items/:id missing id returns 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/items/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: 'Item not found',
      statusCode: 404,
    })
  })

  test('PATCH /api/items/:id updates name and unit and keeps sku and createdAt', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const item = created.json() as {
      id: string
      sku: string
      name: string
      unit: string
      createdAt: string
    }

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}`,
      payload: { name: 'Cimento CP-III', unit: 'kg' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: item.id,
      sku: 'CEM-50',
      name: 'Cimento CP-III',
      unit: 'kg',
      createdAt: item.createdAt,
    })
  })

  test('PATCH /api/items/:id ignores sku in the payload', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const { id } = created.json() as { id: string }

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/items/${id}`,
      payload: { name: 'Cimento CP-III', unit: 'kg', sku: 'OUTRO' },
    })
    expect(response.statusCode).toBe(200)
    expect((response.json() as { sku: string }).sku).toBe('CEM-50')

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { id: string; sku: string }[]
    expect(rows.find((row) => row.id === id)?.sku).toBe('CEM-50')
  })

  test('PATCH /api/items/:id with blank or whitespace name or unit returns 400 and does not persist', async () => {
    const cases = [
      { name: '', unit: 'kg' },
      { name: '   ', unit: 'kg' },
      { name: 'Cimento CP-III', unit: '' },
      { name: 'Cimento CP-III', unit: '   ' },
    ]

    for (const input of cases) {
      const sqlite = new Database(dbFile)
      sqlite.exec('DELETE FROM items')
      sqlite.close()

      const created = await app.inject({
        method: 'POST',
        url: '/api/items',
        payload,
      })
      const item = created.json() as { id: string }

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/items/${item.id}`,
        payload: input,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'name and unit are required',
        statusCode: 400,
      })

      const list = await app.inject({ method: 'GET', url: '/api/items' })
      const rows = list.json() as { id: string; name: string; unit: string }[]
      const persisted = rows.find((row) => row.id === item.id)
      expect(persisted?.name).toBe('Cimento CP-II')
      expect(persisted?.unit).toBe('saco')
    }
  })

  test('PATCH /api/items/:id missing id returns 404', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/items/00000000-0000-4000-8000-000000000000',
      payload: { name: 'A', unit: 'un' },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: 'Item not found',
      statusCode: 404,
    })
  })

  test('PATCH /api/items/:id trims name and unit', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const { id } = created.json() as { id: string }

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/items/${id}`,
      payload: { name: '  Cimento CP-III  ', unit: '  kg  ' },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as { name: string; unit: string }
    expect(body.name).toBe('Cimento CP-III')
    expect(body.unit).toBe('kg')

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { id: string; name: string; unit: string }[]
    const persisted = rows.find((row) => row.id === id)
    expect(persisted?.name).toBe('Cimento CP-III')
    expect(persisted?.unit).toBe('kg')
  })

  test('PATCH /api/items/:id with the same valid body again is 200 and does not create a row', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const item = created.json() as { id: string }

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}`,
      payload: { name: 'Cimento CP-III', unit: 'kg' },
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}`,
      payload: { name: 'Cimento CP-III', unit: 'kg' },
    })
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({
      ...(first.json() as Record<string, unknown>),
      name: 'Cimento CP-III',
      unit: 'kg',
      sku: 'CEM-50',
    })

    const list = await app.inject({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { id: string }[]
    expect(rows.filter((row) => row.id === item.id)).toHaveLength(1)
    expect(rows).toHaveLength(1)
  })
})
