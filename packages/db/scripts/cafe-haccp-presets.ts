/**
 * Cafe HACCP checklist presets: canonical manifest + pure plan builder
 * (Cafe v2.2 WP1 Operations, D3/D5 -- HACCP preset DATA layered on top of
 * the fully generic Operations module).
 *
 * SCOPE / GOVERNANCE NOTES (read before touching any content below):
 *
 * 1. NUMERIC RANGES ARE NOT LEGALLY VERIFIED. The four temperature ranges
 *    used below (0-10C fridge, -30 to -15C freezer, 60-90C hot-holding) are
 *    OPERATIONAL DEFAULTS based on common food-safety practice. They are NOT
 *    sourced from any approved document in this repository and have NOT been
 *    independently verified against Japanese HACCP / food sanitation law.
 *    They are flagged here per this mission's explicit instruction not to
 *    silently invent a legally meaningful number. A food-safety professional
 *    or the Founder must confirm/adjust these before they are treated as
 *    anything more than an operational starting point.
 *
 * 2. NOT A CERTIFICATION. Per the approved scope doc
 *    (`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md`
 *    Sections 2 and 7's HACCP boundary clause): this preset content is
 *    operational workflow/recordkeeping SUPPORT only. Installing it does NOT
 *    constitute or imply HACCP certification or legal compliance.
 *
 * 3. CORRECTIVE ACTION / RECHECK MAPPING (scope Section 7). No new workflow
 *    engine may be built for this mission, so these two HACCP concepts map
 *    onto EXISTING generic Operations capabilities as follows:
 *      - CONTENT REPRESENTABLE: a corrective action is recorded via the
 *        existing `api.operations_report_problem` (Staff notes a problem,
 *        with severity) -> `api.operations_resolve_exception` (Manager
 *        resolves with a free-text resolution note) lifecycle already built
 *        in WP1. The resolution note IS the corrective-action record. No new
 *        template/schema is needed for this.
 *      - PRODUCT GAP (not fixed here): there is no capability in the current
 *        Operations model to spawn an ad-hoc, unscheduled "recheck" task
 *        instance later the same business day once a violation is found --
 *        the next verification only happens at that template's next
 *        regularly scheduled occurrence (e.g. tomorrow, or the next
 *        scheduled check in the same template category if one exists later
 *        the same day). This is flagged plainly as a real product gap for a
 *        future Operations capability decision; this mission does not invent
 *        a workaround for it.
 *
 * 4. SEVERITY IS NEVER SET HERE. Severity for a numeric out-of-range
 *    response is NOT set by this preset content or by the write executor --
 *    the server (`api.operations_record_response`, migration 0101) derives
 *    it automatically from the item's own `is_critical` flag
 *    (`is_critical` -> `'action_required'`, else `'warning'`), which is the
 *    already-approved D4 rule. This file only ever sets `isCritical`
 *    correctly on each item; it never passes or invents a severity value for
 *    template/item/schedule content.
 *
 * PURE: no Supabase client, no I/O, no `Date.now()`/`Math.random()`. Mirrors
 * `oruwa-cafe-fixture.ts`'s shape -- the executor (`cafe-haccp-presets-write.ts`)
 * resolves live tenant state, hands it to `buildCafeHaccpPresetsPlan`, and this
 * file only decides WHAT still needs to be created.
 *
 * BILINGUAL LABELS: this repo's Operations schema has only ONE free-text
 * `label`/`name` column -- no per-locale columns exist, and adding one would
 * be new schema (out of scope). JA/EN parity for this content is therefore
 * expressed as one bilingual string per label/name, Japanese first followed
 * by the English in parentheses, matching how `oruwa-cafe-fixture.ts` already
 * writes bilingual item names for exactly the same reason.
 */

export const CAFE_HACCP_PRESETS_MANIFEST_VERSION = 1 as const;

export type OperationsResponseType = 'boolean' | 'numeric' | 'text';

export interface CafeHaccpPresetItem {
  label: string;
  responseType: OperationsResponseType;
  isCritical: boolean;
  isRequired: boolean;
  numericMin: number | null;
  numericMax: number | null;
  numericUnit: string | null;
}

export interface CafeHaccpPresetTemplate {
  name: string;
  category: string;
  dueTime: string;
  windowEndTime: string;
  recurrenceKind: 'daily';
  items: CafeHaccpPresetItem[];
}

export interface CafeHaccpPresetsManifest {
  manifestVersion: typeof CAFE_HACCP_PRESETS_MANIFEST_VERSION;
  templates: CafeHaccpPresetTemplate[];
}

export const CAFE_HACCP_PRESETS_MANIFEST: CafeHaccpPresetsManifest = {
  manifestVersion: CAFE_HACCP_PRESETS_MANIFEST_VERSION,
  templates: [
    {
      name: 'オープニング衛生チェック（Opening Hygiene Check）',
      category: 'オープニング（Opening）',
      dueTime: '07:30',
      windowEndTime: '08:30',
      recurrenceKind: 'daily',
      items: [
        {
          label: '手洗い・消毒設備の準備確認（石鹸・ペーパータオル・消毒液）（Hand-washing & sanitizing stations ready: soap, paper towels, sanitizer）',
          responseType: 'boolean',
          isCritical: false,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
        {
          label: '調理台・調理器具の清潔確認（Prep surfaces & utensils clean before use）',
          responseType: 'boolean',
          isCritical: true,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
        {
          label: '冷蔵庫内温度確認（開店時）（Fridge temperature check, opening）',
          responseType: 'numeric',
          isCritical: true,
          isRequired: true,
          numericMin: 0,
          numericMax: 10,
          numericUnit: '°C',
        },
      ],
    },
    {
      name: 'クロージング衛生チェック（Closing Hygiene Check）',
      category: 'クロージング（Closing）',
      dueTime: '21:00',
      windowEndTime: '22:00',
      recurrenceKind: 'daily',
      items: [
        {
          label: '調理台・シンクの清掃・消毒（Prep surfaces & sink cleaned and sanitized）',
          responseType: 'boolean',
          isCritical: true,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
        {
          label: '生ゴミ・ゴミ箱の廃棄と洗浄（Food waste disposed, bins emptied and cleaned）',
          responseType: 'boolean',
          isCritical: false,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
        {
          label: '冷蔵庫内温度確認（閉店時）（Fridge temperature check, closing）',
          responseType: 'numeric',
          isCritical: true,
          isRequired: true,
          numericMin: 0,
          numericMax: 10,
          numericUnit: '°C',
        },
      ],
    },
    {
      name: '日次清掃チェック（Daily Cleaning Check）',
      category: '清掃（Cleaning）',
      dueTime: '15:00',
      windowEndTime: '16:00',
      recurrenceKind: 'daily',
      items: [
        {
          label: 'フロア・客席エリアの清掃（Floor & customer seating area cleaned）',
          responseType: 'boolean',
          isCritical: false,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
        {
          label: 'トイレの清掃・消毒（Restroom cleaned and sanitized）',
          responseType: 'boolean',
          isCritical: true,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
        {
          label: '製氷機・ドリンクディスペンサーの清掃確認（Ice machine & drink dispenser cleaned）',
          responseType: 'boolean',
          isCritical: true,
          isRequired: true,
          numericMin: null,
          numericMax: null,
          numericUnit: null,
        },
      ],
    },
    {
      name: '温度管理チェック（Temperature Monitoring Check）',
      category: '温度管理（Temperature）',
      dueTime: '13:00',
      windowEndTime: '14:00',
      recurrenceKind: 'daily',
      items: [
        {
          label: '冷蔵庫内温度確認（営業中）（Fridge temperature check, midday）',
          responseType: 'numeric',
          isCritical: true,
          isRequired: true,
          numericMin: 0,
          numericMax: 10,
          numericUnit: '°C',
        },
        {
          label: '冷凍庫内温度確認（営業中）（Freezer temperature check, midday）',
          responseType: 'numeric',
          isCritical: true,
          isRequired: true,
          numericMin: -30,
          numericMax: -15,
          numericUnit: '°C',
        },
        {
          label: '温蔵・保温機器の温度確認（該当する場合）（Hot-holding equipment temperature check, if applicable）',
          responseType: 'numeric',
          isCritical: true,
          isRequired: false,
          numericMin: 60,
          numericMax: 90,
          numericUnit: '°C',
        },
      ],
    },
  ],
};

/** Live tenant state the executor resolves (via `api.operations_templates` / `api.operations_template_items` / `api.operations_schedules`, filtered to the target tenant) and hands to the pure plan builder -- this is the only I/O boundary. */
export interface CafeHaccpPresetsExistingTemplate {
  templateId: string;
  name: string;
  locationId: string | null;
  /** Existing item labels for this template. */
  itemLabels: readonly string[];
  /** Whether a schedule already exists for this template at the target location (any recurrence). */
  hasScheduleAtLocation: boolean;
}

export interface CafeHaccpPresetsContext {
  tenantId: string;
  locationId: string;
  existingTemplates: readonly CafeHaccpPresetsExistingTemplate[];
}

export interface PlannedTemplateCreate {
  kind: 'template';
  name: string;
  category: string;
  locationId: string;
}

export interface PlannedItemCreate {
  kind: 'item';
  /** Set once the executor knows the real template id (either freshly created or pre-existing). Carried here as the canonical template NAME so the executor can resolve it without the pure builder needing to invent an id. */
  templateName: string;
  label: string;
  responseType: OperationsResponseType;
  isCritical: boolean;
  isRequired: boolean;
  numericMin: number | null;
  numericMax: number | null;
  numericUnit: string | null;
  sortOrder: number;
}

export interface PlannedScheduleCreate {
  kind: 'schedule';
  templateName: string;
  locationId: string;
  recurrenceKind: 'daily';
  dueTime: string;
  windowEndTime: string;
}

export interface CafeHaccpPresetsPlan {
  templatesToCreate: PlannedTemplateCreate[];
  itemsToCreate: PlannedItemCreate[];
  schedulesToCreate: PlannedScheduleCreate[];
  /** Human-readable reasons for anything the manifest asked for but this plan omitted (already installed, existing schedule diverges, etc.). */
  skipped: string[];
}

/**
 * Pure: given the manifest and the executor-resolved live context, decide
 * exactly what to create. No I/O, no randomness. Idempotency contract:
 *   - A template is "already installed" if an existing row's `name` exactly
 *     matches a canonical name for this tenant/location -- skip creating it,
 *     but still check its items/schedule using the EXISTING template.
 *   - An item is "already installed" (existing or newly-planned template) if
 *     an existing item's `label` exactly matches a canonical item label for
 *     that template -- skip it.
 *   - A schedule is "already installed" for a template+location if an
 *     existing schedule row already has that templateId+locationId
 *     (regardless of recurrence) -- skip and record the reason in
 *     `plan.skipped`, never attempt to revise a divergent existing schedule.
 */
export function buildCafeHaccpPresetsPlan(
  manifest: CafeHaccpPresetsManifest,
  context: CafeHaccpPresetsContext,
): CafeHaccpPresetsPlan {
  const plan: CafeHaccpPresetsPlan = {
    templatesToCreate: [],
    itemsToCreate: [],
    schedulesToCreate: [],
    skipped: [],
  };

  for (const template of manifest.templates) {
    const existing = context.existingTemplates.find(
      (t) => t.name === template.name && t.locationId === context.locationId,
    );

    if (existing) {
      plan.skipped.push(`template "${template.name}": already installed (template_id ${existing.templateId}).`);
    } else {
      plan.templatesToCreate.push({
        kind: 'template',
        name: template.name,
        category: template.category,
        locationId: context.locationId,
      });
    }

    const existingItemLabels = existing ? existing.itemLabels : [];
    template.items.forEach((item, index) => {
      if (existingItemLabels.includes(item.label)) {
        plan.skipped.push(`item "${item.label}" (template "${template.name}"): already installed.`);
        return;
      }
      plan.itemsToCreate.push({
        kind: 'item',
        templateName: template.name,
        label: item.label,
        responseType: item.responseType,
        isCritical: item.isCritical,
        isRequired: item.isRequired,
        numericMin: item.responseType === 'numeric' ? item.numericMin : null,
        numericMax: item.responseType === 'numeric' ? item.numericMax : null,
        numericUnit: item.responseType === 'numeric' ? item.numericUnit : null,
        sortOrder: index,
      });
    });

    const hasSchedule = existing?.hasScheduleAtLocation ?? false;
    if (hasSchedule) {
      plan.skipped.push(
        `schedule for template "${template.name}" at location ${context.locationId}: already exists -- not revising, surface for a human if it diverges from the canonical recurrence.`,
      );
    } else {
      plan.schedulesToCreate.push({
        kind: 'schedule',
        templateName: template.name,
        locationId: context.locationId,
        recurrenceKind: template.recurrenceKind,
        dueTime: template.dueTime,
        windowEndTime: template.windowEndTime,
      });
    }
  }

  return plan;
}
