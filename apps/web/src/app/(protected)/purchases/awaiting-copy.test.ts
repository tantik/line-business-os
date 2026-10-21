import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatAwaitingLabel, formatCancelRestBody } from './awaiting-copy.js';

test('formatAwaitingLabel: "order 8 L, receive 4 L" reads as 4 L awaiting of 8 L (JA/EN)', () => {
  assert.equal(formatAwaitingLabel('ja', 4, 8, 'L'), '入荷待ち 4 L（8 Lのうち）');
  assert.equal(formatAwaitingLabel('en', 4, 8, 'L'), '4 L awaiting (of 8 L)');
});

test('formatAwaitingLabel keeps fractional quantities as-is', () => {
  assert.equal(formatAwaitingLabel('en', 1.75, 2.5, 'kg'), '1.75 kg awaiting (of 2.5 kg)');
});

test('formatCancelRestBody states the effect and that stock does not change (JA/EN)', () => {
  assert.equal(formatCancelRestBody('ja', 4, 'L'), '残り4 Lは入荷待ちから外れます。在庫は変わりません。');
  assert.equal(formatCancelRestBody('en', 4, 'L'), 'The remaining 4 L will be removed from Awaiting delivery. Stock will not change.');
});

test('"Cancel the rest" uses the Radix Menu + DS ConfirmDialog (work inside the Purchases Radix Dialog), never the design-kit ones', () => {
  const menu = readFileSync(new URL('./cancel-rest-menu.tsx', import.meta.url), 'utf8');
  assert.match(menu, /import \{ ConfirmDialog, Menu \} from '@line-os\/ui'/);
  assert.doesNotMatch(menu, /<ActionsMenu/);
  assert.doesNotMatch(menu, /design-kit'/);
});
