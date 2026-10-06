import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptPII, byteaToBuffer } from '@line-os/db/crypto';
import { listTenantLocations } from '@/lib/tenant/locations';
import { sendTransactionalEmail, type SendEmailResult, type TransactionalEmail } from '@/lib/notifications/resend-email';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError } from './pg-error';
import { readPiiEnv } from './pii-env';
import { buildShiftPreferenceReminderEmail, nextMonthPrefix } from './shift-preference-reminder-email';
import { todayIsoInTimeZone } from './timezone';

/**
 * Manager -> one employee "please submit next month's shift preferences"
 * email (Founder decision 2026-10-06: real email now, LINE deferred to v2.3).
 *
 * Security shape:
 *   - The client sends only `employeeId` + a per-dialog nonce. It never sends
 *     an address, a subject, a body, or a month, so this cannot be used as an
 *     open relay or to put arbitrary text in an email.
 *   - The employee row is read through `api.workforce_staff_manage` under the
 *     caller's own RLS (Manager-only rows), then the caller must also hold
 *     `workforce.request.manage` at that employee's location -- the same key
 *     that governs every other shift-request Manager action.
 *   - The address is decrypted here, server-side, and never returned: the
 *     result carries only a delivery outcome.
 *
 * The target month is computed here (next calendar month in the employee's
 * location time zone), matching what the Staff "submit next month's shift
 * preference" modal submits for.
 */

const DEFAULT_TIME_ZONE = 'Asia/Tokyo';

export type ReminderDelivery = 'sent' | 'no_email' | 'send_failed' | 'not_configured';

export interface ShiftPreferenceReminderOutcome {
  delivery: ReminderDelivery;
  /** `YYYY-MM` the reminder was about. */
  monthPrefix: string;
}

interface ReminderEmployeeRow {
  staff_id: string;
  location_id: string | null;
  name_encrypted: string;
  email_encrypted: string | null;
  is_active: boolean;
}

export interface SendShiftPreferenceReminderDeps {
  sendEmail?: (email: TransactionalEmail) => Promise<SendEmailResult>;
  todayIso?: (timeZone: string) => string;
}

export async function sendShiftPreferenceReminder(
  supabase: SupabaseClient,
  tenantId: string,
  input: { employeeId: string; nonce: string },
  deps: SendShiftPreferenceReminderDeps = {},
): Promise<WorkforceWriteResult<ShiftPreferenceReminderOutcome>> {
  const pii = readPiiEnv();
  if (!pii.ok) return { status: 'config_error', message: `Missing PII protection env: ${pii.missing.join(', ')}` };

  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_manage')
      .select('staff_id, location_id, name_encrypted, email_encrypted, is_active')
      .eq('tenant_id', tenantId)
      .eq('staff_id', input.employeeId)
      .maybeSingle();
    if (error) return mapWorkforceReadError(error, 'read this employee');
    const employee = data as ReminderEmployeeRow | null;
    if (!employee || !employee.is_active) return { status: 'not_found' };

    const { data: permitted, error: permissionError } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'workforce.request.manage',
      p_location_id: employee.location_id,
    });
    if (permissionError || permitted !== true) {
      return { status: 'unauthorized', message: 'You do not have permission to send shift-preference reminders.' };
    }

    let timeZone = DEFAULT_TIME_ZONE;
    const locations = await listTenantLocations(supabase);
    if (locations.status === 'success') {
      const location = locations.data.find((l) => l.tenantId === tenantId && l.locationId === employee.location_id);
      if (location) timeZone = location.timezone;
    }
    const monthPrefix = nextMonthPrefix((deps.todayIso ?? todayIsoInTimeZone)(timeZone));

    if (!employee.email_encrypted) return { status: 'success', data: { delivery: 'no_email', monthPrefix } };
    const email = decryptPII(byteaToBuffer(employee.email_encrypted), pii.config.encryptionKey).trim();
    if (!email) return { status: 'success', data: { delivery: 'no_email', monthPrefix } };
    const staffName = decryptPII(byteaToBuffer(employee.name_encrypted), pii.config.encryptionKey);

    const { subject, text } = buildShiftPreferenceReminderEmail(staffName, monthPrefix);
    const sent = await (deps.sendEmail ?? sendTransactionalEmail)({
      to: email,
      subject,
      text,
      idempotencyKey: `shift-pref-reminder/${tenantId}/${employee.staff_id}/${monthPrefix}/${input.nonce}`,
    });
    const delivery: ReminderDelivery = sent.status === 'sent' ? 'sent' : sent.status === 'not_configured' ? 'not_configured' : 'send_failed';
    return { status: 'success', data: { delivery, monthPrefix } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error sending this reminder.',
    };
  }
}
