import type { FastifyInstance } from 'fastify'
import { container, tokens } from '../container/container'
import { RequisitionService } from '../services/requisition.service'
import { UserService } from '../services/user.service'

export async function requisitionRoutes(fastify: FastifyInstance) {
  const requisitions = container.get<RequisitionService>(tokens.requisitionService)
  const users = container.get<UserService>(tokens.userService)

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

  fastify.post('/api/requisitions/:id/purchases', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { supplierId?: string; warehouseId?: string }
    const user = await users.getById(request.session.userId as string)
    const purchase = await requisitions.createPurchase(id, body, user.role)
    return reply.status(201).send(purchase)
  })

  fastify.delete('/api/requisitions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await requisitions.deleteById(id)
    return reply.status(204).send()
  })
}
