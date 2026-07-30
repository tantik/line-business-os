import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GoogleContentTranslationProvider } from './google-provider.js';

function googleResponse(translatedTexts: string[]) {
  return { data: { translations: translatedTexts.map((translatedText) => ({ translatedText })) } };
}

function fakeFetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function fakeFetchThatThrows(name: string): typeof fetch {
  return (async () => {
    const err = new Error(name);
    err.name = name;
    throw err;
  }) as unknown as typeof fetch;
}

function fakeFetchThatMustNotRun(): typeof fetch {
  return (async () => {
    throw new Error('fetch must not be called');
  }) as unknown as typeof fetch;
}

test('translateBatch returns translations in order on a 200 response (JA->EN)', async () => {
  const fetchImpl = fakeFetchReturning(200, googleResponse(['Matcha latte', 'Milk 200ml']));
  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });

  const result = await provider.translateBatch({ texts: ['抹茶ラテ', '牛乳200ml'], sourceLang: 'ja', targetLang: 'en' });

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['Matcha latte', 'Milk 200ml']);
});

test('translateBatch never calls fetch for an empty text list', async () => {
  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatMustNotRun() });
  const result = await provider.translateBatch({ texts: [], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: true, translations: [] });
});

test('translateBatch sends a JSON request to the v2 endpoint with the API key header, source texts, and source/target/format fields', async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify(googleResponse(['Matcha latte'])), { status: 200 });
  }) as unknown as typeof fetch;

  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  await provider.translateBatch({ texts: ['抹茶ラテ'], sourceLang: 'ja', targetLang: 'en' });

  assert.equal(capturedUrl, 'https://translation.googleapis.com/language/translate/v2');
  assert.equal((capturedInit?.headers as Record<string, string>)?.['x-goog-api-key'], 'fake-key');
  assert.equal(capturedUrl?.includes('fake-key'), false, 'the API key must never appear in the URL');
  const body = JSON.parse(capturedInit?.body as string);
  assert.deepEqual(body, { q: ['抹茶ラテ'], source: 'ja', target: 'en', format: 'text' });
});

test('translateBatch preserves the exact order of a multi-item batch', async () => {
  const fetchImpl = fakeFetchReturning(200, googleResponse(['one', 'two', 'three']));
  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  const result = await provider.translateBatch({ texts: ['一', '二', '三'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['one', 'two', 'three']);
});

test('translateBatch maps a network failure/timeout to translation_provider_unavailable', async () => {
  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatThrows('AbortError') });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

test('translateBatch maps an aborted (timeout) request the same as a network failure', async () => {
  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatThrows('AbortError'), timeoutMs: 5 });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

for (const status of [401, 403, 429]) {
  test(`translateBatch maps HTTP ${status} to translation_quota_exceeded`, async () => {
    const provider = new GoogleContentTranslationProvider({
      apiKey: 'fake-key',
      fetchImpl: fakeFetchReturning(status, { error: { message: 'quota or auth' } }),
    });
    const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
    assert.deepEqual(result, { ok: false, error: { code: 'translation_quota_exceeded' } });
  });
}

test('translateBatch maps a 5xx response to translation_provider_unavailable', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(503, { error: { message: 'down' } }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

test('translateBatch maps a 400 (bad request) response to translation_provider_unavailable', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(400, { error: { message: 'invalid language code' } }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

test('translateBatch maps a malformed JSON HTTP body to translation_invalid_response', async () => {
  const fetchImpl = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
  const provider = new GoogleContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a missing "data" key to translation_invalid_response', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, { unexpected: true }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a missing "translations" array to translation_invalid_response', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, { data: { unexpected: true } }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a translations array shorter than the request to translation_invalid_response', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse(['only one'])),
  });
  const result = await provider.translateBatch({ texts: ['a', 'b'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a translations array longer than the request (extra invented entries) to translation_invalid_response', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse(['a', 'b', 'extra'])),
  });
  const result = await provider.translateBatch({ texts: ['a', 'b'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch rejects an entry with a missing translatedText field', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, { data: { translations: [{ unexpected: true }] } }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch rejects an empty-string translatedText entry', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse([''])),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch rejects a whitespace-only translatedText entry', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse(['   '])),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

// -- HTML entity decoding -----------------------------------------------------

test('translateBatch decodes named HTML entities in translatedText', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse(['Tom &amp; Jerry&#39;s &quot;Cafe&quot; &lt;Special&gt;'])),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['Tom & Jerry\'s "Cafe" <Special>']);
});

test('translateBatch decodes numeric decimal and hex HTML entities in translatedText', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse(['Caf&#233; &#x2615;'])),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['Café ☕']);
});

test('translateBatch leaves plain text without entities unchanged', async () => {
  const provider = new GoogleContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, googleResponse(['Matcha latte, 200ml'])),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['Matcha latte, 200ml']);
});

// -- source scan: no secret/full-content logging -----------------------------

test('google-provider.ts never logs', () => {
  const source = readFileSync(new URL('./google-provider.ts', import.meta.url), 'utf8');
  assert.ok(!/console\.(log|error|warn|info|debug)/.test(source), 'must never log anything (status/error tags are returned, not logged)');
  // `this.apiKey` may only appear in its own constructor assignment and the
  // request-authentication header assignment -- never anywhere else (URL, body, logs).
  const apiKeyUsages = [...source.matchAll(/this\.apiKey/g)];
  assert.equal(apiKeyUsages.length, 2);
  assert.ok(source.includes("'x-goog-api-key': this.apiKey"));
  assert.ok(!source.includes('?key='), 'the API key must never be sent as a URL query parameter');
});
