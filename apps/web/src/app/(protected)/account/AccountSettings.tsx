'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { changePassword, signOutOtherSessions } from '@/lib/auth/actions';
import { AuthLink, authInput, useAuthT } from '@/components/auth/AuthShell';
import { NewPasswordFields } from '@/components/auth/NewPasswordFields';
import { validateNewPassword } from '@/lib/auth/password-rules';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';

const ERROR_COPY: Record<string, AuthCopyKey> = {
  wrong_current: 'wrongCurrentPassword',
  too_short: 'passwordTooShort',
  same_password: 'passwordSameAsOld',
  weak_password: 'passwordWeak',
  not_authenticated: 'genericError',
  error: 'genericError',
};

const successText = { color: colors.success, fontSize: 14, margin: 0 } as const;
const sectionStyle = { borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginTop: 16 } as const;

export function AccountSettings({ email, backHref }: { email: string; backHref: string }) {
  const t = useAuthT();
  const [isPending, startTransition] = useTransition();
  const [pwError, setPwError] = useState<AuthCopyKey | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [sessionsState, setSessionsState] = useState<'idle' | 'done' | 'error'>('idle');

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwError(null);
    setPwDone(false);
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (!String(formData.get('currentPassword') ?? '')) {
      setPwError('wrongCurrentPassword');
      return;
    }
    const problem = validateNewPassword(String(formData.get('password') ?? ''), String(formData.get('confirmPassword') ?? ''));
    if (problem) {
      setPwError(problem);
      return;
    }
    startTransition(async () => {
      const result = await changePassword(formData);
      if (result.status === 'success') {
        setPwDone(true);
        form.reset();
      } else {
        setPwError(ERROR_COPY[result.status] ?? 'genericError');
      }
    });
  }

  function handleSignOutOthers() {
    setSessionsState('idle');
    startTransition(async () => {
      const result = await signOutOtherSessions();
      setSessionsState(result.status === 'success' ? 'done' : 'error');
    });
  }

  return (
    <>
      <dl style={{ margin: 0 }}>
        <dt style={{ ...mutedText, fontSize: 13 }}>{t('accountEmail')}</dt>
        <dd style={{ margin: '2px 0 0', fontWeight: 600, overflowWrap: 'anywhere' }}>{email}</dd>
      </dl>

      <section style={sectionStyle} aria-labelledby="pw-heading">
        <h2 id="pw-heading" style={{ fontSize: 16, margin: '0 0 12px' }}>
          {t('accountPasswordHeading')}
        </h2>
        <form onSubmit={handlePasswordSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pwError ? (
            <p role="alert" style={alertDanger}>
              {t(pwError)}
            </p>
          ) : null}
          {pwDone ? (
            <p role="status" style={successText}>
              {t('passwordChangedInline')}
            </p>
          ) : null}
          <label>
            <span style={{ ...mutedText, fontSize: 13, display: 'block', marginBottom: 4 }}>{t('currentPassword')}</span>
            <input type="password" name="currentPassword" required autoComplete="current-password" disabled={isPending} style={authInput} />
          </label>
          <NewPasswordFields disabled={isPending} passwordLabel="newPassword" />
          <button type="submit" disabled={isPending} style={{ ...(isPending ? buttonDisabled : buttonPrimary), width: '100%' }}>
            {isPending ? t('resetSaving') : t('changePasswordButton')}
          </button>
        </form>
      </section>

      <section style={sectionStyle} aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" style={{ fontSize: 16, margin: '0 0 8px' }}>
          {t('sessionsHeading')}
        </h2>
        <p style={{ ...mutedText, fontSize: 13, marginTop: 0 }}>{t('sessionsBody')}</p>
        <button type="button" onClick={handleSignOutOthers} disabled={isPending} style={{ ...(isPending ? buttonDisabled : buttonSecondary), width: '100%' }}>
          {t('signOutOthersButton')}
        </button>
        {sessionsState === 'done' ? (
          <p role="status" style={{ ...successText, marginTop: 8 }}>
            {t('signOutOthersDone')}
          </p>
        ) : null}
        {sessionsState === 'error' ? (
          <p role="alert" style={{ ...alertDanger, marginTop: 8 }}>
            {t('genericError')}
          </p>
        ) : null}
      </section>

      <div style={{ ...sectionStyle, textAlign: 'center' }}>
        <AuthLink href={backHref} k="backToApp" />
      </div>
    </>
  );
}
