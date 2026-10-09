# AyurCare API — Phase 1

AI-powered Ayurvedic Clinic Management Platform — Backend API

## Phase 1 Scope

- ✅ Multi-tenant PostgreSQL schema (Clinic → Doctor → Staff → Patient)
- ✅ Passwordless authentication: **Clinic ID + Mobile + OTP**
- ✅ OTP lifecycle: generate → send (MSG91) → verify → expire → lockout
- ✅ JWT sessions with Redis backing (web: 8h, mobile: 30d)
- ✅ Clinic registration & auto Clinic ID generation (AYR-XXXXX)
- ✅ Clinic logo upload to S3
- ✅ Doctor onboarding (profile + certificate upload)
- ✅ Super Admin doctor verification workflow
- ✅ Staff management (add / deactivate / mobile change)
- ✅ Branding auto-population (clinic + doctor data pre-fetched for all PDFs)
- ✅ Basic patient registration (Phase 2 adds full medical history + visits)
- ✅ Full audit logging on every significant action
- ✅ Role-based access control (SUPER_ADMIN / CLINIC_ADMIN / DOCTOR / STAFF)
- ✅ Subscription tier limits (SOLO / CLINIC / MULTI_CENTER)

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Framework | Fastify 4 + TypeScript |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / OTP | Redis 7 (ioredis) |
| File Storage | AWS S3 (ap-south-1) |
| Auth | JWT (HS256) + MSG91 OTP SMS |

## Quick Start (Development)

### 1. Prerequisites
- Node.js 18+
- Docker & Docker Compose
- An AWS account (for S3) — or skip for local dev

### 2. Start local services
```bash
docker compose up -d postgres redis
```

### 3. Install dependencies
```bash
npm install
```

### 4. Configure environment
```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET
```

### 5. Run migrations & seed
```bash
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Run migrations
npm run db:seed         # Seed dev data
```

### 6. Start the server
```bash
npm run dev
```

Server starts at `http://localhost:3001`

## Development Login

After seeding, use these in the OTP login flow:

| Role | Clinic ID | Mobile |
|---|---|---|
| Clinic Admin | AYR-00001 | 9000000001 |
| Doctor (Verified) | AYR-00001 | 9000000002 |
| Staff | AYR-00001 | 9000000003 |

**In development mode, OTPs are printed to the server console — no real SMS is sent.**

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/request-otp` | None | Step 1: Send OTP |
| POST | `/api/auth/verify-otp` | None | Step 2: Verify OTP → JWT |
| POST | `/api/auth/logout` | JWT | Revoke current session |
| POST | `/api/auth/logout-all` | JWT | Revoke all sessions |
| GET | `/api/auth/me` | JWT | Current user context |

### Clinic

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/clinics/register` | None | Register new clinic |
| GET | `/api/clinics/me` | Any | Get clinic details |
| PATCH | `/api/clinics/me` | Admin | Update clinic settings |
| POST | `/api/clinics/me/logo` | Admin | Upload clinic logo |
| GET | `/api/clinics/me/staff` | Admin | List all staff + doctors |
| GET | `/api/clinics/me/limits` | Admin/Doctor | Subscription usage |

### Doctors

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/doctors` | Admin | Add a doctor |
| GET | `/api/doctors` | Admin/Staff | List clinic doctors |
| GET | `/api/doctors/me` | Doctor | Own profile |
| PATCH | `/api/doctors/me` | Doctor | Update own profile |
| POST | `/api/doctors/me/certificates` | Doctor | Upload certificate |
| POST | `/api/doctors/me/signature` | Doctor | Upload signature |
| GET | `/api/doctors/pending` | Super Admin | Pending verifications |
| POST | `/api/doctors/:id/verify` | Super Admin | Approve / Reject |

### Staff

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/staff` | Admin | Add staff member |
| DELETE | `/api/staff/:id` | Admin | Deactivate staff |
| PATCH | `/api/staff/:id/mobile` | Admin | Update mobile number |

### Patients

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/patients` | Any auth | Register patient |
| GET | `/api/patients` | Any auth | Search/list patients |
| GET | `/api/patients/:id` | Any auth | Patient details |

## Project Structure

```
ayurcare/
├── prisma/
│   ├── schema.prisma     # Full multi-tenant schema
│   └── seed.ts           # Dev seed data
├── src/
│   ├── lib/
│   │   ├── audit.ts      # Audit logger
│   │   ├── branding.ts   # Clinic ID generation + branding context
│   │   ├── otp.ts        # OTP generate / send / verify with rate limiting
│   │   ├── prisma.ts     # Prisma client singleton
│   │   ├── redis.ts      # Redis client + key builders
│   │   └── s3.ts         # S3 upload / presigned URL helpers
│   ├── middleware/
│   │   └── requireAuth.ts # JWT verify + RBAC
│   ├── routes/
│   │   ├── auth.ts        # OTP login, logout, /me
│   │   ├── clinic.ts      # Register, settings, logo, staff list
│   │   ├── doctor.ts      # Onboarding, certificates, verification
│   │   ├── patient.ts     # Registration, search
│   │   └── staff.ts       # Add, remove, mobile change
│   ├── types/
│   │   └── index.ts       # Shared TypeScript types
│   └── server.ts          # Fastify app entry point
├── .env.example
├── docker-compose.yml
├── package.json
├── README.md
└── tsconfig.json
```

## Security Notes

- OTPs are hashed (SHA-256) before storage in Redis — plaintext never persists
- JWT uses HS256; rotate `JWT_SECRET` every 90 days in production
- All S3 uploads use server-side encryption (AES-256)
- `clinic_id` is enforced in every query via middleware — no cross-tenant data leakage
- Audit log is append-only; no update/delete on `audit_logs` table
- All login attempts (success and failure) are logged with IP and masked mobile

## What's Next (Phase 2)

- Patient medical history (allergies, medications, lifestyle)
- Lab report upload against patient visits
- Dosha questionnaire engine (32 questions, Prakriti/Vikriti scoring)
- Tongue and eye analysis with image upload
- AI prescription generation (Claude API integration)
