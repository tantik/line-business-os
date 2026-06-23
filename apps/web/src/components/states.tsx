import type { ReactNode } from 'react';

/**
 * Minimal, reusable "safe state" components for authenticated/tenant-aware
 * routes. Foundation only — no product logic. They present consistent
 * loading / error / unauthorized / no-membership / missing-config UI and never
 * expose internal error details to the user.
 */

function StateShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function LoadingState() {
  return (
    <StateShell title="Loading…">
      <p style={{ color: '#6b7280' }}>Preparing your workspace.</p>
    </StateShell>
  );
}

export function ErrorState({ message }: { message?: string }) {
  // Intentionally generic: do not surface raw internal error text to users.
  return (
    <StateShell title="Something went wrong">
      <p style={{ color: '#6b7280' }}>
        {message ?? 'An unexpected error occurred. Please try again.'}
      </p>
    </StateShell>
  );
}

export function UnauthorizedState() {
  return (
    <StateShell title="Access denied">
      <p style={{ color: '#6b7280' }}>You do not have access to this resource.</p>
    </StateShell>
  );
}

export function NoTenantState() {
  return (
    <StateShell title="No workspace yet">
      <p style={{ color: '#6b7280' }}>
        Your account is not a member of any tenant. Ask an administrator for an invitation.
      </p>
    </StateShell>
  );
}

export function MissingConfigState() {
  return (
    <StateShell title="Configuration required">
      <p style={{ color: '#6b7280' }}>
        The application is missing required Supabase configuration. Set{' '}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see{' '}
        <code>.env.example</code>).
      </p>
    </StateShell>
  );
}
