import type { FastifyInstance } from 'fastify'
import { container, tokens } from '../container/container'
import { RequisitionService } from '../services/requisition.service'

export async function requisitionRoutes(fastify: FastifyInstance) {
  const requisitions = container.get<RequisitionService>(tokens.requisitionService)

  fastify.get('/api/requisitions', async () => requisitions.list())

  fastify.post('/api/requisitions', async (request, reply) => {
    const body = (request.body ?? {}) as {
      itemId?: string
      jobId?: string
      quantity?: unknown
    }
    const requisition = await requisitions.create(body)
    return reply.status(201).send(requisition)
  })
}
