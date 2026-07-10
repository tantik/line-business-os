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
    default:
      return result.message;
  }
}
