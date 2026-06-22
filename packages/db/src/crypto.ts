import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * PII protection utilities (SERVER-ONLY).
 *
 * - `encryptPII` / `decryptPII`: AES-256-GCM authenticated encryption. The
 *   output is a self-describing buffer: [12-byte IV][16-byte tag][ciphertext].
 *   Store the buffer in a `bytea` column (e.g. email_encrypted).
 * - `blindIndex`: deterministic HMAC-SHA256 over a normalized value plus a
 *   server-side pepper, used as a searchable hash (e.g. email_hash). Equality
 *   lookups work; the raw value is never revealed.
 *
 * Keys come from the environment and must never reach the browser bundle.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(encryptionKeyBase64: string): Buffer {
  const key = Buffer.from(encryptionKeyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  return key;
}

export function encryptPII(plaintext: string, encryptionKeyBase64: string): Buffer {
  const key = getKey(encryptionKeyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptPII(blob: Buffer, encryptionKeyBase64: string): string {
  const key = getKey(encryptionKeyBase64);
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Normalize then HMAC to a hex blind index. Use the same normalization rules
 * consistently so equality lookups succeed.
 */
export function blindIndex(value: string, pepper: string, kind: 'email' | 'phone' | 'raw' = 'raw'): string {
  let normalized = value.trim();
  if (kind === 'email') {
    normalized = normalized.toLowerCase();
  } else if (kind === 'phone') {
    normalized = normalized.replace(/[^\d+]/g, '');
  }
  return createHmac('sha256', pepper).update(normalized).digest('hex');
}

/**
 * Encode a Buffer for a Postgres `bytea` column over PostgREST/supabase-js,
 * which expects the hex format `\x...`.
 */
export function bufferToBytea(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`;
}

/** Decode a `bytea` value returned by PostgREST (`\x...`) back into a Buffer. */
export function byteaToBuffer(value: string | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  return Buffer.from(hex, 'hex');
}

/** Convenience: produce both the encrypted blob and blind index together. */
export function protectSearchablePII(
  value: string,
  opts: { encryptionKey: string; pepper: string; kind?: 'email' | 'phone' | 'raw' },
): { encrypted: Buffer; hash: string } {
  return {
    encrypted: encryptPII(value, opts.encryptionKey),
    hash: blindIndex(value, opts.pepper, opts.kind ?? 'raw'),
  };
}
