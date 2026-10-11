'use client';

import { authInput, useAuthT } from './AuthShell';
import { mutedText } from '@/lib/ui/theme';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-rules';
import type { AuthCopyKey } from '@/lib/auth/auth-copy';

/**
 * Password + confirmation inputs with the length rule shown up front (the
 * Founder hit an unexplained browser-language "min 8 characters" bubble on
 * 2026-10-10). Validation messages come from `validateNewPassword`, in the
 * page language -- forms using this set `noValidate`.
 */
export function NewPasswordFields({ disabled, passwordLabel }: { disabled: boolean; passwordLabel: AuthCopyKey }) {
  const t = useAuthT();
  const labelText = { ...mutedText, fontSize: 13, display: 'block', marginBottom: 4 } as const;
  return (
    <>
      <label>
        <span style={labelText}>{t(passwordLabel)}</span>
        <input
          type="password"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          aria-describedby="new-password-hint"
          disabled={disabled}
          style={authInput}
        />
        <span id="new-password-hint" style={{ ...mutedText, fontSize: 12, display: 'block', marginTop: 4 }}>
          {t('passwordHint')}
        </span>
      </label>
      <label>
        <span style={labelText}>{t('confirmPassword')}</span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={disabled}
          style={authInput}
        />
      </label>
    </>
  );
}
