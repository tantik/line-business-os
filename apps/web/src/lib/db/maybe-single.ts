import type { PostgrestError } from '@supabase/supabase-js';

/**
 * The error postgrest-js's `.maybeSingle()` returns when more than one row
 * matches (code PGRST116). Used where a former `.maybeSingle()` read now
 * arrives as a plain row list (e.g. from `api.manager_dashboard`, DEBT-135),
 * so the mapped outcome stays the same.
 */
export function maybeSingleTooManyRowsError(count: number): PostgrestError {
  return {
    name: 'PostgrestError',
    code: 'PGRST116',
    details: `Results contain ${count} rows, application/vnd.pgrst.object+json requires 1 row`,
    hint: '',
    message: 'JSON object requested, multiple (or no) rows returned',
  } as PostgrestError;
}
