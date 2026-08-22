'use client';

import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { bindEmployeeLineUser, upsertEmployee } from '@/lib/workforce/staff-actions';
import { PendingOverlay } from '@/components/ui/loading';
import { alertDanger, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManagerDashboard } from './manager-dashboard-i18n';

/** Localizes the subset of `WorkforceWriteResult` statuses this form can actually receive; falls back to the shared (English) copy for statuses this form's own action never returns. */
export function localizedFormError(result: Parameters<typeof describeWriteError>[0], t: (key: Parameters<typeof tManagerDashboard>[1]) => string) {
  switch (result.status) {
    case 'not_found':
      return t('errorNotFound');
    case 'not_authenticated':
      return t('errorNotAuthenticated');
    case 'no_membership':
      return t('errorNoMembership');
    default:
      return describeWriteError(result);
  }
}

export interface StaffFormProps {
  locationId: string;
  /** Omit/undefined to create a new employee; pass an existing entry to edit it. */
  employee?: WorkforceStaffManageEntry;
  /** Id given to the underlying `<form>` element so an external "Save" button (rendered by the parent popup, positioned after the LINE/access/danger-zone sections below this form in the DOM) can submit it via the standard HTML `form="..."` button attribute, without an invalid nested-`<form>` layout. */
  formId: string;
  /** Whether this employee already has a linked LINE user id. `false`/omitted (always the case for a new employee) shows a LINE user id field inline next to Email -- entering one and saving links it in the same submit, no separate "Bind" step. `true` omits that field entirely; the parent's own `LineLinkForm` (Unbind-only in that state) is the sole LINE control instead. */
  isLineLinked?: boolean;
  onSuccess: () => void;
  /** Reports pending/error state up to the parent, which owns the actual Save button (see `formId`) and needs to know when to show it as loading/disabled. */
  onPendingChange?: (pending: boolean) => void;
  onErrorChange?: (error: string | null) => void;
}

/**
 * 2026-08-21 polish pass: this form now renders ONLY the identity fields
 * (previously also owned Save/Cancel/Delete-permanently inline) -- the
 * Founder asked for one flowing popup (fields -> LINE -> account-access
 * actions -> danger zone -> Save/Cancel at the very bottom), which the old
 * layout couldn't express since LINE/access/danger-zone are rendered by
 * the parent popup, not this component, and HTML doesn't allow nesting a
 * `<form>` inside another `<form>` (`LineLinkForm`'s bind control is its
 * own `<form>`). Delete-permanently moved to the parent's danger zone.
 * "Employment type" is temporarily removed from the visible form per
 * Founder direction ("пока удали") -- carried through as a hidden input so
 * an edit-and-save never silently wipes an existing value.
 */
export function StaffForm({ locationId, employee, formId, isLineLinked = false, onSuccess, onPendingChange, onErrorChange }: StaffFormProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);
  useEffect(() => onErrorChange?.(error), [error, onErrorChange]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (employee) formData.set('id', employee.staffId);
    // Preserve the employee's own location on edit (the page's active location is only a create-time default) -- this manager page can list staff across locations, and an edit shouldn't silently move someone.
    formData.set('locationId', employee?.locationId ?? locationId);
    // `rawLineUserId` is this form's own field (see the !isLineLinked branch
    // below), not part of `upsertEmployee`'s input shape -- pulled out and
    // removed before that call, then used for a second, chained bind call
    // below so entering a LINE id and clicking Save/Add links it in one
    // step, no separate "Bind" submit.
    const rawLineUserId = String(formData.get('rawLineUserId') ?? '').trim();
    formData.delete('rawLineUserId');

    startTransition(async () => {
      const result = await upsertEmployee(formData);
      if (result.status !== 'success') {
        setError(localizedFormError(result, t));
        return;
      }
      if (rawLineUserId) {
        const lineFormData = new FormData();
        lineFormData.set('employeeId', result.data.staffId);
        lineFormData.set('rawLineUserId', rawLineUserId);
        const lineResult = await bindEmployeeLineUser(lineFormData);
        if (lineResult.status !== 'success') {
          // The identity fields are already saved at this point (upsert
          // succeeded) -- only the LINE link failed. Surfacing the error
          // here (instead of calling onSuccess, which the parent popup
          // wires to close back to the list) keeps the Manager on this
          // form so they can see it and retry the LINE id, rather than
          // silently losing the failure the moment the popup navigates
          // away.
          setError(describeWriteError(lineResult));
          return;
        }
      }
      onSuccess();
    });
  }

  return (
    <form id={formId} onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PendingOverlay visible={isPending} message={t('saving')} />
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldName')}</span>
        <input style={input} name="name" defaultValue={employee?.name ?? ''} maxLength={120} required />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldFamilyName')}</span>
          <input style={input} name="familyName" defaultValue={employee?.familyName ?? ''} maxLength={80} required />
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldGivenName')}</span>
          <input style={input} name="givenName" defaultValue={employee?.givenName ?? ''} maxLength={80} required />
        </label>
      </div>
      {isLineLinked ? (
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldEmail')}</span>
          <input style={input} type="email" name="email" defaultValue={employee?.email ?? ''} maxLength={254} required />
        </label>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldEmail')}</span>
            <input style={input} type="email" name="email" defaultValue={employee?.email ?? ''} maxLength={254} required />
          </label>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldLineUserId')}</span>
            <input style={input} name="rawLineUserId" placeholder={t('lineUserIdPlaceholder')} maxLength={128} />
          </label>
        </div>
      )}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('fieldPosition')}</span>
        <input style={input} name="positionLabel" defaultValue={employee?.positionLabel ?? ''} maxLength={60} />
      </label>
      {/* Employment type: temporarily removed from the visible form (Founder direction); hidden so editing/saving other fields never wipes an existing value. */}
      <input type="hidden" name="employmentType" defaultValue={employee?.employmentType ?? ''} />
    </form>
  );
}
