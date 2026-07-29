import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveContentTranslationProvider } from './translation-provider-factory.js';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('resolveContentTranslationProvider returns null (never throws) when DEEPL_API_KEY is unset', () => {
  withEnv({ DEEPL_API_KEY: undefined, CONTENT_TRANSLATION_AUTO_ENABLED: undefined }, () => {
    assert.equal(resolveContentTranslationProvider(), null);
  });
});

test('resolveContentTranslationProvider returns a provider when DEEPL_API_KEY is set', () => {
  withEnv({ DEEPL_API_KEY: 'fake-key:fx', CONTENT_TRANSLATION_AUTO_ENABLED: undefined }, () => {
    const provider = resolveContentTranslationProvider();
    assert.ok(provider !== null);
    assert.equal(provider?.providerId, 'deepl');
  });
});

test('resolveContentTranslationProvider returns null when CONTENT_TRANSLATION_AUTO_ENABLED=false, even with a key set', () => {
  withEnv({ DEEPL_API_KEY: 'fake-key:fx', CONTENT_TRANSLATION_AUTO_ENABLED: 'false' }, () => {
    assert.equal(resolveContentTranslationProvider(), null);
  });
});
