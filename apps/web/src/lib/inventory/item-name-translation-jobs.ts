import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listContentTranslationsForEntities,
  listContentTranslationsForField,
  setMachineContentTranslation,
  type ContentTranslation,
} from '@/lib/content/translations';
import { resolveContentTranslationProvider } from '@/lib/content/translation-provider-factory';
import { loadTenantPackageConfig } from '@/lib/packages/tenant-package-config';
import type { TenantAccessResult } from '@/lib/tenant/types';
import {
  buildInventoryNameTranslations,
  runItemNameTranslation,
  selectItemsNeedingNameTranslation,
  type ItemNameSource,
} from './item-name-translation';
import type { InventoryNameTranslations } from './item-name-display';

/**
 * Inventory item name translation -- I/O + scheduling (0153). Everything
 * runs with the caller's own RLS-scoped client (never service_role): the
 * write RPC is SECURITY INVOKER and `content.can_manage_translation_source`
 * admits only `inventory.item.manage` at the item's location, so a Staff
 * page load can read but never write. Provider work is scheduled with
 * Next's `after()` -- it runs once the response is sent and can never fail,
 * delay or change the save / page that scheduled it.
 */

/** ONE batched read of every item-name translation in the tenant (both directions) -- one request per page. */
export async function loadInventoryNameTranslationRows(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<ContentTranslation[]>> {
  return listContentTranslationsForField(supabase, tenantId, 'inventory_item', 'name');
}

/** Rows -> the client-safe display map (current translations only); a failed read just means "show original names". */
export function toInventoryNameTranslations(
  items: ItemNameSource[] | null | undefined,
  rows: TenantAccessResult<ContentTranslation[]> | null | undefined,
): InventoryNameTranslations {
  if (!items || !rows || rows.status !== 'success') return {};
  return buildInventoryNameTranslations(items, rows.data);
}

async function translateAndPersist(
  supabase: SupabaseClient,
  tenantId: string,
  items: ItemNameSource[],
  existing: ContentTranslation[],
  domainHint: string | undefined,
  logContext: string,
): Promise<void> {
  const provider = resolveContentTranslationProvider();
  if (!provider || items.length === 0) return;
  try {
    const hint = domainHint ?? (await loadTenantPackageConfig(supabase, tenantId)).translationDomainHint;
    const run = await runItemNameTranslation(items, existing, provider, { domainHint: hint });
    for (const error of run.errors) {
      console.error(`[inventory-name-translation] ${logContext}: provider error code=${error.code}`);
    }
    for (const accepted of run.accepted) {
      const saved = await setMachineContentTranslation(supabase, tenantId, {
        sourceEntityType: accepted.sourceEntityType,
        sourceEntityId: accepted.sourceEntityId,
        sourceField: accepted.sourceField,
        translatedText: accepted.translatedText,
        sourceContentHash: accepted.sourceContentHash,
        translationProvider: provider.providerId,
      });
      if (saved.status !== 'success' && saved.status !== 'reviewed_conflict') {
        console.error(`[inventory-name-translation] ${logContext}: failed to persist item=${accepted.sourceEntityId} status=${saved.status}`);
      }
    }
  } catch (err) {
    console.error(`[inventory-name-translation] ${logContext}: unexpected error:`, err instanceof Error ? err.message : err);
  }
}

/**
 * After an item create/rename: translate its name into the other language
 * once the save's response is sent. A name that already has a current
 * translation is skipped by the orchestrator (no provider call).
 */
export function scheduleItemNameTranslation(supabase: SupabaseClient, tenantId: string, item: ItemNameSource): void {
  if (!resolveContentTranslationProvider()) return;
  after(async () => {
    const existing = await listContentTranslationsForEntities(supabase, tenantId, [
      { sourceEntityType: 'inventory_item', sourceEntityId: item.itemId },
    ]);
    if (existing.status !== 'success') return;
    await translateAndPersist(supabase, tenantId, [item], existing.data, undefined, `item=${item.itemId}`);
  });
}

/**
 * Lazy backfill on a Manager inventory page load: items without a current
 * name translation (created before 0153, or whose earlier attempt failed)
 * get translated after the response, at most `ITEM_NAME_BACKFILL_LIMIT` per
 * load. Uses the translations the page already read -- no extra request
 * unless there is something to translate. No-op without a provider.
 */
export function scheduleInventoryNameBackfill(
  supabase: SupabaseClient,
  tenantId: string,
  items: ItemNameSource[] | null | undefined,
  rows: TenantAccessResult<ContentTranslation[]> | null | undefined,
  domainHint?: string,
): void {
  if (!items || !rows || rows.status !== 'success') return;
  if (!resolveContentTranslationProvider()) return;
  const pending = selectItemsNeedingNameTranslation(items, rows.data);
  if (pending.length === 0) return;
  const existing = rows.data;
  after(() => translateAndPersist(supabase, tenantId, pending, existing, domainHint, `backfill(${pending.length})`));
}
