/**
 * Pure, framework-agnostic parsing/validation for the sign-in form payload.
 *
 * Kept out of the `'use server'` actions module (which may only export async
 * server actions) so the validation logic stays synchronous and unit-testable
 * with a plain stubbed `FormData`. No Supabase, no secrets, no side effects.
 */
export interface Credentials {
  email: string;
  password: string;
}

/**
 * Extract trimmed email + password from a submitted form. Returns `null` when
 * either field is missing or empty so the caller can fail closed with a generic
 * error (we never reveal which field was wrong). The raw values are never
 * logged.
 */
export function parseCredentials(formData: FormData): Credentials | null {
  const emailRaw = formData.get('email');
  const passwordRaw = formData.get('password');

  if (typeof emailRaw !== 'string' || typeof passwordRaw !== 'string') return null;

  const email = emailRaw.trim();
  const password = passwordRaw;

  if (email.length === 0 || password.length === 0) return null;

  return { email, password };
}
