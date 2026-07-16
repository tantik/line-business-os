'use server';

import {
  decideCorrectionRequest as decideCorrectionRequestWrite,
  listShiftRequestsForManager,
  type WorkforceShiftRequest,
} from '@/lib/workforce/shift-requests';
import { parseDecideCorrectionRequestInput } from '@/lib/workforce/attendance-input';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager Server Action for
 * correction-request approve/reject. Preview-only wrapper around the
 * existing, unchanged `shift-requests.ts` service-layer function - never
 * imports `attendance-actions.ts` (the dashboard action module).
 *
 * `wf_shift_requests_write` is location-scoped exactly like every other
 * workforce write policy (B2 plan Section 3.1a) - both the `api.has_permission`
 * pre-check (inside `resolvePreviewManagerContext`) and the target-record
 * check below verify the request's own `locationId` against the
 * server-resolved active location; `decideCorrectionRequestWrite`'s own
 * tenant filter alone is not relied on as if it also checked location.
 */
export async function previewDecideCorrectionRequest(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceShiftRequest>> {
  const contextResult = await resolvePreviewManagerContext('workforce.request.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const input = parseDecideCorrectionRequestInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const requestsResult = await listShiftRequestsForManager(supabase, tenantId, { kind: 'correction' });
  if (requestsResult.status !== 'success') return mapWorkforceWriteResult(requestsResult);
  const target = requestsResult.data.find((r) => r.requestId === input.requestId);
  if (!target || target.locationId !== locationId) return { status: 'not_found' };

  const result = await decideCorrectionRequestWrite(supabase, tenantId, input.requestId, input.decision);
  return mapWorkforceWriteResult(result);
}
