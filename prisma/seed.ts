// AyurCare — Development seed data
// Run with: npm run db:seed

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding AyurCare database...')

  // ── Seed clinic ─────────────────────────────────────────────────────────────
  const clinic = await prisma.clinic.upsert({
    where: { clinicId: 'AYR-00001' },
    update: {},
    create: {
      clinicId:     'AYR-00001',
      name:         'Sreedhareeyam Ayurveda Clinic',
      addressLine1: 'MG Road',
      addressLine2: 'Near Civil Station',
      city:         'Kochi',
      state:        'Kerala',
      pincode:      '682016',
      phone:        '9876543210',
      email:        'info@sreedhareeyam.in',
      tier:         'CLINIC',
      workingHours: { mon: '9:00-18:00', tue: '9:00-18:00', wed: '9:00-18:00', thu: '9:00-18:00', fri: '9:00-18:00', sat: '9:00-14:00' },
      consultationTypes: ['General OPD', 'Panchakarma', 'Follow-up', 'Pulse Diagnosis'],
    },
  })
  console.log(`  ✓ Clinic: ${clinic.name} (${clinic.clinicId})`)

  // ── Seed Clinic Admin ────────────────────────────────────────────────────────
  const admin = await prisma.staff.upsert({
    where: { clinicId_mobile: { clinicId: clinic.id, mobile: '9000000001' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name:     'Clinic Admin',
      mobile:   '9000000001',
      email:    'admin@sreedhareeyam.in',
      role:     'CLINIC_ADMIN',
    },
  })
  console.log(`  ✓ Clinic Admin: ${admin.name} (mobile: 9000000001)`)

  // ── Seed Doctor ──────────────────────────────────────────────────────────────
  const doctor = await prisma.doctor.upsert({
    where: { clinicId_mobile: { clinicId: clinic.id, mobile: '9000000002' } },
    update: {},
    create: {
      clinicId:           clinic.id,
      name:               'Dr. Sunita Nair',
      mobile:             '9000000002',
      email:              'sunita.nair@sreedhareeyam.in',
      qualification:      'BAMS, MD (Ayurveda)',
      specialization:     'Panchakarma & General Ayurveda',
      yearsExperience:    14,
      registrationNumber: 'KAU/A-04821',
      registrationState:  'Kerala',
      status:             'VERIFIED',
      verifiedAt:         new Date(),
      consultationFee:    600,
    },
  })
  console.log(`  ✓ Doctor: ${doctor.name} — VERIFIED (mobile: 9000000002)`)

  // ── Seed Staff ───────────────────────────────────────────────────────────────
  const staff = await prisma.staff.upsert({
    where: { clinicId_mobile: { clinicId: clinic.id, mobile: '9000000003' } },
    update: {},
    create: {
      clinicId: clinic.id,
      name:     'Receptionist Meera',
      mobile:   '9000000003',
      email:    'meera@sreedhareeyam.in',
      role:     'STAFF',
    },
  })
  console.log(`  ✓ Staff: ${staff.name} (mobile: 9000000003)`)

  // ── Seed sample patients ─────────────────────────────────────────────────────
  const patients = [
    { patientCode: 'PAT-0001', name: 'Anjali Menon', mobile: '9876500001', gender: 'F', occupation: 'Teacher' },
    { patientCode: 'PAT-0002', name: 'Ravi Kurup',   mobile: '9876500002', gender: 'M', occupation: 'Engineer' },
    { patientCode: 'PAT-0003', name: 'Fathima K.',   mobile: '9876500003', gender: 'F', occupation: 'Homemaker' },
  ]

  for (const p of patients) {
    await prisma.patient.upsert({
      where: { clinicId_patientCode: { clinicId: clinic.id, patientCode: p.patientCode } },
      update: {},
      create: { clinicId: clinic.id, ...p },
    })
    console.log(`  ✓ Patient: ${p.name} (${p.patientCode})`)
  }

  console.log(`
✅ Seed complete!

Login credentials (use in Clinic ID + Mobile + OTP flow):
  Clinic ID:     AYR-00001
  Admin mobile:  9000000001
  Doctor mobile: 9000000002
  Staff mobile:  9000000003

In development mode, OTPs are printed to console (no real SMS).
  `)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
