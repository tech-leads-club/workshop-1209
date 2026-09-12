import type { FastifyInstance } from 'fastify'
import { container, tokens } from '../container/container'
import { JobService } from '../services/job.service'

export async function jobRoutes(fastify: FastifyInstance) {
  const jobs = container.get<JobService>(tokens.jobService)

  fastify.get('/api/jobs', async () => jobs.list())

  fastify.post('/api/jobs', async (request, reply) => {
    const body = (request.body ?? {}) as { name?: string }
    const job = await jobs.create(body)
    return reply.status(201).send(job)
  })

  fastify.patch('/api/jobs/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { name?: string }
    return jobs.updateById(id, body)
  })

  fastify.delete('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await jobs.deleteById(id)
    return reply.status(204).send()
  })
}
