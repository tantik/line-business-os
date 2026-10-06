/**
 * Minimal transactional email sender over Resend's REST API (SERVER-ONLY).
 *
 * Plain `fetch`, no SDK dependency: one POST to `https://api.resend.com/emails`
 * is all a single-recipient transactional send needs. `RESEND_API_KEY` is read
 * from `process.env` at call time and never returned, logged, or sent anywhere
 * but Resend's own Authorization header. Same "importable by testable helpers,
 * only ever reached from `'use server'` code" convention as
 * `lib/workforce/pii-env.ts` (no `server-only` import, so unit tests can call
 * it with an injected `fetch`).
 *
 * Sender domain: `notifications.oruwa.jp` (verified in Resend 2026-10-06,
 * deliberately separate from `auth.oruwa.jp`, which Supabase Auth uses).
 *
 * Never throws. A missing key, a network error, and a non-2xx response all map
 * to a typed result -- a caller must never claim "sent" on anything but `sent`.
 * Logs carry only the HTTP status / error class, never the recipient address,
 * subject, or body (PII).
 *
 * This is the first email channel in the platform and is intentionally
 * minimal (one recipient, no queue, no retry, no audit table). A general
 * notification service is separate platform work, see
 * `lib/notifications/queue-line-notification.ts`'s doc comment.
 */

export const REMINDER_SENDER = 'ORUWA <reminders@notifications.oruwa.jp>';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  /**
   * Passed as Resend's `Idempotency-Key` header: a retry with the same key
   * within 24h is not sent twice. Callers build it from a per-action nonce,
   * not from data alone, so an intentional second reminder is still possible.
   */
  idempotencyKey: string;
}

export type SendEmailResult = { status: 'sent' } | { status: 'not_configured' } | { status: 'failed' };

export type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>;

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  deps: { fetch?: FetchLike; apiKey?: string | undefined } = {},
): Promise<SendEmailResult> {
  const apiKey = 'apiKey' in deps ? deps.apiKey : process.env.RESEND_API_KEY;
  if (!apiKey) return { status: 'not_configured' };
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));

  try {
    const response = await doFetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey,
      },
      body: JSON.stringify({
        from: REMINDER_SENDER,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return { status: 'sent' };
    console.error(`[resend-email] send failed: HTTP ${response.status}`);
    return { status: 'failed' };
  } catch (err) {
    console.error(`[resend-email] send failed: ${err instanceof Error ? err.name : 'unknown error'}`);
    return { status: 'failed' };
  }
}
