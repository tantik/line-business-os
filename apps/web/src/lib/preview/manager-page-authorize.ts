import 'server-only';
import { resolvePreviewManagerContext } from './actions/authorize';

/**
 * Fail-closed page-level gate for the tenant-wide manager read surface.
 * Server Actions keep their own per-mutation checks; this prevents staff
 * members from rendering manager data or manager action forms at all.
 */
export async function authorizePreviewManagerPage(): Promise<boolean> {
  const result = await resolvePreviewManagerContext('workforce.staff.manage');
  return result.status === 'ok';
}
