/** Shared (client + server) new-password rules. Pure; no Supabase. */
export const MIN_PASSWORD_LENGTH = 8;

export type NewPasswordProblem = 'passwordTooShort' | 'passwordMismatch';

/** Returns the copy key of the first problem, or null when the pair is acceptable. */
export function validateNewPassword(password: string, confirm: string): NewPasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'passwordTooShort';
  if (password !== confirm) return 'passwordMismatch';
  return null;
}
