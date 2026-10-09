-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DoshaType" AS ENUM ('VATA', 'PITTA', 'KAPHA');

-- CreateEnum
CREATE TYPE "SignOffSection" AS ENUM ('PRESCRIPTION', 'DINACHARYA', 'DIET_PLAN', 'TREATMENT_PLAN');

-- CreateEnum
CREATE TYPE "AIPlanType" AS ENUM ('PRESCRIPTION', 'DINACHARYA', 'DIET_PLAN', 'TREATMENT_PLAN');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('AI_SUGGESTED', 'DOCTOR_CONFIRMED', 'DOCTOR_EDITED', 'DOCTOR_REJECTED');

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiefComplaint" TEXT,
    "workingDiagnosis" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_histories" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "pastIllnesses" TEXT[],
    "surgeries" TEXT[],
    "allergies" TEXT[],
    "currentMedications" TEXT[],
    "familyHistory" TEXT,
    "sleepHours" DOUBLE PRECISION,
    "exerciseFrequency" TEXT,
    "smokingStatus" TEXT,
    "alcoholStatus" TEXT,
    "dietPreference" TEXT,
    "occupation" TEXT,
    "stressLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_reports" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "clinicId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3),
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dosha_assessments" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "vataScore" DOUBLE PRECISION NOT NULL,
    "pittaScore" DOUBLE PRECISION NOT NULL,
    "kaphaScore" DOUBLE PRECISION NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideNote" TEXT,
    "finalVata" DOUBLE PRECISION NOT NULL,
    "finalPitta" DOUBLE PRECISION NOT NULL,
    "finalKapha" DOUBLE PRECISION NOT NULL,
    "dominantDosha" TEXT NOT NULL,
    "filledBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dosha_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tongue_analyses" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "imageS3Key" TEXT,
    "colour" TEXT,
    "coating" TEXT,
    "texture" TEXT,
    "cracks" TEXT,
    "moisture" TEXT,
    "shape" TEXT,
    "markings" TEXT,
    "colourStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "coatingStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "textureStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "cracksStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "moistureStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "aiSuggestion" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tongue_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eye_analyses" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "leftImageS3Key" TEXT,
    "rightImageS3Key" TEXT,
    "colour" TEXT,
    "clarity" TEXT,
    "dryness" TEXT,
    "discolouration" TEXT,
    "luster" TEXT,
    "colourStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "clarityStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "drynessStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "discolourationStatus" "ObservationStatus" NOT NULL DEFAULT 'AI_SUGGESTED',
    "aiSuggestion" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eye_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_plans" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "planType" "AIPlanType" NOT NULL,
    "aiContent" JSONB NOT NULL,
    "finalContent" JSONB,
    "promptContext" JSONB,
    "isSignedOff" BOOLEAN NOT NULL DEFAULT false,
    "signedOffAt" TIMESTAMP(3),
    "signedOffBy" TEXT,
    "aiGeneratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_offs" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "section" "SignOffSection" NOT NULL,
    "doctorId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "sign_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentS3Key" TEXT,
    "attachmentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dosha_questions" (
    "id" TEXT NOT NULL,
    "questionNo" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dosha_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandName" TEXT,
    "genericName" TEXT,
    "form" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "standardDosage" TEXT,
    "indications" TEXT[],
    "contraindications" TEXT[],
    "anupana" TEXT,
    "isVaidyaratnam" BOOLEAN NOT NULL DEFAULT false,
    "mrp" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_histories_patientId_key" ON "medical_histories"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "medical_histories_visitId_key" ON "medical_histories"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "dosha_assessments_visitId_key" ON "dosha_assessments"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "tongue_analyses_visitId_key" ON "tongue_analyses"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "eye_analyses_visitId_key" ON "eye_analyses"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_plans_visitId_planType_key" ON "ai_plans"("visitId", "planType");

-- CreateIndex
CREATE UNIQUE INDEX "sign_offs_visitId_section_key" ON "sign_offs"("visitId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "dosha_questions_questionNo_key" ON "dosha_questions"("questionNo");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_histories" ADD CONSTRAINT "medical_histories_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_histories" ADD CONSTRAINT "medical_histories_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dosha_assessments" ADD CONSTRAINT "dosha_assessments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tongue_analyses" ADD CONSTRAINT "tongue_analyses_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eye_analyses" ADD CONSTRAINT "eye_analyses_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_plans" ADD CONSTRAINT "ai_plans_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sign_offs" ADD CONSTRAINT "sign_offs_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
