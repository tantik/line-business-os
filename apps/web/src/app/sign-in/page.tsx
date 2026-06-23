/**
 * Sign-in route placeholder.
 *
 * Foundation only: `requireUser` redirects unauthenticated requests here. The
 * actual sign-in UI/flow (Supabase Auth email/OAuth/LINE) is intentionally NOT
 * implemented in Phase 1C — this page just gives the redirect a safe landing
 * spot instead of a 404.
 */
export default function SignInPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
      <h1>Sign in</h1>
      <p style={{ color: '#6b7280' }}>
        Authentication is wired through Supabase Auth (anon key + RLS). The sign-in experience is a
        later phase; this is a foundation placeholder.
      </p>
    </main>
  );
}
