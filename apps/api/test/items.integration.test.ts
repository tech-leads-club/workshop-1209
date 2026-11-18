import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { login } from './login'

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
    const response = await request({ method: 'GET', url: '/api/items' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('GET /health returns 200 { status: ok }', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual({ status: 'ok' })
  })

  test('POST /api/items creates Item without quantity', async () => {
    const response = await request({
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
    const created = await request({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const item = created.json() as Record<string, unknown>
    const response = await request({ method: 'GET', url: '/api/items' })
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
    const response = await request({
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

      const response = await request({
        method: 'POST',
        url: '/api/items',
        payload: input,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'sku, name, and unit are required',
        statusCode: 400,
      })

      const list = await request({ method: 'GET', url: '/api/items' })
      expect(list.statusCode).toBe(200)
      expect(list.json<unknown>()).toEqual([])
    }
  })

  test('POST /api/items duplicate sku returns 409 and keeps one row', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'SKU already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { sku: string }[]
    expect(rows.filter((row) => row.sku === 'CEM-50')).toHaveLength(1)
  })

  test('POST /api/items concurrent duplicate sku returns 201 and 409 with one row', async () => {
    const [first, second] = await Promise.all([
      request({ method: 'POST', url: '/api/items', payload }),
      request({ method: 'POST', url: '/api/items', payload }),
    ])
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409])

    const list = await request({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { sku: string }[]
    expect(rows.filter((row) => row.sku === 'CEM-50')).toHaveLength(1)
  })

  test('POST /api/items treats ABC and abc as distinct skus', async () => {
    const upper = await request({
      method: 'POST',
      url: '/api/items',
      payload: { sku: 'ABC', name: 'Upper', unit: 'un' },
    })
    expect(upper.statusCode).toBe(201)

    const lower = await request({
      method: 'POST',
      url: '/api/items',
      payload: { sku: 'abc', name: 'Lower', unit: 'un' },
    })
    expect(lower.statusCode).toBe(201)

    const list = await request({ method: 'GET', url: '/api/items' })
    expect(list.json()).toHaveLength(2)
  })

  test('DELETE /api/items/:id returns 204 and removes the Item', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/items',
      payload,
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/items/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await request({ method: 'GET', url: '/api/items' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('DELETE /api/items/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/items/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Item not found',
      statusCode: 404,
    })
  })
})
