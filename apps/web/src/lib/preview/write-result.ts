import type { PreviewTenantResult } from './tenant';
import type { PreviewModuleResult } from './module-guard';
import type { ManagerLocationResult } from './location';
import type { WorkforceWriteResult } from '@/lib/workforce/result-types';

/**
 * Phase 1N-4C Slice B2a - shared, fixed, neutral result contract for every
 * preview write Server Action (architecture plan Section 11 / B2 plan
 * Section 11). Deliberately coarser than any raw Supabase/Postgres error or
 * the underlying `WorkforceWriteResult`/`TenantAccessResult` status: no
 * status here ever carries a tenant/employee UUID, an internal route path,
 * an RLS policy name, or raw Postgres/PostgREST error text.
 *
 * No `server-only` import - this module is intentionally importable from a
 * `'use client'` preview island so the Japanese status->message dictionary
 * lives in exactly one place, shared by server wrapper and client renderer.
 */
export type PreviewWriteFailureStatus =
  | 'not_authenticated'
  | 'no_access'
  | 'module_disabled'
  | 'location_blocked'
  | 'no_profile'
  | 'invalid_input'
  | 'not_found'
  | 'duplicate'
  | 'unexpected_error';

export type PreviewWriteResult<T> =
  | { status: 'success'; data: T }
  | { status: PreviewWriteFailureStatus };

const PREVIEW_WRITE_MESSAGES_JA: Record<PreviewWriteFailureStatus, string> = {
  not_authenticated: 'サインインが必要です。',
  no_access: 'この操作を行う権限がありません。',
  module_disabled: 'ワークフォース機能はこのワークスペースで有効になっていません。',
  location_blocked: '店舗の設定を確認できません。担当者にお問い合わせください。',
  no_profile: 'このアカウントに紐づくスタッフ情報がありません。担当者にお問い合わせください。',
  invalid_input: '入力内容を確認してください。',
  not_found: '対象の情報が見つかりません。',
  duplicate: 'すでに同じ内容が登録されています。',
  unexpected_error: '一時的な問題が発生しました。しばらくしてからもう一度お試しください。',
};

export function previewWriteMessageJa(status: PreviewWriteFailureStatus): string {
  return PREVIEW_WRITE_MESSAGES_JA[status];
}

export const PREVIEW_INVALID_INPUT_RESULT: PreviewWriteResult<never> = { status: 'invalid_input' };

/** Maps every non-`success` `PreviewTenantResult` to the fixed preview write contract. */
export function mapPreviewTenantFailure(
  result: Exclude<PreviewTenantResult, { status: 'success' }>,
): PreviewWriteResult<never> {
  if (result.status === 'not_authenticated') return { status: 'not_authenticated' };
  if (result.status === 'no_access') return { status: 'no_access' };
  return { status: 'unexpected_error' };
}

/** Maps every non-`enabled` `PreviewModuleResult` to the fixed preview write contract. */
export function mapPreviewModuleFailure(
  result: Exclude<PreviewModuleResult, { status: 'enabled' }>,
): PreviewWriteResult<never> {
  if (result.status === 'disabled') return { status: 'module_disabled' };
  return { status: 'unexpected_error' };
}

/** Maps every non-`ok` `ManagerLocationResult` (`none`/`ambiguous`) to the fixed preview write contract - both fail closed to the same neutral status, never distinguished to the caller. */
export function mapManagerLocationFailure(
  _result: Exclude<ManagerLocationResult, { kind: 'ok' }>,
): PreviewWriteResult<never> {
  return { status: 'location_blocked' };
}

/** Maps an existing service-layer `WorkforceWriteResult` to the fixed preview write contract. */
export function mapWorkforceWriteResult<T>(result: WorkforceWriteResult<T>): PreviewWriteResult<T> {
  switch (result.status) {
    case 'success':
      return { status: 'success', data: result.data };
    case 'not_found':
      return { status: 'not_found' };
    case 'duplicate':
      return { status: 'duplicate' };
    case 'not_authenticated':
      return { status: 'not_authenticated' };
    case 'no_membership':
    case 'unauthorized':
      return { status: 'no_access' };
    case 'config_error':
    case 'unexpected_error':
      return { status: 'unexpected_error' };
    default:
      return { status: 'unexpected_error' };
  }
}
