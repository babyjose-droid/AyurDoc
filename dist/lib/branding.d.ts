import type { BrandingContext } from '../types';
export declare function generateClinicId(): Promise<string>;
export declare function generatePatientCode(clinicId: string): Promise<string>;
export declare function getBrandingContext(clinicId: string, doctorId: string): Promise<BrandingContext | null>;
//# sourceMappingURL=branding.d.ts.map