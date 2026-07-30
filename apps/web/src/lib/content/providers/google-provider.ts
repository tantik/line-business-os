import type {
  ContentTranslationProvider,
  ContentTranslationProviderError,
  TranslateBatchInput,
  TranslateBatchResult,
} from '../translation-provider';

/**
 * Google Cloud Translation API (Basic, v2) implementation of
 * `ContentTranslationProvider`. Mirrors `deepl-provider.ts`/`openai-provider.ts`'s
 * structure and logging discipline (never logs recipe text, the API key, or
 * the raw response body -- only HTTP status and the mapped
 * `ContentTranslationErrorCode`), but does NOT copy either sibling's
 * request/response shape: Google Basic v2 expects a single JSON body with a
 * `q` array plus `source`/`target`/`format`, and returns
 * `{ data: { translations: [{ translatedText: string }] } }`, one entry per
 * input, in the same order.
 *
 * No official Google Cloud SDK dependency is added -- like DeepL/OpenAI,
 * this repo talks to the provider with plain `fetch`, matching the existing
 * minimal-dependency convention rather than introducing a new package for
 * one HTTP call shape. Authentication is the API key sent via the
 * `x-goog-api-key` header rather than as a URL query parameter, so the key
 * never appears in a URL that could end up in access logs.
 *
 * Google Basic v2 can return HTML-entity-encoded text even with
 * `format: 'text'` (documented quirk) -- `decodeHtmlEntities` below is a
 * small, dependency-free decoder covering the handful of entities Google
 * actually emits (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`/`&apos;`, plus
 * numeric decimal/hex entities); no new npm dependency was added solely for
 * this.
 *
 * This module must never be reachable from a `'use client'` file -- verified
 * by the same repo-wide scan test that covers `deepl-provider.ts`
 * (`deepl-provider.test.ts`).
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Dependency-free decoder for the small set of entities Google Basic v2 is known to emit. */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function mapStatusToError(status: number): ContentTranslationProviderError {
  // 401/403 (bad or unauthorized key) and 429 (rate limit / quota) all
  // surface as a quota/entitlement problem to the caller -- neither is
  // something an immediate retry fixes.
  if (status === 401 || status === 403 || status === 429) {
    return { code: 'translation_quota_exceeded' };
  }
  return { code: 'translation_provider_unavailable' };
}

function extractTranslations(payload: unknown, expectedCount: number): string[] | null {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) return null;
  const data = (payload as { data: unknown }).data;
  if (typeof data !== 'object' || data === null || !('translations' in data)) return null;

  const translations = (data as { translations: unknown }).translations;
  if (!Array.isArray(translations) || translations.length !== expectedCount) return null;

  const texts: string[] = [];
  for (const entry of translations) {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { translatedText?: unknown }).translatedText !== 'string') {
      return null;
    }
    const decoded = decodeHtmlEntities((entry as { translatedText: string }).translatedText);
    if (decoded.trim().length === 0) return null;
    texts.push(decoded);
  }
  return texts;
}

export class GoogleContentTranslationProvider implements ContentTranslationProvider {
  readonly providerId = 'google';

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translateBatch(input: TranslateBatchInput): Promise<TranslateBatchResult> {
    if (input.texts.length === 0) return { ok: true, translations: [] };

    const requestBody = JSON.stringify({
      q: input.texts,
      source: input.sourceLang,
      target: input.targetLang,
      format: 'text',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal: controller.signal,
      });
    } catch {
      // Covers both AbortError (timeout) and network failure -- neither
      // exposes a status code, so both map to "provider unavailable".
      return { ok: false, error: { code: 'translation_provider_unavailable' } };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { ok: false, error: mapStatusToError(response.status) };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: { code: 'translation_invalid_response' } };
    }

    const translations = extractTranslations(payload, input.texts.length);
    if (!translations) {
      return { ok: false, error: { code: 'translation_invalid_response' } };
    }

    return { ok: true, translations };
  }
}
