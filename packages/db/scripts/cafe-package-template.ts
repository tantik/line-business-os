/** Versioned, non-secret Cafe Package onboarding contract. */
import type { ModuleCode } from './onboard-tenant.js';

export const CAFE_PACKAGE_TEMPLATE_VERSION = 2 as const;

export interface CafePackageTemplate {
  version: typeof CAFE_PACKAGE_TEMPLATE_VERSION;
  productCode: 'cafe-v2';
  requiredModules: readonly ModuleCode[];
  defaultTimeZone: 'Asia/Tokyo';
  requiredRoles: readonly ['manager', 'employee'];
  minimumReadyData: {
    activeShiftTypes: number;
    publishedRecipes: number;
    activeInventoryItems: number;
  };
  operatorChecklist: readonly string[];
}

export const CAFE_PACKAGE_V2_TEMPLATE: CafePackageTemplate = {
  version: CAFE_PACKAGE_TEMPLATE_VERSION,
  productCode: 'cafe-v2',
  requiredModules: ['core', 'workforce', 'inventory'],
  defaultTimeZone: 'Asia/Tokyo',
  requiredRoles: ['manager', 'employee'],
  minimumReadyData: { activeShiftTypes: 1, publishedRecipes: 1, activeInventoryItems: 1 },
  operatorChecklist: [
    'owner-auth-user-confirmed',
    'tenant-and-location-created',
    'required-modules-enabled',
    'manager-and-staff-role-smoke',
    'shift-types-configured',
    'recipes-imported-and-published',
    'inventory-catalog-configured',
    'ja-en-and-recipe-translation-smoke',
    'opening-closing-session-smoke',
    'redacted-verification-report-saved',
  ],
} as const;

export type CafeTemplateValidation =
  | { ok: true; template: CafePackageTemplate }
  | { ok: false; errors: string[] };

export function validateCafePackageTemplate(template: CafePackageTemplate): CafeTemplateValidation {
  const errors: string[] = [];
  const modules = new Set(template.requiredModules);
  if (template.version !== CAFE_PACKAGE_TEMPLATE_VERSION) {
    errors.push(`Unsupported Cafe Package template version: ${template.version}.`);
  }
  if (template.productCode !== 'cafe-v2') errors.push('Cafe Package productCode must be "cafe-v2".');
  for (const required of ['core', 'workforce', 'inventory'] as const) {
    if (!modules.has(required)) errors.push(`Required module "${required}" is missing.`);
  }
  if (modules.size !== template.requiredModules.length) errors.push('Required modules must not contain duplicates.');
  if (template.defaultTimeZone !== 'Asia/Tokyo') errors.push('Cafe Package default timezone must be Asia/Tokyo.');
  if (!template.requiredRoles.includes('manager') || !template.requiredRoles.includes('employee')) {
    errors.push('Cafe Package requires manager and employee roles.');
  }
  for (const [key, value] of Object.entries(template.minimumReadyData)) {
    if (!Number.isInteger(value) || value < 1) errors.push(`minimumReadyData.${key} must be a positive integer.`);
  }
  if (new Set(template.operatorChecklist).size !== template.operatorChecklist.length) {
    errors.push('Operator checklist entries must be unique.');
  }
  if (template.operatorChecklist.length === 0) errors.push('Operator checklist must not be empty.');
  return errors.length === 0 ? { ok: true, template } : { ok: false, errors };
}
