import prisma from './prisma'
import { getAssetUrl, getPresignedUrl } from './s3'
import type { BrandingContext } from '../types'

const PREFIX = process.env.CLINIC_ID_PREFIX || 'AYR'

// Generate the next clinic ID: AYR-00001, AYR-00002, etc.
export async function generateClinicId(): Promise<string> {
  // Count existing clinics and increment — wrapped in a transaction for safety
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM clinics
  `
  const next = Number(result[0].count) + 1
  return `${PREFIX}-${String(next).padStart(5, '0')}`
}

// Generate the next patient code scoped to a clinic: SRD-0001, SRD-0002, etc.
export async function generatePatientCode(clinicId: string): Promise<string> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM patients WHERE "clinicId" = ${clinicId}
  `
  const next = Number(result[0].count) + 1
  // Use first 3 letters of clinicId suffix as prefix
  return `PAT-${String(next).padStart(4, '0')}`
}

// Assemble branding context for a doctor — used in PDF generation, invoices
export async function getBrandingContext(
  clinicId: string,
  doctorId: string
): Promise<BrandingContext | null> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      logoUrl: true,
    },
  })

  if (!clinic) return null

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId },
    select: {
      name: true,
      qualification: true,
      registrationNumber: true,
      signatureUrl: true,
    },
  })

  if (!doctor) return null

  const address = [clinic.addressLine1, clinic.addressLine2, clinic.city, clinic.state, clinic.pincode]
    .filter(Boolean)
    .join(', ')

  return {
    clinicName: clinic.name,
    clinicAddress: address,
    clinicPhone: clinic.phone,
    clinicEmail: clinic.email,
    clinicLogoUrl: clinic.logoUrl ? await getPresignedUrl('clinicAssets', clinic.logoUrl, 3600).catch(() => null) : null,
    doctorName: doctor.name,
    doctorQualification: doctor.qualification,
    doctorRegistrationNumber: doctor.registrationNumber,
    doctorSignatureUrl: doctor.signatureUrl ? await getPresignedUrl('clinicAssets', doctor.signatureUrl, 3600).catch(() => null) : null,
  }
}
