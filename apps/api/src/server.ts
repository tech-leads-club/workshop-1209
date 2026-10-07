import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import session from '@fastify/session'
import Fastify from 'fastify'
import { config } from './config/env'
import { container, tokens } from './container/container'
import { registerServices } from './container/service-registration'
import type { AppDatabase } from './db/client'
import { seedAdministratorIfEmpty } from './db/seed'
import { registerAuth } from './middleware/auth'
import { registerErrorHandler } from './middleware/error'
import { assignmentRoutes } from './routes/assignments'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { itemRoutes } from './routes/items'
import { jobRoutes } from './routes/jobs'
import { movementRoutes } from './routes/movements'
import { purchaseRoutes } from './routes/purchases'
import { requisitionRoutes } from './routes/requisitions'
import { staffRoutes } from './routes/staff'
import { stockRoutes } from './routes/stock'
import { supplierRoutes } from './routes/suppliers'
import { userRoutes } from './routes/users'
import { warehouseRoutes } from './routes/warehouses'
import './types/session'

export async function createServer() {
  registerServices()
  await seedAdministratorIfEmpty(container.get<AppDatabase>(tokens.db))

  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  await fastify.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  })
  await fastify.register(cookie)
  await fastify.register(session, {
    secret: config.SESSION_SECRET,
    cookieName: 'sessionId',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
    },
  })

  await registerErrorHandler(fastify)
  await registerAuth(fastify)
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(userRoutes)
  await fastify.register(itemRoutes)
  await fastify.register(warehouseRoutes)
  await fastify.register(jobRoutes)
  await fastify.register(movementRoutes)
  await fastify.register(stockRoutes)
  await fastify.register(supplierRoutes)
  await fastify.register(purchaseRoutes)
  await fastify.register(requisitionRoutes)
  await fastify.register(staffRoutes)
  await fastify.register(assignmentRoutes)

  return fastify
}

export async function startServer() {
  const fastify = await createServer()

  try {
    const address = await fastify.listen({
      host: config.HOST,
      port: config.PORT,
    })
    fastify.log.info(`Server listening at ${address}`)
    return fastify
  } catch (error) {
    fastify.log.error(error, 'Failed to start server')
    process.exit(1)
  }
}
