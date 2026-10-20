'use client';

import { useState, useTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LangProvider, useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { useDocumentTitle } from '@/lib/ui/document-title';
import { Dialog } from '@line-os/ui';
import { submitTenantProvisioning, type SubmitProvisioningResult } from '@/lib/platform/provisioning-actions';
import { isRetryableStatus, type ProvisionOutcome } from '@/lib/platform/provision-outcome';
import { DEFAULT_TIMEZONE, validateProvisioningForm, type ProvisioningField, type ProvisioningFieldError } from '@/lib/platform/provisioning-form';
import type { PlatformTenantRow } from '@/lib/platform/provisioning-list';
import {
  alertDanger,
  badgeStyle,
  buttonDisabled,
  buttonPrimary,
  buttonSecondary,
  card,
  colors,
  input,
  mutedText,
  tableCell,
  tableHeaderCell,
  type BadgeTone,
} from '@/lib/ui/theme';
import { FIELD_ERROR_KEY, FIELD_ORDER, OUTCOME_KEY, OWNER_KEY, STATUS_KEY, tTenants, type TenantsKey } from './tenants-i18n';

/** Time zones offered in the form (the validator accepts any IANA zone; Japan first). */
const TIMEZONES = ['Asia/Tokyo', 'Asia/Seoul', 'Asia/Taipei', 'Asia/Bangkok', 'UTC'] as const;

type T = (key: TenantsKey) => string;

/** Row cap of `api.platform_tenant_provisioning_list` (0135). */
const LIST_CAP = 1000;

/** Stored error codes a retry cannot fix (0134 owner invitation conflicts). */
const OPERATOR_ONLY_CODES: ReadonlySet<string> = new Set(['owner_invitation_conflict', 'owner_already_accepted']);

/** Outcomes after which nothing is reserved under the request_id, so the slug may still be edited. */
const SLUG_FREE_OUTCOMES: ReadonlySet<ProvisionOutcome['kind']> = new Set(['invalid_input', 'slug_taken', 'request_mismatch', 'not_staff', 'rate_limited']);

/** A form session: one request_id for its whole life (create, then any retries of it). */
interface FormSession {
  mode: 'create' | 'retry';
  requestId: string;
  initial: Partial<Record<ProvisioningField, string>>;
}

function newRequestId(): string {
  return crypto.randomUUID();
}

function statusTone(status: string | null): BadgeTone {
  if (status === 'ready' || status === 'invite_sent') return 'active';
  if (status === 'failed_db' || status === 'invite_failed') return 'warning';
  if (status === null) return 'inactive';
  return 'neutral';
}

function formatDateTime(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-GB', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TenantsConsole({ rows }: { rows: PlatformTenantRow[] | null }) {
  return (
    <LangProvider>
      <ConsoleBody rows={rows} />
    </LangProvider>
  );
}

function ConsoleBody({ rows }: { rows: PlatformTenantRow[] | null }) {
  const { lang } = useLang();
  const t: T = (key) => tTenants(lang, key);
  const [session, setSession] = useState<FormSession | null>(null);
  useDocumentTitle(`${t('pageTitle')} | ORUWA`);

  function openCreate() {
    setSession({ mode: 'create', requestId: newRequestId(), initial: { timezone: DEFAULT_TIMEZONE, locationName: '本店' } });
  }

  function openRetry(row: PlatformTenantRow) {
    if (!row.requestId) return;
    setSession({
      mode: 'retry',
      requestId: row.requestId,
      initial: {
        tenantSlug: row.slug,
        businessName: row.businessName ?? '',
        locationName: row.locationName ?? '',
        timezone: row.locationTimezone ?? DEFAULT_TIMEZONE,
      },
    });
  }

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 'bold' }}>{t('pageTitle')}</h1>
          <PreviewLanguageToggle />
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 14, lineHeight: 1.5 }}>{t('pageLead')}</p>
        <div style={{ marginTop: 12 }}>
          <button type="button" style={buttonPrimary} onClick={openCreate}>
            {t('createButton')}
          </button>
        </div>
      </header>

      <section style={card} aria-labelledby="tenants-list-heading">
        <h2 id="tenants-list-heading" style={{ marginTop: 0, fontSize: 16 }}>
          {t('listHeading')}
          {rows ? <span style={{ ...mutedText, fontWeight: 'normal', marginLeft: 8 }}>{rows.length}{t('listCount')}</span> : null}
        </h2>
        {rows === null ? (
          <p role="alert" style={alertDanger}>
            {t('listError')}
          </p>
        ) : rows.length === 0 ? (
          <p style={mutedText}>{t('listEmpty')}</p>
        ) : (
          <>
            {rows.length >= LIST_CAP ? <p style={{ ...mutedText, fontSize: 13 }}>{t('listCapped')}</p> : null}
            <TenantsTable rows={rows} t={t} lang={lang} onRetry={openRetry} />
          </>
        )}
      </section>

      {session ? <ProvisioningDialog key={session.requestId} session={session} t={t} onClose={() => setSession(null)} /> : null}
    </>
  );
}

function TenantsTable({ rows, t, lang, onRetry }: { rows: PlatformTenantRow[]; t: T; lang: Lang; onRetry: (row: PlatformTenantRow) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th scope="col" style={tableHeaderCell}>{t('colStore')}</th>
            <th scope="col" style={tableHeaderCell}>{t('colStatus')}</th>
            <th scope="col" style={tableHeaderCell}>{t('colOwner')}</th>
            <th scope="col" style={tableHeaderCell}>{t('colCreated')}</th>
            <th scope="col" style={tableHeaderCell}>{t('colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const statusKey = row.status ? STATUS_KEY[row.status] : undefined;
            const ownerKey = row.ownerInvitationStatus ? OWNER_KEY[row.ownerInvitationStatus] : undefined;
            // An owner-invitation conflict repeats on every retry: support case, no button.
            const retryable = row.requestId !== null && isRetryableStatus(row.status) && !OPERATOR_ONLY_CODES.has(row.errorCode ?? '');
            return (
              <tr key={row.requestId ?? row.tenantId ?? row.slug}>
                <td style={tableCell}>
                  <div style={{ fontWeight: 600 }}>
                    {row.businessName ?? '—'}
                    {row.tenantStatus === 'archived' || row.tenantStatus === 'suspended' ? (
                      <span style={{ ...badgeStyle('inactive'), marginLeft: 8 }}>{t(row.tenantStatus === 'archived' ? 'tenantArchived' : 'tenantSuspended')}</span>
                    ) : null}
                  </div>
                  <div style={{ ...mutedText, fontSize: 12.5 }}>
                    {row.slug}
                    {row.locationName ? ` · ${row.locationName}` : ''}
                  </div>
                </td>
                <td style={tableCell}>
                  {row.requestId === null ? (
                    <span style={{ ...mutedText, fontSize: 13 }}>{t('notProvisioned')}</span>
                  ) : (
                    <>
                      <span style={badgeStyle(statusTone(row.status))}>{statusKey ? t(statusKey) : (row.status ?? '—')}</span>
                      {row.errorCode ? (
                        <div style={{ ...mutedText, fontSize: 12, marginTop: 4 }}>
                          {t('errorCodeLabel')}: <code>{row.errorCode}</code>
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td style={tableCell}>{ownerKey ? t(ownerKey) : t('ownerNone')}</td>
                <td style={{ ...tableCell, whiteSpace: 'nowrap' }}>{formatDateTime(row.createdAt, lang)}</td>
                <td style={tableCell}>
                  {retryable ? (
                    <button type="button" style={buttonSecondary} onClick={() => onRetry(row)} title={t('retryHint')}>
                      {t('retry')}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fieldLabel: Record<ProvisioningField, TenantsKey> = {
  businessName: 'formBusinessName',
  tenantSlug: 'formSlug',
  locationName: 'formLocationName',
  timezone: 'formTimezone',
  ownerEmail: 'formOwnerEmail',
};

function ProvisioningDialog({ session, t, onClose }: { session: FormSession; t: T; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<ProvisioningField, string>>({
    businessName: session.initial.businessName ?? '',
    tenantSlug: session.initial.tenantSlug ?? '',
    locationName: session.initial.locationName ?? '',
    timezone: session.initial.timezone ?? DEFAULT_TIMEZONE,
    ownerEmail: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProvisioningField, ProvisioningFieldError>>>({});
  const [result, setResult] = useState<SubmitProvisioningResult | null>(null);
  const [requestId, setRequestId] = useState(session.requestId);
  const outcome: ProvisionOutcome | null = result?.status === 'done' ? result.outcome : null;
  // The slug is fixed for a retry and after any attempt that may have reserved
  // it under this request_id (a retry must send the same slug). Only refusals
  // that wrote nothing leave it editable.
  const slugLocked = session.mode === 'retry' || (outcome !== null && !SLUG_FREE_OUTCOMES.has(outcome.kind));
  const finished = outcome !== null && (outcome.kind === 'invited' || outcome.kind === 'invited_existing' || outcome.kind === 'already_done');

  function set(field: ProvisioningField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validateProvisioningForm(values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      const first = FIELD_ORDER.find((field) => checked.fieldErrors[field]);
      if (first) document.getElementById(`prov-${first}`)?.focus();
      return;
    }
    setFieldErrors({});
    const formData = new FormData();
    for (const [key, value] of Object.entries(checked.value)) formData.set(key, value);
    formData.set('requestId', requestId);
    startTransition(async () => {
      const next = await submitTenantProvisioning(formData);
      setResult(next);
      if (next.status === 'invalid') setFieldErrors(next.fieldErrors);
      // That id is bound to another slug: the next attempt is a new request.
      setRequestId(next.status === 'done' && next.outcome.needsNewRequest ? newRequestId() : next.requestId);
      router.refresh();
    });
  }

  const resultMessage: TenantsKey | null =
    result === null
      ? null
      : result.status === 'done'
        ? OUTCOME_KEY[result.outcome.kind]
        : result.status === 'invalid'
          ? 'outInvalidInput'
          : result.status === 'session_expired'
            ? 'outSessionExpired'
            : 'outUnauthorized';
  const resultIsSuccess = finished;

  return (
    <Dialog open onClose={onClose} title={t(session.mode === 'retry' ? 'formTitleRetry' : 'formTitleCreate')} size="form" closeLabel={t('formClose')} dismissible={!isPending}>
      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {resultMessage ? (
          <div
            role={resultIsSuccess ? 'status' : 'alert'}
            style={
              resultIsSuccess
                ? { border: `1px solid ${colors.success}`, background: colors.successMuted, color: colors.textPrimary, borderRadius: 8, padding: '8px 12px', fontSize: 14 }
                : alertDanger
            }
          >
            <div>{t(resultMessage)}</div>
            {outcome?.errorCode ? (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {t('errorCodeLabel')}: <code>{outcome.errorCode}</code>
              </div>
            ) : null}
          </div>
        ) : null}

        {(['businessName', 'tenantSlug', 'locationName'] as const).map((field) => (
          <Field key={field} field={field} t={t} error={fieldErrors[field]}>
            <input
              id={`prov-${field}`}
              name={field}
              value={values[field]}
              onChange={(e) => set(field, e.target.value)}
              disabled={isPending || finished || (field === 'tenantSlug' && slugLocked)}
              autoComplete="off"
              autoCapitalize={field === 'tenantSlug' ? 'none' : undefined}
              spellCheck={field === 'tenantSlug' ? false : undefined}
              aria-invalid={fieldErrors[field] ? true : undefined}
              aria-describedby={fieldErrors[field] ? `prov-${field}-error` : field === 'tenantSlug' ? `prov-${field}-hint` : undefined}
              style={{ ...input, fontSize: 16 }}
            />
            {field === 'tenantSlug' ? (
              <p id={`prov-${field}-hint`} style={{ ...mutedText, fontSize: 12.5, margin: '4px 0 0' }}>
                {t('formSlugHint')}
              </p>
            ) : null}
          </Field>
        ))}

        <Field field="timezone" t={t} error={fieldErrors.timezone}>
          <select
            id="prov-timezone"
            name="timezone"
            value={values.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            disabled={isPending || finished}
            aria-invalid={fieldErrors.timezone ? true : undefined}
            aria-describedby={fieldErrors.timezone ? 'prov-timezone-error' : undefined}
            style={{ ...input, fontSize: 16 }}
          >
            {(TIMEZONES as readonly string[]).includes(values.timezone) ? null : <option value={values.timezone}>{values.timezone}</option>}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field field="ownerEmail" t={t} error={fieldErrors.ownerEmail}>
          <input
            id="prov-ownerEmail"
            name="ownerEmail"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={values.ownerEmail}
            onChange={(e) => set('ownerEmail', e.target.value)}
            disabled={isPending || finished}
            aria-invalid={fieldErrors.ownerEmail ? true : undefined}
            aria-describedby={fieldErrors.ownerEmail ? 'prov-ownerEmail-error' : 'prov-ownerEmail-hint'}
            style={{ ...input, fontSize: 16 }}
          />
          <p id="prov-ownerEmail-hint" style={{ ...mutedText, fontSize: 12.5, margin: '4px 0 0' }}>
            {t(session.mode === 'retry' ? 'formRetryEmailHint' : 'formOwnerEmailHint')}
          </p>
        </Field>

        {session.mode === 'retry' && !session.initial.businessName ? (
          <p style={{ ...mutedText, fontSize: 12.5, margin: 0 }}>{t('formRetryNamesHint')}</p>
        ) : null}

        <p style={{ ...mutedText, fontSize: 12, margin: 0 }}>
          {t('requestIdLabel')}: <code>{requestId}</code>
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" style={isPending ? buttonDisabled : buttonSecondary} onClick={onClose} disabled={isPending}>
            {t(finished ? 'formClose' : 'formCancel')}
          </button>
          {finished ? null : (
            <button type="submit" disabled={isPending} aria-busy={isPending} style={isPending ? buttonDisabled : buttonPrimary}>
              {isPending ? t('formSubmitting') : t(session.mode === 'retry' || result !== null ? 'formSubmitRetry' : 'formSubmit')}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function Field({ field, t, error, children }: { field: ProvisioningField; t: T; error?: ProvisioningFieldError; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={`prov-${field}`} style={{ fontSize: 14, fontWeight: 600 }}>
        {t(fieldLabel[field])}
      </label>
      {children}
      {error ? (
        <p id={`prov-${field}-error`} role="alert" style={{ color: colors.dangerText, fontSize: 13, margin: '4px 0 0' }}>
          {t(FIELD_ERROR_KEY[error])}
        </p>
      ) : null}
    </div>
  );
}
