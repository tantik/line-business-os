import 'server-only';
import { resolvePreviewManagerContext, type PreviewManagerContext } from './actions/authorize';

export type AuthorizePreviewManagerPageResult =
  | { status: 'ok'; context: PreviewManagerContext }
  | { status: 'fail' };

/**
 * Fail-closed page-level gate for the tenant-wide manager read surface.
 * Server Actions keep their own per-mutation checks; this prevents staff
 * members from rendering manager data or manager action forms at all.
 *
 * Returns the tenant/module/location context this check already had to
 * resolve to run the `workforce.staff.manage` permission check, so the page
 * can render straight from it instead of resolving tenant/module/location a
 * second time from scratch. Every non-`ok` outcome (wrong tenant, disabled
 * module, blocked location, missing permission) still collapses to the same
 * neutral `fail` - the page only ever rendered a generic no-access state for
 * any of these before, so this changes no observable behavior.
 */
export async function authorizePreviewManagerPage(): Promise<AuthorizePreviewManagerPageResult> {
  const result = await resolvePreviewManagerContext('workforce.staff.manage');
  if (result.status !== 'ok') return { status: 'fail' };
  return { status: 'ok', context: result.context };
}
