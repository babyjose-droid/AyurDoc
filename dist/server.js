"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const auth_1 = __importDefault(require("./routes/auth"));
const clinic_1 = __importDefault(require("./routes/clinic"));
const doctor_1 = __importDefault(require("./routes/doctor"));
const staff_1 = __importDefault(require("./routes/staff"));
const patient_1 = __importDefault(require("./routes/patient"));
const visits_1 = __importDefault(require("./routes/visits"));
const clinical_1 = __importDefault(require("./routes/clinical"));
const dosha_1 = __importDefault(require("./routes/dosha"));
const analysis_1 = __importDefault(require("./routes/analysis"));
const ai_1 = __importDefault(require("./routes/ai"));
const pdf_1 = __importDefault(require("./routes/pdf"));
const billing_1 = __importDefault(require("./routes/billing"));
const inventory_1 = __importDefault(require("./routes/inventory"));
const payments_1 = __importDefault(require("./routes/payments"));
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';
async function build() {
    const fastify = (0, fastify_1.default)({
        connectionTimeout: 300000,
        bodyLimit: 20971520,
        requestTimeout: 300000,
        logger: {
            level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
            transport: process.env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
        },
        trustProxy: true, // needed behind AWS ALB / CloudFront
    });
    // ─── Security ────────────────────────────────────────────────────────────────
    await fastify.register(helmet_1.default, {
        contentSecurityPolicy: false, // handled by frontend framework
    });
    await fastify.register(cors_1.default, {
        origin: process.env.APP_URL || 'http://localhost:3000',
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });
    // ─── JWT ─────────────────────────────────────────────────────────────────────
    await fastify.register(jwt_1.default, {
        secret: process.env.JWT_SECRET,
        sign: {
            algorithm: 'HS256',
        },
    });
    // ─── File uploads ─────────────────────────────────────────────────────────────
    await fastify.register(multipart_1.default, {
        limits: {
            fileSize: 20 * 1024 * 1024, // 20MB max
            files: 1, // one file per request
        },
    });
    // ─── Health check ──────────────────────────────────────────────────────────────
    fastify.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    }));
    // ─── Routes ──────────────────────────────────────────────────────────────────
    await fastify.register(auth_1.default, { prefix: '/api/auth' });
    await fastify.register(clinic_1.default, { prefix: '/api/clinics' });
    await fastify.register(doctor_1.default, { prefix: '/api/doctors' });
    await fastify.register(staff_1.default, { prefix: '/api/staff' });
    await fastify.register(patient_1.default, { prefix: '/api/patients' });
    await fastify.register(visits_1.default, { prefix: '/api/visits' });
    await fastify.register(clinical_1.default, { prefix: '/api' });
    await fastify.register(dosha_1.default, { prefix: '/api' });
    await fastify.register(analysis_1.default, { prefix: '/api' });
    await fastify.register(ai_1.default, { prefix: '/api' });
    await fastify.register(pdf_1.default, { prefix: '/api' });
    await fastify.register(billing_1.default, { prefix: '/api/billing' });
    await fastify.register(inventory_1.default, { prefix: '/api/inventory' });
    await fastify.register(payments_1.default, { prefix: '/api/payments' });
    // ─── Global error handler ────────────────────────────────────────────────────
    fastify.setErrorHandler((error, request, reply) => {
        fastify.log.error(error);
        if (error.validation) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: error.validation,
            });
        }
        const statusCode = error.statusCode || 500;
        return reply.status(statusCode).send({
            success: false,
            error: process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred.'
                : error.message,
        });
    });
    return fastify;
}
async function start() {
    const fastify = await build();
    try {
        await fastify.listen({ port: PORT, host: HOST });
        console.log(`
╔══════════════════════════════════════════╗
║      AyurCare API — Phase 1 Ready       ║
║  http://${HOST}:${PORT}                  ║
╚══════════════════════════════════════════╝
    `);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=server.js.map