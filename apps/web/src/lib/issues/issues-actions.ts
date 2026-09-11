'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { acknowledgeIssue, createIssue, resolveIssue } from './issues';
import { parseAcknowledgeIssueInput, parseCreateIssueInput, parseResolveIssueInput } from './issues-input';
import type { IssuesWriteResult } from './result-types';

/**
 * Server Actions for the Issues & Handover Manager frontend slice (Cafe
 * v2.2 WP2). Thin controllers: parse `FormData` -> resolve tenant ->
 * delegate to `issues.ts`'s service-layer helper, which owns the actual
 * `api.issues_*` RPC call. Mirrors `@/lib/operations/exceptions-actions.ts`'s
 * exact shape.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function reportIssueAction(formData: FormData): Promise<IssuesWriteResult<{ issueId: string }>> {
  const input = parseCreateIssueInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return createIssue(supabase, tenantContext.data.activeTenant.tenantId, input.locationId, input.kind, input.note, input.category, input.severity);
}

export async function acknowledgeIssueAction(formData: FormData): Promise<IssuesWriteResult<{ issueId: string }>> {
  const input = parseAcknowledgeIssueInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return acknowledgeIssue(supabase, tenantContext.data.activeTenant.tenantId, input.issueId);
}

export async function resolveIssueAction(formData: FormData): Promise<IssuesWriteResult<{ issueId: string }>> {
  const input = parseResolveIssueInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return resolveIssue(supabase, tenantContext.data.activeTenant.tenantId, input.issueId, input.resolutionNote);
}
