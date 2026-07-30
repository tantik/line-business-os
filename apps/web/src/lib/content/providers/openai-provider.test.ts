import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OpenAIContentTranslationProvider } from './openai-provider.js';

function chatCompletion(translations: string[]) {
  return {
    choices: [{ message: { content: JSON.stringify({ translations }) } }],
  };
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

test('translateBatch returns translations in order on a 200 response', async () => {
  const fetchImpl = fakeFetchReturning(200, chatCompletion(['Matcha latte', 'Milk 200ml']));
  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });

  const result = await provider.translateBatch({ texts: ['抹茶ラテ', '牛乳200ml'], sourceLang: 'ja', targetLang: 'en' });

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['Matcha latte', 'Milk 200ml']);
});

test('translateBatch never calls fetch for an empty text list', async () => {
  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatMustNotRun() });
  const result = await provider.translateBatch({ texts: [], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: true, translations: [] });
});

test('translateBatch sends a JSON chat-completions request with the bearer auth header, source texts, and json_object response format', async () => {
  let capturedInit: RequestInit | undefined;
  let capturedUrl: string | undefined;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify(chatCompletion(['Matcha latte'])), { status: 200 });
  }) as unknown as typeof fetch;

  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  await provider.translateBatch({ texts: ['抹茶ラテ'], sourceLang: 'ja', targetLang: 'en' });

  assert.equal(capturedUrl, 'https://api.openai.com/v1/chat/completions');
  assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, 'Bearer fake-key');
  const body = JSON.parse(capturedInit?.body as string);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.model, 'gpt-4o-mini');
  const userMessage = body.messages.find((m: { role: string }) => m.role === 'user');
  const userPayload = JSON.parse(userMessage.content);
  assert.deepEqual(userPayload.texts, ['抹茶ラテ']);
  assert.equal(userPayload.sourceLang, 'ja');
  assert.equal(userPayload.targetLang, 'en');
});

test('an explicit model option overrides the default', async () => {
  let capturedBody: string | undefined;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify(chatCompletion(['x'])), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', model: 'gpt-4.1-mini', fetchImpl });
  await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(JSON.parse(capturedBody!).model, 'gpt-4.1-mini');
});

test('translateBatch maps a network failure/timeout to translation_provider_unavailable', async () => {
  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatThrows('AbortError') });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

for (const status of [401, 403, 429]) {
  test(`translateBatch maps HTTP ${status} to translation_quota_exceeded`, async () => {
    const provider = new OpenAIContentTranslationProvider({
      apiKey: 'fake-key',
      fetchImpl: fakeFetchReturning(status, { error: { message: 'quota or auth' } }),
    });
    const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
    assert.deepEqual(result, { ok: false, error: { code: 'translation_quota_exceeded' } });
  });
}

test('translateBatch maps a 5xx response to translation_provider_unavailable', async () => {
  const provider = new OpenAIContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(503, { error: { message: 'down' } }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

test('translateBatch maps a malformed JSON HTTP body to translation_invalid_response', async () => {
  const fetchImpl = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a malformed (non-JSON) message content to translation_invalid_response', async () => {
  const fetchImpl = fakeFetchReturning(200, { choices: [{ message: { content: 'not a json object' } }] });
  const provider = new OpenAIContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a translations array shorter than the request to translation_invalid_response', async () => {
  const provider = new OpenAIContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, chatCompletion(['only one'])),
  });
  const result = await provider.translateBatch({ texts: ['a', 'b'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a translations array longer than the request (extra invented entries) to translation_invalid_response', async () => {
  const provider = new OpenAIContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, chatCompletion(['a', 'b', 'extra'])),
  });
  const result = await provider.translateBatch({ texts: ['a', 'b'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch rejects an empty-string translation entry', async () => {
  const provider = new OpenAIContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, chatCompletion([''])),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a missing "choices" key to translation_invalid_response', async () => {
  const provider = new OpenAIContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, { unexpected: true }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

// -- source scan: no secret/full-content logging -----------------------------

test('openai-provider.ts never logs', () => {
  const source = readFileSync(new URL('./openai-provider.ts', import.meta.url), 'utf8');
  assert.ok(!/console\.(log|error|warn|info|debug)/.test(source), 'must never log anything (status/error tags are returned, not logged)');
  // The only place `this.apiKey` may be interpolated is the Authorization header itself.
  const apiKeyUsages = [...source.matchAll(/\$\{this\.apiKey\}/g)];
  assert.equal(apiKeyUsages.length, 1);
  assert.ok(source.includes('Authorization: `Bearer ${this.apiKey}`'));
});
