'use client';

/**
 * Error boundary for the protected route group: the same JA/EN screen as the
 * app-wide boundary (retry + back to the start page, which routes a signed-in
 * user to their workspace), so a failure is never a dead end. Logs the real
 * error for developers; users only see the generic message.
 */
export { default } from '../error';
