"use strict";
// AyurCare — Shared Types
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_LIMITS = void 0;
// Subscription limits per tier
exports.TIER_LIMITS = {
    SOLO: { maxDoctors: 1, maxPatientsPerMonth: 500 },
    CLINIC: { maxDoctors: 5, maxPatientsPerMonth: 2000 },
    MULTI_CENTER: { maxDoctors: 999, maxPatientsPerMonth: 999999 },
};
//# sourceMappingURL=index.js.map