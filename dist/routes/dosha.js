"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOSHA_QUESTIONS = void 0;
exports.calculateDoshaScores = calculateDoshaScores;
exports.default = doshaRoutes;
const prisma_1 = __importDefault(require("../lib/prisma"));
const requireAuth_1 = require("../middleware/requireAuth");
// ─── 32 Dosha Questions ───────────────────────────────────────────────────────
exports.DOSHA_QUESTIONS = [
    // PHYSICAL (1-12)
    { no: 1, category: 'PHYSICAL', question: 'Body frame and bone structure', options: [
            { label: 'Thin, light, small bones', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Medium, moderate build', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Large, heavy, broad frame', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 2, category: 'PHYSICAL', question: 'Body weight tendency', options: [
            { label: 'Difficulty gaining weight, naturally thin', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Moderate weight, easy to maintain', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Tendency to gain weight, difficult to lose', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 3, category: 'PHYSICAL', question: 'Skin texture', options: [
            { label: 'Dry, rough, thin, cool', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Oily, warm, sensitive, prone to rashes', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Thick, oily, smooth, cool, pale', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 4, category: 'PHYSICAL', question: 'Hair quality', options: [
            { label: 'Dry, thin, brittle, prone to split ends', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Fine, oily, early greying or thinning', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Thick, oily, wavy, lustrous', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 5, category: 'PHYSICAL', question: 'Eyes', options: [
            { label: 'Small, dry, active, nervous', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Medium, sharp, sensitive to light', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Large, calm, thick lashes, attractive', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 6, category: 'PHYSICAL', question: 'Teeth and gums', options: [
            { label: 'Irregular, receding gums, dry', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Medium, yellowish, prone to inflammation', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Large, white, strong, healthy gums', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 7, category: 'PHYSICAL', question: 'Joints', options: [
            { label: 'Cracking, popping sounds, prone to dryness', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Loose, prone to inflammation and heat', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Large, lubricated, strong', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 8, category: 'PHYSICAL', question: 'Body temperature preference', options: [
            { label: 'Dislikes cold, loves warmth', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Dislikes heat, loves cool weather', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Dislikes cold and damp, tolerates heat', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 9, category: 'PHYSICAL', question: 'Sweat and body odour', options: [
            { label: 'Scanty sweating, no strong odour', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Profuse sweating, strong odour', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Moderate sweating, sweet/pleasant odour', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 10, category: 'PHYSICAL', question: 'Voice quality', options: [
            { label: 'Low, weak, hoarse, fast', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Sharp, clear, precise', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Deep, melodious, pleasant', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 11, category: 'PHYSICAL', question: 'Physical activity level', options: [
            { label: 'Hyperactive, cannot sit still', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Moderate, purposeful activity', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Slow, steady, low activity preference', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 12, category: 'PHYSICAL', question: 'Nails', options: [
            { label: 'Dry, brittle, rough, crack easily', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Soft, pink, flexible', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Thick, smooth, strong, glossy', vata: 0, pitta: 0, kapha: 2 },
        ] },
    // PHYSIOLOGICAL (13-22)
    { no: 13, category: 'PHYSIOLOGICAL', question: 'Appetite and hunger', options: [
            { label: 'Irregular, variable appetite', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Strong, sharp hunger, irritable if meals delayed', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Slow, steady appetite, can skip meals easily', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 14, category: 'PHYSIOLOGICAL', question: 'Digestion', options: [
            { label: 'Irregular, tendency to gas and bloating', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Quick and efficient, tendency to acidity', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Slow but steady, tendency to heaviness', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 15, category: 'PHYSIOLOGICAL', question: 'Bowel movements', options: [
            { label: 'Irregular, dry, hard, tendency to constipation', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Regular, loose, tendency to diarrhoea', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Regular, heavy, slow, well-formed', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 16, category: 'PHYSIOLOGICAL', question: 'Urine', options: [
            { label: 'Scanty, colourless or pale', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Profuse, yellow to deep yellow', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Moderate, clear or milky white', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 17, category: 'PHYSIOLOGICAL', question: 'Sleep pattern', options: [
            { label: 'Light, interrupted, difficulty falling asleep, less than 6 hours', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Moderate, sound, 6-8 hours', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Deep, long, difficulty waking, more than 8 hours', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 18, category: 'PHYSIOLOGICAL', question: 'Dreams', options: [
            { label: 'Fearful, flying, running, moving', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Fiery, passionate, violent, colourful', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Romantic, sentimental, water, oceans', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 19, category: 'PHYSIOLOGICAL', question: 'Menstrual cycle (if applicable)', options: [
            { label: 'Irregular, scanty, painful', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Regular, heavy, with clots, irritability', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Regular, moderate, with fluid retention', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 20, category: 'PHYSIOLOGICAL', question: 'Sexual desire', options: [
            { label: 'Variable, quickly aroused, quickly satisfied', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Strong and passionate', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Steady, enduring', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 21, category: 'PHYSIOLOGICAL', question: 'Energy levels during day', options: [
            { label: 'Variable, bursts of energy followed by fatigue', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Consistent, strong until evening', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Steady, slow to start, better after warming up', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 22, category: 'PHYSIOLOGICAL', question: 'Immune strength', options: [
            { label: 'Variable, prone to frequent minor ailments', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Moderate, prone to infections and inflammation', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Strong, rarely falls ill but slow to recover', vata: 0, pitta: 0, kapha: 2 },
        ] },
    // PSYCHOLOGICAL (23-32)
    { no: 23, category: 'PSYCHOLOGICAL', question: 'Memory and learning', options: [
            { label: 'Quick to learn, quick to forget', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Sharp, precise, analytical mind', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Slow to learn, retains knowledge long-term', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 24, category: 'PSYCHOLOGICAL', question: 'Speech pattern', options: [
            { label: 'Fast, talkative, jumps topics', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Sharp, direct, critical', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Slow, deliberate, thoughtful', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 25, category: 'PSYCHOLOGICAL', question: 'Decision making', options: [
            { label: 'Indecisive, changes mind frequently', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Decisive, confident, can be stubborn', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Slow to decide but sticks to decisions', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 26, category: 'PSYCHOLOGICAL', question: 'Emotional response under stress', options: [
            { label: 'Anxiety, fear, nervousness', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Anger, irritability, frustration', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Withdrawal, depression, attachment', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 27, category: 'PSYCHOLOGICAL', question: 'Approach to work', options: [
            { label: 'Creative, enthusiastic but inconsistent', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Organised, goal-oriented, perfectionist', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Methodical, steady, reliable', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 28, category: 'PSYCHOLOGICAL', question: 'Social nature', options: [
            { label: 'Makes friends easily, not always reliable', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Selective, prefers quality over quantity', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Loyal, caring, attached to close circle', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 29, category: 'PSYCHOLOGICAL', question: 'Financial habits', options: [
            { label: 'Spends impulsively, poor savings', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Spends on quality, planned purchases', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Saves well, reluctant to spend', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 30, category: 'PSYCHOLOGICAL', question: 'Reaction to change', options: [
            { label: 'Welcomes change, gets bored with routine', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Adapts if change is logical and purposeful', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Resists change, prefers stability', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 31, category: 'PSYCHOLOGICAL', question: 'Spiritual nature', options: [
            { label: 'Explores many paths, spiritual but unsettled', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Seeks knowledge and understanding, analytical', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Devoted, faithful, consistent practice', vata: 0, pitta: 0, kapha: 2 },
        ] },
    { no: 32, category: 'PSYCHOLOGICAL', question: 'Overall disposition', options: [
            { label: 'Creative, enthusiastic, variable, sensitive', vata: 2, pitta: 0, kapha: 0 },
            { label: 'Intelligent, ambitious, focused, intense', vata: 0, pitta: 2, kapha: 0 },
            { label: 'Calm, stable, nurturing, content', vata: 0, pitta: 0, kapha: 2 },
        ] },
];
// ─── Scoring algorithm ────────────────────────────────────────────────────────
function calculateDoshaScores(answers) {
    let vata = 0, pitta = 0, kapha = 0;
    for (const answer of answers) {
        const question = exports.DOSHA_QUESTIONS.find(q => q.no === answer.questionId);
        if (!question)
            continue;
        const option = question.options[answer.optionIndex];
        if (!option)
            continue;
        vata += option.vata;
        pitta += option.pitta;
        kapha += option.kapha;
    }
    const total = vata + pitta + kapha || 1;
    const vataPct = Math.round((vata / total) * 100);
    const pittaPct = Math.round((pitta / total) * 100);
    const kaphaPct = Math.round((kapha / total) * 100);
    // Determine dominant dosha(s)
    const max = Math.max(vataPct, pittaPct, kaphaPct);
    const dominant = [];
    if (vataPct >= max - 10)
        dominant.push('VATA');
    if (pittaPct >= max - 10)
        dominant.push('PITTA');
    if (kaphaPct >= max - 10)
        dominant.push('KAPHA');
    const dominantDosha = dominant.join('_');
    return { vata: vataPct, pitta: pittaPct, kapha: kaphaPct, dominantDosha };
}
// ─── Routes ───────────────────────────────────────────────────────────────────
async function doshaRoutes(fastify) {
    // GET /api/dosha/questions — get questions from DB
    fastify.get('/dosha/questions', async (_request, reply) => {
        const questions = await prisma_1.default.doshaQuestion.findMany({ where: { isActive: true }, orderBy: { questionNo: 'asc' } });
        if (questions.length > 0)
            return reply.send({ success: true, data: questions, count: questions.length });
        return reply.send({ success: true, data: exports.DOSHA_QUESTIONS, count: exports.DOSHA_QUESTIONS.length });
    });
    // POST /api/visits/:id/dosha — save questionnaire answers
    fastify.post('/visits/:id/dosha', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const body = request.body;
        const visit = await prisma_1.default.visit.findFirst({ where: { id: visitId, clinicId: request.user.clinicId } });
        if (!visit)
            return reply.status(404).send({ success: false, error: 'Visit not found.' });
        const scores = calculateDoshaScores(body.answers);
        const assessment = await prisma_1.default.doshaAssessment.upsert({
            where: { visitId },
            create: {
                visitId,
                patientId: visit.patientId,
                answers: body.answers,
                vataScore: scores.vata,
                pittaScore: scores.pitta,
                kaphaScore: scores.kapha,
                finalVata: scores.vata,
                finalPitta: scores.pitta,
                finalKapha: scores.kapha,
                dominantDosha: scores.dominantDosha,
                filledBy: body.filledBy || 'DOCTOR',
            },
            update: {
                answers: body.answers,
                vataScore: scores.vata,
                pittaScore: scores.pitta,
                kaphaScore: scores.kapha,
                finalVata: scores.vata,
                finalPitta: scores.pitta,
                finalKapha: scores.kapha,
                dominantDosha: scores.dominantDosha,
                overridden: false,
            },
        });
        return reply.send({ success: true, data: assessment });
    });
    // PATCH /api/visits/:id/dosha/override — doctor overrides scores
    fastify.patch('/visits/:id/dosha/override', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'DOCTOR') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const body = request.body;
        const existing = await prisma_1.default.doshaAssessment.findUnique({ where: { visitId } });
        if (!existing)
            return reply.status(404).send({ success: false, error: 'No dosha assessment found for this visit.' });
        const total = body.vata + body.pitta + body.kapha || 1;
        const dominant = [];
        if ((body.vata / total * 100) >= 30)
            dominant.push('VATA');
        if ((body.pitta / total * 100) >= 30)
            dominant.push('PITTA');
        if ((body.kapha / total * 100) >= 30)
            dominant.push('KAPHA');
        const updated = await prisma_1.default.doshaAssessment.update({
            where: { visitId },
            data: {
                finalVata: body.vata,
                finalPitta: body.pitta,
                finalKapha: body.kapha,
                dominantDosha: dominant.join('_') || 'VATA_PITTA_KAPHA',
                overridden: true,
                overrideNote: body.reason,
            },
        });
        return reply.send({ success: true, data: updated });
    });
    // GET /api/visits/:id/dosha
    fastify.get('/visits/:id/dosha', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId } = request.params;
        const assessment = await prisma_1.default.doshaAssessment.findUnique({ where: { visitId } });
        return reply.send({ success: true, data: assessment });
    });
}
//# sourceMappingURL=dosha.js.map