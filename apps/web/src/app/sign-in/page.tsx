import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { signIn } from '@/lib/auth/actions';

/**
 * Minimal email/password sign-in page.
 *
 * Server component: the form posts directly to the `signIn` Server Action, so no
 * client JS and no Supabase client run in the browser for the submit. Already
 * authenticated visitors are sent straight to the dashboard. A generic error is
 * shown when `?error=1` is present (set by the action on bad input or failed
 * auth) — we never reveal which field was wrong or echo the auth error.
 *
 * Sign-up, password reset, OAuth/social, and LINE login are intentionally NOT
 * implemented in this phase (foundation only).
 */
export const dynamic = 'force-dynamic';

const labelStyle = { display: 'block', marginBottom: 12 } as const;
const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
} as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  const params = await searchParams;
  const hasError = Boolean(params?.error);

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 32 }}>
      <h1>Sign in</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>
        Sign in to LINE Business OS with your email and password.
      </p>

      {hasError ? (
        <p
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 14,
          }}
        >
          Invalid email or password. Please try again.
        </p>
      ) : null}

      <form action={signIn}>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </label>
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px 16px',
            background: '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Sign in
        </button>
      </form>

      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 16 }}>
        Sign-up, password reset, and social login are not available yet.
      </p>
    </main>
  );
}
