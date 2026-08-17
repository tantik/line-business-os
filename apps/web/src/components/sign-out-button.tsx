import { signOut } from '@/lib/auth/actions';
import { buttonSecondary } from '@/lib/ui/theme';

/**
 * Sign-out control shared by every authenticated top-level page (Dashboard,
 * Manager, Staff). Posts to the `signOut` Server Action -- no client JS
 * needed. Cafe v2.1 QA audit P2-7: `/manager` and `/staff` previously had no
 * way to end the session without navigating to the unrelated `/dashboard`
 * technical shell, a real risk on a shared cafe device.
 */
export function SignOutButton({ label = 'Sign out' }: { label?: string }) {
  return (
    <form action={signOut}>
      <button type="submit" style={buttonSecondary}>
        {label}
      </button>
    </form>
  );
}
