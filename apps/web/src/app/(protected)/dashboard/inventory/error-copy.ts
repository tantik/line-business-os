import type { InventoryWriteResult } from '@/lib/inventory/result-types';

/** Shared client-side error copy for every Inventory write call on this page -- the single place this text lives. Never surfaces a raw Postgres/internal message. */
export function describeInventoryWriteError(result: Exclude<InventoryWriteResult<unknown>, { status: 'success' }>): string {
  switch (result.status) {
    case 'not_found':
      return 'Not found.';
    case 'not_authenticated':
      return 'Please sign in again.';
    case 'no_membership':
      return 'You are not a member of this workspace.';
    case 'unauthorized':
      return result.message;
    default:
      return 'Something went wrong. Please try again.';
  }
}
