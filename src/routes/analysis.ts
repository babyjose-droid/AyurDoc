import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { uploadFile, buildS3Key, validateMimeType, getPresignedUrl } from '../lib/s3'
import { requireRole } from '../middleware/requireAuth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

// ─── AI Image Analysis ────────────────────────────────────────────────────────
async function analyzeTongueImage(base64Image: string, mimeType: string) {
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: base64Image } },
          { type: 'text', text: 'You are an expert Ayurvedic clinician. Analyze this tongue image. Return ONLY valid JSON with fields: colour, coating, texture, cracks, moisture, shape, dominantDosha (Vata/Pitta/Kapha), summary (2-3 sentence clinical analysis), imbalances (array of 3 specific imbalances found), recommendations (array of 4 specific recommendations), confidence (High/Medium/Low)' },
        ],
      }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
    return null
  } catch (err) {
    console.error('[Tongue AI] Analysis failed:', err)
    return null
  }
}

async function analyzeEyeImage(base64Image: string, mimeType: string) {
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: base64Image } },
          { type: 'text', text: 'You are an expert Ayurvedic clinician. Analyze this eye image. Return ONLY valid JSON with fields: colour, clarity, dryness, discolouration, dominantDosha (Vata/Pitta/Kapha), summary (2-3 sentence clinical analysis), imbalances (array of 3 specific imbalances found), recommendations (array of 4 specific recommendations), confidence (High/Medium/Low)' },
        ],
      }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
    return null
  } catch (err) {
    console.error('[Eye AI] Analysis failed:', err)
    return null
  }
}


// ─── Routes ───────────────────────────────────────────────────────────────────
export default async function analysisRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Tongue Analysis ────────────────────────────────────────────────────────

  // POST /api/visits/:id/tongue/image — upload tongue image
  fastify.post('/visits/:id/tongue/image',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }

      const visit = await prisma.visit.findFirst({ where: { id: visitId, clinicId: request.user.clinicId } })
      if (!visit) return reply.status(404).send({ success: false, error: 'Visit not found.' })

      const data = await request.file()
      if (!data) return reply.status(400).send({ success: false, error: 'No image uploaded.' })

      if (!validateMimeType('tongueImage', data.mimetype)) {
        return reply.status(400).send({ success: false, error: 'Allowed: JPG, PNG, WebP.' })
      }

      const buffer = await data.toBuffer()
      const key = buildS3Key('tongue-images', request.user.clinicId, data.filename, visit.patientId)
      await uploadFile('patientDocs', key, buffer, data.mimetype)

      // Run AI analysis
      const base64 = buffer.toString('base64')
      const aiSuggestion = await analyzeTongueImage(base64, data.mimetype)

      // Upsert tongue analysis record
      const analysis = await prisma.tongueAnalysis.upsert({
        where: { visitId },
        create: {
          visitId,
          imageS3Key:   key,
          aiSuggestion,
          colour:       aiSuggestion?.colour,
          coating:      aiSuggestion?.coating,
          texture:      aiSuggestion?.texture,
          cracks:       aiSuggestion?.cracks,
          moisture:     aiSuggestion?.moisture,
          shape:        aiSuggestion?.shape,
        },
        update: {
          imageS3Key:   key,
          aiSuggestion,
          colour:       aiSuggestion?.colour,
          coating:      aiSuggestion?.coating,
          texture:      aiSuggestion?.texture,
          cracks:       aiSuggestion?.cracks,
          moisture:     aiSuggestion?.moisture,
          shape:        aiSuggestion?.shape,
          colourStatus:  'AI_SUGGESTED',
          coatingStatus: 'AI_SUGGESTED',
          textureStatus: 'AI_SUGGESTED',
          cracksStatus:  'AI_SUGGESTED',
          moistureStatus:'AI_SUGGESTED',
          confirmedAt:   null,
          confirmedBy:   null,
        },
      })

      return reply.send({ success: true, data: analysis, aiAnalysisAvailable: !!aiSuggestion })
    }
  )

  // PATCH /api/visits/:id/tongue — update observations and confirm
  fastify.patch('/visits/:id/tongue',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const body = request.body as any

      const statusUpdate = body.confirmed ? {
        colourStatus:  'DOCTOR_CONFIRMED' as const,
        coatingStatus: 'DOCTOR_CONFIRMED' as const,
        textureStatus: 'DOCTOR_CONFIRMED' as const,
        cracksStatus:  'DOCTOR_CONFIRMED' as const,
        moistureStatus:'DOCTOR_CONFIRMED' as const,
        confirmedAt:   new Date(),
        confirmedBy:   request.user.sub,
      } : {}

      const updated = await prisma.tongueAnalysis.upsert({
        where: { visitId },
        create: { visitId, colour: body.colour || '', coating: body.coating || '', texture: body.texture || '', cracks: body.cracks || '', moisture: body.moisture || '', shape: body.shape || '', ...statusUpdate },
        update: { colour: body.colour, coating: body.coating, texture: body.texture, cracks: body.cracks, moisture: body.moisture, shape: body.shape, ...statusUpdate },
      })

      return reply.send({ success: true, data: updated })
    }
  )

  // GET /api/visits/:id/tongue
  fastify.get('/visits/:id/tongue',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const analysis = await prisma.tongueAnalysis.findUnique({ where: { visitId } })

      let imageUrl = null
      if (analysis?.imageS3Key) {
        imageUrl = await getPresignedUrl('patientDocs', analysis.imageS3Key, 3600)
      }

      return reply.send({ success: true, data: analysis ? { ...analysis, imageUrl } : null })
    }
  )

  // ─── Eye Analysis ────────────────────────────────────────────────────────────

  // POST /api/visits/:id/eye/image — upload eye image
  fastify.post('/visits/:id/eye/image',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const side = (request.query as any).side || 'left' // "left" | "right"

      const visit = await prisma.visit.findFirst({ where: { id: visitId, clinicId: request.user.clinicId } })
      if (!visit) return reply.status(404).send({ success: false, error: 'Visit not found.' })

      const data = await request.file()
      if (!data) return reply.status(400).send({ success: false, error: 'No image uploaded.' })
      if (!validateMimeType('eyeImage', data.mimetype)) {
        return reply.status(400).send({ success: false, error: 'Allowed: JPG, PNG, WebP.' })
      }

      const buffer = await data.toBuffer()
      const key = buildS3Key(`eye-images/${side}`, request.user.clinicId, data.filename, visit.patientId)
      await uploadFile('patientDocs', key, buffer, data.mimetype)

      const base64 = buffer.toString('base64')
      const aiSuggestion = await analyzeEyeImage(base64, data.mimetype)

      const updateData: any = side === 'right'
        ? { rightImageS3Key: key }
        : { leftImageS3Key: key }

      if (aiSuggestion) {
        Object.assign(updateData, {
          aiSuggestion,
          ...(side === 'left' ? { leftAiSuggestion: aiSuggestion } : { rightAiSuggestion: aiSuggestion }),
          colour: aiSuggestion.colour, clarity: aiSuggestion.clarity,
          dryness: aiSuggestion.dryness, discolouration: aiSuggestion.discolouration, luster: aiSuggestion.luster,
          colourStatus: 'AI_SUGGESTED', clarityStatus: 'AI_SUGGESTED',
          drynessStatus: 'AI_SUGGESTED', discolourationStatus: 'AI_SUGGESTED',
          confirmedAt: null,
        })
      }

      const analysis = await prisma.eyeAnalysis.upsert({
        where: { visitId },
        create: { visitId, ...updateData },
        update: updateData,
      })

      return reply.send({ success: true, data: analysis, aiAnalysisAvailable: !!aiSuggestion })
    }
  )

  // PATCH /api/visits/:id/eye — update and confirm
  fastify.patch('/visits/:id/eye',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const body = request.body as {
        colour?: string; clarity?: string; dryness?: string; discolouration?: string; luster?: string
        confirmed?: boolean
      }

      const statusUpdate = body.confirmed ? {
        colourStatus:        'DOCTOR_CONFIRMED' as const,
        clarityStatus:       'DOCTOR_CONFIRMED' as const,
        drynessStatus:       'DOCTOR_CONFIRMED' as const,
        discolourationStatus:'DOCTOR_CONFIRMED' as const,
        confirmedAt:         new Date(),
        confirmedBy:         request.user.sub,
      } : {}

      const updated = await prisma.eyeAnalysis.upsert({
        where: { visitId },
        create: { visitId, colour: body.colour || '', clarity: body.clarity || '', dryness: body.dryness || '', discolouration: body.discolouration || '' },
        update: { colour: body.colour, clarity: body.clarity, dryness: body.dryness, discolouration: body.discolouration, luster: body.luster, ...(body.confirmed ? statusUpdate : {}) },
      })

      return reply.send({ success: true, data: updated })
    }
  )

  // GET /api/visits/:id/eye
  fastify.get('/visits/:id/eye',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const analysis = await prisma.eyeAnalysis.findUnique({ where: { visitId } })
      let leftImageUrl = null
      let rightImageUrl = null
      if (analysis?.leftImageS3Key) leftImageUrl = await getPresignedUrl('patientDocs', analysis.leftImageS3Key, 3600)
      if (analysis?.rightImageS3Key) rightImageUrl = await getPresignedUrl('patientDocs', analysis.rightImageS3Key, 3600)
      return reply.send({ success: true, data: analysis ? { ...analysis, leftImageUrl, rightImageUrl } : null })
    }
  )
}
