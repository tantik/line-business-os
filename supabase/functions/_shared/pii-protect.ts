// ============================================================================
// _shared/pii-protect.ts -- encrypt + blind-index PII inside an Edge Function
// ----------------------------------------------------------------------------
// Web Crypto twin of packages/db/src/crypto.ts (`encryptPII` + `blindIndex`),
// for the provision-tenant function, which stores the Owner's email in
// core.users (rule 6: encrypted + searchable hash, never plaintext):
//   * AES-256-GCM, output [12-byte IV][16-byte tag][ciphertext] -- the exact
//     layout `decryptPII` (Node) and invite-employee's Web Crypto decrypt read.
//     Web Crypto returns ciphertext||tag, so the tag is moved in front here.
//   * HMAC-SHA256 hex over the normalized value with PII_HASH_PEPPER
//     (email: trim + lowercase), same as `blindIndex(value, pepper, 'email')`.
// Compatibility is proven by pii-protect.test.ts against the Node module.
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports; `globalThis.crypto`
// exists in Deno and Node >= 20. Never logs or returns the plaintext.
// ============================================================================

const IV_BYTES = 12;
const TAG_BYTES = 16;

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** AES-256-GCM encrypt to the [IV][tag][ciphertext] layout of packages/db/src/crypto.ts. */
export async function encryptPII(plaintext: string, encryptionKeyBase64: string): Promise<Uint8Array> {
  const keyBytes = base64ToBytes(encryptionKeyBase64);
  if (keyBytes.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const ciphertext = sealed.slice(0, sealed.length - TAG_BYTES);
  const tag = sealed.slice(sealed.length - TAG_BYTES);
  const out = new Uint8Array(IV_BYTES + TAG_BYTES + ciphertext.length);
  out.set(iv, 0);
  out.set(tag, IV_BYTES);
  out.set(ciphertext, IV_BYTES + TAG_BYTES);
  return out;
}

/** HMAC-SHA256 hex blind index of a normalized email (trim + lowercase). */
export async function blindIndexEmail(email: string, pepperUtf8: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepperUtf8), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalized));
  return toHex(new Uint8Array(signature));
}

/** PostgREST / supabase-js `bytea` text form (`\x...`). */
export function bytesToBytea(bytes: Uint8Array): string {
  return `\\x${toHex(bytes)}`;
}

/** Encrypted blob (as bytea text) + blind index of an email, ready for the RPC. */
export async function protectEmail(
  email: string,
  opts: { encryptionKey: string; pepper: string },
): Promise<{ emailEncryptedBytea: string; emailHash: string }> {
  return {
    emailEncryptedBytea: bytesToBytea(await encryptPII(email.trim().toLowerCase(), opts.encryptionKey)),
    emailHash: await blindIndexEmail(email, opts.pepper),
  };
}
