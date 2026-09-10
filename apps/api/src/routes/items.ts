import type { FastifyInstance } from 'fastify'
import { container, tokens } from '../container/container'
import { ItemService } from '../services/item.service'

export async function itemRoutes(fastify: FastifyInstance) {
  const items = container.get<ItemService>(tokens.itemService)

  fastify.get('/api/items', async () => items.list())

  fastify.post('/api/items', async (request, reply) => {
    const body = (request.body ?? {}) as { sku?: string; name?: string; unit?: string }
    const item = await items.create(body)
    return reply.status(201).send(item)
  })

  fastify.delete('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await items.deleteById(id)
    return reply.status(204).send()
  })

  fastify.patch('/api/items/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { name?: string; unit?: string; sku?: string }
    return items.updateById(id, body)
  })
}
