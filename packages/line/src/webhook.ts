import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * LINE webhook signature verification.
 *
 * LINE signs each webhook request with HMAC-SHA256 over the RAW request body
 * using the channel secret, base64-encoded in the `x-line-signature` header.
 *
 * SECURITY: Always verify the signature against the RAW (unparsed) body BEFORE
 * processing any event. Reject if it does not match.
 */
export function verifyLineSignature(params: {
  channelSecret: string;
  rawBody: string | Buffer;
  signature: string | undefined | null;
}): boolean {
  const { channelSecret, rawBody, signature } = params;
  if (!signature) return false;

  const expected = createHmac('sha256', channelSecret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface LineWebhookEvent {
  type: string;
  timestamp: number;
  source?: { type: string; userId?: string; groupId?: string; roomId?: string };
  replyToken?: string;
  message?: { type: string; id: string; text?: string };
  [key: string]: unknown;
}

export interface LineWebhookBody {
  destination: string;
  events: LineWebhookEvent[];
}

/**
 * Parse a verified webhook body. Call ONLY after verifyLineSignature passed.
 */
export function parseWebhookBody(rawBody: string | Buffer): LineWebhookBody {
  const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const json = JSON.parse(text) as LineWebhookBody;
  if (!json || !Array.isArray(json.events)) {
    throw new Error('Invalid LINE webhook body: missing events[]');
  }
  return json;
}
