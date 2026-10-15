import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDocumentTitle } from './document-title';
import { tAuth } from '../auth/auth-copy';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('formatDocumentTitle matches the root layout title template', () => {
  assert.equal(formatDocumentTitle(tAuth('ja', 'accessDeniedTitle')), 'アクセスできません | ORUWA');
  assert.equal(formatDocumentTitle(tAuth('en', 'accessDeniedTitle')), 'Access denied | ORUWA');
  assert.equal(formatDocumentTitle(tAuth('en', 'signInTitle')), 'Sign in | ORUWA');
  assert.match(read('../../app/layout.tsx'), /template: '%s \| ORUWA'/);
});

test('QA3: the title survives a late streamed metadata <title>, but only on its own page', () => {
  const hook = read('./document-title.ts');
  assert.match(hook, /new MutationObserver\(apply\)/);
  assert.match(hook, /return \(\) => observer\.disconnect\(\);/);
  assert.match(hook, /window\.location\.pathname === pathname/);
});

test('QA3: state pages (incl. access denied) set the tab title from their headline; loading does not', () => {
  const states = read('../../components/states.tsx');
  assert.match(states, /useDocumentTitle\(setDocumentTitle \? tAuth\(lang, title\) : null\)/);
  assert.match(states, /title="loadingTitle" body="loadingBody" setDocumentTitle=\{false\}/);
  assert.match(states, /title="accessDeniedTitle" body="accessDeniedBody" homeLink \/>/);
});

test('QA3: the sign-in page localizes its tab title with the JA/EN toggle', () => {
  assert.match(read('../../app/sign-in/page.tsx'), /documentTitle="signInTitle"/);
  assert.match(read('../../components/auth/AuthShell.tsx'), /useDocumentTitle\(documentTitle \? t\(documentTitle\) : null\)/);
});

test('QA3: a failed sign-in keeps the typed email via sessionStorage only, never the URL', () => {
  const form = read('../../app/sign-in/SignInForm.tsx');
  assert.match(form, /window\.sessionStorage\.setItem\(EMAIL_STASH_KEY, email\)/);
  assert.match(form, /writeEmailStash\(email\);/);
  assert.doesNotMatch(form, /localStorage/);
  const actions = read('../auth/actions.ts');
  assert.doesNotMatch(actions, /searchParams\.set\(['"]email/);
  assert.doesNotMatch(actions, /[?&]email=/);
});

test('QA3: the monthly preference validation error is announced to screen readers', () => {
  assert.match(read('../../app/(protected)/staff/monthly-shift-preference-modal.tsx'), /<div role="alert" style=\{\{ \.\.\.alertDanger, marginBottom: 10 \}\}>/);
});

test('QA3: Manager/Staff tab titles are Japanese by default and follow the JA/EN toggle', () => {
  assert.match(read('../../app/(protected)/manager/page.tsx'), /title: 'マネージャー'/);
  assert.match(read('../../app/(protected)/staff/page.tsx'), /title: 'スタッフ'/);
  assert.match(read('../../app/(protected)/manager/manager-dashboard-client.tsx'), /useDocumentTitle\(lang === 'en' \? 'Manager' : 'マネージャー'\)/);
  assert.match(read('../../app/(protected)/staff/staff-dashboard-client.tsx'), /useDocumentTitle\(lang === 'en' \? 'Staff' : 'スタッフ'\)/);
});
