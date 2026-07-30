import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveContentTranslationProvider } from './translation-provider-factory.js';

const PROVIDER_ENV_KEYS = [
  'CONTENT_TRANSLATION_PROVIDER',
  'CONTENT_TRANSLATION_AUTO_ENABLED',
  'DEEPL_API_KEY',
  'DEEPL_API_URL',
  'OPENAI_API_KEY',
  'OPENAI_TRANSLATION_MODEL',
];

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

/** Clears every provider-related env var, then applies `overrides` -- keeps each test's intent explicit instead of relying on ambient state. */
function withCleanProviderEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const cleared: Record<string, string | undefined> = {};
  for (const key of PROVIDER_ENV_KEYS) cleared[key] = undefined;
  withEnv({ ...cleared, ...overrides }, fn);
}

function captureConsoleError(fn: () => void): string[] {
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.error = original;
  }
  return messages;
}

test('resolveContentTranslationProvider returns null (never throws) when CONTENT_TRANSLATION_PROVIDER is unset', () => {
  withCleanProviderEnv({}, () => {
    assert.equal(resolveContentTranslationProvider(), null);
  });
});

test('resolveContentTranslationProvider selects DeepL when CONTENT_TRANSLATION_PROVIDER=deepl and DEEPL_API_KEY is set', () => {
  withCleanProviderEnv({ CONTENT_TRANSLATION_PROVIDER: 'deepl', DEEPL_API_KEY: 'fake-key:fx' }, () => {
    const provider = resolveContentTranslationProvider();
    assert.ok(provider !== null);
    assert.equal(provider?.providerId, 'deepl');
  });
});

test('resolveContentTranslationProvider selects OpenAI when CONTENT_TRANSLATION_PROVIDER=openai and OPENAI_API_KEY is set', () => {
  withCleanProviderEnv({ CONTENT_TRANSLATION_PROVIDER: 'openai', OPENAI_API_KEY: 'fake-openai-key' }, () => {
    const provider = resolveContentTranslationProvider();
    assert.ok(provider !== null);
    assert.equal(provider?.providerId, 'openai');
  });
});

test('resolveContentTranslationProvider is case-insensitive for the provider selector', () => {
  withCleanProviderEnv({ CONTENT_TRANSLATION_PROVIDER: 'OpenAI', OPENAI_API_KEY: 'fake-openai-key' }, () => {
    assert.equal(resolveContentTranslationProvider()?.providerId, 'openai');
  });
});

test('resolveContentTranslationProvider never selects DeepL merely because DEEPL_API_KEY exists, when CONTENT_TRANSLATION_PROVIDER=openai and OPENAI_API_KEY is missing', () => {
  withCleanProviderEnv(
    { CONTENT_TRANSLATION_PROVIDER: 'openai', DEEPL_API_KEY: 'fake-key:fx' },
    () => {
      const messages = captureConsoleError(() => {
        assert.equal(resolveContentTranslationProvider(), null);
      });
      assert.ok(messages.some((m) => m.includes('OPENAI_API_KEY')));
    },
  );
});

test('resolveContentTranslationProvider returns null and logs (server-side only) when CONTENT_TRANSLATION_PROVIDER=openai but OPENAI_API_KEY is missing', () => {
  withCleanProviderEnv({ CONTENT_TRANSLATION_PROVIDER: 'openai' }, () => {
    const messages = captureConsoleError(() => {
      assert.equal(resolveContentTranslationProvider(), null);
    });
    assert.equal(messages.length, 1);
    assert.ok(messages[0]!.includes('OPENAI_API_KEY'));
    assert.ok(!messages[0]!.includes('fake'), 'must never include a key value');
  });
});

test('resolveContentTranslationProvider returns null and logs when CONTENT_TRANSLATION_PROVIDER=deepl but DEEPL_API_KEY is missing', () => {
  withCleanProviderEnv({ CONTENT_TRANSLATION_PROVIDER: 'deepl' }, () => {
    const messages = captureConsoleError(() => {
      assert.equal(resolveContentTranslationProvider(), null);
    });
    assert.equal(messages.length, 1);
    assert.ok(messages[0]!.includes('DEEPL_API_KEY'));
  });
});

test('resolveContentTranslationProvider returns null and logs a clear error for an unsupported CONTENT_TRANSLATION_PROVIDER value', () => {
  withCleanProviderEnv(
    { CONTENT_TRANSLATION_PROVIDER: 'google-translate', DEEPL_API_KEY: 'fake-key:fx', OPENAI_API_KEY: 'fake-openai-key' },
    () => {
      const messages = captureConsoleError(() => {
        assert.equal(resolveContentTranslationProvider(), null);
      });
      assert.equal(messages.length, 1);
      assert.ok(messages[0]!.includes('google-translate'));
    },
  );
});

test('resolveContentTranslationProvider returns null when CONTENT_TRANSLATION_AUTO_ENABLED=false, even with a valid provider/key configured', () => {
  withCleanProviderEnv(
    { CONTENT_TRANSLATION_PROVIDER: 'openai', OPENAI_API_KEY: 'fake-openai-key', CONTENT_TRANSLATION_AUTO_ENABLED: 'false' },
    () => {
      assert.equal(resolveContentTranslationProvider(), null);
    },
  );
});
