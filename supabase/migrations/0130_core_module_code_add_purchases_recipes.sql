-- ============================================================================
-- 0130 — module codes 'purchases' and 'recipes' (packages model, task P3 1/2)
-- ----------------------------------------------------------------------------
-- Purchasing rode the 'inventory' flag and recipes the 'workforce' flag
-- (docs/architecture/platform-packages-model.md §4). To sell and switch them
-- separately they become their own modules. A new enum value cannot be used in
-- the transaction that adds it, so this file only adds the values; 0131
-- registers them and moves the gates.
-- ============================================================================
alter type core.module_code add value if not exists 'purchases';
alter type core.module_code add value if not exists 'recipes';
