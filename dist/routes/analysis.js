"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = analysisRoutes;
const prisma_1 = __importDefault(require("../lib/prisma"));
const s3_1 = require("../lib/s3");
const requireAuth_1 = require("../middleware/requireAuth");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const client = new sdk_1.default();
// ─── AI Image Analysis ────────────────────────────────────────────────────────
async function analyzeTongueImage(base64Image, mimeType) {
    try {
        const response = await client.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 1500,
            messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
                        { type: 'text', text: 'You are an expert Ayurvedic clinician. Analyze this tongue image. Return ONLY valid JSON with fields: colour, coating, texture, cracks, moisture, shape, dominantDosha (Vata/Pitta/Kapha), summary (2-3 sentence clinical analysis), imbalances (array of 3 specific imbalances found), recommendations (array of 4 specific recommendations), confidence (High/Medium/Low)' },
                    ],
                }],
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch)
            return JSON.parse(jsonMatch[0]);
        return null;
    }
    catch (err) {
        console.error('[Tongue AI] Analysis failed:', err);
        return null;
    }
}
async function analyzeEyeImage(base64Image, mimeType) {
    try {
        const response = await client.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 1500,
            messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
                        { type: 'text', text: 'You are an expert Ayurvedic clinician. Analyze this eye image. Return ONLY valid JSON with fields: colour, clarity, dryness, discolouration, dominantDosha (Vata/Pitta/Kapha), summary (2-3 sentence clinical analysis), imbalances (array of 3 specific imbalances found), recommendations (array of 4 specific recommendations), confidence (High/Medium/Low)' },
                    ],
                }],
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch)
            return JSON.parse(jsonMatch[0]);
        return null;
    }
    catch (err) {
        console.error('[Eye AI] Analysis failed:', err);
        return null;
    }
}
// ─── Routes ───────────────────────────────────────────────────────────────────
async function analysisRoutes(fastify) {
    // ─── Tongue Analysis ────────────────────────────────────────────────────────
    // POST /api/visits/:id/tongue/image — upload tongue image
    fastify.post('/visits/:id/tongue/image', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const visit = await prisma_1.default.visit.findFirst({ where: { id: visitId, clinicId: request.user.clinicId } });
        if (!visit)
            return reply.status(404).send({ success: false, error: 'Visit not found.' });
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ success: false, error: 'No image uploaded.' });
        if (!(0, s3_1.validateMimeType)('tongueImage', data.mimetype)) {
            return reply.status(400).send({ success: false, error: 'Allowed: JPG, PNG, WebP.' });
        }
        const buffer = await data.toBuffer();
        const key = (0, s3_1.buildS3Key)('tongue-images', request.user.clinicId, data.filename, visit.patientId);
        await (0, s3_1.uploadFile)('patientDocs', key, buffer, data.mimetype);
        // Run AI analysis
        const base64 = buffer.toString('base64');
        const aiSuggestion = await analyzeTongueImage(base64, data.mimetype);
        // Upsert tongue analysis record
        const analysis = await prisma_1.default.tongueAnalysis.upsert({
            where: { visitId },
            create: {
                visitId,
                imageS3Key: key,
                aiSuggestion,
                colour: aiSuggestion?.colour,
                coating: aiSuggestion?.coating,
                texture: aiSuggestion?.texture,
                cracks: aiSuggestion?.cracks,
                moisture: aiSuggestion?.moisture,
                shape: aiSuggestion?.shape,
            },
            update: {
                imageS3Key: key,
                aiSuggestion,
                colour: aiSuggestion?.colour,
                coating: aiSuggestion?.coating,
                texture: aiSuggestion?.texture,
                cracks: aiSuggestion?.cracks,
                moisture: aiSuggestion?.moisture,
                shape: aiSuggestion?.shape,
                colourStatus: 'AI_SUGGESTED',
                coatingStatus: 'AI_SUGGESTED',
                textureStatus: 'AI_SUGGESTED',
                cracksStatus: 'AI_SUGGESTED',
                moistureStatus: 'AI_SUGGESTED',
                confirmedAt: null,
                confirmedBy: null,
            },
        });
        return reply.send({ success: true, data: analysis, aiAnalysisAvailable: !!aiSuggestion });
    });
    // PATCH /api/visits/:id/tongue — update observations and confirm
    fastify.patch('/visits/:id/tongue', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const body = request.body;
        const statusUpdate = body.confirmed ? {
            colourStatus: 'DOCTOR_CONFIRMED',
            coatingStatus: 'DOCTOR_CONFIRMED',
            textureStatus: 'DOCTOR_CONFIRMED',
            cracksStatus: 'DOCTOR_CONFIRMED',
            moistureStatus: 'DOCTOR_CONFIRMED',
            confirmedAt: new Date(),
            confirmedBy: request.user.sub,
        } : {};
        const updated = await prisma_1.default.tongueAnalysis.upsert({
            where: { visitId },
            create: { visitId, colour: body.colour || '', coating: body.coating || '', texture: body.texture || '', cracks: body.cracks || '', moisture: body.moisture || '', shape: body.shape || '', ...statusUpdate },
            update: { colour: body.colour, coating: body.coating, texture: body.texture, cracks: body.cracks, moisture: body.moisture, shape: body.shape, ...statusUpdate },
        });
        return reply.send({ success: true, data: updated });
    });
    // GET /api/visits/:id/tongue
    fastify.get('/visits/:id/tongue', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const analysis = await prisma_1.default.tongueAnalysis.findUnique({ where: { visitId } });
        let imageUrl = null;
        if (analysis?.imageS3Key) {
            imageUrl = await (0, s3_1.getPresignedUrl)('patientDocs', analysis.imageS3Key, 3600);
        }
        return reply.send({ success: true, data: analysis ? { ...analysis, imageUrl } : null });
    });
    // ─── Eye Analysis ────────────────────────────────────────────────────────────
    // POST /api/visits/:id/eye/image — upload eye image
    fastify.post('/visits/:id/eye/image', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const side = request.query.side || 'left'; // "left" | "right"
        const visit = await prisma_1.default.visit.findFirst({ where: { id: visitId, clinicId: request.user.clinicId } });
        if (!visit)
            return reply.status(404).send({ success: false, error: 'Visit not found.' });
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ success: false, error: 'No image uploaded.' });
        if (!(0, s3_1.validateMimeType)('eyeImage', data.mimetype)) {
            return reply.status(400).send({ success: false, error: 'Allowed: JPG, PNG, WebP.' });
        }
        const buffer = await data.toBuffer();
        const key = (0, s3_1.buildS3Key)(`eye-images/${side}`, request.user.clinicId, data.filename, visit.patientId);
        await (0, s3_1.uploadFile)('patientDocs', key, buffer, data.mimetype);
        const base64 = buffer.toString('base64');
        const aiSuggestion = await analyzeEyeImage(base64, data.mimetype);
        const updateData = side === 'right'
            ? { rightImageS3Key: key }
            : { leftImageS3Key: key };
        if (aiSuggestion) {
            Object.assign(updateData, {
                aiSuggestion,
                ...(side === 'left' ? { leftAiSuggestion: aiSuggestion } : { rightAiSuggestion: aiSuggestion }),
                colour: aiSuggestion.colour, clarity: aiSuggestion.clarity,
                dryness: aiSuggestion.dryness, discolouration: aiSuggestion.discolouration, luster: aiSuggestion.luster,
                colourStatus: 'AI_SUGGESTED', clarityStatus: 'AI_SUGGESTED',
                drynessStatus: 'AI_SUGGESTED', discolourationStatus: 'AI_SUGGESTED',
                confirmedAt: null,
            });
        }
        const analysis = await prisma_1.default.eyeAnalysis.upsert({
            where: { visitId },
            create: { visitId, ...updateData },
            update: updateData,
        });
        return reply.send({ success: true, data: analysis, aiAnalysisAvailable: !!aiSuggestion });
    });
    // PATCH /api/visits/:id/eye — update and confirm
    fastify.patch('/visits/:id/eye', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const body = request.body;
        const statusUpdate = body.confirmed ? {
            colourStatus: 'DOCTOR_CONFIRMED',
            clarityStatus: 'DOCTOR_CONFIRMED',
            drynessStatus: 'DOCTOR_CONFIRMED',
            discolourationStatus: 'DOCTOR_CONFIRMED',
            confirmedAt: new Date(),
            confirmedBy: request.user.sub,
        } : {};
        const updated = await prisma_1.default.eyeAnalysis.upsert({
            where: { visitId },
            create: { visitId, colour: body.colour || '', clarity: body.clarity || '', dryness: body.dryness || '', discolouration: body.discolouration || '' },
            update: { colour: body.colour, clarity: body.clarity, dryness: body.dryness, discolouration: body.discolouration, luster: body.luster, ...(body.confirmed ? statusUpdate : {}) },
        });
        return reply.send({ success: true, data: updated });
    });
    // GET /api/visits/:id/eye
    fastify.get('/visits/:id/eye', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const analysis = await prisma_1.default.eyeAnalysis.findUnique({ where: { visitId } });
        let leftImageUrl = null;
        let rightImageUrl = null;
        if (analysis?.leftImageS3Key)
            leftImageUrl = await (0, s3_1.getPresignedUrl)('patientDocs', analysis.leftImageS3Key, 3600);
        if (analysis?.rightImageS3Key)
            rightImageUrl = await (0, s3_1.getPresignedUrl)('patientDocs', analysis.rightImageS3Key, 3600);
        return reply.send({ success: true, data: analysis ? { ...analysis, leftImageUrl, rightImageUrl } : null });
    });
}
//# sourceMappingURL=analysis.js.map