import pg from 'pg';
import { blindIndex, encryptPII } from '../src/crypto.js';

const MARKER = 'cafe-v2-showcase-v1';
const TENANT_SLUG = 'mame-to-cha';
const WEEK_STARTS = ['2026-07-27', '2026-08-03'] as const;
const STAFF_NAMES = ['田中 愛', '佐藤 健', '鈴木 舞', '高橋 大輝', '伊藤 さくら'];
const SHIFT_TYPES = [
  { code: 'AM', label: '1', start: '07:00', end: '15:00', breakMinutes: 60, order: 1 },
  { code: 'PM', label: '2', start: '10:00', end: '18:00', breakMinutes: 60, order: 2 },
  { code: 'SHOWCASE_3', label: '3', start: '13:00', end: '21:00', breakMinutes: 60, order: 13 },
  { code: 'ALL', label: '通', start: '07:00', end: '21:00', breakMinutes: 90, order: 14 },
] as const;
const CONTENT = [
  { kind: 'instruction', title: '開店・閉店チェックリスト', category: '業務マニュアル', description: '毎日の開店準備と閉店作業を同じ品質で行うための手順です。' },
  { kind: 'recipe', title: '抹茶ラテ', category: 'カクテル・ドリンク', description: '抹茶の香りを活かした定番ラテです。' },
  { kind: 'recipe', title: 'ほうじ茶ラテ', category: 'カクテル・ドリンク', description: '香ばしいほうじ茶とミルクのドリンクです。' },
  { kind: 'recipe', title: '柚子スパークリング', category: 'カクテル・ドリンク', description: '柚子の酸味を活かした爽やかな一杯です。' },
  { kind: 'recipe', title: '黒糖エスプレッソ', category: 'カクテル・ドリンク', description: '黒糖のコクを加えたエスプレッソドリンクです。' },
  { kind: 'recipe', title: '季節のベリーモクテル', category: 'カクテル・ドリンク', description: '季節のベリーを使ったノンアルコールドリンクです。' },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const databaseUrl = process.env.MAME_TO_CHA_CLOUD_DATABASE_URL ?? requireEnv('DATABASE_URL');
  const encryptionKey = requireEnv('PII_ENCRYPTION_KEY');
  const pepper = requireEnv('PII_HASH_PEPPER');
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('begin');
    await client.query(`select set_config('app.showcase_marker', $1, true)`, [MARKER]);

    const scope = await client.query<{
      tenant_id: string;
      location_id: string;
    }>(
      `select t.id tenant_id, l.id location_id
         from core.tenants t
         join core.locations l on l.tenant_id = t.id and l.is_active
        where t.slug = $1
        order by l.created_at
        limit 1
        for update of t, l`,
      [TENANT_SLUG],
    );
    if (scope.rowCount !== 1) throw new Error('Mame To Cha tenant/location scope was not resolved uniquely.');
    const { tenant_id: tenantId, location_id: locationId } = scope.rows[0]!;

    await client.query(`delete from workforce.shifts where tenant_id = $1 and notes = $2`, [tenantId, MARKER]);
    await client.query(`delete from workforce.recipes where tenant_id = $1 and description_en = $2`, [tenantId, MARKER]);
    await client.query(`delete from workforce.shift_types where tenant_id = $1 and code like 'SHOWCASE_%'`, [tenantId]);
    await client.query(`delete from workforce.employees where tenant_id = $1 and employment_type = $2`, [tenantId, MARKER]);

    const employeeIds: string[] = [];
    const existing = await client.query<{ id: string }>(
      `select id from workforce.employees
        where tenant_id = $1 and location_id = $2
        order by created_at
        limit 1`,
      [tenantId, locationId],
    );
    if (existing.rowCount !== 1) throw new Error('The existing acceptance employee was not found.');
    const acceptanceEmployeeId = existing.rows[0]!.id;
    await client.query(
      `update workforce.employees
          set is_active = true
        where tenant_id = $1 and location_id = $2 and id = $3`,
      [tenantId, locationId, acceptanceEmployeeId],
    );
    employeeIds.push(acceptanceEmployeeId);

    for (const name of STAFF_NAMES) {
      const inserted = await client.query<{ id: string }>(
        `insert into workforce.employees
          (tenant_id, location_id, name_encrypted, name_hash, position_label, employment_type, is_active)
         values ($1, $2, $3, $4, $5, $6, true)
         returning id`,
        [tenantId, locationId, encryptPII(name, encryptionKey), blindIndex(name, pepper), 'カフェスタッフ', MARKER],
      );
      employeeIds.push(inserted.rows[0]!.id);
    }

    const shiftTypeIds: string[] = [];
    for (const shiftType of SHIFT_TYPES) {
      const inserted = await client.query<{ id: string }>(
        `insert into workforce.shift_types
          (tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes, sort_order, is_active)
         values ($1, $2, $3, $4, $5::time, $6::time, $7, $8, true)
         on conflict (tenant_id, location_id, code) do update set
           label_ja = excluded.label_ja,
           starts_at_local = excluded.starts_at_local,
           ends_at_local = excluded.ends_at_local,
           break_minutes = excluded.break_minutes,
           sort_order = excluded.sort_order,
           is_active = true
         returning id`,
        [tenantId, locationId, shiftType.code, shiftType.label, shiftType.start, shiftType.end, shiftType.breakMinutes, shiftType.order],
      );
      shiftTypeIds.push(inserted.rows[0]!.id);
    }

    await client.query(
      `insert into workforce.schedule_settings
        (tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours)
       values ($1, $2, '[3,3,3,3,3,2,4]'::jsonb, 160)
       on conflict (tenant_id, location_id) do update set
         required_headcount_by_weekday = excluded.required_headcount_by_weekday,
         max_monthly_hours = excluded.max_monthly_hours`,
      [tenantId, locationId],
    );

    const pattern = [
      [3, 3, 3, 3, 3, 3, null],
      [null, 1, 2, 3, 0, 1, 2],
      [1, null, 3, 0, 1, 2, 3],
      [2, 3, null, 1, 2, 3, 0],
      [3, 0, 1, 2, null, 0, 1],
      [0, 1, 2, 3, 0, 1, null],
    ] as const;

    for (const weekStart of WEEK_STARTS) {
      for (let staffIndex = 0; staffIndex < employeeIds.length; staffIndex += 1) {
        const employeeId = employeeIds[staffIndex];
        if (!employeeId) throw new Error(`Missing showcase employee at index ${staffIndex}.`);
        for (let day = 0; day < 7; day += 1) {
          const typeIndex = pattern[staffIndex]![day];
          if (typeIndex === null || typeIndex === undefined) continue;
          const shiftType = SHIFT_TYPES[typeIndex]!;
          const workDate = addDays(weekStart, day);
          await client.query(
            `insert into workforce.shifts
              (tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, role, notes, published)
             values ($1, $2, $3, $4, ($5 || ' ' || $6 || ':00+09')::timestamptz,
                     ($5 || ' ' || $7 || ':00+09')::timestamptz, $8, 'staff', $9, true)`,
            [tenantId, locationId, employeeId, shiftTypeIds[typeIndex], workDate, shiftType.start, shiftType.end, shiftType.breakMinutes, MARKER],
          );
        }
      }
    }

    const categoryIds = new Map<string, string>();
    for (const label of [...new Set(CONTENT.map((item) => item.category))]) {
      let category = await client.query<{ id: string }>(
        `select id from workforce.recipe_categories
          where tenant_id = $1 and label_ja = $2 and is_active
          order by created_at
          limit 1`,
        [tenantId, label],
      );
      if (category.rowCount === 0) {
        category = await client.query<{ id: string }>(
          `insert into workforce.recipe_categories (tenant_id, label_ja, sort_order, is_active)
           values ($1, $2, $3, true)
           returning id`,
          [tenantId, label, categoryIds.size + 20],
        );
      }
      categoryIds.set(label, category.rows[0]!.id);
    }

    for (const [index, item] of CONTENT.entries()) {
      const recipe = await client.query<{ id: string }>(
        `insert into workforce.recipes
          (tenant_id, location_id, recipe_category_id, title_ja, description_ja, description_en, content_kind, is_popular, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'published')
         returning id`,
        [tenantId, locationId, categoryIds.get(item.category), item.title, item.description, MARKER, item.kind, index === 1],
      );
      const recipeId = recipe.rows[0]!.id;
      await client.query(
        `insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja, sort_order)
         values ($1, $2, $3, 1), ($1, $2, $4, 2)`,
        [tenantId, recipeId, item.kind === 'instruction' ? 'チェックリスト' : 'ベース材料', item.kind === 'instruction' ? '担当者確認' : '仕上げ材料'],
      );
      await client.query(
        `insert into workforce.recipe_steps (tenant_id, recipe_id, step_number, instruction_ja)
         values ($1, $2, 1, $3), ($1, $2, 2, $4)`,
        [tenantId, recipeId, '必要な材料と道具を確認します。', '手順に沿って仕上げ、提供前に品質を確認します。'],
      );
      await client.query(
        `insert into workforce.recipe_notes (tenant_id, recipe_id, title_ja, body_ja)
         values ($1, $2, 'ポイント', '品質を揃えるため、分量と手順を毎回確認してください。')`,
        [tenantId, recipeId],
      );
    }

    const verification = await client.query<{
      showcase_staff: number;
      showcase_shifts: number;
      showcase_recipes: number;
      showcase_instructions: number;
    }>(
      `select
        (select count(*)::int from workforce.employees where tenant_id = $1 and employment_type = $2) showcase_staff,
        (select count(*)::int from workforce.shifts where tenant_id = $1 and notes = $2) showcase_shifts,
        (select count(*)::int from workforce.recipes where tenant_id = $1 and description_en = $2 and content_kind = 'recipe') showcase_recipes,
        (select count(*)::int from workforce.recipes where tenant_id = $1 and description_en = $2 and content_kind = 'instruction') showcase_instructions`,
      [tenantId, MARKER],
    );
    const counts = verification.rows[0]!;
    if (counts.showcase_staff !== 5 || counts.showcase_shifts !== 72 || counts.showcase_recipes !== 5 || counts.showcase_instructions !== 1) {
      throw new Error(`Showcase verification failed: ${JSON.stringify(counts)}`);
    }

    await client.query('commit');
    console.log(JSON.stringify({ tenant: TENANT_SLUG, weekStarts: WEEK_STARTS, ...counts }));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Showcase setup failed.');
  process.exitCode = 1;
});
