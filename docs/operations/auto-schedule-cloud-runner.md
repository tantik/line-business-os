# Scheduled monthly auto-create — cloud runner (DEBT-074)

How the Manager's "create next month's schedule automatically on day N"
setting actually runs in Supabase Cloud. Introduced by migration
`0125_workforce_auto_schedule_cloud_runner.sql` and the Edge Function
`supabase/functions/auto-schedule-monthly`. Replaces the never-deployed
`apps/worker` job.

## How it works

```
pg_cron  (job workforce-auto-schedule-monthly, '7 * * * *' = minute 7 of every hour)
  -> select workforce.invoke_auto_schedule_runner()        -- SECURITY DEFINER, no app-role grant
       reads vault secrets project_url + auto_schedule_cron_token
       no project_url -> RAISE NOTICE, return (no-op)
  -> pg_net  POST {project_url}/functions/v1/auto-schedule-monthly
             Authorization: Bearer <auto_schedule_cron_token>
  -> Edge Function auto-schedule-monthly  (verify_jwt = false)
       POST only; token checked in the DB by api.verify_auto_schedule_cron_token -> 401 on mismatch
       service client (SUPABASE_SECRET_KEYS["default"]) on the `api` schema, RPCs only:
         api.auto_schedule_candidates()        enabled + Workforce module ON + active location
         per location, in ITS timezone:
           today's day-of-month != configured day        -> skip silently
           marker auto_create_last_generated_month = next month -> skip silently
           api.auto_schedule_load_inputs(...)    employees / shift types / preferences / existing shifts,
                                                 all scoped by tenant_id AND location_id
           no active shift types / no headcount -> api.auto_schedule_record_issue('config_error', code)
                                                 (marker NOT set -> retried next hour after a fix)
           engine: autoDistribute() (generated copy of packages/workforce, drift-guarded)
           api.auto_schedule_apply(...)          ONE transaction: optimistic-lock marker claim,
                                                 drafts with published = false, run-log row, audit row
           any error at this location -> api.auto_schedule_record_issue('failed', code); next location continues
       response: ids + counts + machine codes only
```

- Target month is always the NEXT calendar month; drafts are never
  published and never sent via LINE. The Manager reviews and publishes.
- Idempotent: hourly re-runs on the trigger day are no-ops once the marker is
  set; a concurrent run that loses the optimistic lock writes nothing.
- The Manager sees the last 3 run-log rows (and a "has not run yet" warning
  when the day has passed with no trace) in Manager → Settings → automatic
  schedule. Staff never sees that block.
- Engine sync: after editing `packages/workforce/src/auto-distribute.ts` or
  `auto-distribution-authority.ts`, run
  `node scripts/sync-edge-workforce-engine.mjs` and commit the result; the
  `engine-sync.test.ts` guard fails CI otherwise.

## Per-environment setup

1. Apply migration 0125 (creates the run-log table, RPCs, the vault secret
   `auto_schedule_cron_token` if absent, and the cron job).
2. Deploy the function: `supabase functions deploy auto-schedule-monthly`
   (`verify_jwt = false` comes from `supabase/config.toml`).
3. The one manual step — tell the runner where to POST, as a vault secret:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   ```

   Until this exists the runner is a no-op. Local stacks and production stay
   inert until someone sets it deliberately. **Production: Founder gate.**

## How to verify

```sql
-- cron job present and active
select jobid, jobname, schedule, command, active from cron.job
 where jobname = 'workforce-auto-schedule-monthly';

-- recent cron executions
select status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'workforce-auto-schedule-monthly')
 order by start_time desc limit 10;

-- HTTP responses from the Edge Function (pg_net keeps them ~6h)
select id, status_code, content::text, created
  from net._http_response order by created desc limit 10;

-- what the runner did, per location
select tenant_id, location_id, target_month, outcome, created_count, shortage_count,
       error_code, attempt_count, first_seen_at, last_seen_at
  from workforce.auto_schedule_runs order by last_seen_at desc limit 20;
```

- Function logs: Supabase dashboard → Edge Functions → `auto-schedule-monthly`
  → Logs. Entries are JSON with `event` and machine codes only.
- Expected 200 body: `{"ok":true,"candidates":N,"results":[...]}`; a 401
  means the bearer token did not match the vault secret.
- To exercise immediately (instead of waiting for minute 7):
  `select workforce.invoke_auto_schedule_runner();` as `postgres`, then check
  `net._http_response`. The job only generates for locations whose
  configured day is today in their timezone.

## How to disable

```sql
select cron.unschedule('workforce-auto-schedule-monthly');
```

Or remove the `project_url` vault secret (runner becomes a no-op). Per
location, the Manager can simply switch automatic creation OFF. Full rollback
of the migration is described in its header comment.

## Security notes

- No app role (anon/authenticated) can execute any runner RPC; only
  `service_role` can, and only the api passthroughs (invoker) of
  SECURITY DEFINER functions in `workforce` (ADR 0008).
- `auto_schedule_apply` re-validates every draft in the DB (employee and
  shift type in the same tenant AND location, active, start inside the
  target month) and rejects the whole call otherwise.
- The run log stores ids, counts and a short machine code (CHECK enforced) —
  no raw error text, no PII. RLS: Workforce module ON +
  `workforce.shift.read` at the location.
- Rotating the cron token: update the vault secret
  `auto_schedule_cron_token` (`vault.update_secret`); the runner and the
  function read it on every call, no redeploy needed.
