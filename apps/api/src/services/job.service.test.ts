import { describe, expect, test } from 'bun:test'
import sinon from 'sinon'
import { JobRepository } from '../repositories/job.repository'
import { JobService } from './job.service'

const valid = { name: 'Site A' }
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function uniqueByCode() {
  return Object.assign(new Error('UNIQUE constraint failed: jobs.name'), {
    code: 'SQLITE_CONSTRAINT_UNIQUE',
  })
}

function uniqueByMessage() {
  return new Error('UNIQUE constraint failed: jobs.name')
}

function uniqueByCause() {
  return Object.assign(new Error('wrapped'), { cause: uniqueByCode() })
}

describe('JobService', () => {
  test('S5 create with blank or whitespace name throws 400 and does not call repository.create', async () => {
    for (const name of ['', '   ']) {
      const jobs = sinon.createStubInstance(JobRepository)
      const service = new JobService(jobs)

      try {
        await service.create({ name })
        throw new Error(`expected create to throw for ${JSON.stringify(name)}`)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error & { statusCode: number }).statusCode).toBe(400)
        expect((error as Error).message).toBe('name is required')
      }

      expect(jobs.create.notCalled).toBe(true)
    }
  })

  test('S4 create trims name before repository.create', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.create.resolves()
    const service = new JobService(jobs)

    await service.create({ name: '  Site A  ' })

    expect(jobs.create.calledOnce).toBe(true)
    expect(jobs.create.firstCall.args[0].name).toBe('Site A')
  })

  test('S2 create persists a UUID id, ISO-8601 createdAt, and returns that record', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.create.resolves()
    const service = new JobService(jobs)

    const created = await service.create(valid)

    expect(created.id).toMatch(UUID)
    expect(created.createdAt).toMatch(ISO_8601)
    expect(created.name).toBe('Site A')
    expect('quantity' in created).toBe(false)
    expect(jobs.create.firstCall.args[0]).toEqual(created)
  })

  test('S6 create maps a unique-constraint error to 409', async () => {
    const errors = [uniqueByCode(), uniqueByMessage(), uniqueByCause()]

    for (const thrown of errors) {
      const jobs = sinon.createStubInstance(JobRepository)
      jobs.create.rejects(thrown)
      const service = new JobService(jobs)

      try {
        await service.create(valid)
        throw new Error('expected create to throw')
      } catch (error) {
        expect((error as Error & { statusCode: number }).statusCode).toBe(409)
        expect((error as Error).message).toBe('Job already exists')
      }
    }
  })

  test('create rethrows errors that are not unique violations', async () => {
    const boom = new Error('disk full')
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.create.rejects(boom)
    const service = new JobService(jobs)

    try {
      await service.create(valid)
      throw new Error('expected create to throw')
    } catch (error) {
      expect(error).toBe(boom)
    }
  })

  test('updateById returns the updated Job and keeps id and createdAt', async () => {
    const persisted = {
      id: 'job-1',
      name: 'Site B',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.updateById.resolves(persisted)
    const service = new JobService(jobs)

    const updated = await service.updateById('job-1', { name: 'Site B' })

    expect(updated).toEqual(persisted)
    expect('quantity' in updated).toBe(false)
    expect(jobs.updateById.calledOnce).toBe(true)
    expect(jobs.updateById.firstCall.args).toEqual(['job-1', 'Site B'])
  })

  test('updateById maps a unique-constraint error to 409', async () => {
    const errors = [uniqueByCode(), uniqueByMessage(), uniqueByCause()]

    for (const thrown of errors) {
      const jobs = sinon.createStubInstance(JobRepository)
      jobs.updateById.rejects(thrown)
      const service = new JobService(jobs)

      try {
        await service.updateById('job-1', { name: 'Site B' })
        throw new Error('expected updateById to throw')
      } catch (error) {
        expect((error as Error & { statusCode: number }).statusCode).toBe(409)
        expect((error as Error).message).toBe('Job already exists')
      }
    }
  })

  test('updateById with blank or whitespace name throws 400 and does not call repository.updateById', async () => {
    for (const name of ['', '   ']) {
      const jobs = sinon.createStubInstance(JobRepository)
      const service = new JobService(jobs)

      try {
        await service.updateById('job-1', { name })
        throw new Error(`expected updateById to throw for ${JSON.stringify(name)}`)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error & { statusCode: number }).statusCode).toBe(400)
        expect((error as Error).message).toBe('name is required')
      }

      expect(jobs.updateById.notCalled).toBe(true)
    }
  })

  test('updateById throws 404 when the repository updates nothing', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.updateById.resolves(undefined)
    const service = new JobService(jobs)

    try {
      await service.updateById('00000000-0000-4000-8000-000000000000', {
        name: 'Site B',
      })
      throw new Error('expected updateById to throw')
    } catch (error) {
      expect((error as Error & { statusCode: number }).statusCode).toBe(404)
      expect((error as Error).message).toBe('Job not found')
    }
  })

  test('updateById trims name before repository.updateById', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.updateById.resolves({
      id: 'job-1',
      name: 'Site B',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const service = new JobService(jobs)

    await service.updateById('job-1', { name: '  Site B  ' })

    expect(jobs.updateById.calledOnce).toBe(true)
    expect(jobs.updateById.firstCall.args).toEqual(['job-1', 'Site B'])
  })

  test('updateById ignores quantity', async () => {
    const persisted = {
      id: 'job-1',
      name: 'Site B',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.updateById.resolves(persisted)
    const service = new JobService(jobs)

    const updated = await service.updateById('job-1', {
      name: 'Site B',
      quantity: 10,
    } as { name: string; quantity: number })

    expect(updated).toEqual(persisted)
    expect('quantity' in updated).toBe(false)
    expect(jobs.updateById.firstCall.args).toEqual(['job-1', 'Site B'])
  })

  test('updateById rethrows errors that are not unique violations', async () => {
    const boom = new Error('disk full')
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.updateById.rejects(boom)
    const service = new JobService(jobs)

    try {
      await service.updateById('job-1', { name: 'Site B' })
      throw new Error('expected updateById to throw')
    } catch (error) {
      expect(error).toBe(boom)
    }
  })

  test('S7 deleteById succeeds when the repository deletes the row', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.deleteById.resolves(true)
    const service = new JobService(jobs)
    await service.deleteById('job-1')
    expect(jobs.deleteById.calledOnceWith('job-1')).toBe(true)
  })

  function foreignKeyByCode() {
    return Object.assign(new Error('FOREIGN KEY constraint failed'), {
      code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
    })
  }

  test('deleteById maps a foreign-key error to 409 Job has Movement', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.deleteById.rejects(foreignKeyByCode())
    const service = new JobService(jobs)

    try {
      await service.deleteById('job-1')
      throw new Error('expected deleteById to throw')
    } catch (error) {
      expect((error as Error & { statusCode: number }).statusCode).toBe(409)
      expect((error as Error).message).toBe('Job has Movement')
    }
  })

  test('S8 deleteById throws 404 when the repository deletes nothing', async () => {
    const jobs = sinon.createStubInstance(JobRepository)
    jobs.deleteById.resolves(false)
    const service = new JobService(jobs)

    try {
      await service.deleteById('missing')
      throw new Error('expected deleteById to throw')
    } catch (error) {
      expect((error as Error & { statusCode: number }).statusCode).toBe(404)
      expect((error as Error).message).toBe('Job not found')
    }
  })
})
