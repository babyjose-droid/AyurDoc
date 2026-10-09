"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = pdfRoutes;
const prisma_1 = __importDefault(require("../lib/prisma"));
const requireAuth_1 = require("../middleware/requireAuth");
const branding_1 = require("../lib/branding");
const audit_1 = require("../lib/audit");
// ─── HTML template builders ───────────────────────────────────────────────────
function prescriptionHtml(branding, patient, visit, medicines) {
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #20281F; background: white; }
  .header { background: #163829; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
  .clinic-name { font-size: 18px; font-weight: bold; }
  .clinic-sub { font-size: 11px; color: #C9C2AC; margin-top: 3px; }
  .content { padding: 20px 30px; }
  .patient-row { display: flex; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #E2DCCB; margin-bottom: 16px; }
  .field-label { font-size: 10px; color: #5B6356; margin-bottom: 2px; }
  .field-value { font-weight: 600; }
  .rx-header { font-size: 13px; font-weight: 700; color: #1F4D38; margin-bottom: 10px; letter-spacing: 1px; }
  .medicine { padding: 10px 0; border-bottom: 1px solid #E2DCCB; }
  .med-name { font-weight: 600; font-size: 13px; }
  .med-brand { color: #C98A2E; font-size: 10px; font-weight: 600; background: #F2E2C2; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
  .med-details { color: #5B6356; font-size: 11px; margin-top: 4px; }
  .signature { margin-top: 30px; padding-top: 16px; border-top: 1px solid #E2DCCB; text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
  .sig-box { display: inline-block; width: 120px; height: 60px; border: 1px dashed #E2DCCB; border-radius: 6px; margin-bottom: 6px; }
  .disclaimer { margin-top: 16px; padding: 10px; background: #F2E2C2; border-radius: 6px; font-size: 10px; color: #7A540F; }
  .leaf { width: 24px; height: 24px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="clinic-name">${branding.clinicName}</div>
    <div class="clinic-sub">${branding.clinicAddress}</div>
    <div class="clinic-sub">${branding.clinicPhone} · ${branding.clinicEmail}</div>
  </div>
  ${branding.clinicLogoUrl ? '<img src="' + branding.clinicLogoUrl + '" style="height:60px;width:60px;object-fit:contain;border-radius:8px;background:white;padding:4px" />' : '<div style="font-size:28px;color:#C98A2E">☘</div>'}
</div>
<div class="content">
  <div class="patient-row">
    <div><div class="field-label">Patient</div><div class="field-value">${patient.name}${patient.age ? ', ' + patient.age + 'y' : ''}${patient.gender ? ' (' + patient.gender + ')' : ''}</div></div>
    <div><div class="field-label">Visit Date</div><div class="field-value">${new Date(visit.visitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
    <div><div class="field-label">Doctor</div><div class="field-value">${branding.doctorName}</div><div class="field-label">${branding.doctorQualification} · Reg: ${branding.doctorRegistrationNumber}</div></div>
  </div>
  ${visit.chiefComplaint ? `<div style="margin-bottom:12px"><span class="field-label">Chief Complaint: </span><span>${visit.chiefComplaint}</span></div>` : ''}
  <div class="rx-header">℞ &nbsp; MEDICINES</div>
  ${medicines.map((m, i) => `
    <div class="medicine">
      <div class="med-name">${i + 1}. ${m.name}${m.brandAlternative ? `<span class="med-brand">${m.brandAlternative}</span>` : ''}</div>
      <div class="med-details">
        ${m.form ? m.form.charAt(0).toUpperCase() + m.form.slice(1) : ''} · 
        ${m.dosage || ''} · ${m.frequency || ''} · ${m.duration || ''}<br>
        Anupana: ${m.anupana || 'Warm water'} · ${m.timing || 'After food'}
      </div>
    </div>
  `).join('')}
  <div class="signature">
    ${branding.doctorSignatureUrl ? '<img src="' + branding.doctorSignatureUrl + '" style="height:60px;max-width:160px;object-fit:contain;display:block;margin-bottom:6px" />' : '<div class="sig-box"></div>'}
    <div class="field-value">${branding.doctorName}</div>
    <div class="field-label">${branding.doctorQualification}</div>
    <div class="field-label">Reg. No. ${branding.doctorRegistrationNumber}</div>
  </div>
  <div class="disclaimer">
    ⚠️ This prescription is generated with AI assistance and has been reviewed and approved by ${branding.doctorName}. 
    This is a clinical decision-support document. Please consult your doctor for any queries.
  </div>
</div>
</body></html>`;
}
function dietPlanHtml(branding, patient, visitDate, dietPlan) {
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #20281F; }
  .header { background: #163829; color: white; padding: 20px 30px; }
  .clinic-name { font-size: 18px; font-weight: bold; }
  .content { padding: 20px 30px; }
  .section-title { font-size: 13px; font-weight: 700; color: #1F4D38; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 1px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .box { background: #EEF2EA; border-radius: 8px; padding: 12px; }
  .box-title { font-weight: 700; color: #163829; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; }
  .box-red { background: #F5E0DA; }
  .box-red .box-title { color: #B5533C; }
  .meal { padding: 10px 0; border-bottom: 1px solid #E2DCCB; }
  .meal-name { font-weight: 600; color: #1F4D38; }
  .meal-time { color: #C98A2E; font-size: 10px; font-weight: 600; }
  li { margin-left: 16px; margin-bottom: 3px; }
</style>
</head>
<body>
<div class="header">
  <div class="clinic-name">${branding.clinicName}</div>
  <div style="font-size: 11px; color: #C9C2AC; margin-top: 3px;">Diet Plan for ${patient.name} · ${new Date(visitDate).toLocaleDateString('en-IN')}</div>
</div>
<div class="content">
  <div class="grid-2">
    <div class="box">
      <div class="box-title">✓ Foods to Favour</div>
      <ul>${(dietPlan.foodsToFavour || []).map((f) => `<li>${f}</li>`).join('')}</ul>
    </div>
    <div class="box box-red">
      <div class="box-title">✗ Foods to Avoid</div>
      <ul>${(dietPlan.foodsToAvoid || []).map((f) => `<li>${f}</li>`).join('')}</ul>
    </div>
  </div>
  <div class="section-title">Meal Plan</div>
  ${(dietPlan.mealPlan || []).map((m) => `
    <div class="meal">
      <div><span class="meal-name">${m.meal}</span> <span class="meal-time">${m.time}</span></div>
      <ul>${(m.options || []).map((o) => `<li>${o}</li>`).join('')}</ul>
      ${m.guidelines ? `<div style="color: #5B6356; font-size: 11px; margin-top: 3px; font-style: italic;">${m.guidelines}</div>` : ''}
    </div>
  `).join('')}
  ${dietPlan.waterIntake ? `<div style="margin-top: 12px"><strong>Fluids:</strong> ${dietPlan.waterIntake}</div>` : ''}
  ${dietPlan.cookingGuidelines ? `<div style="margin-top: 8px"><strong>Cooking:</strong> ${dietPlan.cookingGuidelines}</div>` : ''}
  <div style="margin-top: 16px; padding: 10px; background: #FDF3E0; border-radius: 6px; font-size: 10px;">
    ${branding.clinicLogoUrl ? `<img src='${branding.clinicLogoUrl}' style='height:30px;object-fit:contain;vertical-align:middle;margin-right:8px' />` : ''}Prepared by ${branding.doctorName}, ${branding.doctorQualification} — ${branding.clinicName}
  </div>
</div>
</body></html>`;
}
function caseSheetHtml(branding, patient, visit) {
    const age = patient.age || '';
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #20281F; background: white; }
  .header { background: #163829; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
  .clinic-name { font-size: 18px; font-weight: bold; }
  .clinic-sub { font-size: 11px; color: #C9C2AC; margin-top: 3px; }
  .content { padding: 20px 30px; }
  h2 { color: #1F4D38; font-size: 14px; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #1F4D38; padding-bottom: 4px; }
  .patient-row { display: flex; gap: 32px; padding: 14px 0; border-bottom: 1px solid #E2DCCB; margin-bottom: 16px; flex-wrap: wrap; }
  .field { margin-bottom: 14px; }
  .field-label { font-size: 10px; color: #5B6356; margin-bottom: 3px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
  .field-value { background: #F7F5F0; border-radius: 6px; padding: 10px 12px; min-height: 36px; line-height: 1.6; white-space: pre-wrap; }
  .sig-row { margin-top: 30px; padding-top: 16px; border-top: 1px solid #E2DCCB; text-align: right; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="clinic-name">${branding.clinicName}</div>
    <div class="clinic-sub">${branding.clinicAddress}</div>
    <div class="clinic-sub">${branding.clinicPhone} · ${branding.clinicEmail}</div>
  </div>
  ${branding.clinicLogoUrl ? '<img src="' + branding.clinicLogoUrl + '" style="height:60px;width:60px;object-fit:contain;border-radius:8px;background:white;padding:4px" />' : '<div style="font-size:28px;color:#C98A2E">☘</div>'}
</div>
<div class="content">
  <h2>Case Sheet</h2>
  <div class="patient-row">
    <div><div class="field-label">Patient</div><div style="font-weight:600">${patient.name}${age ? ', ' + age + 'y' : ''}${patient.gender ? ' (' + patient.gender + ')' : ''}</div></div>
    <div><div class="field-label">Visit Date</div><div style="font-weight:600">${new Date(visit.visitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
    <div><div class="field-label">Doctor</div><div style="font-weight:600">${branding.doctorName}</div><div class="field-label">${branding.doctorQualification} · Reg: ${branding.doctorRegistrationNumber}</div></div>
  </div>
  <div class="field"><div class="field-label">Chief Complaint</div><div class="field-value">${visit.chiefComplaint || '—'}</div></div>
  <div class="field"><div class="field-label">Medical History &amp; Notes</div><div class="field-value">${visit.medicalHistoryNote || '—'}</div></div>
  <div class="field"><div class="field-label">Clinical Examination</div><div class="field-value">${visit.examination || '—'}</div></div>
  <div class="field"><div class="field-label">Ayurvedic Diagnosis</div><div class="field-value">${visit.ayurvedicDiagnosis || '—'}</div></div>
  <div class="sig-row">
    ${branding.doctorSignatureUrl ? '<img src="' + branding.doctorSignatureUrl + '" style="height:60px;max-width:160px;object-fit:contain;display:block;margin-left:auto;margin-bottom:6px" />' : '<div style="width:120px;height:60px;border:1px dashed #E2DCCB;border-radius:6px;margin-left:auto;margin-bottom:6px"></div>'}
    <div style="font-weight:600">${branding.doctorName}</div>
    <div style="font-size:10px;color:#5B6356">${branding.doctorQualification} · Reg. No. ${branding.doctorRegistrationNumber}</div>
  </div>
</div>
</body></html>`;
}
// ─── Routes ───────────────────────────────────────────────────────────────────
function dinacharyaHtml(branding, patient, visitDate, d) {
    const rows = [
        ...(d.morningRoutine || []).map((r) => `<tr><td>${r.time || ''}</td><td><strong>${r.activity || ''}</strong><br><small>${r.description || ''}</small></td><td>${r.duration || ''}</td></tr>`),
        ...(d.meals || []).map((m) => `<tr><td>${m.time || ''}</td><td><strong>${m.meal || ''}</strong><br><small>${m.description || ''}</small></td><td>${m.guidelines || ''}</td></tr>`),
    ].join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:12px;color:#20281F}.header{background:#163829;color:white;padding:20px 30px}.clinic-name{font-size:18px;font-weight:bold}.content{padding:20px 30px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#163829;color:white;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #E2DCCB}h2{color:#1F4D38;font-size:14px}</style></head><body><div class="header"><div class="clinic-name">${branding.clinicName}</div><div style="font-size:11px;color:#C9C2AC">${branding.clinicAddress}</div></div><div class="content"><p><strong>Patient:</strong> ${patient.name}${patient.age ? ', ' + patient.age + 'y' : ''} | <strong>Doctor:</strong> ${branding.doctorName} | <strong>Date:</strong> ${new Date(visitDate).toLocaleDateString('en-IN')}</p><h2>DINACHARYA — DAILY ROUTINE PLAN</h2><p><strong>Wake Time:</strong> ${d.wakeTime || 'N/A'} | <strong>Bedtime:</strong> ${d.bedtime || 'N/A'}</p><table><tr><th>Time</th><th>Activity</th><th>Duration/Guidelines</th></tr>${rows}</table>${d.doshaSpecificNotes ? '<p style="margin-top:16px;padding:10px;background:#EEF2EA;border-radius:6px"><strong>Notes:</strong> ' + d.doshaSpecificNotes + '</p>' : ''}</div></body></html>`;
}
function treatmentHtml(branding, patient, visitDate, t) {
    const phases = (t.phases || []).map((p) => `<div style="margin-bottom:12px;padding:10px;background:#EEF2EA;border-radius:6px"><strong>${p.phase}</strong> (${p.duration})<br>${p.description}<br><em>Therapies: ${(p.therapies || []).join(', ')}</em></div>`).join('');
    const followup = (t.followUpSchedule || []).map((f) => `<tr><td>Week ${f.week}</td><td>${f.purpose}</td></tr>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:12px;color:#20281F}.header{background:#163829;color:white;padding:20px 30px}.clinic-name{font-size:18px;font-weight:bold}.content{padding:20px 30px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#163829;color:white;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #E2DCCB}h2{color:#1F4D38;font-size:14px}</style></head><body><div class="header"><div class="clinic-name">${branding.clinicName}</div><div style="font-size:11px;color:#C9C2AC">${branding.clinicAddress}</div></div><div class="content"><p><strong>Patient:</strong> ${patient.name}${patient.age ? ', ' + patient.age + 'y' : ''} | <strong>Doctor:</strong> ${branding.doctorName} | <strong>Date:</strong> ${new Date(visitDate).toLocaleDateString('en-IN')}</p><h2>TREATMENT PLAN</h2><p>${t.primaryApproach || ''}</p><p><strong>Duration:</strong> ${t.duration || ''}</p>${phases}<h2>FOLLOW-UP SCHEDULE</h2><table><tr><th>Timeline</th><th>Purpose</th></tr>${followup}</table>${t.lifestyle ? '<p style="margin-top:12px"><strong>Lifestyle:</strong> ' + t.lifestyle + '</p>' : ''}${t.prognosis ? '<p><strong>Prognosis:</strong> ' + t.prognosis + '</p>' : ''}</div></body></html>`;
}
async function pdfRoutes(fastify) {
    // GET /api/visits/:id/pdf/:type — generate and return PDF HTML
    // In production this would use puppeteer/wkhtmltopdf to generate actual PDF
    // For Phase 2, we return the HTML for client-side print
    fastify.get('/visits/:id/pdf/:type', { preHandler: (0, requireAuth_1.requireRole)('SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF') }, async (request, reply) => {
        const { id: visitId, type } = request.params;
        // CASE_SHEET: no sign-off required, built from visit fields directly
        if (type === 'CASE_SHEET') {
            const visit = await prisma_1.default.visit.findFirst({
                where: { id: visitId, clinicId: request.user.clinicId },
                include: { patient: true, doctor: true },
            });
            if (!visit)
                return reply.status(404).send({ success: false, error: 'Visit not found.' });
            const branding = await (0, branding_1.getBrandingContext)(request.user.clinicId, visit.doctorId);
            if (!branding)
                return reply.status(400).send({ success: false, error: 'Branding context not available.' });
            const patient = visit.patient;
            const age = patient.dateOfBirth
                ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / 3.156e10)
                : null;
            await (0, audit_1.audit)({ clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role,
                action: 'PDF_GENERATED', entityType: 'Visit', entityId: visitId, meta: { planType: 'CASE_SHEET' } });
            reply.header('Content-Type', 'text/html');
            return reply.send(caseSheetHtml(branding, { ...patient, age }, visit));
        }
        // Verify this specific section is signed off
        const signOffCount = await prisma_1.default.signOff.count({ where: { visitId, section: type } });
        if (signOffCount < 1) {
            return reply.status(403).send({
                success: false,
                error: `Cannot generate PDF. ${type} has not been signed off by the doctor.`,
            });
        }
        const visit = await prisma_1.default.visit.findFirst({
            where: { id: visitId, clinicId: request.user.clinicId },
            include: {
                patient: true,
                doctor: true,
                aiPlans: true,
            },
        });
        if (!visit)
            return reply.status(404).send({ success: false, error: 'Visit not found.' });
        const branding = await (0, branding_1.getBrandingContext)(request.user.clinicId, visit.doctorId);
        if (!branding)
            return reply.status(400).send({ success: false, error: 'Branding context not available.' });
        const plan = visit.aiPlans.find(p => p.planType === type);
        if (!plan)
            return reply.status(404).send({ success: false, error: `${type} plan not found.` });
        const content = (plan.finalContent || plan.aiContent);
        const patient = visit.patient;
        const age = patient.dateOfBirth
            ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / 3.156e10)
            : null;
        let html = '';
        switch (type) {
            case 'PRESCRIPTION':
                html = prescriptionHtml(branding, { ...patient, age }, visit, content || []);
                break;
            case 'DIET_PLAN':
                html = dietPlanHtml(branding, { ...patient, age }, visit.visitDate.toISOString(), content || {});
                break;
            case 'DINACHARYA':
                html = dinacharyaHtml(branding, { ...patient, age }, visit.visitDate.toISOString(), content || {});
                break;
            case 'TREATMENT_PLAN':
                html = treatmentHtml(branding, { ...patient, age }, visit.visitDate.toISOString(), content || {});
                break;
            default:
                html = `<html><body><h1>${type}</h1><pre>${JSON.stringify(content, null, 2)}</pre></body></html>`;
        }
        await (0, audit_1.audit)({
            clinicId: request.user.clinicId, userId: request.user.sub, userRole: request.user.role,
            action: 'PDF_GENERATED', entityType: 'Visit', entityId: visitId,
            meta: { planType: type },
        });
        reply.header('Content-Type', 'text/html');
        return reply.send(html);
    });
}
//# sourceMappingURL=pdf.js.map