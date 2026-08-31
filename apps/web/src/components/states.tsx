import type { ReactNode } from 'react';
import { mutedText, pageStyle } from '@/lib/ui/theme';

/**
 * Minimal, reusable "safe state" components for authenticated/tenant-aware
 * routes. Foundation only — no product logic. They present consistent
 * loading / error / unauthorized / no-membership / missing-config UI and never
 * expose internal error details to the user.
 */

function StateShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main style={pageStyle(720)}>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function LoadingState() {
  return (
    <StateShell title="Loading…">
      <p style={mutedText}>Preparing your workspace.</p>
    </StateShell>
  );
}

export function ErrorState({ message }: { message?: string }) {
  // Intentionally generic: do not surface raw internal error text to users.
  return (
    <StateShell title="Something went wrong">
      <p style={mutedText}>{message ?? 'An unexpected error occurred. Please try again.'}</p>
    </StateShell>
  );
}

export function UnauthorizedState() {
  return (
    <StateShell title="Access denied">
      <p style={mutedText}>You do not have access to this resource.</p>
    </StateShell>
  );
}

export function NoTenantState() {
  return (
    <StateShell title="No workspace yet">
      <p style={mutedText}>
        Your account is not a member of any tenant. Ask an administrator for an invitation.
      </p>
    </StateShell>
  );
}

export function MissingConfigState() {
  return (
    <StateShell title="Configuration required">
      <p style={mutedText}>
        The application is missing required Supabase configuration. Set{' '}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> and either{' '}
        <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (preferred) or{' '}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>).
      </p>
    </StateShell>
  );
}

export function NotFoundState() {
  return (
    <StateShell title="Not found">
      <p style={mutedText}>
        The item you are looking for does not exist or is not available to you.
      </p>
    </StateShell>
  );
}

export function ModuleUnavailableState() {
  return (
    <StateShell title="Feature unavailable">
      <p style={mutedText}>
        This feature is not enabled for your workspace. Ask an administrator to enable it.
      </p>
    </StateShell>
  );
}
