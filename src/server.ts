import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyMultipart from '@fastify/multipart'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'

import authRoutes   from './routes/auth'
import clinicRoutes from './routes/clinic'
import doctorRoutes from './routes/doctor'
import staffRoutes  from './routes/staff'
import patientRoutes from './routes/patient'
import visitRoutes   from './routes/visits'
import clinicalRoutes from './routes/clinical'
import doshaRoutes    from './routes/dosha'
import analysisRoutes from './routes/analysis'
import aiRoutes       from './routes/ai'
import pdfRoutes      from './routes/pdf'
import billingRoutes  from './routes/billing'
import inventoryRoutes from './routes/inventory'
import paymentRoutes  from './routes/payments'

const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.HOST || '0.0.0.0'

async function build() {
  const fastify = Fastify({
    connectionTimeout: 300000,
    bodyLimit: 20971520,
    requestTimeout: 300000,
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true,  // needed behind AWS ALB / CloudFront
  })

  // ─── Security ────────────────────────────────────────────────────────────────
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false,  // handled by frontend framework
  })

  await fastify.register(fastifyCors, {
    origin: process.env.APP_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })

  // ─── JWT ─────────────────────────────────────────────────────────────────────
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: {
      algorithm: 'HS256',
    },
  })

  // ─── File uploads ─────────────────────────────────────────────────────────────
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,  // 20MB max
      files: 1,                   // one file per request
    },
  })

  // ─── Health check ──────────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  }))

  // ─── Routes ──────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes,    { prefix: '/api/auth' })
  await fastify.register(clinicRoutes,  { prefix: '/api/clinics' })
  await fastify.register(doctorRoutes,  { prefix: '/api/doctors' })
  await fastify.register(staffRoutes,   { prefix: '/api/staff' })
  await fastify.register(patientRoutes, { prefix: '/api/patients' })
  await fastify.register(visitRoutes,    { prefix: '/api/visits' })
  await fastify.register(clinicalRoutes, { prefix: '/api' })
  await fastify.register(doshaRoutes,    { prefix: '/api' })
  await fastify.register(analysisRoutes, { prefix: '/api' })
  await fastify.register(aiRoutes,       { prefix: '/api' })
  await fastify.register(pdfRoutes,      { prefix: '/api' })
  await fastify.register(billingRoutes,  { prefix: '/api/billing' })
  await fastify.register(inventoryRoutes, { prefix: '/api/inventory' })
  await fastify.register(paymentRoutes,  { prefix: '/api/payments' })

  // ─── Global error handler ────────────────────────────────────────────────────
  fastify.setErrorHandler((error: any, request: any, reply: any) => {
    fastify.log.error(error)

    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.validation,
      })
    }

    const statusCode = error.statusCode || 500
    return reply.status(statusCode).send({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : error.message,
    })
  })

  return fastify
}

async function start() {
  const fastify = await build()
  try {
    await fastify.listen({ port: PORT, host: HOST })
    console.log(`
╔══════════════════════════════════════════╗
║      AyurCare API — Phase 1 Ready       ║
║  http://${HOST}:${PORT}                  ║
╚══════════════════════════════════════════╝
    `)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
