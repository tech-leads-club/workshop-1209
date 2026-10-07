import type { PurchaseRecord } from '../repositories/purchase.repository'
import {
  RequisitionRepository,
  type RequisitionRecord,
} from '../repositories/requisition.repository'

export type RequisitionInput = {
  itemId?: string
  jobId?: string
  quantity?: unknown
}

export type RequisitionPurchaseInput = {
  supplierId?: string
  warehouseId?: string
}

export class RequisitionService {
  constructor(private readonly requisitions: RequisitionRepository) {}

  list(): Promise<RequisitionRecord[]> | RequisitionRecord[] {
    return this.requisitions.list()
  }

  async create(input: RequisitionInput): Promise<RequisitionRecord> {
    const itemId = input.itemId?.trim() ?? ''
    const jobId = input.jobId?.trim() ?? ''
    if (!itemId || !jobId || input.quantity === undefined || input.quantity === null) {
      throw httpError('itemId, jobId, and a positive quantity are required', 400)
    }
    if (!isPositiveQuantity(input.quantity)) {
      throw httpError('quantity must be a positive number', 400)
    }
    if (
      !(await this.requisitions.existsItem(itemId)) ||
      !(await this.requisitions.existsJob(jobId))
    ) {
      throw httpError('Item or Job not found', 400)
    }

    const requisition: RequisitionRecord = {
      id: crypto.randomUUID(),
      itemId,
      jobId,
      quantity: input.quantity,
      purchaseId: null,
      createdAt: new Date().toISOString(),
    }
    await this.requisitions.create(requisition)
    return requisition
  }

  async deleteById(id: string): Promise<void> {
    const found = await this.requisitions.findById(id)
    if (!found) {
      throw httpError('Requisition not found', 404)
    }
    if (found.purchaseId !== null) {
      throw httpError('Requisition has Purchase', 409)
    }
    await this.requisitions.deleteById(id)
  }

  async createPurchase(
    id: string,
    input: RequisitionPurchaseInput,
    role: string,
  ): Promise<PurchaseRecord> {
    const found = await this.requisitions.findById(id)
    if (!found) {
      throw httpError('Requisition not found', 404)
    }
    if (role !== 'Administrator') {
      throw httpError('Administrator role is required', 403)
    }

    const supplierId = input.supplierId?.trim() ?? ''
    const warehouseId = input.warehouseId?.trim() ?? ''
    if (
      !supplierId ||
      !warehouseId ||
      !(await this.requisitions.existsSupplier(supplierId)) ||
      !(await this.requisitions.existsWarehouse(warehouseId))
    ) {
      throw httpError('Supplier or Warehouse not found', 400)
    }

    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      supplierId,
      itemId: found.itemId,
      warehouseId,
      quantity: found.quantity,
      createdAt: new Date().toISOString(),
    }
    await this.requisitions.createPurchase(purchase)
    await this.requisitions.setPurchaseId(id, purchase.id)
    return purchase
  }
}

function isPositiveQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function httpError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}
