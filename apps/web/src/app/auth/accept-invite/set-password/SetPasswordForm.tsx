'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setPasswordAndAcceptInvitation } from '@/lib/workforce/invitation-actions';
import { alertDanger, buttonDisabled, buttonPrimary, input as inputStyle, mutedText } from '@/lib/ui/theme';

const MIN_PASSWORD_LENGTH = 8;

// Fixed JA copy per status -- never pass through the underlying result's
// `message` (written in English internally, e.g. by the shared pg-error
// mapper or the action's own guard clauses).
function describeError(result: { status: string }): string {
  switch (result.status) {
    case 'not_found':
      return 'この招待は無効か、すでに使用されています。マネージャーに再送を依頼してください。';
    case 'unauthorized':
      return 'この招待を受け入れる権限がありません。招待の有効期限が切れている可能性があります。';
    default:
      return 'エラーが発生しました。もう一度お試しください。';
  }
}

export function SetPasswordForm({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirmPassword') ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`);
      return;
    }
    if (password !== confirm) {
      setError('パスワードが一致しません。');
      return;
    }
    formData.set('invitationId', invitationId);

    startTransition(async () => {
      const result = await setPasswordAndAcceptInvitation(formData);
      if (result.status === 'success') {
        router.push('/staff');
      } else {
        setError(describeError(result));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
      {error ? (
        <p role="alert" style={alertDanger}>
          {error}
        </p>
      ) : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13, display: 'block', marginBottom: 4 }}>パスワード</span>
        <input
          type="password"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={isPending}
          style={inputStyle}
        />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13, display: 'block', marginBottom: 4 }}>パスワード（確認）</span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={isPending}
          style={inputStyle}
        />
      </label>
      <button type="submit" disabled={isPending} style={{ ...(isPending ? buttonDisabled : buttonPrimary), width: '100%' }}>
        {isPending ? '設定中…' : 'パスワードを設定してはじめる'}
      </button>
    </form>
  );
}
