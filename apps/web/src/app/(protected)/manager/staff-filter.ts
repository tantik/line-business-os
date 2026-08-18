import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';

export type StaffStatusFilter = 'active' | 'inactive' | 'all';

/**
 * Pure search/status filter for the Manage-staff popup's list (WP A4).
 * Extracted so the filter logic itself is unit-testable without a DOM
 * harness (this repo's test runner has none) -- the popup component just
 * calls this on every render, no memoization needed at this list size.
 */
export function filterStaffEntries(
  staff: WorkforceStaffManageEntry[],
  options: { status: StaffStatusFilter; query: string },
): WorkforceStaffManageEntry[] {
  const query = options.query.trim().toLowerCase();
  return staff.filter((entry) => {
    if (options.status === 'active' && !entry.isActive) return false;
    if (options.status === 'inactive' && entry.isActive) return false;
    if (query.length === 0) return true;
    return (
      entry.name.toLowerCase().includes(query) ||
      (entry.positionLabel ?? '').toLowerCase().includes(query) ||
      (entry.employmentType ?? '').toLowerCase().includes(query)
    );
  });
}
