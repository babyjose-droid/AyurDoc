"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMimeType = validateMimeType;
exports.buildS3Key = buildS3Key;
exports.uploadFile = uploadFile;
exports.deleteFile = deleteFile;
exports.getPresignedUrl = getPresignedUrl;
exports.getAssetUrl = getAssetUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
const s3 = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
// Bucket names from env
const BUCKETS = {
    clinicAssets: process.env.S3_BUCKET_CLINIC_ASSETS || 'ayurcare-clinic-assets',
    patientDocs: process.env.S3_BUCKET_PATIENT_DOCS || 'ayurcare-patient-docs',
    generatedPdfs: process.env.S3_BUCKET_GENERATED_PDFS || 'ayurcare-generated-pdfs',
};
// Allowed MIME types per context
const ALLOWED_TYPES = {
    logo: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
    certificate: ['application/pdf', 'image/jpeg', 'image/png'],
    signature: ['image/png', 'image/jpeg'],
    labReport: ['application/pdf', 'image/jpeg', 'image/png'],
    tongueImage: ['image/jpeg', 'image/png', 'image/webp'],
    eyeImage: ['image/jpeg', 'image/png', 'image/webp'],
};
function validateMimeType(context, mimeType) {
    const allowed = ALLOWED_TYPES[context];
    if (!allowed)
        return false;
    return allowed.includes(mimeType);
}
function buildS3Key(context, clinicId, filename, subId) {
    const ext = path_1.default.extname(filename);
    const uid = (0, crypto_1.randomUUID)();
    const base = subId
        ? `${context}/${clinicId}/${subId}/${uid}${ext}`
        : `${context}/${clinicId}/${uid}${ext}`;
    return base;
}
async function uploadFile(bucket, key, body, mimeType, metadata) {
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: BUCKETS[bucket],
        Key: key,
        Body: body,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
        Metadata: metadata,
    }));
    return key;
}
async function deleteFile(bucket, key) {
    await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: BUCKETS[bucket], Key: key }));
}
async function getPresignedUrl(bucket, key, expiresInSeconds = 3600) {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: BUCKETS[bucket],
        Key: key,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: expiresInSeconds });
}
// Return a public CDN URL (if CloudFront is configured) or a presigned URL
function getAssetUrl(key) {
    const cdnBase = process.env.CDN_BASE_URL;
    if (cdnBase)
        return `${cdnBase}/${key}`;
    return `/api/assets/${encodeURIComponent(key)}`; // served via proxy endpoint
}
//# sourceMappingURL=s3.js.map