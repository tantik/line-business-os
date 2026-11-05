'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { optimizeImageForWeb } from '@/lib/media/optimize-image';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { parseUuid } from './validation';
import { parseCancelReason, parseReceiptPhotoMode, parseSaveSpendReceiptInput } from './spend-receipt-input';
import {
  RECEIPT_MANAGE_PERMISSION,
  RECEIPTS_BUCKET,
  cancelSpendReceipt,
  createReceiptMediaUrlMap,
  createSpendReceipt,
  getSpendReceiptSettings,
  listSpendReceipts,
  localDate,
  monthRange,
  setSpendReceiptSettings,
  updateSpendReceipt,
  type ApiSpendReceiptRow,
  type SpendReceipt,
  type SpendReceiptSettings,
  type SpendReceiptWriteResult,
} from './spend-receipts';

/**
 * Server Actions for spend receipts (レシート, DEBT-136). The tab's data is
 * loaded on open (`loadSpendReceiptsAction`), never in the dashboard page
 * RPC, so the Staff/Manager page keeps its DEBT-135 request budget.
 * `tenantId` and the uploader id always come from `requireTenantContext()`;
 * every rule is re-checked by the 0147 RPCs and storage policies.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;
/** Client shrinks the photo before sending (`shrinkImageForUpload`); the server re-checks and re-encodes regardless. */
const MAX_RECEIPT_PHOTO_BYTES = 2.5 * 1024 * 1024;
const RECEIPT_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Long side of a stored receipt photo: small print must stay readable. */
const RECEIPT_PHOTO_MAX_DIMENSION = 2000;

/** A bought/received purchase of today that can still go on a receipt. */
export interface ReceiptCandidate {
  actionId: string;
  /** Keys the item name translation (0153). */
  itemId: string;
  itemName: string;
  actionType: 'bought' | 'received';
  actionedAt: string;
  actionedByStaffId: string | null;
}

export interface SpendReceiptsTabData {
  canManage: boolean;
  settings: SpendReceiptSettings;
  /** Location-local today (`YYYY-MM-DD`). */
  today: string;
  month: string;
  receipts: SpendReceipt[];
  photoUrlByReceiptId: Record<string, string>;
  candidates: ReceiptCandidate[];
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

async function canManageReceipts(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, locationId: string) {
  const { data, error } = await supabase
    .schema('api')
    .rpc('has_permission', { p_tenant_id: tenantId, p_permission: RECEIPT_MANAGE_PERMISSION, p_location_id: locationId });
  return !error && data === true;
}

/**
 * `scope = 'tab'`: everything the 「レシート」 tab shows. `scope = 'prompt'` (after each
 * 購入済み/入荷): settings + today's candidates only -- no month list, no signed photo URLs,
 * so a run of purchases stays cheap.
 */
export async function loadSpendReceiptsAction(
  locationIdRaw: string,
  monthRaw: string | null,
  timeZoneRaw: string,
  scope: 'tab' | 'prompt' = 'tab',
): Promise<TenantAccessResult<SpendReceiptsTabData>> {
  const locationId = parseUuid(locationIdRaw);
  const timeZone = typeof timeZoneRaw === 'string' && isValidTimeZone(timeZoneRaw) ? timeZoneRaw : null;
  if (!locationId || !timeZone || (scope !== 'tab' && scope !== 'prompt')) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;
  const tenantId = tenantContext.data.activeTenant.tenantId;
  const supabase = await createClient();

  const today = localDate(new Date(), timeZone);
  const month = monthRaw && monthRange(monthRaw) ? monthRaw : today.slice(0, 7);

  const [canManage, settingsResult, receiptsResult, profileResult, todayLinksResult, historyResult] = await Promise.all([
    canManageReceipts(supabase, tenantId, locationId),
    getSpendReceiptSettings(supabase, tenantId, locationId),
    scope === 'tab' ? listSpendReceipts(supabase, tenantId, locationId, month) : Promise.resolve(null),
    getMyWorkforceStaffProfile(supabase, tenantId),
    // a purchase made today can only be on a receipt created today -- those are not offered again
    supabase
      .schema('api')
      .from('spend_receipts')
      .select('items')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .eq('created_on', today),
    // today's bought/received purchases (36 h window, narrowed to the local day below)
    supabase
      .schema('api')
      .from('purchase_history')
      .select('action_id, item_id, item_name, action_type, actioned_at, actioned_by_staff_id')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .in('action_type', ['bought', 'received'])
      .gte('actioned_at', new Date(Date.now() - 36 * 3600 * 1000).toISOString())
      .order('actioned_at', { ascending: false })
      .limit(200),
  ]);

  if (receiptsResult && receiptsResult.status !== 'success') return receiptsResult;
  if (settingsResult.status !== 'success') return settingsResult;
  if (todayLinksResult.error || historyResult.error) return { status: 'unexpected_error', message: 'Unable to load receipts right now.' };

  const linked = new Set<string>();
  for (const row of (todayLinksResult.data ?? []) as Array<Pick<ApiSpendReceiptRow, 'items'>>) {
    for (const item of row.items ?? []) linked.add(item.action_id);
  }
  // DEBT-132: a user with several employee rows gets no staff profile -> only a manager sees candidates then
  const myStaffId = profileResult.status === 'success' ? (profileResult.data?.staffId ?? null) : null;
  const seen = new Set<string>();
  const candidates: ReceiptCandidate[] = [];
  for (const row of (historyResult.data ?? []) as Array<{
    action_id: string;
    item_id: string;
    item_name: string;
    action_type: 'bought' | 'received';
    actioned_at: string;
    actioned_by_staff_id: string | null;
  }>) {
    if (seen.has(row.action_id) || linked.has(row.action_id)) continue;
    if (localDate(new Date(row.actioned_at), timeZone) !== today) continue;
    const isMine = myStaffId !== null && row.actioned_by_staff_id === myStaffId;
    if (!canManage && !isMine) continue;
    seen.add(row.action_id);
    candidates.push({
      actionId: row.action_id,
      itemId: row.item_id,
      itemName: row.item_name,
      actionType: row.action_type,
      actionedAt: row.actioned_at,
      actionedByStaffId: row.actioned_by_staff_id,
    });
  }

  const receipts = receiptsResult?.data ?? [];
  return {
    status: 'success',
    data: {
      canManage,
      settings: settingsResult.data,
      today,
      month,
      receipts,
      photoUrlByReceiptId: scope === 'tab' ? await createReceiptMediaUrlMap(supabase, receipts) : {},
      candidates,
    },
  };
}

/** Create (no `receiptId`) or update a receipt; an attached `photo` is re-encoded and uploaded first. */
export async function saveSpendReceiptAction(formData: FormData): Promise<SpendReceiptWriteResult<{ receiptId: string }>> {
  const input = parseSaveSpendReceiptInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const photo = formData.get('photo');
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && (photo.size > MAX_RECEIPT_PHOTO_BYTES || !RECEIPT_PHOTO_MIME_TYPES.includes(photo.type))) {
    return INVALID_INPUT_RESULT;
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;
  const tenantId = tenantContext.data.activeTenant.tenantId;
  const userId = tenantContext.data.userId;
  const supabase = await createClient();

  // edit: start from the stored photo (RLS-visible row; a hidden row = not found)
  let mediaPath: string | null = null;
  let locationId = input.locationId;
  if (input.receiptId) {
    const { data, error } = await supabase
      .schema('api')
      .from('spend_receipts')
      .select('location_id, media_path')
      .eq('tenant_id', tenantId)
      .eq('receipt_id', input.receiptId)
      .maybeSingle();
    if (error) return { status: 'unexpected_error', message: 'Unable to save the receipt right now.' };
    if (!data) return { status: 'receipt_error', code: 'not_found' };
    const current = data as Pick<ApiSpendReceiptRow, 'location_id' | 'media_path'>;
    locationId = current.location_id;
    mediaPath = input.removePhoto ? null : current.media_path;
  }

  if (hasPhoto) {
    let optimized;
    try {
      optimized = await optimizeImageForWeb(await photo.arrayBuffer(), { maxDimension: RECEIPT_PHOTO_MAX_DIMENSION, quality: 85 });
    } catch {
      return { status: 'receipt_error', code: 'photo_upload_failed' };
    }
    // <tenant>/<location>/<uploader user>/<uuid>.<ext> (0147 storage policies)
    const path = `${tenantId}/${locationId}/${userId}/${crypto.randomUUID()}.${optimized.extension}`;
    const upload = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, optimized.buffer, {
      contentType: optimized.contentType,
      cacheControl: '3600',
      upsert: false,
    });
    if (upload.error) return { status: 'receipt_error', code: 'photo_upload_failed' };
    mediaPath = path;
  }

  const payload = {
    purchasedOn: input.purchasedOn,
    amountJpy: input.amountJpy,
    category: input.category,
    note: input.note,
    mediaPath,
    actionIds: input.actionIds,
  };
  // Accepted (0147 review): a photo uploaded for a save that then fails stays in
  // the bucket until the tenant purge -- there is no delete policy on purpose.
  return input.receiptId
    ? updateSpendReceipt(supabase, tenantId, input.receiptId, payload)
    : createSpendReceipt(supabase, tenantId, locationId, payload, input.clientRequestId as string);
}

export async function cancelSpendReceiptAction(formData: FormData): Promise<SpendReceiptWriteResult<null>> {
  const receiptId = parseUuid(formData.get('receiptId'));
  const reason = parseCancelReason(formData.get('reason'));
  if (!receiptId || !reason) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;
  const supabase = await createClient();
  return cancelSpendReceipt(supabase, tenantContext.data.activeTenant.tenantId, receiptId, reason);
}

export async function setSpendReceiptSettingsAction(formData: FormData): Promise<SpendReceiptWriteResult<SpendReceiptSettings>> {
  const locationId = parseUuid(formData.get('locationId'));
  const photoMode = parseReceiptPhotoMode(formData.get('photoMode'));
  const enabledRaw = formData.get('receiptsEnabled');
  if (!locationId || !photoMode || (enabledRaw !== 'true' && enabledRaw !== 'false')) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;
  const supabase = await createClient();
  return setSpendReceiptSettings(supabase, tenantContext.data.activeTenant.tenantId, locationId, {
    receiptsEnabled: enabledRaw === 'true',
    photoMode,
  });
}

