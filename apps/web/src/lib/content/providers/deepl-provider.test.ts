import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeepLContentTranslationProvider } from './deepl-provider.js';

function fakeFetchReturning(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
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
  const fetchImpl = fakeFetchReturning(200, {
    translations: [{ text: 'Matcha latte' }, { text: 'Milk 200ml' }],
  });
  const provider = new DeepLContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });

  const result = await provider.translateBatch({ texts: ['抹茶ラテ', '牛乳200ml'], sourceLang: 'ja', targetLang: 'en' });

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.translations, ['Matcha latte', 'Milk 200ml']);
});

test('translateBatch never calls fetch for an empty text list', async () => {
  const provider = new DeepLContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatMustNotRun() });
  const result = await provider.translateBatch({ texts: [], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: true, translations: [] });
});

test('translateBatch sends the request as form-encoded text[]/source_lang/target_lang, with the auth header', async () => {
  let capturedInit: RequestInit | undefined;
  let capturedUrl: string | undefined;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ translations: [{ text: 'Matcha latte' }] }), { status: 200 });
  }) as unknown as typeof fetch;

  const provider = new DeepLContentTranslationProvider({ apiKey: 'fake-key:fx', fetchImpl });
  await provider.translateBatch({ texts: ['抹茶ラテ'], sourceLang: 'ja', targetLang: 'en' });

  assert.equal(capturedUrl, 'https://api-free.deepl.com/v2/translate');
  assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, 'DeepL-Auth-Key fake-key:fx');
  const parsedBody = new URLSearchParams(capturedInit?.body as string);
  assert.deepEqual(parsedBody.getAll('text'), ['抹茶ラテ']);
  assert.equal(parsedBody.get('source_lang'), 'JA');
  assert.equal(parsedBody.get('target_lang'), 'EN');
});

test('a Pro-tier key (no ":fx" suffix) resolves to the Pro endpoint', async () => {
  let capturedUrl: string | undefined;
  const fetchImpl = (async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ translations: [{ text: 'x' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = new DeepLContentTranslationProvider({ apiKey: 'fake-pro-key', fetchImpl });
  await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(capturedUrl, 'https://api.deepl.com/v2/translate');
});

test('an explicit apiUrl always wins over key-based endpoint resolution', async () => {
  let capturedUrl: string | undefined;
  const fetchImpl = (async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ translations: [{ text: 'x' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = new DeepLContentTranslationProvider({
    apiKey: 'fake-key:fx',
    apiUrl: 'https://custom.example/v2/translate',
    fetchImpl,
  });
  await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.equal(capturedUrl, 'https://custom.example/v2/translate');
});

test('translateBatch maps a network failure/timeout to translation_provider_unavailable', async () => {
  const provider = new DeepLContentTranslationProvider({ apiKey: 'fake-key', fetchImpl: fakeFetchThatThrows('AbortError') });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

for (const status of [403, 456, 429]) {
  test(`translateBatch maps HTTP ${status} to translation_quota_exceeded`, async () => {
    const provider = new DeepLContentTranslationProvider({
      apiKey: 'fake-key',
      fetchImpl: fakeFetchReturning(status, { message: 'quota' }),
    });
    const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
    assert.deepEqual(result, { ok: false, error: { code: 'translation_quota_exceeded' } });
  });
}

test('translateBatch maps a 5xx response to translation_provider_unavailable', async () => {
  const provider = new DeepLContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(503, { message: 'down' }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_provider_unavailable' } });
});

test('translateBatch maps a malformed JSON body to translation_invalid_response', async () => {
  const fetchImpl = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
  const provider = new DeepLContentTranslationProvider({ apiKey: 'fake-key', fetchImpl });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a translations array shorter than the request to translation_invalid_response', async () => {
  const provider = new DeepLContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, { translations: [{ text: 'only one' }] }),
  });
  const result = await provider.translateBatch({ texts: ['a', 'b'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

test('translateBatch maps a missing "translations" key to translation_invalid_response', async () => {
  const provider = new DeepLContentTranslationProvider({
    apiKey: 'fake-key',
    fetchImpl: fakeFetchReturning(200, { unexpected: true }),
  });
  const result = await provider.translateBatch({ texts: ['x'], sourceLang: 'ja', targetLang: 'en' });
  assert.deepEqual(result, { ok: false, error: { code: 'translation_invalid_response' } });
});

// -- source scan: no secret/body logging ------------------------------------

test('deepl-provider.ts never logs', () => {
  const source = readFileSync(new URL('./deepl-provider.ts', import.meta.url), 'utf8');
  assert.ok(!/console\.(log|error|warn|info|debug)/.test(source), 'must never log anything (status/error tags are returned, not logged)');
  // The only place `this.apiKey` may be interpolated is the Authorization header itself.
  const apiKeyUsages = [...source.matchAll(/\$\{this\.apiKey\}/g)];
  assert.equal(apiKeyUsages.length, 1);
  assert.ok(source.includes('Authorization: `DeepL-Auth-Key ${this.apiKey}`'));
});

// -- repo-wide guard: these server-only modules are never reachable from a 'use client' file --

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listFilesRecursive(full);
    return (full.endsWith('.ts') || full.endsWith('.tsx')) && !full.endsWith('.test.ts') ? [full] : [];
  });
}

test('no "use client" file imports the DeepL provider, the OpenAI provider, the Google provider, the provider factory, or the translation-env reader directly', () => {
  const srcDir = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const files = listFilesRecursive(srcDir);
  const forbiddenImportTargets = [
    'providers/deepl-provider',
    'providers/openai-provider',
    'providers/google-provider',
    'translation-provider-factory',
    'content/translation-env',
  ];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Match the actual directive line only (top of file), not any mention of
    // the phrase inside a comment/docstring -- e.g. this repo's own
    // `translation-env.ts` header explains the `'use client'` convention in
    // prose without being a client file itself.
    const firstLines = source.split('\n').slice(0, 5);
    if (!firstLines.some((line) => /^\s*['"]use client['"];?\s*$/.test(line))) continue;
    for (const target of forbiddenImportTargets) {
      assert.ok(!source.includes(target), `${file} is a 'use client' file and must not import ${target}`);
    }
  }
});
