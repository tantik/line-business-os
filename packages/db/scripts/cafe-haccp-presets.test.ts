import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_HACCP_PRESETS_MANIFEST,
  buildCafeHaccpPresetsPlan,
  type CafeHaccpPresetsContext,
  type CafeHaccpPresetsExistingTemplate,
} from './cafe-haccp-presets.js';

const TENANT_ID = 'tenant-1';
const LOCATION_ID = 'loc-1';

function baseContext(overrides: Partial<CafeHaccpPresetsContext> = {}): CafeHaccpPresetsContext {
  return {
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    existingTemplates: [],
    ...overrides,
  };
}

test('an empty existing-state context plans all 4 templates, all 12 items, all 4 schedules', () => {
  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, baseContext());
  assert.equal(plan.templatesToCreate.length, 4);
  assert.equal(plan.itemsToCreate.length, 12);
  assert.equal(plan.schedulesToCreate.length, 4);
  assert.equal(plan.skipped.length, 0);
});

test('a context reflecting everything the first run created is fully idempotent: zero creates in every category (rerun-safety proof)', () => {
  const existingTemplates: CafeHaccpPresetsExistingTemplate[] = CAFE_HACCP_PRESETS_MANIFEST.templates.map((template, index) => ({
    templateId: `tpl-${index}`,
    name: template.name,
    locationId: LOCATION_ID,
    itemLabels: template.items.map((item) => item.label),
    hasScheduleAtLocation: true,
  }));

  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, baseContext({ existingTemplates }));

  // This is the idempotency guarantee: re-running against a context that
  // already reflects everything the first run created must produce a plan
  // that creates NOTHING, in any of the three categories.
  assert.equal(plan.templatesToCreate.length, 0);
  assert.equal(plan.itemsToCreate.length, 0);
  assert.equal(plan.schedulesToCreate.length, 0);
  assert.ok(plan.skipped.length > 0);
});

test('a partial context (template 1 exists with its items but no schedule yet) creates only that schedule for template 1, while creating templates 2-4 in full', () => {
  const template1 = CAFE_HACCP_PRESETS_MANIFEST.templates[0]!;
  const existingTemplates: CafeHaccpPresetsExistingTemplate[] = [
    {
      templateId: 'tpl-1',
      name: template1.name,
      locationId: LOCATION_ID,
      itemLabels: template1.items.map((item) => item.label),
      hasScheduleAtLocation: false,
    },
  ];

  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, baseContext({ existingTemplates }));

  // Template 1 itself is not re-created.
  assert.ok(!plan.templatesToCreate.some((t) => t.name === template1.name));
  // Templates 2-4 are created in full.
  assert.equal(plan.templatesToCreate.length, 3);

  // No items planned for template 1 (all already installed).
  assert.ok(!plan.itemsToCreate.some((i) => i.templateName === template1.name));
  // Templates 2-4's items (3 each) are all planned.
  assert.equal(plan.itemsToCreate.length, 9);

  // Template 1's schedule is planned (the one missing piece), plus templates 2-4's schedules.
  assert.equal(plan.schedulesToCreate.length, 4);
  assert.ok(plan.schedulesToCreate.some((s) => s.templateName === template1.name));
});

test('every planned numeric item carries numericUnit °C and its manifest range; every boolean item carries null for all three', () => {
  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, baseContext());
  const manifestItems = CAFE_HACCP_PRESETS_MANIFEST.templates.flatMap((t) => t.items);
  for (const item of plan.itemsToCreate) {
    if (item.responseType === 'numeric') {
      const source = manifestItems.find((i) => i.label === item.label);
      assert.ok(source);
      assert.equal(item.numericMin, source.numericMin);
      assert.equal(item.numericMax, source.numericMax);
      assert.equal(item.numericUnit, '°C', `numeric item "${item.label}" must carry numericUnit`);
    } else if (item.responseType === 'boolean') {
      assert.equal(item.numericMin, null);
      assert.equal(item.numericMax, null);
      assert.equal(item.numericUnit, null);
    }
  }
});

test('sourced default ranges (Founder 2026-10-17, MHLW 大量調理施設衛生管理マニュアル): fridge 0-5 °C, freezer <= -15 °C, hot-holding >= 65 °C', () => {
  const numericItems = CAFE_HACCP_PRESETS_MANIFEST.templates.flatMap((t) => t.items).filter((i) => i.responseType === 'numeric');
  assert.equal(numericItems.length, 5, 'expected exactly 5 numeric HACCP items (fridge x3: opening/closing/midday, freezer, hot-holding) -- update this count deliberately if the manifest content changes');
  const fridge = numericItems.filter((i) => i.label.includes('冷蔵庫内温度確認'));
  assert.equal(fridge.length, 3);
  for (const item of fridge) {
    assert.equal(item.numericMin, 0, `"${item.label}"`);
    assert.equal(item.numericMax, 5, `"${item.label}"`);
  }
  const freezer = numericItems.find((i) => i.label.includes('冷凍庫内温度確認'));
  assert.ok(freezer);
  assert.equal(freezer.numericMin, null, 'freezer is one-sided: no lower bound');
  assert.equal(freezer.numericMax, -15);
  for (const item of numericItems) {
    assert.equal(item.numericUnit, '°C', `"${item.label}" must declare its unit`);
    if (item.numericMin !== null && item.numericMax !== null) assert.ok(item.numericMin <= item.numericMax, 'numeric_range_chk (0100)');
  }
});

test('the hot-holding temperature item is isCritical:true, isRequired:false, min 65 °C with no upper bound (spot check)', () => {
  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, baseContext());
  const hotHolding = plan.itemsToCreate.find((i) => i.label.includes('温蔵・保温機器'));
  assert.ok(hotHolding);
  assert.equal(hotHolding.isCritical, true);
  assert.equal(hotHolding.isRequired, false);
  assert.equal(hotHolding.numericMin, 65);
  assert.equal(hotHolding.numericMax, null);
  assert.equal(hotHolding.numericUnit, '°C');
});

test('an already-installed item is never re-planned, so an existing tenant keeps its own range', () => {
  const template = CAFE_HACCP_PRESETS_MANIFEST.templates.find((t) => t.items.some((i) => i.label.includes('冷凍庫内温度確認')));
  assert.ok(template);
  const plan = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, {
    ...baseContext(),
    existingTemplates: [
      { templateId: 'existing-temp', name: template.name, locationId: baseContext().locationId, itemLabels: template.items.map((i) => i.label), hasScheduleAtLocation: true },
    ],
  });
  assert.equal(plan.itemsToCreate.filter((i) => i.templateName === template.name).length, 0);
});

test('buildCafeHaccpPresetsPlan is deterministic: the same manifest+context produces byte-identical output across two calls', () => {
  const context = baseContext();
  const planA = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, context);
  const planB = buildCafeHaccpPresetsPlan(CAFE_HACCP_PRESETS_MANIFEST, context);
  assert.deepEqual(planA, planB);
});

test('exactly 4 templates, each with exactly 3 items, are defined in the manifest', () => {
  assert.equal(CAFE_HACCP_PRESETS_MANIFEST.templates.length, 4);
  for (const template of CAFE_HACCP_PRESETS_MANIFEST.templates) {
    assert.equal(template.items.length, 3);
    assert.equal(template.recurrenceKind, 'daily');
  }
});

test('every template name and category is bilingual (JA + EN in one string) -- category is rendered as user-visible text in the Manager UI, so it must carry the same parity as name/label', () => {
  const JA_RE = /[぀-ヿ一-鿿]/;
  const EN_RE = /[A-Za-z]/;
  for (const template of CAFE_HACCP_PRESETS_MANIFEST.templates) {
    assert.ok(JA_RE.test(template.name) && EN_RE.test(template.name), `template name "${template.name}" must be bilingual`);
    assert.ok(JA_RE.test(template.category) && EN_RE.test(template.category), `template category "${template.category}" must be bilingual`);
    for (const item of template.items) {
      assert.ok(JA_RE.test(item.label) && EN_RE.test(item.label), `item label "${item.label}" must be bilingual`);
    }
  }
});
