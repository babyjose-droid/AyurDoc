import type { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'
import { requireRole } from '../middleware/requireAuth'
import Anthropic from '@anthropic-ai/sdk'
import { audit } from '../lib/audit'

const client = new Anthropic()

async function buildClinicalContext(visitId: string, clinicId: string): Promise<any> {
  const visit = await (prisma as any).visit.findFirst({
    where: { id: visitId, clinicId },
    include: {
      patient: { include: { MedicalHistory: true } },
      doshaAssessment: true,
      tongueAnalysis: true,
      eyeAnalysis: true,
      labReports: { select: { reportType: true, fileName: true, reportDate: true, notes: true } },
    },
  }) as any
  if (!visit) return null
  const p = visit.patient
  const mh = (p as any).MedicalHistory
  const dosha = visit.doshaAssessment
  return {
    patient: {
      name: p.name,
      age: p.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 3.156e10) : 'Unknown',
      gender: p.gender || 'Unknown',
      occupation: p.occupation,
    },
    chiefComplaint: visit.chiefComplaint || 'Not specified',
    workingDiagnosis: visit.ayurvedicDiagnosis || visit.workingDiagnosis || 'Not specified',
    medicalHistoryNote: visit.medicalHistoryNote || '',
    examination: visit.examination || '',
    ayurvedicDiagnosis: visit.ayurvedicDiagnosis || '',
    medicalHistory: mh ? {
      allergies: mh.allergies,
      pastIllnesses: mh.pastIllnesses,
      currentMedications: mh.currentMedications,
      surgeries: mh.surgeries,
      lifestyle: { sleep: mh.sleepHours, exercise: mh.exerciseFrequency, smoking: mh.smokingStatus, alcohol: mh.alcoholStatus, diet: mh.dietPreference, stress: mh.stressLevel },
      familyHistory: mh.familyHistory,
    } : {},
    doshaAssessment: dosha ? { vata: dosha.finalVata, pitta: dosha.finalPitta, kapha: dosha.finalKapha, dominant: dosha.dominantDosha, overridden: dosha.overridden } : null,
    tongueObservations: visit.tongueAnalysis ? { colour: visit.tongueAnalysis.colour, coating: visit.tongueAnalysis.coating, texture: visit.tongueAnalysis.texture, cracks: visit.tongueAnalysis.cracks, moisture: visit.tongueAnalysis.moisture } : null,
    eyeObservations: visit.eyeAnalysis ? { colour: visit.eyeAnalysis.colour, clarity: visit.eyeAnalysis.clarity, dryness: visit.eyeAnalysis.dryness, discolouration: visit.eyeAnalysis.discolouration } : null,
    labReports: visit.labReports,
  }
}

async function generatePrescription(ctx: any) {
  const prompt = `You are an expert Ayurvedic physician (BAMS, MD Ayurveda). Based on the following clinical data, generate a draft Ayurvedic prescription.
Patient: ${ctx.patient.name}, ${ctx.patient.age} years, ${ctx.patient.gender}
Chief Complaint: ${ctx.chiefComplaint}
Working Diagnosis: ${ctx.workingDiagnosis}
Dosha: ${ctx.doshaAssessment ? `Vata ${ctx.doshaAssessment.vata}%, Pitta ${ctx.doshaAssessment.pitta}%, Kapha ${ctx.doshaAssessment.kapha}% (Dominant: ${ctx.doshaAssessment.dominant})` : 'Not assessed'}
Known Allergies: ${ctx.medicalHistory?.allergies?.join(', ') || 'None'}
Current Medications: ${ctx.medicalHistory?.currentMedications?.join(', ') || 'None'}
Tongue: ${ctx.tongueObservations ? JSON.stringify(ctx.tongueObservations) : 'Not examined'}
Eyes: ${ctx.eyeObservations ? JSON.stringify(ctx.eyeObservations) : 'Not examined'}

Return ONLY valid JSON array of medicines:
[{"name":"Classical formulation name","brandAlternative":"Vaidyaratnam brand if available or null","form":"tablet/churna/taila/arishta/ghrita/kwatha","dosage":"specific dose","frequency":"twice daily/etc","duration":"30 days","anupana":"vehicle e.g. warm water","timing":"before/after food","indication":"why prescribed","contraindication":null}]
Prescribe 3-6 medicines. Check allergies carefully.`
  const response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = text.replace(new RegExp('```json\\n?', 'g'), '').replace(new RegExp('```\\n?', 'g'), '').trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  try { return jsonMatch ? JSON.parse(jsonMatch[0]) : [] } catch(e) { return [] }
}

async function generateDinacharya(ctx: any) {
  const dosha = ctx.doshaAssessment?.dominant || 'Vata'
  const prompt = 'Return ONLY valid JSON, no extra text: {"wakeTime":"5:30 AM","morningRoutine":[{"time":"5:30 AM","activity":"Wake up","description":"Rise early"},{"time":"6:00 AM","activity":"Yoga","description":"30 min gentle yoga"},{"time":"7:00 AM","activity":"Breakfast","description":"Light warm meal"}],"meals":[{"meal":"Breakfast","time":"8:00 AM","description":"Warm oats or idli","guidelines":"Eat slowly"},{"meal":"Lunch","time":"12:30 PM","description":"Rice vegetables dal","guidelines":"Main meal"},{"meal":"Dinner","time":"7:00 PM","description":"Soup or khichdi","guidelines":"Light and early"}],"bedtime":"10:00 PM","doshaSpecificNotes":"For ' + dosha + ': avoid cold foods, sleep by 10pm"}'
  const response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const cleaned = text.replace(new RegExp('```json', 'g'), '').replace(new RegExp('```', 'g'), '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  try { return jsonMatch ? JSON.parse(jsonMatch[0]) : {} } catch(e: any) { console.log('Dinacharya error:', e.message); return {} }
}

async function generateDietPlan(ctx: any) {
  const prompt = `You are an expert Ayurvedic nutritionist. Generate a personalised Ayurvedic diet plan for:
Patient: ${ctx.patient.age} years, ${ctx.patient.gender}
Dosha: ${ctx.doshaAssessment?.dominant || 'Not assessed'}
Condition: ${ctx.chiefComplaint}
Diet Preference: ${ctx.medicalHistory?.lifestyle?.diet || 'Not specified'}
Allergies: ${ctx.medicalHistory?.allergies?.join(', ') || 'None'}

Return ONLY valid JSON:
{"foodsToFavour":["food 1","food 2"],"foodsToAvoid":["food 1"],"tastesToFavour":["sweet","sour"],"tastesToAvoid":[],"mealPlan":[{"meal":"Breakfast","time":"7:30-8:30 AM","options":["option 1"],"guidelines":"guidelines"},{"meal":"Lunch","time":"12:00-1:00 PM","options":[],"guidelines":""},{"meal":"Dinner","time":"7:00-8:00 PM","options":[],"guidelines":""}],"waterIntake":"recommendations","cookingGuidelines":"how to cook","seasonalAdjustments":"seasonal adjustments","supplementaryItems":["ghee"]}`
  const response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const cleaned = text.replace(new RegExp('```json\\n?', 'g'), '').replace(new RegExp('```\\n?', 'g'), '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  try { return jsonMatch ? JSON.parse(jsonMatch[0]) : {} } catch(e) { return {} }
}

async function generateTreatmentPlan(ctx: any) {
  const prompt = 'Ayurvedic Treatment Plan for: ' + ctx.patient.age + 'y ' + ctx.patient.gender + ', Dosha: ' + (ctx.doshaAssessment?.dominant || 'Vata') + ', Condition: ' + ctx.chiefComplaint + '. Return ONLY compact JSON: {"primaryApproach":"Brief treatment in 20 words","duration":"8 weeks","phases":[{"phase":"Phase 1","duration":"2 weeks","description":"Cleansing","therapies":["Abhyanga","Swedana"]},{"phase":"Phase 2","duration":"4 weeks","description":"Balancing","therapies":["Medicines","Diet"]},{"phase":"Phase 3","duration":"2 weeks","description":"Rejuvenation","therapies":["Rasayana","Yoga"]}],"panchakarmaRecommended":true,"panchakarmaDetails":{"procedures":["Abhyanga"],"duration":"7 days","timing":"Week 2"},"externalTherapies":[{"name":"Kati Basti","description":"Warm oil on back","frequency":"Daily"}],"followUpSchedule":[{"week":2,"purpose":"Initial review"},{"week":6,"purpose":"Progress check"}],"lifestyle":"Avoid cold foods, sleep by 10pm","prognosis":"Good improvement in 4-6 weeks","precautions":["Avoid heavy foods","No cold bath"]}'
  const response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const cleaned = text.replace(new RegExp('```json', 'g'), '').replace(new RegExp('```', 'g'), '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  try { return jsonMatch ? JSON.parse(jsonMatch[0]) : {} } catch(e: any) { console.log('Treatment parse error:', e.message); return {} }
}

export default async function aiRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/visits/:id/ai/generate',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const { plans = ['PRESCRIPTION', 'DINACHARYA', 'DIET_PLAN', 'TREATMENT_PLAN'] } = request.body as any
      const ctx = await buildClinicalContext(visitId, request.user.clinicId)
      if (!ctx) return reply.status(404).send({ success: false, error: 'Visit not found.' })
      const results: any = {}
      const errors: any = {}

      if (plans.includes('PRESCRIPTION')) {
        try {
          const data = await generatePrescription(ctx)
          await prisma.aIPlan.upsert({ where: { visitId_planType: { visitId, planType: 'PRESCRIPTION' } }, create: { visitId, planType: 'PRESCRIPTION', aiContent: data, promptContext: ctx }, update: { aiContent: data, isSignedOff: false, signedOffAt: null, signedOffBy: null } })
          results.PRESCRIPTION = data
        } catch(e: any) { errors.PRESCRIPTION = e.message }
      }
      if (plans.includes('DINACHARYA')) {
        try {
          console.log('Starting DINACHARYA generation...')
          const data = await generateDinacharya(ctx)
          console.log('DINACHARYA generated, saving...', JSON.stringify(data).substring(0,50))
          await prisma.aIPlan.upsert({ where: { visitId_planType: { visitId, planType: 'DINACHARYA' } }, create: { visitId, planType: 'DINACHARYA', aiContent: data, promptContext: ctx }, update: { aiContent: data, isSignedOff: false, signedOffAt: null, signedOffBy: null } })
          results.DINACHARYA = data
          console.log('DINACHARYA saved successfully')
        } catch(e: any) { console.log('DINACHARYA FAILED:', e.message); errors.DINACHARYA = e.message }
      }
      if (plans.includes('DIET_PLAN')) {
        try {
          const data = await generateDietPlan(ctx)
          await prisma.aIPlan.upsert({ where: { visitId_planType: { visitId, planType: 'DIET_PLAN' } }, create: { visitId, planType: 'DIET_PLAN', aiContent: data, promptContext: ctx }, update: { aiContent: data, isSignedOff: false, signedOffAt: null, signedOffBy: null } })
          results.DIET_PLAN = data
        } catch(e: any) { errors.DIET_PLAN = e.message }
      }
      if (plans.includes('TREATMENT_PLAN')) {
        try {
          const data = await generateTreatmentPlan(ctx)
          await prisma.aIPlan.upsert({ where: { visitId_planType: { visitId, planType: 'TREATMENT_PLAN' } }, create: { visitId, planType: 'TREATMENT_PLAN', aiContent: data, promptContext: ctx }, update: { aiContent: data, isSignedOff: false, signedOffAt: null, signedOffBy: null } })
          results.TREATMENT_PLAN = data
        } catch(e: any) { errors.TREATMENT_PLAN = e.message }
      }
            await audit({ clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role, action: 'AI_PLANS_GENERATED', entityType: 'Visit', entityId: visitId, meta: { plans } })
      return reply.send({ success: true, data: results, errors: Object.keys(errors).length ? errors : undefined })
    }
  )

  fastify.get('/visits/:id/ai/plans',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const plans = await prisma.aIPlan.findMany({ where: { visitId } })
      return reply.send({ success: true, data: plans })
    }
  )

  fastify.patch('/visits/:id/ai/plans/:type',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId, type } = request.params as { id: string; type: string }
      const { content } = request.body as { content: any }
      const updated = await prisma.aIPlan.update({ where: { visitId_planType: { visitId, planType: type as any } }, data: { finalContent: content, editedAt: new Date() } })
      return reply.send({ success: true, data: updated })
    }
  )

  fastify.post('/visits/:id/signoff',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const { section } = request.body as { section: 'PRESCRIPTION' | 'DINACHARYA' | 'DIET_PLAN' | 'TREATMENT_PLAN' }
      await prisma.signOff.upsert({ where: { visitId_section: { visitId, section } }, create: { visitId, section, doctorId: request.user.sub, ipAddress: request.ip }, update: { signedAt: new Date(), ipAddress: request.ip } })
      await prisma.aIPlan.update({ where: { visitId_planType: { visitId, planType: section } }, data: { isSignedOff: true, signedOffAt: new Date(), signedOffBy: request.user.sub } })
      await audit({ clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role, action: 'PLAN_SIGNED_OFF', entityType: 'Visit', entityId: visitId, meta: { section } })
      const signOffs = await prisma.signOff.count({ where: { visitId } })
      return reply.send({ success: true, data: { section, allSigned: signOffs >= 4, totalSignedOff: signOffs } })
    }
  )

  fastify.get('/visits/:id/signoffs',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const signOffs = await prisma.signOff.findMany({ where: { visitId } })
      const sections = ['PRESCRIPTION', 'DINACHARYA', 'DIET_PLAN', 'TREATMENT_PLAN']
      const status = Object.fromEntries(sections.map(s => [s, signOffs.find(so => so.section === s) ? true : false]))
      return reply.send({ success: true, data: { status, allSigned: signOffs.length >= 4, count: signOffs.length } })
    }
  )

  fastify.post('/visits/:id/chat',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const { message } = request.body as { message: string }
      await prisma.chatMessage.create({ data: { visitId, role: 'doctor', content: message } })
      const history = await prisma.chatMessage.findMany({ where: { visitId }, orderBy: { createdAt: 'asc' }, take: 20 })
      const ctx = await buildClinicalContext(visitId, request.user.clinicId)
      const systemPrompt = `You are an AI clinical assistant for an Ayurvedic doctor using RhythmDoc platform. Help with case analysis, treatment suggestions, and documentation. Current patient: ${JSON.stringify(ctx?.patient || {})}. Chief complaint: ${ctx?.chiefComplaint || 'Not specified'}`
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 1500, system: systemPrompt,
        messages: history.map(h => ({ role: h.role === 'doctor' ? 'user' : 'assistant', content: h.content })) as any,
      })
      const aiReply = response.content[0].type === 'text' ? response.content[0].text : 'Could not process request.'
      const saved = await prisma.chatMessage.create({ data: { visitId, role: 'assistant', content: aiReply } })
      return reply.send({ success: true, data: { message: aiReply, id: saved.id } })
    }
  )

  fastify.get('/visits/:id/chat',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request, reply) => {
      const { id: visitId } = request.params as { id: string }
      const messages = await prisma.chatMessage.findMany({ where: { visitId }, orderBy: { createdAt: 'asc' } })
      return reply.send({ success: true, data: messages })
    }
  )
  // POST /api/visits/:id/ai/plans/:type/save-template
  fastify.post('/visits/:id/ai/plans/:type/save-template',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request: any, reply: any) => {
      const { id: visitId, type } = request.params as { id: string; type: string }
      const { name } = request.body as { name: string }
      if (!name) return reply.status(400).send({ success: false, error: 'Template name required' })
      const plan = await prisma.aIPlan.findFirst({ where: { visitId, planType: type as any } })
      if (!plan) return reply.status(404).send({ success: false, error: 'Plan not found' })
      const template = await (prisma as any).prescriptionTemplate.create({
        data: { clinicId: request.user.clinicId, doctorId: request.user.sub, name, medicines: plan.finalContent || plan.aiContent }
      })
      return reply.send({ success: true, data: template })
    }
  )

  // GET /api/templates
  fastify.get('/templates',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request: any, reply: any) => {
      const templates = await (prisma as any).prescriptionTemplate.findMany({
        where: { clinicId: request.user.clinicId }, orderBy: { createdAt: 'desc' }
      })
      return reply.send({ success: true, data: templates })
    }
  )

  // DELETE /api/templates/:id
  fastify.delete('/templates/:id',
    { preHandler: requireRole('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') },
    async (request: any, reply: any) => {
      const { id } = request.params as { id: string }
      await (prisma as any).prescriptionTemplate.delete({ where: { id } })
      return reply.send({ success: true })
    }
  )

}
