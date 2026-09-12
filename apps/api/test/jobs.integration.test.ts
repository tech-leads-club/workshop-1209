import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-jobs-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')
const { jobs } = await import('../src/db/schema')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const jobPayload = { name: 'Site A' }
const operator = { email: 'op@local', password: 'secret', role: 'Operator' }

function clearJobs() {
  const sqlite = new Database(dbFile)
  sqlite.exec('DELETE FROM jobs')
  sqlite.close()
}

describe('jobs HTTP', () => {
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

  beforeEach(() => {
    clearJobs()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('S1 GET /api/jobs on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/jobs' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  test('S2 POST /api/jobs creates Job', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.name).toBe('Site A')
    expect(typeof body.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(body.createdAt as string))).toBe(false)
    expect('quantity' in body).toBe(false)
  })

  test('S3 GET /api/jobs contains the created Job', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    const job = created.json() as Record<string, unknown>
    const response = await request({ method: 'GET', url: '/api/jobs' })
    expect(response.statusCode).toBe(200)
    const list = response.json() as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(job.id)
    expect(list[0]?.name).toBe('Site A')
    expect(list[0]?.createdAt).toBe(job.createdAt)
  })

  test('S4 POST /api/jobs trims name', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: { name: '  Site A  ' },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { name: string }).name).toBe('Site A')
  })

  test('S5 POST /api/jobs with blank or whitespace name returns 400 and does not persist', async () => {
    for (const name of ['', '   ']) {
      clearJobs()

      const response = await request({
        method: 'POST',
        url: '/api/jobs',
        payload: { name },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'name is required',
        statusCode: 400,
      })

      const list = await request({ method: 'GET', url: '/api/jobs' })
      expect(list.json()).toEqual([])
    }
  })

  test('S6 POST /api/jobs duplicate name returns 409 and keeps one row', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    expect(second.statusCode).toBe(409)
    expect(second.json()).toEqual({
      error: 'Job already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as { name: string }[]
    expect(rows.filter((row) => row.name === 'Site A')).toHaveLength(1)
  })

  test('PATCH /api/jobs/:id renames the Job and keeps id and createdAt', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    const job = created.json() as { id: string; name: string; createdAt: string }

    const response = await request({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: { name: 'Site B' },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    expect(body).toEqual({
      id: job.id,
      name: 'Site B',
      createdAt: job.createdAt,
    })
    expect('quantity' in body).toBe(false)

    const again = await request({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: { name: 'Site B' },
    })
    expect(again.statusCode).toBe(200)
    expect(again.json()).toEqual({
      id: job.id,
      name: 'Site B',
      createdAt: job.createdAt,
    })

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      id: job.id,
      name: 'Site B',
      createdAt: job.createdAt,
    })
  })

  test('PATCH /api/jobs/:id duplicate name returns 409 and keeps original names', async () => {
    const first = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: { name: 'Site A' },
    })
    const second = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: { name: 'Site B' },
    })
    const jobA = first.json() as { id: string; name: string; createdAt: string }
    const jobB = second.json() as { id: string; name: string; createdAt: string }

    const response = await request({
      method: 'PATCH',
      url: `/api/jobs/${jobA.id}`,
      payload: { name: 'Site B' },
    })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      error: 'Job already exists',
      statusCode: 409,
    })

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as { id: string; name: string }[]
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: jobA.id, name: 'Site A' }),
        expect.objectContaining({ id: jobB.id, name: 'Site B' }),
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  test('PATCH /api/jobs/:id with blank or whitespace name returns 400 and does not persist', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    const job = created.json() as { id: string; name: string; createdAt: string }

    for (const name of ['', '   ']) {
      const response = await request({
        method: 'PATCH',
        url: `/api/jobs/${job.id}`,
        payload: { name },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'name is required',
        statusCode: 400,
      })

      const list = await request({ method: 'GET', url: '/api/jobs' })
      const rows = list.json() as { id: string; name: string }[]
      expect(rows.find((row) => row.id === job.id)?.name).toBe('Site A')
    }
  })

  test('PATCH /api/jobs/:id missing id returns 404', async () => {
    const response = await request({
      method: 'PATCH',
      url: '/api/jobs/00000000-0000-4000-8000-000000000000',
      payload: { name: 'Site B' },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: 'Job not found',
      statusCode: 404,
    })
  })

  test('PATCH /api/jobs/:id without a session returns 401', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/jobs/00000000-0000-4000-8000-000000000000',
      payload: { name: 'Site B' },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'Unauthorized',
      statusCode: 401,
    })
  })

  test('PATCH /api/jobs/:id trims name', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    const job = created.json() as { id: string }

    const response = await request({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: { name: '  Site B  ' },
    })
    expect(response.statusCode).toBe(200)
    expect((response.json() as { name: string }).name).toBe('Site B')

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as { id: string; name: string }[]
    expect(rows.find((row) => row.id === job.id)?.name).toBe('Site B')
  })

  test('PATCH /api/jobs/:id ignores quantity', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    const job = created.json() as { id: string; createdAt: string }

    const response = await request({
      method: 'PATCH',
      url: `/api/jobs/${job.id}`,
      payload: { name: 'Site B', quantity: 10 },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    expect(body).toEqual({
      id: job.id,
      name: 'Site B',
      createdAt: job.createdAt,
    })
    expect('quantity' in body).toBe(false)

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as Record<string, unknown>[]
    const persisted = rows.find((row) => row.id === job.id)
    expect(persisted).toEqual({
      id: job.id,
      name: 'Site B',
      createdAt: job.createdAt,
    })
    expect(persisted && 'quantity' in persisted).toBe(false)
  })

  test('S7 DELETE /api/jobs/:id returns 204 and removes the Job', async () => {
    const created = await request({
      method: 'POST',
      url: '/api/jobs',
      payload: jobPayload,
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/jobs/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as { id: string }[]
    expect(rows.find((row) => row.id === id)).toBeUndefined()
  })

  test('S8 DELETE /api/jobs/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/jobs/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: 'Job not found',
      statusCode: 404,
    })
  })

  test('S9 jobs table has no quantity column', () => {
    const { columns } = getTableConfig(jobs)
    expect(columns.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'name',
    ])

    const sqlite = new Database(dbFile)
    const info = sqlite.query('PRAGMA table_info(jobs)').all() as { name: string }[]
    const indexes = sqlite.query('PRAGMA index_list(jobs)').all() as {
      name: string
      unique: number
    }[]
    sqlite.close()
    expect(info.map((column) => column.name).sort()).toEqual([
      'created_at',
      'id',
      'name',
    ])
    expect(indexes.some((index) => index.name === 'jobs_name_unique' && index.unique === 1)).toBe(
      true,
    )
  })

  test('S10 GET /api/jobs without a session returns 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/jobs' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'Unauthorized',
      statusCode: 401,
    })
  })

  test('S11 Operator creates a Job', async () => {
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
      url: '/api/jobs',
      headers: { cookie: operatorCookie },
      payload: jobPayload,
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as { name: string }
    expect(body.name).toBe('Site A')

    const list = await request({ method: 'GET', url: '/api/jobs' })
    const rows = list.json() as { name: string }[]
    expect(rows.some((row) => row.name === 'Site A')).toBe(true)
  })
})
