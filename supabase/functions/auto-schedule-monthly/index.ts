// ============================================================================
// auto-schedule-monthly -- Supabase Edge Function (DEBT-074, Stage 2)
// ----------------------------------------------------------------------------
// The cloud runner for the Manager's scheduled monthly auto-create. pg_cron
// (migration 0125, job `workforce-auto-schedule-monthly`, minute 7 of every
// hour) calls `workforce.invoke_auto_schedule_runner()`, which POSTs here via
// pg_net. The orchestration itself lives in `../_shared/auto-schedule/job.ts`
// (pure, unit-tested); this file is only HTTP + auth + client wiring.
//
// AUTH: pg_cron has no user JWT, so `verify_jwt = false` in
// supabase/config.toml and this function authenticates the caller itself:
// the `Authorization: Bearer <token>` header must equal the vault secret
// `auto_schedule_cron_token` (created by 0125, never leaves the DB except in
// pg_net's request). The comparison happens IN the database
// (`api.verify_auto_schedule_cron_token`), so this function never reads the
// secret value. Missing/mismatched token -> 401 with no detail.
//
// PRIVILEGED KEY: `SUPABASE_SECRET_KEYS["default"]` via
// `_shared/supabase-secret-key.ts`, used only for the `api` schema's
// service-role-only auto-schedule RPCs (0125). It is never returned or
// logged. No direct table access: the RPCs are the whole DB surface.
//
// RESPONSE: ids + counts + machine codes only -- never PII, never raw error
// text (errors are logged server-side as codes only).
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveSupabaseSecretKey } from '../_shared/supabase-secret-key.ts';
import { AutoScheduleRunError, runAutoScheduleMonthly, type AutoScheduleRpc } from '../_shared/auto-schedule/job.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!token) return jsonResponse(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let privilegedKey: string;
  try {
    privilegedKey = resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS') }).key;
  } catch {
    console.error(JSON.stringify({ event: 'auto-schedule-monthly.config_error', code: 'missing_privileged_key' }));
    return jsonResponse(500, { error: 'missing_configuration' });
  }
  if (!supabaseUrl) return jsonResponse(500, { error: 'missing_configuration' });

  const serviceClient = createClient(supabaseUrl, privilegedKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'api' },
  });

  const { data: tokenOk, error: tokenError } = await serviceClient.rpc('verify_auto_schedule_cron_token', { p_token: token });
  if (tokenError) {
    console.error(JSON.stringify({ event: 'auto-schedule-monthly.token_check_failed' }));
    return jsonResponse(500, { error: 'token_check_failed' });
  }
  if (tokenOk !== true) return jsonResponse(401, { error: 'unauthorized' });

  const rpc: AutoScheduleRpc = async (fn, args) => {
    const { data, error } = await serviceClient.rpc(fn, args ?? {});
    if (error) console.error(JSON.stringify({ event: 'auto-schedule-monthly.rpc_error', fn, code: error.code ?? null }));
    return { data, error: error ? { code: error.code } : null };
  };

  try {
    const summary = await runAutoScheduleMonthly(rpc, new Date());
    console.log(JSON.stringify({ event: 'auto-schedule-monthly.done', candidates: summary.candidates, results: summary.results }));
    return jsonResponse(200, { ok: true, candidates: summary.candidates, results: summary.results });
  } catch (err) {
    const code = err instanceof AutoScheduleRunError ? err.code : 'unexpected_error';
    console.error(JSON.stringify({ event: 'auto-schedule-monthly.failed', code }));
    return jsonResponse(500, { error: code });
  }
});
