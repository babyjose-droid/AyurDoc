import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import path from 'path'

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// Bucket names from env
const BUCKETS = {
  clinicAssets:    process.env.S3_BUCKET_CLINIC_ASSETS    || 'ayurcare-clinic-assets',
  patientDocs:     process.env.S3_BUCKET_PATIENT_DOCS     || 'ayurcare-patient-docs',
  generatedPdfs:   process.env.S3_BUCKET_GENERATED_PDFS   || 'ayurcare-generated-pdfs',
} as const

type BucketKey = keyof typeof BUCKETS

// Allowed MIME types per context
const ALLOWED_TYPES: Record<string, string[]> = {
  logo:        ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
  certificate: ['application/pdf', 'image/jpeg', 'image/png'],
  signature:   ['image/png', 'image/jpeg'],
  labReport:   ['application/pdf', 'image/jpeg', 'image/png'],
  tongueImage: ['image/jpeg', 'image/png', 'image/webp'],
  eyeImage:    ['image/jpeg', 'image/png', 'image/webp'],
}

export function validateMimeType(context: string, mimeType: string): boolean {
  const allowed = ALLOWED_TYPES[context]
  if (!allowed) return false
  return allowed.includes(mimeType)
}

export function buildS3Key(
  context: string,
  clinicId: string,
  filename: string,
  subId?: string
): string {
  const ext = path.extname(filename)
  const uid = randomUUID()
  const base = subId
    ? `${context}/${clinicId}/${subId}/${uid}${ext}`
    : `${context}/${clinicId}/${uid}${ext}`
  return base
}

export async function uploadFile(
  bucket: BucketKey,
  key: string,
  body: Buffer,
  mimeType: string,
  metadata?: Record<string, string>
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKETS[bucket],
      Key: key,
      Body: body,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
      Metadata: metadata,
    })
  )
  return key
}

export async function deleteFile(bucket: BucketKey, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKETS[bucket], Key: key }))
}

export async function getPresignedUrl(
  bucket: BucketKey,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKETS[bucket],
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
}

// Return a public CDN URL (if CloudFront is configured) or a presigned URL
export function getAssetUrl(key: string): string {
  const cdnBase = process.env.CDN_BASE_URL
  if (cdnBase) return `${cdnBase}/${key}`
  return `/api/assets/${encodeURIComponent(key)}` // served via proxy endpoint
}
