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
})
