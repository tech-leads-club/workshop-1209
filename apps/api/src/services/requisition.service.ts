import {
  RequisitionRepository,
  type RequisitionRecord,
} from '../repositories/requisition.repository'

export type RequisitionInput = {
  itemId?: string
  jobId?: string
  quantity?: unknown
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
    if (found?.purchaseId !== null) {
      return
    }
    await this.requisitions.deleteById(id)
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
