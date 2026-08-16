import { signOut } from '@/lib/auth/actions';
import { buttonSecondary } from '@/lib/ui/theme';

/** Shared sign-out control, reused by every canonical (protected) page header. */
export function SignOutButton() {
  return (
    <form action={signOut} style={{ display: 'inline-block', marginLeft: 12 }}>
      <button type="submit" style={buttonSecondary}>
        Sign out
      </button>
    </form>
  );
}
