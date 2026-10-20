/**
 * Versioned, non-secret Cafe Package template (v3, Stage 4B-1).
 *
 * v3 = what `core.provision_tenant` (migration 0133) installs for a new Cafe
 * tenant. It must match the DB package `cafe` (migration 0129 + 0131 + 0132):
 * `core.packages.version = 3` and the modules in `core.package_modules`. The
 * provisioning SQL rejects a payload whose `template_version` is not the
 * package's current version, so code/DB drift fails closed.
 *
 * No customer identity, no secrets, no demo data: a clean client tenant.
 */
import type { ModuleCode } from './tenant-input-rules.js';
import { CAFE_HACCP_PRESETS_MANIFEST_VERSION } from './cafe-haccp-presets.js';

export const CAFE_PACKAGE_TEMPLATE_VERSION = 3 as const;
export const CAFE_PACKAGE_CODE = 'cafe' as const;

/** Modules of DB package `cafe` (core.package_modules), in navigation order (0132). */
export const CAFE_PACKAGE_MODULES = [
  'core',
  'recipes',
  'inventory',
  'workforce',
  'purchases',
  'operations',
  'issues',
] as const satisfies readonly ModuleCode[];

export interface CafeScheduleDefaults {
  /** Required staff per weekday, Monday first (workforce.schedule_settings). */
  requiredHeadcountByWeekday: readonly number[];
  maxMonthlyHours: number;
  maxWeeklyHours: number;
  maxDaysPerWeek: number;
  autoCreateDayOfMonth: number;
  /** Always false at provisioning: the Owner turns auto-create on. */
  autoCreateEnabled: false;
}

export interface CafeShiftTypeTemplate {
  code: string;
  labelJa: string;
  labelEn: string;
  startsAtLocal: string;
  endsAtLocal: string;
  breakMinutes: number;
  sortOrder: number;
}

export interface CafePackageTemplate {
  version: typeof CAFE_PACKAGE_TEMPLATE_VERSION;
  packageCode: typeof CAFE_PACKAGE_CODE;
  requiredModules: readonly ModuleCode[];
  defaultTimeZone: 'Asia/Tokyo';
  /** Every new tenant starts in trial (Founder 2026-10-19: 30 days, no card). */
  plan: { code: 'trial'; trialDays: number };
  scheduleDefaults: CafeScheduleDefaults;
  shiftTypes: readonly CafeShiftTypeTemplate[];
  /** HACCP checklists come from CAFE_HACCP_PRESETS_MANIFEST at this manifest version (closes DEBT-100). */
  haccpManifestVersion: typeof CAFE_HACCP_PRESETS_MANIFEST_VERSION;
  requiredRoles: readonly ['manager', 'employee'];
  minimumReadyData: {
    activeShiftTypes: number;
    publishedRecipes: number;
    activeInventoryItems: number;
  };
  operatorChecklist: readonly string[];
}

export const CAFE_PACKAGE_TEMPLATE: CafePackageTemplate = {
  version: CAFE_PACKAGE_TEMPLATE_VERSION,
  packageCode: CAFE_PACKAGE_CODE,
  requiredModules: CAFE_PACKAGE_MODULES,
  defaultTimeZone: 'Asia/Tokyo',
  plan: { code: 'trial', trialDays: 30 },
  scheduleDefaults: {
    requiredHeadcountByWeekday: [1, 2, 2, 2, 2, 2, 1],
    maxMonthlyHours: 160,
    maxWeeklyHours: 40,
    maxDaysPerWeek: 5,
    autoCreateDayOfMonth: 15,
    autoCreateEnabled: false,
  },
  shiftTypes: [
    { code: 'EARLY', labelJa: '早番', labelEn: 'Early', startsAtLocal: '07:00', endsAtLocal: '12:00', breakMinutes: 0, sortOrder: 1 },
    { code: 'MIDDLE', labelJa: '中番', labelEn: 'Middle', startsAtLocal: '10:00', endsAtLocal: '14:00', breakMinutes: 0, sortOrder: 2 },
    { code: 'LATE', labelJa: '遅番', labelEn: 'Late', startsAtLocal: '12:00', endsAtLocal: '17:00', breakMinutes: 0, sortOrder: 3 },
  ],
  haccpManifestVersion: CAFE_HACCP_PRESETS_MANIFEST_VERSION,
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

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function validateCafePackageTemplate(template: CafePackageTemplate): CafeTemplateValidation {
  const errors: string[] = [];
  const modules = new Set(template.requiredModules);
  if (template.version !== CAFE_PACKAGE_TEMPLATE_VERSION) {
    errors.push(`Unsupported Cafe Package template version: ${template.version}.`);
  }
  if (template.packageCode !== CAFE_PACKAGE_CODE) errors.push('Cafe Package packageCode must be "cafe".');
  for (const required of CAFE_PACKAGE_MODULES) {
    if (!modules.has(required)) errors.push(`Required module "${required}" is missing.`);
  }
  if (modules.size !== template.requiredModules.length) errors.push('Required modules must not contain duplicates.');
  if (template.defaultTimeZone !== 'Asia/Tokyo') errors.push('Cafe Package default timezone must be Asia/Tokyo.');
  if (template.plan.code !== 'trial' || !Number.isInteger(template.plan.trialDays) || template.plan.trialDays < 1 || template.plan.trialDays > 90) {
    errors.push('Cafe Package plan must be trial with 1-90 trial days.');
  }

  const s = template.scheduleDefaults;
  if (s.requiredHeadcountByWeekday.length !== 7 || s.requiredHeadcountByWeekday.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) {
    errors.push('scheduleDefaults.requiredHeadcountByWeekday must be 7 integers 0-99.');
  }
  if (!Number.isInteger(s.maxMonthlyHours) || s.maxMonthlyHours < 0 || s.maxMonthlyHours > 744) errors.push('scheduleDefaults.maxMonthlyHours must be 0-744.');
  if (!Number.isInteger(s.maxWeeklyHours) || s.maxWeeklyHours < 1 || s.maxWeeklyHours > 168) errors.push('scheduleDefaults.maxWeeklyHours must be 1-168.');
  if (!Number.isInteger(s.maxDaysPerWeek) || s.maxDaysPerWeek < 1 || s.maxDaysPerWeek > 7) errors.push('scheduleDefaults.maxDaysPerWeek must be 1-7.');
  if (!Number.isInteger(s.autoCreateDayOfMonth) || s.autoCreateDayOfMonth < 1 || s.autoCreateDayOfMonth > 28) errors.push('scheduleDefaults.autoCreateDayOfMonth must be 1-28.');
  if (s.autoCreateEnabled !== false) errors.push('scheduleDefaults.autoCreateEnabled must be false at provisioning.');

  if (template.shiftTypes.length === 0) errors.push('Cafe Package needs at least one shift type.');
  if (new Set(template.shiftTypes.map((t) => t.code)).size !== template.shiftTypes.length) errors.push('Shift type codes must be unique.');
  for (const t of template.shiftTypes) {
    if (!TIME_PATTERN.test(t.startsAtLocal) || !TIME_PATTERN.test(t.endsAtLocal) || t.endsAtLocal <= t.startsAtLocal) {
      errors.push(`Shift type "${t.code}" must have HH:MM times with the end after the start.`);
    }
  }

  if (template.haccpManifestVersion !== CAFE_HACCP_PRESETS_MANIFEST_VERSION) {
    errors.push(`Unsupported HACCP manifest version: ${template.haccpManifestVersion}.`);
  }
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
