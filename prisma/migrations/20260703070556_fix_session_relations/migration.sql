-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_doctor_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_staff_fkey";
