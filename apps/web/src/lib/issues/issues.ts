import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { IssuesWriteResult } from './result-types';
import type { IssueCategory, IssueKind, IssueSeverity } from './validation';
import { mapIssuesReadError, mapIssuesWriteError } from './pg-error';

/**
 * Issues & Handover read/write service layer (Cafe v2.2 WP2, Manager
 * frontend slice). Reads go through `api.issues_open` (open + acknowledged
 * -- the "current" feed) and `api.issues` (full history, including
 * resolved) -- both `security_invoker` views, 0118. Writes go through
 * `api.issues_create` / `api.issues_acknowledge` / `api.issues_resolve` --
 * never a raw `issues.issues` table write. Mirrors
 * `@/lib/operations/exceptions.ts`'s exact shape/conventions.
 */

export type IssueKindValue = IssueKind;
export type IssueCategoryValue = IssueCategory;
export type IssueSeverityValue = IssueSeverity;
export type IssueStatus = 'open' | 'acknowledged' | 'resolved';
export type IssueReportedByRole = 'staff' | 'manager';
export type IssueSource = 'manual' | 'operations';

/** Flat row shape shared by `api.issues_open` and `api.issues` (0118) -- the full-history-only columns are `null` when read from `api.issues_open` (that view never selects them). */
interface ApiIssueRow {
  issue_id: string;
  tenant_id: string;
  location_id: string;
  kind: IssueKindValue;
  category: IssueCategoryValue | null;
  severity: IssueSeverityValue | null;
  status: IssueStatus;
  note: string;
  business_date: string;
  reported_by: string;
  reported_by_role: IssueReportedByRole;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  source: IssueSource;
  operations_exception_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Issue {
  issueId: string;
  tenantId: string;
  locationId: string;
  kind: IssueKindValue;
  category: IssueCategoryValue | null;
  severity: IssueSeverityValue | null;
  status: IssueStatus;
  note: string;
  businessDate: string;
  reportedBy: string;
  reportedByRole: IssueReportedByRole;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  /** `null` on a row read from `api.issues_open` (that view has no resolved-only columns), not just "not yet resolved". Use `status === 'resolved'` to tell the two apart. */
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  source: IssueSource;
  operationsExceptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapIssueRow(row: ApiIssueRow): Issue {
  return {
    issueId: row.issue_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    kind: row.kind,
    category: row.category,
    severity: row.severity,
    status: row.status,
    note: row.note,
    businessDate: row.business_date,
    reportedBy: row.reported_by,
    reportedByRole: row.reported_by_role,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
    resolutionNote: row.resolution_note ?? null,
    source: row.source,
    operationsExceptionId: row.operations_exception_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ISSUE_OPEN_SELECT =
  'issue_id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, acknowledged_by, acknowledged_at, source, operations_exception_id, created_at, updated_at';

const ISSUE_FULL_SELECT =
  'issue_id, tenant_id, location_id, kind, category, severity, status, note, business_date, reported_by, reported_by_role, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note, source, operations_exception_id, created_at, updated_at';

/** Read every currently-open (`open` or `acknowledged`) issue/handover the caller may see, via `api.issues_open` (RLS-scoped: module ON + `issues.report`/`issues.manage`, tenant/location isolated). Not scoped to one location -- callers that need only the Manager's own location must filter client-side, same convention as `listOpenOperationsExceptions`. */
export async function listOpenIssues(supabase: SupabaseClient, tenantId: string): Promise<TenantAccessResult<Issue[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('issues_open').select(ISSUE_OPEN_SELECT).eq('tenant_id', tenantId);
    if (error) return mapIssuesReadError(error, 'read open issues');
    const rows = (data ?? []) as ApiIssueRow[];
    const issues = rows.map(mapIssueRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.issueId.localeCompare(b.issueId));
    return { status: 'success', data: issues };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading open issues.' };
  }
}

/** Read every issue/handover (including resolved) the caller may see, via `api.issues` -- for the History view. */
export async function listAllIssues(supabase: SupabaseClient, tenantId: string): Promise<TenantAccessResult<Issue[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('issues').select(ISSUE_FULL_SELECT).eq('tenant_id', tenantId);
    if (error) return mapIssuesReadError(error, 'read issue history');
    const rows = (data ?? []) as ApiIssueRow[];
    const issues = rows.map(mapIssueRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.issueId.localeCompare(b.issueId));
    return { status: 'success', data: issues };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading issue history.' };
  }
}

/** Create an issue or handover note via `api.issues_create` (0118). `reported_by`/`reported_by_role` are resolved server-side by the RPC from the authenticated actor -- never client-supplied. */
export async function createIssue(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  kind: IssueKindValue,
  note: string,
  category: IssueCategoryValue | null,
  severity: IssueSeverityValue | null,
): Promise<IssuesWriteResult<{ issueId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('issues_create', {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_kind: kind,
      p_note: note,
      p_category: category,
      p_severity: severity,
    });
    if (error) return mapIssuesWriteError(error);
    return { status: 'success', data: { issueId: data as string } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error creating this issue.' };
  }
}

/** Acknowledge an open issue/handover via `api.issues_acknowledge` (0118). Manager-only in this MVP slice (RLS-enforced, not just UI-hidden). */
export async function acknowledgeIssue(supabase: SupabaseClient, tenantId: string, issueId: string): Promise<IssuesWriteResult<{ issueId: string }>> {
  try {
    const { error } = await supabase.schema('api').rpc('issues_acknowledge', { p_tenant_id: tenantId, p_issue_id: issueId });
    if (error) return mapIssuesWriteError(error);
    return { status: 'success', data: { issueId } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error acknowledging this issue.' };
  }
}

/** Resolve an issue/handover via `api.issues_resolve` (0118) -- there is no "reopen". Auto-stamps acknowledged_* server-side if the row skipped that step. */
export async function resolveIssue(
  supabase: SupabaseClient,
  tenantId: string,
  issueId: string,
  resolutionNote: string | null,
): Promise<IssuesWriteResult<{ issueId: string }>> {
  try {
    const { error } = await supabase.schema('api').rpc('issues_resolve', {
      p_tenant_id: tenantId,
      p_issue_id: issueId,
      p_resolution_note: resolutionNote,
    });
    if (error) return mapIssuesWriteError(error);
    return { status: 'success', data: { issueId } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error resolving this issue.' };
  }
}
