'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isPlatformStaff } from './platform-staff';
import { callPlatformLocation } from './platform-location-client';
import {
  parseCreatePlatformLocationForm,
  parseRenamePlatformLocationForm,
  parseSetPlatformLocationActiveForm,
  type PlatformLocationCommand,
  type PlatformLocationResult,
} from './platform-location';

/**
 * Admin console Server Actions (DEBT-139 L3c): add / rename / archive /
 * restore a tenant's store. Platform staff act on ANY tenant, so the tenant /
 * location id comes from the form -- exactly like provisioning; the authority
 * is the platform-staff flag, never a tenant membership.
 *
 * Order: validate -> staff gate with the caller's JWT (fails closed) ->
 * session token -> Edge Function with that token (which re-checks the JWT and
 * the flag; the 0151 functions re-check the actor and write the audit row).
 * No privileged key here. Results carry machine codes only.
 */

async function run(command: PlatformLocationCommand): Promise<PlatformLocationResult> {
  const supabase = await createClient();
  if (!(await isPlatformStaff(supabase))) return { status: 'error', code: 'not_staff' };

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) return { status: 'error', code: 'session_expired' };

  // Correlation id for the function's logs (the DB refuses a duplicate store by name).
  const result = await callPlatformLocation(sessionData.session.access_token, crypto.randomUUID(), command);
  if (result.status === 'success') revalidatePath('/admin/tenants');
  return result;
}

export async function createPlatformLocation(formData: FormData): Promise<PlatformLocationResult> {
  const input = parseCreatePlatformLocationForm(formData);
  if (!input.ok) return { status: 'error', code: input.code };
  return run(input.value);
}

export async function renamePlatformLocation(formData: FormData): Promise<PlatformLocationResult> {
  const input = parseRenamePlatformLocationForm(formData);
  if (!input.ok) return { status: 'error', code: input.code };
  return run(input.value);
}

export async function setPlatformLocationActive(formData: FormData): Promise<PlatformLocationResult> {
  const input = parseSetPlatformLocationActiveForm(formData);
  if (!input.ok) return { status: 'error', code: input.code };
  return run(input.value);
}
