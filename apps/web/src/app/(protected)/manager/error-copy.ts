import type { WorkforceWriteResult } from '@/lib/workforce/result-types';

/** Shared client-side error copy for every write call on this page -- the single place this text lives. */
export function describeWriteError(result: Exclude<WorkforceWriteResult<unknown>, { status: 'success' }>): string {
  switch (result.status) {
    case 'not_found':
      return 'Not found.';
    case 'not_authenticated':
      return 'Please sign in again.';
    case 'no_membership':
      return 'You are not a member of this workspace.';
    case 'blocked_by_history':
      return 'This has historical records and cannot be permanently deleted.';
    case 'blocked_not_archived':
      return 'Only an archived recipe can be permanently deleted.';
    case 'stale_reference':
      return 'This request is no longer up to date — the shift may have changed, or another manager may have already decided it. Refresh to see the latest state.';
    case 'language_change_requires_confirmation':
      return 'You are changing this recipe’s original language. Existing content will not be deleted. Please confirm the change and save again.';
    default:
      return result.message;
  }
}
