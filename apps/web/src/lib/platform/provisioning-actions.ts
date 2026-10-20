'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isPlatformStaff } from './platform-staff';
import { callProvisionTenant } from './provision-tenant-client';
import type { ProvisionOutcome } from './provision-outcome';
import { parseRequestId, validateProvisioningForm, type ProvisioningField, type ProvisioningFieldError } from './provisioning-form';

/**
 * Admin console Server Action (Stage 4B-3): create a tenant, or retry one.
 *
 * request_id lifecycle: the form carries the idempotency key in a hidden
 * field (the page generates it once per new request). A retry -- the same
 * form submitted again after a failure, or the detail view's Retry -- re-sends
 * the SAME id, so the Edge Function / 0133 replay the finished part and only
 * redo what failed (DEBT-109 a). Only when the field is missing/invalid is a
 * fresh id generated here, and it is returned so the client keeps it.
 *
 * Order: validate (shared rules) -> staff gate with the caller's JWT ->
 * session token -> Edge Function with that token. No privileged key here.
 * The result carries machine codes only, never the owner email.
 */

export type SubmitProvisioningResult =
  | { status: 'invalid'; requestId: string; fieldErrors: Partial<Record<ProvisioningField, ProvisioningFieldError>> }
  | { status: 'unauthorized'; requestId: string }
  | { status: 'session_expired'; requestId: string }
  | { status: 'done'; requestId: string; outcome: ProvisionOutcome };

export async function submitTenantProvisioning(formData: FormData): Promise<SubmitProvisioningResult> {
  const requestId = parseRequestId(formData.get('requestId')) ?? crypto.randomUUID();

  const form = validateProvisioningForm({
    businessName: formData.get('businessName'),
    tenantSlug: formData.get('tenantSlug'),
    locationName: formData.get('locationName'),
    timezone: formData.get('timezone'),
    ownerEmail: formData.get('ownerEmail'),
  });
  if (!form.ok) return { status: 'invalid', requestId, fieldErrors: form.fieldErrors };

  const supabase = await createClient();
  if (!(await isPlatformStaff(supabase))) return { status: 'unauthorized', requestId };

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) return { status: 'session_expired', requestId };

  const outcome = await callProvisionTenant(sessionData.session.access_token, requestId, form.value);
  revalidatePath('/admin/tenants', 'layout');
  return { status: 'done', requestId, outcome };
}
