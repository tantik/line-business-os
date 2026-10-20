# SESSION_HANDOFF (2026-10-20) — packages model P1–P7 done, 4B-1 live, QA4 started

Reality check first (Operating Model §4): `git log -1` on `dev` should be the
merge of this handoff or later. Lead = CTO (Operating Model §9). Founder gates:
production, real-customer messages, money/accounts.

## 1. Merged to `dev` (2026-10-19..20)

| PR | What | Cloud DEV |
|---|---|---|
| #602 | R0b: Mame To Cha code removed; sign-in `returnTo` removed (DEBT-104); seed → packages model | — |
| #605 | **P3+P4**: `purchases` / `recipes` own modules (0130/0131, 24 policies + 5 functions moved, zero access change), navigation from packages (0132 `api.my_tenant_navigation`), `?popup=` guard, DEBT-105 | **0130–0132 applied**, live-checked |
| #606 | **P5** package vocabulary for module names (`lib/packages/vocabulary.ts`, Cafe = default) | — |
| #607 | **P6** package config (`lib/packages/config.ts`): allergen UI + translation hint per package; one allergen file; audit `docs/architecture/p6-industry-config-audit-2026-10-20.md`; DEBT-106..108 | — |
| #608 | **4B-1** `core.provision_tenant` one transaction (0133), template v3, DEBT-109 | **0133 applied** |

P2 = covered by 0129 sync (`module_dependency_missing`) + `purchases → inventory`.
**P7** (module-OFF) live-checked on Cloud DEV with temporary overrides on
`oruwa-cafe` (recipes+purchases off; then only workforce): routes show
"この機能は利用できません", buttons hidden, deep links ignored, Weekly Review
blocks "有効になっていません", Attention without off-module items. Overrides
removed afterwards (0 overrides, 7 modules on — verified).

## 2. In flight

1. **PR #604 (open, needs the Founder's click)**: removes the obsolete
   `verify-preview-server-actions` CI step + script, `.env.example` wording.
   Founder approved 2026-10-20, but `gh pr merge` is denied by settings and
   `ai-dev-merge.sh` blocks RED paths → Founder clicks "Squash and merge".
2. **4B-2** (engineer subagent, worktree `.claude/worktrees/4b2`, branch
   `feat/4b2-provision-edge-function`, not pushed when this was written):
   Edge Function `provision-tenant` + owner invitation (0134) + status
   transitions. Acceptance (DEBT-109): actor only from verified JWT; retry with
   the same `request_id`. Next: check the commit, DB/security review, local
   tests, then Cloud DEV apply + `functions deploy` (CTO call), PR.
3. **QA4** (scenario `docs/ai/QA4_SCENARIO_2026-10-18.md`), Lead run on Cloud DEV:
   - §2 DONE (F1–F3).
   - §7 DONE: 佐藤 10/16 missing clock-out → request → 承認 → 33.7 h → 37.7 h; 10/15
     request → 却下; Staff sees both decisions; Manager past-shift edit 07:00–11:00
     → Staff 予定時間 13.0 → 12.0 h live (reverted to 12:00).
   - §10 DONE: Staff issue → 報告者 shown → 確認 → 解決 with note → gone from Staff
     live, in 履歴 with the seed month.
   - §11 DONE (F6): 佐藤 ↔ Manager threads separate, unread counters right, reply live.
   - §6 PARTLY: fridge 7 °C → warning + exception live (17 → 18) → resolved with
     note (18 → 17); freezer −12 °C → no exception (no range, by design);
     未実施 items visible. NOT DONE: Manager sets freezer max −15 °C in the
     template (permanent template change — decide), history "who/what".
   - §9 DONE: allergen block + disclaimer, partial cost "3個中2個"; data oddity 蓋(1kg) (units, DEBT-106).
   - Remaining: §3 (Nov preferences → auto-create → publish), §4 exchanges/
     cancel, §5 live clock-in/out (real days), §8 stock counts + purchases,
     §12 phone (Founder), §13 (cost measurement).

## 3. QA4 findings so far

- **F1 (UX, P3)**: Manager "概算人件費" next to the WEEK grid is the current
  MONTH total (`monthlyLabourCostSummary`) and does not change when paging
  weeks; label lacks "今月".
- **F2 (product gap)**: the per-staff monthly report (name ☞ popup) shows only
  the current month; no way to see September.
- **F3 (product gap)**: Weekly Review has no attendance / lateness and no
  temperature out-of-range counts (the scenario expects them).
- **F5 (UX, P3)**: 承認 / 却下 of correction requests and saving a HACCP item take
  3–5 s before the UI changes — check that a pending state is shown.
- **F6 (P3)**: a mail reply that arrives while the thread is OPEN stays unread
  (counter 1) until the thread is opened again.
- QA automation note (not a user bug): tabs (`role=tab`) and some send buttons
  ignore `element.click()`; use real clicks (snapshot uid).
- Not a finding: Attention 15 vs Weekly 17 open checks — stale page; cron-made
  exceptions arrive via the 15-min safety poll, not Realtime (by design #589).

## 4. Next (order)

4B-2 → QA4 rest (Lead) → 4B-3 admin console `/admin/tenants` → 4B-4 Owner
wizard → 4C 6-tenant test → LINE (Founder decision §5 of the 2026-10-19
handoff: each client's own OA, no webhook dependency, app works without LINE).

## 5. Facts worth knowing

- Local `supabase db reset` "empty DB" = Realtime container migrate race
  (`schema_migrations_pkey`); fix: `supabase stop` → `start --ignore-health-check` → reset.
- `db push` to Cloud DEV: run from the MAIN checkout (link ref lives in its
  `supabase/.temp`, `link` is forbidden): `git checkout --detach <PR head>` →
  `db push --dry-run` → `db push` → `git checkout dev`. Apply BEFORE merging when
  the new app code needs the new DB objects (0132 case).
- Module toggling for QA: `core.set_tenant_module_override(tenant, module, false|null, reason)` — `null` removes the override.
- `gh pr merge`, `gh api`, branch deletion are denied by settings; merges via `scripts/ai-dev-merge.sh`.
- Close preview tabs after browser QA (Vercel CPU).
