import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-staff-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const operator = { email: 'op-staff@local', password: 'secret', role: 'Operator' }

function clearTables() {
  const sqlite = new Database(dbFile)
  sqlite.exec('DELETE FROM assignments')
  sqlite.exec('DELETE FROM staff')
  sqlite.exec('DELETE FROM jobs')
  sqlite.close()
}

describe('staff HTTP', () => {
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

  test('GET /api/staff on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/staff' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('POST /api/staff creates Staff and GET contains it', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Ana' },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.name).toBe('Ana')
    expect(body.createdAt).toMatch(ISO_8601)
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'id', 'name'])

    const list = await request({ method: 'GET', url: '/api/staff' })
    expect(list.statusCode).toBe(200)
    expect(list.json<unknown>()).toEqual([body])
  })

  test('POST /api/staff trims name', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: '  Ana  ' },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { name: string }).name).toBe('Ana')
  })

  test('POST /api/staff with blank, whitespace, or omitted name returns 400 and persists nothing', async () => {
    for (const payload of [{ name: '' }, { name: '   ' }, {}]) {
      clearTables()

      const response = await request({
        method: 'POST',
        url: '/api/staff',
        payload,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'name is required',
        statusCode: 400,
      })

      const list = await request({ method: 'GET', url: '/api/staff' })
      expect(list.json<unknown>()).toEqual([])
    }
  })

  test('POST /api/staff duplicate name returns 409 and keeps one row', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Ana' },
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Ana' },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'Staff already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/staff' })
    const rows = list.json() as { name: string }[]
    expect(rows.filter((row) => row.name === 'Ana')).toHaveLength(1)

    const sqlite = new Database(dbFile)
    const indexes = sqlite.query('PRAGMA index_list(staff)').all() as {
      name: string
      unique: number
    }[]
    sqlite.close()
    expect(indexes.some((index) => index.name === 'staff_name_unique' && index.unique === 1)).toBe(
      true,
    )
  })

  test('POST /api/staff omits email, role, passwordHash, and quantity', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Ana' },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect('email' in body).toBe(false)
    expect('role' in body).toBe(false)
    expect('passwordHash' in body).toBe(false)
    expect('quantity' in body).toBe(false)
  })

  test('Operator creates Staff', async () => {
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

    const response = await app.inject({
      method: 'POST',
      url: '/api/staff',
      headers: { cookie: operatorCookie },
      payload: { name: 'Ana' },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { name: string }).name).toBe('Ana')
  })

  test('Administrator creates Staff', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Ana' },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { name: string }).name).toBe('Ana')
  })

  test('DELETE /api/staff/:id returns 204 and removes the Staff', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Ana' },
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/staff/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await request({ method: 'GET', url: '/api/staff' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('DELETE /api/staff/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/staff/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Staff not found',
      statusCode: 404,
    })
  })

  test('DELETE /api/staff/:id with Assignment returns 409 and keeps both', async () => {
    const staff = (
      await request({ method: 'POST', url: '/api/staff', payload: { name: 'Ana' } })
    ).json() as { id: string }
    const job = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site A' } })
    ).json() as { id: string }
    const assignment = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(assignment.statusCode).toBe(201)
    const assignmentId = (assignment.json() as { id: string }).id

    const response = await request({ method: 'DELETE', url: `/api/staff/${staff.id}` })
    expect(response.statusCode).toBe(409)
    expect(response.json<unknown>()).toEqual({
      error: 'Staff has Assignment',
      statusCode: 409,
    })

    const staffList = (await request({ method: 'GET', url: '/api/staff' })).json() as { id: string }[]
    expect(staffList.some((row) => row.id === staff.id)).toBe(true)
    const assignmentList = (await request({ method: 'GET', url: '/api/assignments' })).json() as {
      id: string
    }[]
    expect(assignmentList.some((row) => row.id === assignmentId)).toBe(true)
  })

  test('GET POST DELETE /api/staff without a session returns 401', async () => {
    const cases: InjectOptions[] = [
      { method: 'GET', url: '/api/staff' },
      { method: 'POST', url: '/api/staff', payload: { name: 'Ana' } },
      { method: 'DELETE', url: '/api/staff/00000000-0000-4000-8000-000000000000' },
    ]

    for (const opts of cases) {
      const response = await app.inject(opts)
      expect(response.statusCode).toBe(401)
      expect(response.json<unknown>()).toEqual({
        error: 'Unauthorized',
        statusCode: 401,
      })
    }
  })
})
