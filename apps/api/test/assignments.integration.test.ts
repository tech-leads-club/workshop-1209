import type { InjectOptions } from 'fastify'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { login } from './login'

const dbDir = mkdtempSync(join(tmpdir(), 'fake-erp-assignments-'))
const dbFile = join(dbDir, 'test.sqlite')
Bun.env.DB_FILE_NAME = dbFile
Bun.env.LOG_LEVEL = 'silent'

const { container } = await import('../src/container/container')
const { createServer } = await import('../src/server')

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const operator = { email: 'op-asgn@local', password: 'secret', role: 'Operator' }

function clearTables() {
  const sqlite = new Database(dbFile)
  sqlite.exec('DELETE FROM assignments')
  sqlite.exec('DELETE FROM staff')
  sqlite.exec('DELETE FROM jobs')
  sqlite.close()
}

describe('assignments HTTP', () => {
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
    const staff = (
      await request({ method: 'POST', url: '/api/staff', payload: { name: 'Ana' } })
    ).json() as { id: string }
    const job = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site A' } })
    ).json() as { id: string }
    return { staff, job }
  }

  beforeEach(() => {
    clearTables()
  })

  afterAll(async () => {
    await app.close()
    container.clear()
  })

  test('GET /api/assignments on empty table returns 200 []', async () => {
    const response = await request({ method: 'GET', url: '/api/assignments' })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual([])
  })

  test('POST /api/assignments creates Assignment and GET contains it', async () => {
    const { staff, job } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.id).toMatch(UUID)
    expect(body.staffId).toBe(staff.id)
    expect(body.jobId).toBe(job.id)
    expect(body.startDate).toBe('2026-03-01')
    expect(body.endDate).toBe('2026-03-10')
    expect(body.createdAt).toMatch(ISO_8601)
    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'endDate',
      'id',
      'jobId',
      'staffId',
      'startDate',
    ])

    const list = await request({ method: 'GET', url: '/api/assignments' })
    expect(list.statusCode).toBe(200)
    expect(list.json<unknown>()).toEqual([body])
  })

  test('POST /api/assignments trims ids and dates', async () => {
    const { staff, job } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: `  ${staff.id}  `,
        jobId: `  ${job.id}  `,
        startDate: '  2026-03-01  ',
        endDate: '  2026-03-10  ',
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as {
      staffId: string
      jobId: string
      startDate: string
      endDate: string
    }
    expect(body.staffId).toBe(staff.id)
    expect(body.jobId).toBe(job.id)
    expect(body.startDate).toBe('2026-03-01')
    expect(body.endDate).toBe('2026-03-10')
  })

  test('POST /api/assignments with blank or omitted fields returns 400 and persists nothing', async () => {
    const { staff, job } = await seedRefs()
    const cases = [
      { staffId: '', jobId: job.id, startDate: '2026-03-01', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: '', startDate: '2026-03-01', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: job.id, startDate: '', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: job.id, startDate: '2026-03-01', endDate: '' },
      { staffId: '   ', jobId: job.id, startDate: '2026-03-01', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: '   ', startDate: '2026-03-01', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: job.id, startDate: '   ', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: job.id, startDate: '2026-03-01', endDate: '   ' },
      { jobId: job.id, startDate: '2026-03-01', endDate: '2026-03-10' },
      { staffId: staff.id, startDate: '2026-03-01', endDate: '2026-03-10' },
      { staffId: staff.id, jobId: job.id, endDate: '2026-03-10' },
      { staffId: staff.id, jobId: job.id, startDate: '2026-03-01' },
    ]

    for (const payload of cases) {
      const response = await request({ method: 'POST', url: '/api/assignments', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'staffId, jobId, startDate, and endDate are required',
        statusCode: 400,
      })
    }

    expect((await request({ method: 'GET', url: '/api/assignments' })).json<unknown>()).toEqual([])
  })

  test('POST /api/assignments with 2026-3-1, 01/03/2026, or ISO datetime returns 400', async () => {
    const { staff, job } = await seedRefs()
    for (const value of ['2026-3-1', '01/03/2026', '2026-03-01T00:00:00.000Z']) {
      for (const field of ['startDate', 'endDate'] as const) {
        const payload = {
          staffId: staff.id,
          jobId: job.id,
          startDate: '2026-03-01',
          endDate: '2026-03-10',
          [field]: value,
        }
        const response = await request({ method: 'POST', url: '/api/assignments', payload })
        expect(response.statusCode).toBe(400)
        expect(response.json<unknown>()).toEqual({
          error: 'startDate and endDate must be YYYY-MM-DD',
          statusCode: 400,
        })
      }
    }

    expect((await request({ method: 'GET', url: '/api/assignments' })).json<unknown>()).toEqual([])
  })

  test('POST /api/assignments with 2026-02-29 or 2026-13-01 returns 400', async () => {
    const { staff, job } = await seedRefs()
    for (const value of ['2026-02-29', '2026-13-01']) {
      for (const field of ['startDate', 'endDate'] as const) {
        const payload = {
          staffId: staff.id,
          jobId: job.id,
          startDate: '2026-03-01',
          endDate: '2026-03-10',
          [field]: value,
        }
        const response = await request({ method: 'POST', url: '/api/assignments', payload })
        expect(response.statusCode).toBe(400)
        expect(response.json<unknown>()).toEqual({
          error: 'startDate and endDate must be YYYY-MM-DD',
          statusCode: 400,
        })
      }
    }

    expect((await request({ method: 'GET', url: '/api/assignments' })).json<unknown>()).toEqual([])
  })

  test('POST /api/assignments with inverted dates returns 400', async () => {
    const { staff, job } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-10',
        endDate: '2026-03-01',
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toEqual({
      error: 'endDate must be on or after startDate',
      statusCode: 400,
    })
    expect((await request({ method: 'GET', url: '/api/assignments' })).json<unknown>()).toEqual([])
  })

  test('POST /api/assignments with the same startDate and endDate returns 201', async () => {
    const { staff, job } = await seedRefs()
    const response = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-01',
      },
    })
    expect(response.statusCode).toBe(201)
  })

  test('POST /api/assignments with missing Staff or Job returns 400 and persists nothing', async () => {
    const { staff, job } = await seedRefs()
    const cases = [
      {
        staffId: '00000000-0000-4000-8000-000000000001',
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
      {
        staffId: staff.id,
        jobId: '00000000-0000-4000-8000-000000000002',
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    ]

    for (const payload of cases) {
      const response = await request({ method: 'POST', url: '/api/assignments', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json<unknown>()).toEqual({
        error: 'Staff or Job not found',
        statusCode: 400,
      })
    }

    expect((await request({ method: 'GET', url: '/api/assignments' })).json<unknown>()).toEqual([])
  })

  test('POST /api/assignments overlapping inclusive endDate returns 409', async () => {
    const staff = (
      await request({ method: 'POST', url: '/api/staff', payload: { name: 'Ana' } })
    ).json() as { id: string }
    const jobA = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site A' } })
    ).json() as { id: string }
    const jobB = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site B' } })
    ).json() as { id: string }

    const first = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: jobA.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: jobB.id,
        startDate: '2026-03-10',
        endDate: '2026-03-20',
      },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<unknown>()).toEqual({
      error: 'Staff already assigned',
      statusCode: 409,
    })

    const list = (await request({ method: 'GET', url: '/api/assignments' })).json() as unknown[]
    expect(list).toHaveLength(1)
  })

  test('POST /api/assignments adjacent day returns 201', async () => {
    const { staff, job } = await seedRefs()
    const first = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-11',
        endDate: '2026-03-20',
      },
    })
    expect(second.statusCode).toBe(201)
  })

  test('POST /api/assignments for a second Staff on the same Job returns 201', async () => {
    const { staff, job } = await seedRefs()
    const other = (
      await request({ method: 'POST', url: '/api/staff', payload: { name: 'Bia' } })
    ).json() as { id: string }

    const first = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(first.statusCode).toBe(201)

    const second = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: other.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(second.statusCode).toBe(201)
  })

  test('Operator creates Assignment', async () => {
    const { staff, job } = await seedRefs()
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
      url: '/api/assignments',
      headers: { cookie: operatorCookie },
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(response.statusCode).toBe(201)
  })

  test('concurrent overlapping POST /api/assignments persists one and returns 409 to the loser', async () => {
    const staff = (
      await request({ method: 'POST', url: '/api/staff', payload: { name: 'Ana' } })
    ).json() as { id: string }
    const jobA = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site A' } })
    ).json() as { id: string }
    const jobB = (
      await request({ method: 'POST', url: '/api/jobs', payload: { name: 'Site B' } })
    ).json() as { id: string }

    const [first, second] = await Promise.all([
      request({
        method: 'POST',
        url: '/api/assignments',
        payload: {
          staffId: staff.id,
          jobId: jobA.id,
          startDate: '2026-03-01',
          endDate: '2026-03-10',
        },
      }),
      request({
        method: 'POST',
        url: '/api/assignments',
        payload: {
          staffId: staff.id,
          jobId: jobB.id,
          startDate: '2026-03-10',
          endDate: '2026-03-20',
        },
      }),
    ])

    const statuses = [first.statusCode, second.statusCode].sort()
    expect(statuses).toEqual([201, 409])
    const loser = first.statusCode === 409 ? first : second
    expect(loser.json<unknown>()).toEqual({
      error: 'Staff already assigned',
      statusCode: 409,
    })

    const list = (await request({ method: 'GET', url: '/api/assignments' })).json() as unknown[]
    expect(list).toHaveLength(1)
  })

  test('Staff and Assignment create and delete leave Stock and Movement unchanged', async () => {
    const { staff, job } = await seedRefs()
    const stockBefore = (await request({ method: 'GET', url: '/api/stock' })).json()
    const movementsBefore = (await request({ method: 'GET', url: '/api/movements' })).json()

    const createdStaff = await request({
      method: 'POST',
      url: '/api/staff',
      payload: { name: 'Bia' },
    })
    expect(createdStaff.statusCode).toBe(201)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)

    const created = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    expect(created.statusCode).toBe(201)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)

    const assignmentId = (created.json() as { id: string }).id
    const deletedAssignment = await request({
      method: 'DELETE',
      url: `/api/assignments/${assignmentId}`,
    })
    expect(deletedAssignment.statusCode).toBe(204)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)

    const extraStaffId = (createdStaff.json() as { id: string }).id
    const deletedStaff = await request({ method: 'DELETE', url: `/api/staff/${extraStaffId}` })
    expect(deletedStaff.statusCode).toBe(204)
    expect((await request({ method: 'GET', url: '/api/stock' })).json<unknown>()).toEqual(stockBefore)
    expect((await request({ method: 'GET', url: '/api/movements' })).json<unknown>()).toEqual(movementsBefore)
  })

  test('DELETE /api/assignments/:id returns 204', async () => {
    const { staff, job } = await seedRefs()
    const created = await request({
      method: 'POST',
      url: '/api/assignments',
      payload: {
        staffId: staff.id,
        jobId: job.id,
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    })
    const { id } = created.json() as { id: string }

    const deleted = await request({ method: 'DELETE', url: `/api/assignments/${id}` })
    expect(deleted.statusCode).toBe(204)

    const list = (await request({ method: 'GET', url: '/api/assignments' })).json() as { id: string }[]
    expect(list.find((row) => row.id === id)).toBeUndefined()
  })

  test('DELETE /api/assignments/:id missing id returns 404', async () => {
    const response = await request({
      method: 'DELETE',
      url: '/api/assignments/00000000-0000-4000-8000-000000000000',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<unknown>()).toEqual({
      error: 'Assignment not found',
      statusCode: 404,
    })
  })

  test('GET POST DELETE /api/assignments without a session returns 401', async () => {
    const cases: InjectOptions[] = [
      { method: 'GET', url: '/api/assignments' },
      {
        method: 'POST',
        url: '/api/assignments',
        payload: {
          staffId: 's',
          jobId: 'j',
          startDate: '2026-03-01',
          endDate: '2026-03-10',
        },
      },
      { method: 'DELETE', url: '/api/assignments/00000000-0000-4000-8000-000000000000' },
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
