/**
 * Minimal LINE Messaging API client (push / reply).
 *
 * The access token is per-tenant (resolved from core.line_channels, decrypted
 * server-side) and passed in explicitly — this package holds no global secrets.
 */

const LINE_API = 'https://api.line.me/v2/bot';

export interface TextMessage {
  type: 'text';
  text: string;
}

export type LineMessage = TextMessage | Record<string, unknown>;

export class LineMessagingClient {
  constructor(private readonly accessToken: string) {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  /** Reply within the webhook reply-token window. */
  async reply(replyToken: string, messages: LineMessage[]): Promise<void> {
    await this.post('/message/reply', { replyToken, messages });
  }

  /** Push a message to a specific LINE user/group (decrypted id, server-side). */
  async push(to: string, messages: LineMessage[]): Promise<void> {
    await this.post('/message/push', { to, messages });
  }

  private async post(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${LINE_API}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`LINE API ${path} failed: ${res.status} ${detail}`);
    }
  }
}

export function text(message: string): TextMessage {
  return { type: 'text', text: message };
}
