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
    const itemId = input.itemId ?? ''
    const jobId = input.jobId ?? ''
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
      quantity: input.quantity as number,
      purchaseId: null,
      createdAt: new Date().toISOString(),
    }
    await this.requisitions.create(requisition)
    return requisition
  }
}

function httpError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}
