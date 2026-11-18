import type { FastifyInstance } from 'fastify'
import { container, tokens } from '../container/container'
import { ItemService } from '../services/item.service'

const createItemSchema = {
  body: {
    type: 'object',
    properties: {
      sku: { type: 'string' },
      name: { type: 'string' },
      unit: { type: 'string' },
    },
  },
} as const

export async function itemRoutes(fastify: FastifyInstance) {
  const items = container.get<ItemService>(tokens.itemService)

  fastify.get('/api/items', async () => items.list())

  fastify.post('/api/items', { schema: createItemSchema }, async (request, reply) => {
    const body = (request.body ?? {}) as { sku?: string; name?: string; unit?: string }
    const item = await items.create(body)
    return reply.status(201).send(item)
  })

  fastify.delete('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await items.deleteById(id)
    return reply.status(204).send()
  })
}
