import { PostgrestError } from '@supabase/supabase-js';

/**
 * DEBT-114: PostgREST caps every response at `max_rows` (1000 in
 * `supabase/config.toml`, same on Cloud) WITHOUT an error -- an unpaginated
 * list read that matches more rows simply comes back short. `fetchAllRows`
 * pages a list read with `.range()` until the last (short) page, so a tenant
 * list can never silently lose rows.
 *
 * Contract for `makePage(from, to)`:
 *  - return the caller's full query (same filters as before) with a
 *    deterministic `.order(...)` that ends in a UNIQUE key (e.g. the row id),
 *    followed by `.range(from, to)`. Without a unique order, rows can repeat
 *    or vanish across page boundaries.
 *  - `FETCH_ALL_PAGE_SIZE` must stay <= the server `max_rows`; a smaller
 *    server cap would make every page look like the last one.
 *
 * Above `FETCH_ALL_MAX_PAGES` full pages the read stops with an error rather
 * than returning a partial list: a caller that needs more than that must
 * narrow its filter or move the aggregate into an RPC.
 */
export const FETCH_ALL_PAGE_SIZE = 1000;
export const FETCH_ALL_MAX_PAGES = 20;
export const FETCH_ALL_ROW_CAP_ERROR_CODE = 'LBO_ROW_CAP';

export interface FetchAllRowsPage<Row> {
  data: Row[] | null;
  error: PostgrestError | null;
}

export type FetchAllRowsResult<Row> = { data: Row[]; error: null } | { data: null; error: PostgrestError };

export async function fetchAllRows<Row = unknown>(
  makePage: (from: number, to: number) => PromiseLike<FetchAllRowsPage<Row>>,
): Promise<FetchAllRowsResult<Row>> {
  const rows: Row[] = [];
  for (let page = 0; page < FETCH_ALL_MAX_PAGES; page += 1) {
    const from = page * FETCH_ALL_PAGE_SIZE;
    const { data, error } = await makePage(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < FETCH_ALL_PAGE_SIZE) return { data: rows, error: null };
  }
  return {
    data: null,
    error: new PostgrestError({
      message: `List read exceeds ${FETCH_ALL_MAX_PAGES * FETCH_ALL_PAGE_SIZE} rows; refusing to return a partial list (DEBT-114).`,
      details: `Stopped after ${FETCH_ALL_MAX_PAGES} pages of ${FETCH_ALL_PAGE_SIZE} rows.`,
      hint: 'Narrow the query filter or aggregate in the database.',
      code: FETCH_ALL_ROW_CAP_ERROR_CODE,
    }),
  };
}
