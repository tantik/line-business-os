# SESSION_HANDOFF (2026-09-21) — Full Integrated Acceptance CLOSED WITH GAPS

Durable handoff for a **fresh** Claude Code session. Git, this file and the report are the source of truth, not any prior chat. Everything marked VERIFIED was confirmed by tool output on 2026-09-21; the rest is INFERRED, UNKNOWN or NOT TESTED (Operating Model §6). Template: `docs/ai/templates/handoff-template.md`.

## 1. Repository state (VERIFIED)

- Start: `dev` = `origin/dev` = `9616701`, clean, no open PRs. Work branch for the records: `docs/cafe-v2-2-full-integrated-acceptance`.
- Merged this session: **#536** (`a4eee49`, Operations "today" in the location timezone) and **#537** (Attention subtitle names unread mail). Both non-RED, CI green, independent review PASS; merged with `scripts/ai-dev-merge.sh`.
- `main`, Production, Cloud DEV data schema: untouched. No migration added. Cloud DEV has `0000`–`0121` applied (read-only `supabase migration list`).
- Local: Docker Desktop was started this session; the local Supabase stack runs. `pnpm --filter @line-os/web test` = **1354/1354** (131+ files); typecheck and lint clean; `supabase test db` = 60 files / 1475 tests with exactly the DEBT-037 failing set (`0002`, `0006`, `0008`, `0012`, `0023`, 11 subtests), nothing new.

## 2. What the acceptance proved (live, real Manager and Staff sessions on `preview.oruwa.jp`)

Schedule (assign → Staff sees → cancel request → approve), Operations (Staff completes a checklist → Manager sees it), Issues (Staff report → Manager acknowledge → resolve), Inventory count by Staff, Purchasing → Inventory (Order/Receive and Bought/Receive, both to the canonical count), Recipes (cost, allergens, no inventory consumption, Staff sees no cost), Weekly Review linkage, Attention, Mail, Clock in/out, Staff create/delete, Help popups, role negatives, unauthenticated redirects, JA and EN, 320/375/768/1440, keyboard, performance. Details and evidence: `CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md`.

## 3. Open items (all in `docs/operations/deferred-debt-register.md`, section E and updated rows)

- **Founder decision + RED:** migration `0122` for DEBT-050 (Issues `business_date` in UTC) and DEBT-051 (module-OFF gate dropped by `0120`). Design is in report §10; nothing is written. A migration PR is a RED path: the Founder merges it and applies it to Cloud DEV (the session cannot).
- DEBT-052 (staff update erases wage and notes; PII-adjacent, needs DB/security review), DEBT-053 (Copy Audit class A incl. allergen wording), DEBT-054 to DEBT-059, DEBT-060 (surfaces and states NOT TESTED live), DEBT-061 (read-only check of Cloud PostgREST exposed schemas; class A, cheap).
- The mission's Definition of Done item 4 (every class A finding fixed or accepted by the Founder) is **not met**: DEBT-050 to DEBT-053 and DEBT-061 wait for a fix or an explicit acceptance.
- DEBT-001 to DEBT-004 (demo data): the Operations backlog is now **63** and grows daily. DEBT-049: cross-tenant, cross-location, no-role and module-OFF cannot be checked live on one tenant.

## 4. Decisions that belong to the Founder (not made)

1. **Founder Technical Freeze** of Cafe v2.2. Recommendation and preconditions: report §9.
2. **Commercial Release.** What is missing: report §9. Production and `main` stay separately gated (DEBT-035, 036, 043).

## 5. Next session: read first

`AGENTS.md`, Operating Model v1.9.0, `docs/ai/current-task.md`, the debt register, the report above, and `docs/ai/CAFE_V2_2_COPY_AUDIT_2026-09-21.md` if the mission is copy or demo work. Do not start SaaS Hardening, the clean demo tenant, or Production work without a fresh Founder prompt (mission stop condition).

## 6. Tooling notes learned

- Radix tabs ignore a scripted `click()`; dispatch `pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click`.
- A single "Something went wrong" page can appear on `/manager` while Vercel swaps a deployment; a reload fixes it (not reproduced).
- `supabase migration list` reads the linked Cloud project (read-only) and prints the Remote column; it is allow-listed and safe, but it does reach Cloud.
- New tests are auto-discovered by `apps/web/scripts/run-tests.mjs`; `node --test` on one file directly does not work (needs the runner's loader).

## 7. Do not modify

`main`; Production Vercel/Supabase; `.env*`; `.claude/settings.json`, `scripts/ai-hooks/*`, `scripts/ai-dev-merge.sh`; `docs/ai/history/*`; existing `oruwa-cafe` records (resolve through workflows, never delete).

No secrets, passwords, tokens or `service_role` values are recorded in this file.
