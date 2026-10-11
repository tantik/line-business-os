import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from './password-rules';
import { tAuth, type AuthCopyKey } from './auth-copy';

test('validateNewPassword: length first, then match', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(validateNewPassword('527231', '527231'), 'passwordTooShort');
  assert.equal(validateNewPassword('52723100', '52723101'), 'passwordMismatch');
  assert.equal(validateNewPassword('52723100', '52723100'), null);
});

test('every validation problem has JA and EN copy that names the 8-character rule', () => {
  for (const key of ['passwordTooShort', 'passwordHint'] as AuthCopyKey[]) {
    assert.match(tAuth('ja', key), /8文字以上/);
    assert.match(tAuth('en', key), /8 characters/);
  }
});

test('auth copy: JA and EN define the same keys, none empty, JA has no leftover English sentence', () => {
  const src = readFileSync(new URL('./auth-copy.ts', import.meta.url), 'utf8');
  const keysOf = (block: string) => [...block.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  const jaBlock = src.slice(src.indexOf('  ja: {'), src.indexOf('  en: {'));
  const enBlock = src.slice(src.indexOf('  en: {'));
  const ja = keysOf(jaBlock);
  const en = keysOf(enBlock);
  assert.ok(ja.length > 40);
  assert.deepEqual([...ja].sort(), [...en].sort());
  for (const key of ja as AuthCopyKey[]) {
    assert.ok(tAuth('ja', key).length > 0 && tAuth('en', key).length > 0, key);
    if (key !== 'inviteTitle') assert.ok(!/^[A-Za-z ,.'’]+$/.test(tAuth('ja', key)), `JA copy for ${key} looks English`);
  }
});

test('sign-in copy no longer advertises the old "not available yet" foundation note or LINE Business OS', () => {
  const page = readFileSync(new URL('../../app/sign-in/page.tsx', import.meta.url), 'utf8');
  const form = readFileSync(new URL('../../app/sign-in/SignInForm.tsx', import.meta.url), 'utf8');
  assert.ok(!/not available yet|LINE Business OS/.test(page + form));
  assert.ok(/\/forgot-password/.test(form), 'sign-in must link to /forgot-password');
});
