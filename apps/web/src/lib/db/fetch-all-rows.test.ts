import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgrestError } from '@supabase/supabase-js';
import { FETCH_ALL_MAX_PAGES, FETCH_ALL_PAGE_SIZE, FETCH_ALL_ROW_CAP_ERROR_CODE, fetchAllRows } from './fetch-all-rows.js';

/** Fake paged source: serves `total` numbered rows by inclusive range, like PostgREST `.range()` under `max_rows`. */
function pagedSource(total: number) {
  const ranges: Array<[number, number]> = [];
  const makePage = (from: number, to: number) => {
    ranges.push([from, to]);
    const end = Math.min(to + 1, total, from + FETCH_ALL_PAGE_SIZE);
    const data = from >= total ? [] : Array.from({ length: end - from }, (_, i) => ({ n: from + i }));
    return Promise.resolve({ data, error: null });
  };
  return { makePage, ranges };
}

test('fetchAllRows: a short first page is returned as-is with one request', async () => {
  const { makePage, ranges } = pagedSource(3);
  const result = await fetchAllRows(makePage);
  assert.equal(result.error, null);
  assert.equal(result.data?.length, 3);
  assert.deepEqual(ranges, [[0, FETCH_ALL_PAGE_SIZE - 1]]);
});

test('fetchAllRows: more than one page of rows are all returned, in order, without gaps (DEBT-114)', async () => {
  const total = FETCH_ALL_PAGE_SIZE * 2 + 345;
  const { makePage, ranges } = pagedSource(total);
  const result = await fetchAllRows<{ n: number }>(makePage);
  assert.equal(result.error, null);
  assert.equal(result.data?.length, total);
  assert.deepEqual(
    result.data?.map((r) => r.n),
    Array.from({ length: total }, (_, i) => i),
  );
  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test('fetchAllRows: an exact multiple of the page size costs one extra empty page and returns everything', async () => {
  const { makePage, ranges } = pagedSource(FETCH_ALL_PAGE_SIZE);
  const result = await fetchAllRows(makePage);
  assert.equal(result.data?.length, FETCH_ALL_PAGE_SIZE);
  assert.equal(ranges.length, 2);
});

test('fetchAllRows: an empty result is success with []', async () => {
  const result = await fetchAllRows(() => Promise.resolve({ data: null, error: null }));
  assert.deepEqual(result, { data: [], error: null });
});

test('fetchAllRows: a page error is returned (no partial data)', async () => {
  const pageError = new PostgrestError({ message: 'permission denied', details: '', hint: '', code: '42501' });
  let calls = 0;
  const result = await fetchAllRows((from) => {
    calls += 1;
    if (from === 0) return Promise.resolve({ data: Array.from({ length: FETCH_ALL_PAGE_SIZE }, () => ({})), error: null });
    return Promise.resolve({ data: null, error: pageError });
  });
  assert.equal(calls, 2);
  assert.equal(result.data, null);
  assert.equal(result.error, pageError);
});

test('fetchAllRows: stops with an explicit error above the hard cap instead of truncating', async () => {
  const { makePage, ranges } = pagedSource(FETCH_ALL_PAGE_SIZE * FETCH_ALL_MAX_PAGES + 1);
  const result = await fetchAllRows(makePage);
  assert.equal(result.data, null);
  assert.equal(result.error?.code, FETCH_ALL_ROW_CAP_ERROR_CODE);
  assert.match(result.error?.message ?? '', /refusing to return a partial list/);
  assert.equal(ranges.length, FETCH_ALL_MAX_PAGES);
});
