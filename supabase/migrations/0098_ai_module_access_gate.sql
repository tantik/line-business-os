-- ============================================================================
-- 0098  AI: enforce module-OFF gating (Module Access Security Remediation,
--       WP-S6)
-- ----------------------------------------------------------------------------
-- AI is, like Booking (WP-S4), a scaffold-only module (AGENTS.md "Database
-- phase (Phase 1)": schema/RLS exist, no product features built on top --
-- confirmed by searching the full migration/test/application history: only
-- 0008_rbac_seed.sql (schema + RLS, plus seeding the `ai.propose`/`ai.approve`
-- permission KEYS -- not a table grant -- to the relevant roles) and
-- 0011_ai.sql (schema + RLS) ever reference the `ai` schema at the database
-- layer. No `api.*` view, no RPC, no SECURITY DEFINER function, no Storage
-- bucket, and no `apps/*` code path touches `ai.proposals` or
-- `ai.prompt_logs` at all (`packages/ai/src/proposals.ts` calls the `ai`
-- schema directly via supabase-js, but nothing in `apps/api` currently
-- imports it -- an unwired dependency, not a live tenant-facing path).
-- Critically, no migration has ever granted `authenticated` schema/table
-- access to `ai` either (mirrors 0013's own comment on Booking), and
-- `supabase/config.toml` exposes only `["public", "api"]` to PostgREST -- so,
-- exactly like Booking, this module is currently unreachable tenant-facing
-- regardless of module state. This keeps WP-S6 the simplest remaining staged
-- domain: four RLS policies to re-declare, no view/RPC/function surface, no
-- existing fixture at risk of breaking under the new fail-closed default.
--
-- Prior state: none of AI's four RLS policies (0011) ever checked
-- core.tenant_modules.is_enabled. A tenant with AI turned OFF (or, since no
-- tenant has ever had an ai.proposals/prompt_logs row provisioned by any
-- seed/migration, a tenant that simply never had the module row created)
-- still had the same tenant-facing RLS behavior as one with AI ON, gated only
-- by core.has_permission(...).
--
-- This migration adds core.has_module_access(tenant_id, 'ai') to:
--   * ai_proposals_read/insert/update
--   * ai_prompt_logs_read
--
-- Behavior:
--   AI ON  -> unchanged (permission checks as before).
--   AI OFF -> proposal create/read/approve and prompt-log read all
--              tenant-facing-blocked; existing rows (none in any current
--              tenant, but the guarantee holds regardless) are preserved.
--   AI ON again -> prior access restored, unchanged.
--
-- No product features added or changed -- per the mission's explicit
-- instruction, this is module-access gating only.
--
-- Rollback: re-apply the pre-0098 policy bodies (drop the module-access
-- conjunct) for each policy listed above. Purely additive/no data change
-- either direction.
-- ============================================================================

drop policy if exists ai_proposals_read on ai.proposals;
create policy ai_proposals_read on ai.proposals
  for select using (
    core.has_module_access(tenant_id, 'ai')
    and (
      core.has_permission(tenant_id, 'ai.propose', location_id)
      or core.has_permission(tenant_id, 'ai.approve', location_id)
    )
  );

drop policy if exists ai_proposals_insert on ai.proposals;
create policy ai_proposals_insert on ai.proposals
  for insert with check (
    core.has_module_access(tenant_id, 'ai')
    and core.has_permission(tenant_id, 'ai.propose', location_id)
  );

drop policy if exists ai_proposals_update on ai.proposals;
create policy ai_proposals_update on ai.proposals
  for update
  using (
    core.has_module_access(tenant_id, 'ai')
    and core.has_permission(tenant_id, 'ai.approve', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'ai')
    and core.has_permission(tenant_id, 'ai.approve', location_id)
  );

drop policy if exists ai_prompt_logs_read on ai.prompt_logs;
create policy ai_prompt_logs_read on ai.prompt_logs
  for select using (
    core.has_module_access(tenant_id, 'ai')
    and core.has_permission(tenant_id, 'core.audit.read')
  );
