import type {
  ContentTranslationProvider,
  ContentTranslationProviderError,
  TranslateBatchInput,
  TranslateBatchResult,
} from '../translation-provider';

/**
 * OpenAI Chat Completions implementation of `ContentTranslationProvider`.
 * Mirrors `deepl-provider.ts`'s structure and logging discipline (never logs
 * recipe text, the API key, or the raw response body -- only HTTP status and
 * the mapped `ContentTranslationErrorCode`), but does NOT copy DeepL-specific
 * assumptions: there is no `:fx`-suffix endpoint split, and the wire format
 * is a single JSON chat request/response rather than form-encoded
 * `text[]`/`source_lang`/`target_lang`.
 *
 * No official `openai` SDK dependency is added -- like DeepL, this repo talks
 * to the provider with plain `fetch`, matching the existing minimal-
 * dependency convention rather than introducing a new package for one HTTP
 * call shape.
 *
 * This module must never be reachable from a `'use client'` file -- verified
 * by the same repo-wide scan test that covers `deepl-provider.ts`
 * (`deepl-provider.test.ts`).
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MODEL = 'gpt-4o-mini';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = [
  'You translate short Japanese food/beverage-recipe text fields into clear, natural English for a cafe staff app.',
  'Rules:',
  '- Preserve quantities, units, temperatures, timing, and numbered steps EXACTLY as given -- never convert units or round numbers.',
  '- Do not add ingredients, steps, or safety warnings that are not in the source text.',
  '- Do not remove any safety warning present in the source text.',
  '- Preserve the order and count of the input list exactly -- one output string per input string, in the same order.',
  '- Return ONLY the JSON object described below -- no markdown, no commentary, no extra keys.',
  'Respond with a single JSON object of the exact shape: {"translations": string[]}',
  'where translations.length equals the number of input texts.',
].join('\n');

function mapStatusToError(status: number): ContentTranslationProviderError {
  // 401 (bad key) and 429 (rate limit / quota) both surface as a
  // quota/entitlement problem to the caller -- neither is something an
  // immediate retry fixes.
  if (status === 401 || status === 403 || status === 429) {
    return { code: 'translation_quota_exceeded' };
  }
  return { code: 'translation_provider_unavailable' };
}

function extractTranslations(payload: unknown, expectedCount: number): string[] | null {
  if (typeof payload !== 'object' || payload === null || !('choices' in payload)) return null;
  const choices = (payload as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  if (typeof content !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || !('translations' in parsed)) return null;
  const translations = (parsed as { translations: unknown }).translations;
  if (!Array.isArray(translations) || translations.length !== expectedCount) return null;

  const texts: string[] = [];
  for (const entry of translations) {
    if (typeof entry !== 'string' || entry.trim().length === 0) return null;
    texts.push(entry);
  }
  return texts;
}

export class OpenAIContentTranslationProvider implements ContentTranslationProvider {
  readonly providerId = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: {
    apiKey: string;
    model?: string | null;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async translateBatch(input: TranslateBatchInput): Promise<TranslateBatchResult> {
    if (input.texts.length === 0) return { ok: true, translations: [] };

    const userPayload = JSON.stringify({
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      texts: input.texts,
    });

    const requestBody = JSON.stringify({
      model: this.model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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
