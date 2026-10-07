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

  test('deleteById removes the Requisition when purchaseId is null', async () => {
    const requisitions = sinon.createStubInstance(RequisitionRepository)
    requisitions.findById.resolves({
      id: 'requisition-1',
      itemId: 'item-1',
      jobId: 'job-1',
      quantity: 12.5,
      purchaseId: null,
      createdAt: '2026-10-07T00:00:00.000Z',
    })
    requisitions.deleteById.resolves(true)
    const service = new RequisitionService(requisitions)

    await service.deleteById('requisition-1')

    expect(requisitions.findById.calledOnceWith('requisition-1')).toBe(true)
    expect(requisitions.deleteById.calledOnceWith('requisition-1')).toBe(true)
  })

  test('deleteById throws 404 when the Requisition does not exist', async () => {
    const requisitions = sinon.createStubInstance(RequisitionRepository)
    requisitions.findById.resolves(undefined)
    const service = new RequisitionService(requisitions)

    try {
      await service.deleteById('missing')
      throw new Error('expected deleteById to throw')
    } catch (error) {
      expect((error as Error & { statusCode: number }).statusCode).toBe(404)
      expect((error as Error).message).toBe('Requisition not found')
    }

    expect(requisitions.deleteById.notCalled).toBe(true)
  })

  test('deleteById throws 409 when purchaseId is set', async () => {
    const requisitions = sinon.createStubInstance(RequisitionRepository)
    requisitions.findById.resolves({
      id: 'requisition-1',
      itemId: 'item-1',
      jobId: 'job-1',
      quantity: 12.5,
      purchaseId: 'purchase-1',
      createdAt: '2026-10-07T00:00:00.000Z',
    })
    const service = new RequisitionService(requisitions)

    try {
      await service.deleteById('requisition-1')
      throw new Error('expected deleteById to throw')
    } catch (error) {
      expect((error as Error & { statusCode: number }).statusCode).toBe(409)
      expect((error as Error).message).toBe('Requisition has Purchase')
    }

    expect(requisitions.deleteById.notCalled).toBe(true)
  })

  test('convert for Administrator creates the Purchase with quantity 12.5 and sets purchaseId', async () => {
    const requisitions = sinon.createStubInstance(RequisitionRepository)
    requisitions.findById.resolves({
      id: 'requisition-1',
      itemId: 'item-1',
      jobId: 'job-1',
      quantity: 12.5,
      purchaseId: null,
      createdAt: '2026-10-07T00:00:00.000Z',
    })
    requisitions.existsSupplier.resolves(true)
    requisitions.existsWarehouse.resolves(true)
    requisitions.createPurchase.resolves()
    requisitions.setPurchaseId.resolves()
    const service = new RequisitionService(requisitions)

    const purchase = await service.createPurchase(
      'requisition-1',
      { supplierId: 'supplier-1', warehouseId: 'warehouse-1' },
      'Administrator',
    )

    expect(purchase.supplierId).toBe('supplier-1')
    expect(purchase.itemId).toBe('item-1')
    expect(purchase.warehouseId).toBe('warehouse-1')
    expect(purchase.quantity).toBe(12.5)
    expect(requisitions.createPurchase.calledOnce).toBe(true)
    expect(requisitions.createPurchase.firstCall.args[0]).toEqual(purchase)
    expect(requisitions.setPurchaseId.calledOnceWith('requisition-1', purchase.id)).toBe(true)
  })
})
