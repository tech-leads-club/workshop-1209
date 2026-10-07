import { describe, expect, test } from 'bun:test'
import sinon from 'sinon'
import { RequisitionRepository } from '../repositories/requisition.repository'
import { RequisitionService } from './requisition.service'

describe('RequisitionService', () => {
  test('create with item-1, job-1, and quantity 12.5 returns purchaseId null', async () => {
    const requisitions = sinon.createStubInstance(RequisitionRepository)
    requisitions.existsItem.resolves(true)
    requisitions.existsJob.resolves(true)
    requisitions.create.resolves()
    const service = new RequisitionService(requisitions)

    const created = await service.create({
      itemId: 'item-1',
      jobId: 'job-1',
      quantity: 12.5,
    })

    expect(created.itemId).toBe('item-1')
    expect(created.jobId).toBe('job-1')
    expect(created.quantity).toBe(12.5)
    expect(created.purchaseId).toBeNull()
    expect(requisitions.existsItem.calledOnceWith('item-1')).toBe(true)
    expect(requisitions.existsJob.calledOnceWith('job-1')).toBe(true)
    expect(requisitions.create.calledOnce).toBe(true)
    expect(requisitions.create.firstCall.args[0]).toEqual(created)
  })

  test('create with missing itemId, jobId, or quantity 0, -1, NaN, Infinity, or "12.5" throws 400', async () => {
    const cases = [
      { jobId: 'job-1', quantity: 12.5 },
      { itemId: 'item-1', quantity: 12.5 },
      { itemId: 'item-1', jobId: 'job-1' },
      { itemId: 'item-1', jobId: 'job-1', quantity: 0 },
      { itemId: 'item-1', jobId: 'job-1', quantity: -1 },
      { itemId: 'item-1', jobId: 'job-1', quantity: NaN },
      { itemId: 'item-1', jobId: 'job-1', quantity: Infinity },
      { itemId: 'item-1', jobId: 'job-1', quantity: '12.5' },
    ]

    for (const input of cases) {
      const requisitions = sinon.createStubInstance(RequisitionRepository)
      requisitions.existsItem.resolves(true)
      requisitions.existsJob.resolves(true)
      const service = new RequisitionService(requisitions)

      try {
        await service.create(input)
        throw new Error(`expected create to throw for ${JSON.stringify(input)}`)
      } catch (error) {
        expect((error as Error & { statusCode: number }).statusCode).toBe(400)
      }

      expect(requisitions.create.notCalled).toBe(true)
    }
  })

  test('create with a missing Item or Job throws 400', async () => {
    const cases = [
      { item: false, job: true },
      { item: true, job: false },
    ]

    for (const refs of cases) {
      const requisitions = sinon.createStubInstance(RequisitionRepository)
      requisitions.existsItem.resolves(refs.item)
      requisitions.existsJob.resolves(refs.job)
      const service = new RequisitionService(requisitions)

      try {
        await service.create({ itemId: 'item-1', jobId: 'job-1', quantity: 12.5 })
        throw new Error('expected create to throw')
      } catch (error) {
        expect((error as Error & { statusCode: number }).statusCode).toBe(400)
        expect((error as Error).message).toBe('Item or Job not found')
      }

      expect(requisitions.create.notCalled).toBe(true)
    }
  })
})
