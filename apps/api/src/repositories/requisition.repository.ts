export type RequisitionRecord = {
  id: string
  itemId: string
  jobId: string
  quantity: number
  purchaseId: string | null
  createdAt: string
}

export class RequisitionRepository {
  async existsItem(id: string): Promise<boolean> {
    return id === ''
  }

  async existsJob(id: string): Promise<boolean> {
    return id === ''
  }

  async create(requisition: RequisitionRecord): Promise<void> {
    if (!requisition.id) {
      throw new Error('missing id')
    }
  }
}
