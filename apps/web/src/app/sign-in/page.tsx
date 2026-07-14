import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { signIn } from '@/lib/auth/actions';
import { sanitizePreviewReturnTo } from '@/lib/preview/return-to';
import { alertDanger, buttonPrimary, input as inputStyle, mutedText, pageStyle } from '@/lib/ui/theme';

/**
 * Minimal email/password sign-in page.
 *
 * Server component: the form posts directly to the `signIn` Server Action, so no
 * client JS and no Supabase client run in the browser for the submit. Already
 * authenticated visitors are sent straight to the dashboard. A generic error is
 * shown when `?error=1` is present (set by the action on bad input or failed
 * auth) - we never reveal which field was wrong or echo the auth error.
 *
 * Sign-up, password reset, OAuth/social, and LINE login are intentionally NOT
 * implemented in this phase (foundation only).
 */
export const dynamic = 'force-dynamic';

const labelStyle = { display: 'block', marginBottom: 12 } as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const safeReturnTo = sanitizePreviewReturnTo(params?.returnTo);

  const user = await getCurrentUser();
  if (user) redirect(safeReturnTo ?? '/dashboard');

  const hasError = Boolean(params?.error);

  return (
    <main style={pageStyle(420)}>
      <h1>Sign in</h1>
      <p style={{ ...mutedText, marginTop: 0 }}>
        Sign in to LINE Business OS with your email and password.
      </p>

      {hasError ? (
        <p role="alert" style={alertDanger}>
          Invalid email or password. Please try again.
        </p>
      ) : null}

      <form action={signIn}>
        {safeReturnTo ? <input type="hidden" name="returnTo" value={safeReturnTo} /> : null}
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
        <button type="submit" style={{ ...buttonPrimary, width: '100%' }}>
          Sign in
        </button>
      </form>

      <p style={{ ...mutedText, fontSize: 13, marginTop: 16 }}>
        Sign-up, password reset, and social login are not available yet.
      </p>
    </main>
  );
}
