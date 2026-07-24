-- ============================================================================
-- 0033 Workforce: narrow manager write for recipe/instruction classification
-- ============================================================================
-- RLS policies from 0022 remain the authorization boundary. These column-level
-- grants expose only content_kind through the existing security_invoker view;
-- authenticated callers cannot use this grant to change tenant/location,
-- publication status, titles, descriptions, or popularity.

grant update (content_kind) on workforce.recipes to authenticated;
grant update (content_kind) on api.workforce_recipes to authenticated;

revoke all on workforce.recipes from anon, public;
revoke all on api.workforce_recipes from anon, public;
