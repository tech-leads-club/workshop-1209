import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { SEED_ADMINISTRATOR } from '../src/db/seed'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-identity-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')
const { users } = await import('../src/db/schema')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const operator = { email: 'op@local', password: 'secret', role: 'Operator' }

describe('identity HTTP', () => {
  let app: Awaited<ReturnType<typeof createServer>>
  let cookie = ''

  beforeAll(async () => {
    container.clear()
    app = await createServer()
    cookie = (await login(app)).cookie
  })

  beforeEach(async () => {
    const sqlite = new Database(dbFile)
    sqlite.exec(`DELETE FROM users WHERE email != '${SEED_ADMINISTRATOR.email}'`)
    sqlite.close()
    cookie = (await login(app)).cookie
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  function request(opts: Pick<InjectOptions, 'method' | 'url' | 'payload'>) {
    return app.inject({
      ...opts,
      headers: { cookie },
    })
  }

  test('GET /api/items without a session returns 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/items' })
    expect(response.statusCode).toBe(401)
    expect(response.json<unknown>()).toEqual({
      error: 'Unauthorized',
      statusCode: 401,
    })
  })

  test('GET /health stays public', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual({ status: 'ok' })
  })

  test('POST /api/login with a wrong password returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { email: SEED_ADMINISTRATOR.email, password: 'nope' },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json<unknown>()).toEqual({
      error: 'Invalid credentials',
      statusCode: 401,
    })
  })

  test('POST /api/login sets a session cookie and returns the User without a password hash', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: {
        email: SEED_ADMINISTRATOR.email,
        password: SEED_ADMINISTRATOR.password,
      },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.email).toBe(SEED_ADMINISTRATOR.email)
    expect(body.role).toBe('Administrator')
    expect('passwordHash' in body).toBe(false)
    expect(response.cookies.some((entry) => entry.name === 'sessionId')).toBe(true)
  })

  test('GET /api/me returns the signed-in User', async () => {
    const response = await request({ method: 'GET', url: '/api/me' })
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    expect(body.email).toBe(SEED_ADMINISTRATOR.email)
    expect(body.role).toBe('Administrator')
    expect('passwordHash' in body).toBe(false)
  })

  test('GET /api/users includes the seeded Administrator', async () => {
    const response = await request({ method: 'GET', url: '/api/users' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list.some((row) => row.email === SEED_ADMINISTRATOR.email)).toBe(true)
    expect(list.every((row) => !('passwordHash' in row))).toBe(true)
  })

  test('users table stores a password hash and unique email', () => {
    const { columns } = getTableConfig(users)
    expect(columns.map((column) => column.name).sort()).toEqual([
      'created_at',
      'email',
      'id',
      'password_hash',
      'role',
    ])

    const sqlite = new Database(dbFile)
    const info = sqlite.query('PRAGMA table_info(users)').all() as { name: string }[]
    const indexes = sqlite.query('PRAGMA index_list(users)').all() as {
      name: string
      unique: number
    }[]
    sqlite.close()
    expect(info.map((column) => column.name).sort()).toEqual([
      'created_at',
      'email',
      'id',
      'password_hash',
      'role',
    ])
    expect(indexes.some((index) => index.name === 'users_email_unique' && index.unique === 1)).toBe(
      true,
    )
  })

  test('POST /api/users creates a User without returning the hash', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/users',
      payload: operator,
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.email).toBe('op@local')
    expect(body.role).toBe('Operator')
    expect('passwordHash' in body).toBe(false)
  })

  test('POST /api/users trims and lowercases email', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/users',
      payload: { email: '  OP@Local  ', password: 'secret', role: 'Operator' },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { email: string }).email).toBe('op@local')
  })

  test('POST /api/users with blank fields or an unknown role returns 400', async () => {
    const cases = [
      { email: '', password: 'secret', role: 'Operator' },
      { email: 'op@local', password: '', role: 'Operator' },
      { email: 'op@local', password: 'secret', role: 'Admin' },
    ]

    for (const payload of cases) {
      const response = await request({ method: 'POST', url: '/api/users', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'email, password, and role are required',
        statusCode: 400,
      })
    }
  })

  test('POST /api/users duplicate email returns 409 and keeps one row', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/users',
      payload: operator,
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/users',
      payload: operator,
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'Email already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/users' })
    const rows = list.json() as { email: string }[]
    expect(rows.filter((row) => row.email === 'op@local')).toHaveLength(1)
  })

  test('DELETE /api/users/:id returns 204 and removes the User', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/users',
      payload: operator,
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/users/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await request({ method: 'GET', url: '/api/users' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('DELETE /api/users/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/users/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'User not found',
      statusCode: 404,
    })
  })

  test('POST /api/logout then GET /api/me returns 401', async () => {
    const logout = await request({ method: 'POST', url: '/api/logout' })
    expect(logout.statusCode).toBe(204)

    const me = await request({ method: 'GET', url: '/api/me' })
    expect(me.statusCode).toBe(401)
    expect(me.json<unknown>()).toEqual({
      error: 'Unauthorized',
      statusCode: 401,
    })
  })
})
