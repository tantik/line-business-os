# ORUWA AI Governance Consolidation Audit

## Document Metadata

| Field | Value |
|---|---|
| Mission | ORUWA AI Governance Consolidation & Repository Cleanup — Phase 1 (read-only) |
| Status | Complete — Phase 1 deliverable |
| Prepared by | Claude Lead Execution Agent, per `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` |
| Date | 2026-08-15 |
| Branch / HEAD (VERIFIED) | `docs/ai-engineering-operating-model-v1`, based on `origin/dev` @ `b17e230` (PR #235, merged) |
| Scope | Read-only inventory + classification + target design. No files modified, moved, or deleted by this mission. |
| Method | Direct inspection by the Lead Agent of governing/entrypoint documents, plus four parallel read-only subagent surveys (docs/ai mission-history; docs/project + misc state docs; .cursor/.claude/.agents tooling; repo-wide reference/approval-boundary map), each spot-verified against the repository before being relied on (Operating Model §2, §13). |

---

## 1. Executive Verdict

The repository has **one correct current authority chain** (Foundation → ADR/Security → `AGENTS.md`/`CLAUDE.md`/`.cursor/rules/*` → `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` → mission state → handoff/completion evidence), and it is already stated correctly in `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` itself and in `docs/foundation/documentation-and-decision-hierarchy.md` §2–3. **The problem is not a missing authority chain — it is five categories of matter still sitting outside it**, each independently confirmed by this audit:

1. **A duplicate, unlisted state-tracking system.** `docs/project/*` (10 files) performs the same "what's the current state / what's next" job as `docs/ai/current-task.md`, is **not** in `documentation-and-decision-hierarchy.md` §2's canonical entry points, has had no commits since 2026-08-08, and does not know `docs/ai/current-task.md` exists (no cross-reference either direction). Both trackers are now stale by roughly a week.
2. **Two orphaned "standing" docs.** `docs/ai/project-context.md` and `docs/ai/agent-roles.md` are referenced almost nowhere except by `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` itself (which flags, not fixes, their staleness). Both describe a ChatGPT/Cursor/Codex-centric operating model that the Operating Model doc has already superseded in practice. Neither is a canonical entry point per `documentation-and-decision-hierarchy.md` §2.
3. **Confirmed, not just alleged, `.claude`/`.agents` skill drift.** `diff` confirms `linebos-tenant-rls-audit` is byte-identical between the two locations, but `linebos-pre-pr-verify` genuinely differs: the `.claude/` copy defaults to "ask before running any check," the `.agents/` copy defaults to "run local checks, ask only for the risky subset." This is a real behavioral inconsistency, not wording noise, and it violates `AGENTS.md`'s own instruction to keep the two in sync.
4. **Nine-plus independently-worded approval-boundary lists** exist and, on direct comparison, are not contradictory but are **inconsistent by omission**: `oruwa-engineering-principles-and-governance.md` §7.5 is strictly broader than `core-laws-and-product-dna.md` Law 6 and ADR 0010 §H (it alone requires approval for every commit/push/PR/local-DB-reset/dependency-install); `deployment-checklist.md` alone adds "any service-role usage path." A reader consulting only one list would draw an incomplete picture.
5. **A backlog of one-off mission reports (17 files, 2026-08-13→08-15) sitting in `docs/ai/` at the same directory level as standing rules**, with no visual or structural separation between "read this every mission" and "this is what happened in one mission on one date." Several are already explicitly superseded by later reports in the same set but are not marked as such.

None of this requires a new governance layer. The fix is: **retire the losing side of each duplicate, correct or explicitly demote the two stale ChatGPT-era docs, fix the skill drift, keep the two approval-boundary lists the Operating Model already designated canonical, and separate mission-history files from standing rule files by location, not by rewriting either.**

**No Foundation, ADR, or security document requires any change.** They are internally consistent and were not found to conflict with each other — only the layer below them (operational/process docs) has drifted.

---

## 2. Current Authority Map (VERIFIED)

```
Foundation (Frozen, docs/foundation/*, esp. core-laws-and-product-dna.md)
  → ADR / Security (docs/adr/*, docs/security/security-requirements.md)
    → Repository operating instructions (CLAUDE.md, AGENTS.md, .cursor/rules/*)
      → ORUWA AI Engineering Operating Model (docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md)
        → Mission-specific state (docs/ai/current-task.md — designated canonical
          by both this document and documentation-and-decision-hierarchy.md §2/§6)
          → Handoff / Completion evidence (docs/ai/<WORKSTREAM>_HANDOFF_<DATE>.md,
            mission completion reports)
```

This chain is stated correctly and consistently in `documentation-and-decision-hierarchy.md` (§3 "Documentation Levels", §6 "Authority Matrix") and in `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`'s own "Authority rule" section. **This audit does not propose changing this chain.** The consolidation work is entirely about removing or correcting material that sits *outside* or *duplicates* a rung of this chain.

`documentation-and-decision-hierarchy.md` §2 "Canonical Entry Points" (VERIFIED, read in full) lists exactly: `CLAUDE.md`, `AGENTS.md`, `docs/README.md`, `docs/foundation/README.md`, `docs/foundation/core-laws-and-product-dna.md`, `docs/foundation/platform-foundation-roadmap.md`, `docs/foundation/oruwa-portfolio-and-module-strategy.md`, `docs/foundation/oruwa-engineering-principles-and-governance.md`, `docs/adr/`, `docs/architecture/`, `docs/security/security-requirements.md`, `docs/product/`, `docs/strategy/`, `docs/operations/`, `docs/ai/` (named as "`oaes-project-profile.md`, `current-task.md`" specifically), `.cursor/rules/`.

**Not listed anywhere in §2**: `docs/project/*`, `docs/ai/project-context.md`, `docs/ai/agent-roles.md`, `docs/AI_PLAYBOOK.md`, `docs/QA_ACCESS.md`, `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`. This is not an oversight this audit is discovering for the first time — `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` already flags item 1 (`docs/project/*` vs. `current-task.md`/`project-context.md`) as a known unresolved conflict — but this audit independently confirms it from the hierarchy document's own text and extends the finding to the other four files.

---

## 3. Complete Relevant-File Inventory

### 3a. Repository entrypoints (KEEP, no change needed)
`CLAUDE.md`, `AGENTS.md`, `docs/foundation/documentation-and-decision-hierarchy.md`, `docs/foundation/core-laws-and-product-dna.md`, `docs/foundation/oruwa-engineering-principles-and-governance.md`, `docs/security/security-requirements.md`, `.cursor/rules/00-05*.mdc` (6 files).

### 3b. Operating Model (KEEP, canonical, newly merged)
`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`, `docs/ai/templates/mission-template.md`, `docs/ai/templates/completion-report-template.md`, `docs/ai/templates/handoff-template.md`.

### 3c. Mission-state system A — `docs/ai/`
`docs/ai/current-task.md` (canonical per §2 above), `docs/ai/oaes-project-profile.md` (canonical per §2 above), `docs/ai/project-context.md`, `docs/ai/agent-roles.md`, `docs/ai/oaes-integration-acceptance-report.md`.

### 3d. Mission-state system B — `docs/project/` (candidate for retirement)
`docs/project/00_PROJECT_INDEX.md`, `01_PROJECT_STATE.md`, `02_ROADMAP.md`, `03_DECISIONS.md`, `04_PRODUCTS.md`, `05_RESEARCH_INDEX.md`, `06_NEXT_TASK.md`, `07_CHANGELOG.md`, `08_RISKS.md`, `CURRENT_HANDOFF.md`, plus the generator `scripts/project-handoff.ps1`.

### 3e. One-off mission reports and handoffs, `docs/ai/`, dated 2026-08-13 → 2026-08-15 (17 files)
`STAFF_AUTH_GIT_COMMIT_PUSH_REPORT_2026-08-14.md`, `STAFF_AUTH_GIT_PREPARATION_REPORT_2026-08-14.md`, `STAFF_AUTH_PROVISIONING_FINAL_LOCAL_GATE_2026-08-14.md`, `STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md`, `STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT_2026-08-14.md`, `STAFF_AUTH_CLEAN_BRANCH_REPORT_2026-08-14.md`, `STAFF_AUTH_PREVIEW_PREFLIGHT_REPORT_2026-08-14.md`, `STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md`, `STAFF_PRODUCT_SURFACE_AND_QA_IDENTITY_AUDIT_2026-08-14.md`, `CANONICAL_CAFE_STAFF_CONSOLIDATION_LOCAL_REPORT_2026-08-14.md`, `CANONICAL_CAFE_PREVIEW_ACCEPTANCE_REPORT_2026-08-14.md`, `MANAGER_ROUTE_AUTHORIZATION_FINAL_REPORT_2026-08-14.md`, `ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`, `STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md`, `CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF_2026-08-15.md`, `CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`.

### 3f. Untracked cross-tool / root-level docs
`docs/AI_PLAYBOOK.md`, `docs/QA_ACCESS.md`, `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`, `docs/architecture/engineering-decisions.md` — all currently **untracked** (`git status`), i.e. not yet part of any commit other operators or clones would see.

### 3g. Tooling layer
`.claude/settings.json`, `.claude/settings.local.json`, `.claude/skills/linebos-pre-pr-verify/SKILL.md`, `.claude/skills/linebos-tenant-rls-audit/SKILL.md`, `.claude/scheduled_tasks.lock` (runtime lock file, not governance), `.agents/skills/linebos-pre-pr-verify/SKILL.md`, `.agents/skills/linebos-tenant-rls-audit/SKILL.md`.

### 3h. Approval-boundary statements (comparison only, not a file-disposition list)
`docs/foundation/core-laws-and-product-dna.md` (Law 6), `docs/foundation/oruwa-engineering-principles-and-governance.md` §7.5, `docs/adr/0004-ai-human-in-the-loop.md`, `docs/adr/0010-...` §H, `docs/security/security-requirements.md` §7, `docs/operations/deployment-checklist.md`, `docs/development/product-acceptance-workflow.md` (confirmed to exist), `.cursor/rules/04-ai-agent-workflow.mdc`, `docs/ai/agent-roles.md` §2/§15, `docs/ai/oaes-project-profile.md` "Authority boundaries", `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §9.

---

## 4. Reference / Dependency Map (VERIFIED by repo-wide grep)

| File | External referencers (excluding self) | Referenced from an entrypoint (AGENTS.md/CLAUDE.md/hierarchy doc)? |
|---|---|---|
| `docs/ai/current-task.md` | ~20 files across `docs/ai/`, `docs/project/`, `docs/foundation/`, `docs/product/`, root `plan.md` | **Yes** — AGENTS.md, CLAUDE.md, `documentation-and-decision-hierarchy.md` §2 |
| `docs/ai/oaes-project-profile.md` | ~12 files, incl. `.agents/skills/linebos-pre-pr-verify/SKILL.md` | **Yes** — AGENTS.md, CLAUDE.md, `documentation-and-decision-hierarchy.md` §2 |
| `docs/ai/project-context.md` | Only `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` and `docs/ai/agent-roles.md` | **No** |
| `docs/ai/agent-roles.md` | Only `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` | **No** |
| `docs/project/` (any file, as prefix) | `docs/project/*` files referencing each other, `scripts/project-handoff.ps1`, `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` (as a *flagged conflict*, not an endorsement) | **No** — absent from `documentation-and-decision-hierarchy.md` §2 entirely |
| `docs/AI_PLAYBOOK.md` | `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` + 6 `docs/ai/STAFF_AUTH_*`/`2026-08-14` mission reports | **No** |
| `docs/QA_ACCESS.md` | 11 files, all `docs/ai/` handoffs/reports from 2026-08-13→15 | **No** |
| `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md` | 7 `docs/ai/` files + `docs/foundation/repository-maturity-roadmap.md` + `plan.md` | **No** |
| `docs/architecture/engineering-decisions.md` | None found | **No** — orphaned |

**Implication**: `docs/ai/current-task.md` and `docs/ai/oaes-project-profile.md` are genuinely wired into the authority chain and load-bearing. `project-context.md`, `agent-roles.md`, all of `docs/project/*`, and the three untracked root/docs files are **not** wired into the chain at the entrypoint level — they are referenced only by each other or by mission-report cross-links, and in `project-context.md`/`agent-roles.md`'s case, only by the very document (`ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`) that is flagging them as a problem.

---

## 5. Duplicate-Rule Map

| Rule area | Canonical source | Duplicated (near-verbatim) in |
|---|---|---|
| Multi-tenant architecture, no isolated projects | `.cursor/rules/00-project-architecture.mdc` | `AGENTS.md` "What this is", `CLAUDE.md` |
| RLS/tenant_id mandatory | `.cursor/rules/02-database-rls.mdc` | `AGENTS.md` rules 1–2 |
| service_role server-only, PII, audit, webhook sig | `.cursor/rules/01-security.mdc`, `docs/security/security-requirements.md` | `AGENTS.md` rules 3–7, `CLAUDE.md` (service_role only) |
| Git branch model (`main`/`dev`/`feature/*`) | `.cursor/rules/03-git-workflow.mdc` | `AGENTS.md` "Git rules" |
| AI propose→approve→apply→audit | `.cursor/rules/04-ai-agent-workflow.mdc`, ADR 0004 | `AGENTS.md` rule 8, `docs/security/security-requirements.md` §7, `.cursor` itself |
| Legacy-migration boundaries | `.cursor/rules/05-legacy-migration-boundaries.mdc` | `AGENTS.md` "Migration rules" |
| "What's the current mission/state" | `docs/ai/current-task.md` | `docs/project/01_PROJECT_STATE.md`, `06_NEXT_TASK.md`, `CURRENT_HANDOFF.md`, `00_PROJECT_INDEX.md` — **this is the one duplication that is a genuine second system, not just restated prose** |
| Evidence-level vocabulary (VERIFIED/INFERRED/UNKNOWN/NOT TESTED) | `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §6 (now canonical per its own text) | `docs/AI_PLAYBOOK.md` (LIVE VERIFIED/STATIC VERIFIED/etc. — a related but not identical vocabulary) |

The `.cursor/rules/*` ↔ `AGENTS.md` duplication is **by design** and low-risk: `.cursor/rules/*` is machine-enforced (Cursor reads `.mdc` directly), `AGENTS.md` is the human/agent-readable restatement, and both are already listed as siblings that must be "kept in sync" per `AGENTS.md`'s own text. This audit does not recommend touching that pair. The load-bearing duplication that matters is the state-tracking system (see §7).

---

## 6. Conflicting-Rule Map

No Foundation-, ADR-, or security-level document was found to contradict another. Two real inconsistencies exist one level down:

**A. Approval-boundary scope inconsistency** (not a direct contradiction — an inconsistency by omission):

| Document | Scope of what requires approval |
|---|---|
| `core-laws-and-product-dna.md` Law 6 | production deploy, destructive migration, data deletion, security-policy change, billing, mass messaging/LINE broadcast, role/permission change, legal docs, sensitive PII, critical integrations |
| ADR 0010 §H | production deploy, Cloud DB migrations, module enable/disable in prod, role/permission change, billing, destructive cleanup, customer PII, mass messaging, credentials/secrets |
| `oruwa-engineering-principles-and-governance.md` §7.5 | **all of the above, plus**: local DB reset, local migration execution, dependency install, external service connection, and **every** commit/push/PR-creation/merge/force-push/history-rewrite/branch-deletion |
| `deployment-checklist.md` | production deploy, `db push` to prod, destructive SQL, RLS change, billing, LINE broadcast, **and uniquely**: "any service-role usage path", customer data export/delete |
| `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §9/§10 | Cites the two above as canonical, and **explicitly narrows** §7.5's commit/push/PR bundle for an approved Standard mission (Founder-approved bounded delivery autonomy) — this narrowing is itself flagged in the Operating Model as a recorded, not silently resolved, conflict with `oaes-project-profile.md`'s and (by extension) §7.5's older wording. |

None of these actually permit an action another forbids — they are strict subsets/supersets of each other, so no agent following the broadest list (§7.5) would ever violate a narrower one. The risk is the reverse: an agent that reads only Law 6 or ADR 0010 (both narrower) would not learn that §7.5 additionally gates local DB resets and dependency installs, and would not learn about the deployment-checklist's service-role-path rule. The Operating Model's designation of two canonical lists (§9) is the right fix in principle; it has not yet been propagated by editing the other seven-plus lists, which the Operating Model itself acknowledges (its own "Known repository conflicts" item 3).

**B. `.claude` vs `.agents` skill behavioral drift** (CONFIRMED by direct `diff`, not merely alleged):

- `linebos-tenant-rls-audit`: **byte-identical** between `.claude/skills/` and `.agents/skills/` — no drift.
- `linebos-pre-pr-verify`: **three lines differ**, and the difference is behaviorally material:
  - `.claude/` copy: "ask before running the appropriate checks" / "ask first if unsure which checks apply" / "stop and ask a human" for anything touching packages/migrations/Cloud.
  - `.agents/` copy: "run the appropriate local checks" (no asking) / "ask first only if" a check installs deps, resets local DB, uses an external service, or crosses an `oaes-project-profile.md` boundary / "Local read-only checks are allowed [without asking]."

This is a real, actionable inconsistency: an agent following `.agents/skills/linebos-pre-pr-verify/SKILL.md` would run local typecheck/lint/test/build without asking, while the same-named `.claude/` skill would stop and ask first. `AGENTS.md` states these must be kept in sync; they currently are not, for this one skill.

**C. `agent-roles.md`/`project-context.md` operating-model mismatch** — both describe ChatGPT-as-CTO/Cursor-paused/Codex-emergency-only as "the current operating model." `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §2 explicitly documents this as known and unresolved (its own text: "flagged here as needing a Founder-reviewed refresh... not silently overridden").

---

## 7. State-Management Systems Comparison

| Property | `docs/ai/current-task.md` (System A) | `docs/project/*` (System B, 10 files + generator) |
|---|---|---|
| Canonical per `documentation-and-decision-hierarchy.md` §2? | **Yes**, named explicitly | **No** — absent from §2 entirely |
| Referenced from AGENTS.md / CLAUDE.md? | **Yes** | **No** |
| Last commit (VERIFIED) | 2026-08-10 | 2026-08-06 to 2026-08-08 (varies by file) |
| Aware the other system exists? | No cross-reference into `docs/project/` found | `00_PROJECT_INDEX.md` (2026-08-06) calls `docs/ai/current-task.md` "canonical for its scoped task, but currently stale and must be updated" — aware, but does not defer |
| Currency relative to repo HEAD (2026-08-15, PR #234 merged) | Stale by ~5 days — silent on all 2026-08-13→08-15 work (Staff Auth, Preview rollout, Manager-route fix, reference tenant, reconciliation audit) | Stale by ~7–9 days, silent on the same work plus everything `current-task.md` is also missing |
| Automation | None found | `scripts/project-handoff.ps1` auto-regenerates `01_PROJECT_STATE.md`/`06_NEXT_TASK.md`/`07_CHANGELOG.md`/`CURRENT_HANDOFF.md` — the automation itself is a reason this system persisted, not evidence it should remain canonical |
| Unique information not restated in System A or elsewhere | `03_DECISIONS.md` (PS-001…PS-011 compact decision index), `08_RISKS.md` (named risk register, several entries self-confirmed by this very audit), `07_CHANGELOG.md` (chronological significant-events log distinct from `git log`) | — |

**Finding**: both systems are stale today; neither is more current than the other by more than a few days. But only System A (`docs/ai/current-task.md`) is wired into the authority chain (§2, §4 above). System B was, per its own `01_PROJECT_STATE.md` text, created because System A was perceived as stale at the time — i.e., System B is a fork born from the same problem this audit is now asked to fix, not a considered second design. Running two parallel, mutually-unaware "what's current" trackers is strictly worse than picking one and keeping it current, even before considering the extra maintenance cost.

---

## 8. `.claude` / `.agents` Tooling Comparison

| Item | `.claude/` | `.agents/` | Verdict |
|---|---|---|---|
| `settings.json` / `settings.local.json` | Machine-enforced hard blocks (`supabase link/db push/pull/repair`, `vercel --prod`, `git push --force*`, `git push origin main*`, `rm -rf*`) and confirmation gates (`db reset`, `db:seed`, `git push*`, `supabase/migrations/**` edits) | No equivalent file | `.claude/settings.json` is the **only** machine-enforced layer in the repo; nothing in `.agents/` enforces anything |
| `skills/linebos-tenant-rls-audit` | — | — | Identical, no action needed |
| `skills/linebos-pre-pr-verify` | Ask-first default | Run-first-for-local-checks default | **Drift confirmed (§6B)** — needs reconciliation |
| Who actually reads `.agents/`? | N/A | No CI workflow, no `package.json` script, no `.claude/settings*.json` references `.agents/` at all (VERIFIED by grep). Referenced only in prose by `oaes-project-profile.md` ("Project helpers" routing target), `oaes-integration-acceptance-report.md` (changelog entry), and the Operating Model (flags the drift) | `.agents/skills/*` is git-tracked but has no confirmed enforcement mechanism in this repository — it functions as a second copy of skill instructions for non-Claude-Code agents in principle, but nothing currently reads it automatically |
| `.claude/scheduled_tasks.lock` | Untracked runtime lock file (session id/pid/timestamp) written by the scheduled-tasks feature | N/A | Not a governance file; should be `.gitignore`d (currently excluded only by accident of not being staged, not by an actual ignore rule) |

**Correction to a stale in-repo claim**: `docs/phase-1o-inventory-daily-stock-check-implementation-report.md` twice describes `.agents/` as "pre-existing untracked... unrelated, left as-is." That is inaccurate today — `.agents/skills/*` **is** git-tracked (confirmed via `git ls-files`). This is a minor factual staleness in an unrelated historical report, noted here for completeness but out of this mission's scope to fix (it is not a governance/process document).

---

## 9. Per-File Classification Matrix

| File | Classification | Notes |
|---|---|---|
| `CLAUDE.md` | **KEEP — canonical** | Already lean (pointer-only); no change needed |
| `AGENTS.md` | **KEEP — canonical** | Already the operational restatement layer; no change needed |
| `.cursor/rules/*.mdc` (6 files) | **KEEP — tooling-required** | Machine-read by Cursor; duplication with `AGENTS.md` is by design |
| `docs/foundation/*` (7 files) | **KEEP — canonical** | Frozen, protected, out of scope for edits |
| `docs/adr/*` (11 files) | **KEEP — canonical** | Protected, out of scope for edits |
| `docs/security/security-requirements.md` | **KEEP — canonical** | Protected, out of scope for edits |
| `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` | **KEEP — canonical** | Founder-approved, current |
| `docs/ai/templates/*` (3 files) | **KEEP — tooling-required** | Standing templates, actively used |
| `docs/ai/current-task.md` | **KEEP — canonical, needs UPDATE** | Canonical per §2/§4/§7; content is stale (last entry 2026-08-10) and should be brought current, but the file itself is not a cleanup target |
| `docs/ai/oaes-project-profile.md` | **KEEP — canonical, needs UPDATE** | Canonical; "Authority boundaries" wording should be refreshed to reflect the Founder-approved bounded delivery autonomy the Operating Model already records as superseding it (§9) |
| `docs/ai/project-context.md` | **UNKNOWN — Founder decision required** | Orphaned from the authority chain (§4); §13 (ChatGPT/Codex/Cursor model) is stale; §1–10/§14 (product/architecture/safety-rule content) may still be useful as a single onboarding brief. Candidate: MERGE the still-valid architecture/product content into a location `documentation-and-decision-hierarchy.md` §2 already lists (e.g. `docs/architecture/` or a short "How to onboard" pointer in `AGENTS.md`), then DELETE the file — but this reshapes content, which is a judgment call, not a pure duplicate-deletion |
| `docs/ai/agent-roles.md` | **UNKNOWN — Founder decision required** | Orphaned from the authority chain (§4); §3/§17 (ChatGPT/Codex-centric "current operating model") are stale and already superseded by the Operating Model's §2 responsibility table. However, its per-domain review-lens definitions and approval-checklist content (§2, §15, §18–19) are more detailed than anything in the Operating Model and are not restated elsewhere — a straight DELETE would lose real content. Candidate: MERGE the still-useful review-lens/checklist content into the Operating Model or a new `docs/ai/review-checklists.md`, then DELETE or truncate the rest |
| `docs/ai/oaes-integration-acceptance-report.md` | **DELETE — superseded** | One-off 2026-07-31 acceptance report; no standing rules; safe archive candidate (git history preserves it) |
| `docs/project/*` (10 files) + `scripts/project-handoff.ps1` | **DELETE — duplicate** (of `docs/ai/current-task.md`'s job), **except** `03_DECISIONS.md` and `08_RISKS.md` which are **MERGE INTO** a location `documentation-and-decision-hierarchy.md` §2 already recognizes | Not a canonical entry point (§2); duplicates System A; stale by 7–9 days; automation script becomes dead code once retired. `03_DECISIONS.md`'s PS-### index and `08_RISKS.md`'s risk register contain information not found elsewhere — see §10 |
| 17 dated mission reports/handoffs in `docs/ai/` (§3e list) | **DELETE — superseded**, with 3 exceptions flagged below | One-off records of completed missions; git history is the durable archive per this mission's own instructions. Three files carry load-bearing decisions not fully restated elsewhere and need content extraction before deletion (see §10): `STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md` (§3 Founder decisions — one-employee-per-tenant invariant, no-LINE-Login, existing-user design), `ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` (Defects A/B/C — this file is currently the only defect log), `CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md` (the single most current statement of Cafe v2.1 Staff-surface state — should be absorbed into `current-task.md`, not deleted, until its content is superseded by a fresher status update) |
| `docs/AI_PLAYBOOK.md` | **MERGE INTO `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`, then DELETE**, or **KEEP — domain-specific** if the Founder wants a standalone cross-tool (non-Claude) reference | Currently untracked; not a canonical entry point; contains unique content (§9 Founder-acceptance order, §10 defect/evidence standard, §11 A/B/C/D classification) not duplicated elsewhere. The Operating Model already treats its evidence vocabulary as "canonical" going forward (§6) while leaving `AI_PLAYBOOK.md` uncommitted and unlinked — an unresolved half-merge. This is a Founder decision: is there still a need for a ChatGPT/Codex-readable operating doc separate from the Claude-specific Operating Model, or has Claude Code fully absorbed that role? |
| `docs/QA_ACCESS.md` | **KEEP — tooling-required, but commit or relocate deliberately** | Untracked; contains live (if disposable/Preview-only) credentials in plaintext. Not a governance document — an operational QA cheat-sheet. Recommend keeping but moving under `docs/operations/` (a directory §2 already lists) and confirming the credentials are genuinely Preview-only/rotatable before committing |
| `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md` | **DELETE — superseded** | Untracked, self-describes its own content as needing re-verification, references migrations/PRs far behind current HEAD (migration 0035–0040 vs. current 0060; PR #134 vs. current #234). Fully superseded by `docs/ai/current-task.md` + the Operating Model's handoff mechanism. Root-level placement (outside `docs/`) is itself nonstandard |
| `docs/architecture/engineering-decisions.md` | **KEEP — domain-specific, needs linking** | Untracked but evidence-grade (cites real commit hashes, current file paths); orphaned (zero inbound references). Not a duplicate of anything — recommend committing and linking from `docs/architecture/` index rather than deleting |
| `.agents/skills/linebos-pre-pr-verify/SKILL.md` | **UPDATE** | Reconcile with `.claude/` copy (§6B) — pick one behavior (recommend the more conservative `.claude/` "ask before running" default, since `.agents/` has no machine-enforced backstop equivalent to `.claude/settings.json`) |
| `.agents/skills/linebos-tenant-rls-audit/SKILL.md` | **KEEP — tooling-required** | Already identical to `.claude/` copy; no change needed |
| `.claude/scheduled_tasks.lock` | **UPDATE** (add to `.gitignore`) | Not a governance file; currently excluded from commits only by accident |

---

## 10. Unique-Information Preservation Analysis

Before any DELETE proceeds, this information must survive somewhere the authority chain (§2) already recognizes:

| Source (deletion candidate) | Unique information | Proposed destination |
|---|---|---|
| `docs/project/03_DECISIONS.md` | PS-001…PS-011 compact decision index (one-line reason/reversibility/source per decision) | `docs/adr/` index or a short table appended to `documentation-and-decision-hierarchy.md` §2 area — Founder to decide whether this compact-index format is worth keeping at all, since full ADRs already exist |
| `docs/project/08_RISKS.md` | Named risk register (documentation drift, dual-system staleness, blind auto-handoff updates, IAC resume-from-BLOCKED gap, mixed working tree) | `docs/operations/` (a recognized entrypoint) as a standing risk register, or fold into the Operating Model's "Known repository conflicts" section, which already tracks a similar list |
| `docs/project/07_CHANGELOG.md` | Chronological table of significant merges/decisions/gates distinct from raw `git log` | Lowest priority to preserve — `git log` is the authoritative substitute per this mission's own instruction ("Git history is the default archive") |
| `docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md` §3 | Founder decisions in force: one-employee-per-tenant invariant, no-LINE-Login-in-this-task, existing-user-no-new-email design | Extract into `docs/ai/current-task.md` or a standing architecture/decision doc before the report is archived |
| `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` | Defects A/B/C — this file is currently the only defect log for the `oruwa-cafe` reference tenant | Extract into a standing defect log (does not currently exist) or `docs/ai/current-task.md`'s "next gate" section before archiving |
| `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md` | Most current statement of Cafe v2.1 Staff-surface acceptance state (`FULL_CAFE_V2_1_STAFF_ACCEPTANCE = NOT_READY`) | Should be reflected in `docs/ai/current-task.md`'s next-gate section as the next mission's starting point — this file itself is not obsolete yet, do not delete until its content is absorbed or superseded |
| `docs/ai/agent-roles.md` §2/§15/§18–19 | Per-domain review-lens focus areas and PR review checklists more detailed than anything in the Operating Model | Merge into the Operating Model §11 (QA model) or a new `docs/ai/review-checklists.md`, scoped to Claude Code rather than ChatGPT/Codex |
| `docs/ai/project-context.md` §1–10, §14 | Product vision / architecture / schema summary not contradicted by anything newer | Founder decision: fold into `docs/architecture/` overview, or confirm `README.md`/`AGENTS.md` already cover this adequately and the file is pure redundancy |
| `docs/AI_PLAYBOOK.md` §9–11 | Founder-acceptance 17-step order; defect/evidence severity standard (P0–P3); A/B/C/D improvement classification | Founder decision: merge into the Operating Model (which already treats its evidence vocabulary as canonical) or keep as a separate cross-tool doc |
| `docs/QA_ACCESS.md` | Live disposable QA credentials | Keep as-is but relocate under `docs/operations/`; not a deletion candidate |
| `docs/architecture/engineering-decisions.md` | ED-001–ED-005 evidence-backed technical decisions | Not deleted — recommend committing + linking, this file has no destination problem, only a visibility problem |

---

## 11. Proposed Minimal Target Structure

```
Foundation / ADR / Security                          (unchanged, protected)
        ↓
Repository entrypoints / machine guardrails            (unchanged: AGENTS.md, CLAUDE.md, .cursor/rules/*)
        ↓
ORUWA AI Engineering Operating Model                    (unchanged, canonical)
        ↓
Mission-specific state:  docs/ai/current-task.md         (ONE system — docs/project/* retired)
                          docs/ai/oaes-project-profile.md  (kept, wording refreshed per §9's own note)
        ↓
Handoff / Completion evidence:  docs/ai/<WORKSTREAM>_HANDOFF_<DATE>.md
                                 + mission completion reports
                                 (mission-history files remain in docs/ai/ but are
                                  understood as archival once superseded — no new
                                  subdirectory required unless the Founder wants one;
                                  see §16 "Risks of cleanup" for the archive-directory
                                  question)
```

`.claude/skills/*` becomes the single source of truth for skill behavior; `.agents/skills/*` either mirrors it exactly (as `linebos-tenant-rls-audit` already does) or is retired if no non-Claude tool is confirmed to actually read it (§8 found no such consumer today — this is a Founder question, not something this audit can resolve alone, since "is any other agent actually using `.agents/`" is outside repository-visible evidence).

This matches the structure suggested in the mission brief. This audit did not find repository evidence requiring a different shape.

---

## 12. Exact Files Proposed to KEEP (unchanged)

`CLAUDE.md`, `AGENTS.md`, all `.cursor/rules/*.mdc` (6), all `docs/foundation/*` (7), all `docs/adr/*` (11), `docs/security/security-requirements.md`, `docs/operations/deployment-checklist.md`, `docs/development/product-acceptance-workflow.md`, `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`, all `docs/ai/templates/*` (3), `docs/ai/current-task.md`, `docs/ai/oaes-project-profile.md` (content), `.claude/settings.json`, `.claude/settings.local.json`, `.claude/skills/*` (2), `.agents/skills/linebos-tenant-rls-audit/SKILL.md`, `docs/architecture/engineering-decisions.md` (recommend committing it, unchanged content).

## 13. Exact Files Proposed to UPDATE

- `docs/ai/current-task.md` — bring current through 2026-08-15 (absorb `CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`'s verdict as the next gate).
- `docs/ai/oaes-project-profile.md` — refresh "Authority boundaries" wording to reflect the Founder-approved bounded delivery autonomy the Operating Model already records as superseding it (Operating Model §9's own flagged item).
- `.agents/skills/linebos-pre-pr-verify/SKILL.md` — reconcile with `.claude/` copy (recommend adopting the more conservative `.claude/` behavior, since `.agents/` has no machine-enforced backstop).
- `.gitignore` — add `.claude/scheduled_tasks.lock` (or the `.claude/` runtime-state pattern it matches).
- `docs/QA_ACCESS.md` — relocate to `docs/operations/qa-access.md` (or equivalent) and commit deliberately.

## 14. Exact Files Proposed to MERGE

- `docs/project/03_DECISIONS.md` → decision index location TBD by Founder (§10).
- `docs/project/08_RISKS.md` → `docs/operations/` risk register, or Operating Model "Known repository conflicts" section (§10).
- `docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md` §3 → `docs/ai/current-task.md` (extract Founder decisions only, then the source file becomes a pure DELETE candidate).
- `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` (Defects A/B/C) → `docs/ai/current-task.md` next-gate section, or a new standing defect log.
- `docs/ai/agent-roles.md` §2/§15/§18–19 (review-lens + checklists) → Operating Model §11, or new `docs/ai/review-checklists.md`.
- `docs/ai/project-context.md` §1–10/§14 (product/architecture content, if not already redundant with `README.md`/`AGENTS.md`) → `docs/architecture/` or `README.md`.
- `docs/AI_PLAYBOOK.md` §9–11 (Founder-acceptance order, defect/evidence standard, A/B/C/D classification) → Operating Model, if the Founder confirms `AI_PLAYBOOK.md` itself should retire (§16 Founder decision).

## 15. Exact Files Proposed to DELETE

**DELETE — superseded** (safe once any §10 extraction above is done first):
`docs/project/00_PROJECT_INDEX.md`, `01_PROJECT_STATE.md`, `02_ROADMAP.md`, `04_PRODUCTS.md`, `05_RESEARCH_INDEX.md`, `06_NEXT_TASK.md`, `07_CHANGELOG.md`, `CURRENT_HANDOFF.md`, `scripts/project-handoff.ps1`; `docs/ai/oaes-integration-acceptance-report.md`; `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`; and, once their §10 extractions are complete, the 17 dated mission reports/handoffs in `docs/ai/` listed in §3e (with `CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md` held back until its content is absorbed into `current-task.md`, not deleted alongside the rest).

**DELETE — duplicate** (pending Founder decision on destination, §10): `docs/project/03_DECISIONS.md`, `08_RISKS.md` (delete only after their unique content is merged, not before).

**DELETE — conditional on Founder decision, not a clean duplicate** (§16): `docs/ai/project-context.md`, `docs/ai/agent-roles.md`, `docs/AI_PLAYBOOK.md` — none of these should be deleted outright without the merge step in §10/§14, because each contains real content not restated elsewhere.

---

## 16. Founder Decisions Required

1. **Confirm `docs/ai/current-task.md` is the single mission-state mechanism going forward**, and `docs/project/*` is retired (this audit recommends yes — System B is unreferenced by any entrypoint and was itself born from perceiving System A as stale).
2. **Decide the destination (or non-destination) for `docs/project/03_DECISIONS.md` and `08_RISKS.md`'s unique content** before deleting those two files.
3. **Decide whether `docs/ai/project-context.md` and `docs/ai/agent-roles.md` should be rewritten/re-scoped to the current Claude-Code-centric model, merged into the Operating Model, or deleted outright** — this audit found real, non-duplicate content in both (review-lens checklists in `agent-roles.md`; product/architecture brief in `project-context.md`) that would be lost by a straight delete.
4. **Decide whether `docs/AI_PLAYBOOK.md` still serves a purpose** as a non-Claude-Code (ChatGPT/Codex) operating reference, or should be merged into the Operating Model and retired — it is currently untracked, unlinked from any entrypoint, yet actively cited by same-day mission handoffs, which is itself an inconsistent state.
5. **Confirm which of the two designated-canonical approval-boundary lists (`oaes-project-profile.md` "Authority boundaries" and Core Laws Law 6) should be edited to close the scope gap with `oruwa-engineering-principles-and-governance.md` §7.5** (local DB reset / dependency install / commit-push-PR bundling) — or confirm the current "two canonical, seven-plus legacy but consistent" state is acceptable and no further edit is needed.
6. **Confirm the fix direction for `.agents/skills/linebos-pre-pr-verify/SKILL.md`** — adopt `.claude/`'s more conservative behavior (this audit's recommendation, since `.agents/` has no machine-enforced backstop), adopt `.agents/`'s more permissive behavior, or confirm whether any tool actually consumes `.agents/` at all before spending effort reconciling it.
7. **Decide whether an archive directory is warranted** for the 17 dated mission reports, or whether git history alone (this mission's stated default) is sufficient. This audit found no concrete operational reason requiring a visible archive directory — the mission brief's own instruction is that git history is the default archive absent such a reason — but flags it as a Founder call since some of these reports (e.g. `ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`) are still being actively cited by the most recent mission work as of this audit's date.
8. **Confirm `docs/QA_ACCESS.md`'s credentials are genuinely disposable/Preview-only** before committing it to the repository under `docs/operations/`.

---

## 17. Risks of Cleanup

- **Losing the only copy of load-bearing information.** Mitigated by §10's extraction list — no DELETE in §15 should execute before its corresponding §10 row (if any) is merged into a surviving location.
- **Breaking an in-flight reference.** Several 2026-08-13→15 mission reports actively cross-reference each other (e.g. the reconciliation audit corrects claims in the earlier QA-identity audit). Deleting in the wrong order, or deleting a report still needed to explain "why" a recent architecture decision was made, degrades institutional memory even though git history technically preserves the bytes — git history is not discoverable the same way a linked doc is.
- **`scripts/project-handoff.ps1` becomes dead code** once `docs/project/*` is retired; leaving it in place with no target files would silently fail or write to files nobody reads. It should be removed in the same change as `docs/project/*`, not left behind.
- **Re-introducing the same duplication later** if a future session doesn't know System B was intentionally retired (not merely forgotten). A brief note in `docs/ai/current-task.md` or the Operating Model's "Known repository conflicts" section recording the retirement (with date and rationale) prevents this.
- **Approval-boundary edits are themselves a governance change**, not a pure cleanup — editing `oaes-project-profile.md`'s "Authority boundaries" wording (Founder decision 5 above) touches a canonical document and should go through the same Founder Review any Foundation-adjacent edit gets, even though `oaes-project-profile.md` itself is not a Foundation document.
- **`docs/QA_ACCESS.md` contains a plaintext password.** Even a disposable/Preview-only credential should not be committed without explicit Founder confirmation that it's safe to do so — committing it is a small but real action this audit flags rather than silently recommending.

---

## 18. Exact Implementation Sequence (for Phase 2, not executed by this mission)

1. Founder reviews this audit and answers §16 decisions 1–8.
2. Extract unique content per §10 into its confirmed destinations (§16 decisions 2, 3, 4) — this is content-writing, done before any deletion.
3. Update `docs/ai/current-task.md` to current state (absorbing the reconciliation audit's verdict) and note the `docs/project/*` retirement with date/rationale.
4. Update `docs/ai/oaes-project-profile.md`'s "Authority boundaries" wording per Founder decision 5.
5. Reconcile `.agents/skills/linebos-pre-pr-verify/SKILL.md` per Founder decision 6.
6. Add `.claude/scheduled_tasks.lock` (or its pattern) to `.gitignore`.
7. Commit `docs/architecture/engineering-decisions.md` and `docs/QA_ACCESS.md` (after decision 8) deliberately, with links added from a recognized entrypoint.
8. Delete `docs/project/*` (10 files) + `scripts/project-handoff.ps1` in one commit, referencing this audit.
9. Delete the superseded one-off mission reports (§15 first bullet list) in one commit, after step 2's extractions are verified complete, holding back the reconciliation audit until its content is absorbed in step 3.
10. Delete `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md` and `docs/ai/oaes-integration-acceptance-report.md`.
11. Decide and execute on `docs/ai/project-context.md` and `docs/ai/agent-roles.md` per Founder decision 3 (rewrite, merge+delete, or delete).
12. Decide and execute on `docs/AI_PLAYBOOK.md` per Founder decision 4.
13. Open one PR into `dev` for the whole Phase 2 change set, citing this audit, for Founder review before merge — per the Operating Model's own bounded-delivery-autonomy rule, merge itself remains a human gate regardless.

## 19. Verification Plan After Cleanup

- Re-run this audit's Part A reference-map greps against the post-cleanup tree; confirm zero remaining references to deleted files outside git history.
- Confirm `documentation-and-decision-hierarchy.md` §2's canonical entry-point list still resolves — every listed path still exists.
- Confirm `AGENTS.md`/`CLAUDE.md`/`ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` read order still makes sense with `docs/project/*` gone (no dangling "see docs/project" pointers left in any surviving file).
- Re-run the `.claude`/`.agents` skill diff; confirm zero drift.
- Confirm `.claude/scheduled_tasks.lock` no longer appears in `git status --short`.
- Have the Strategic CTO / independent gate (per Operating Model §12) review the Phase 2 diff before Founder merge sign-off, given this is a documentation-structure change touching every future mission's bootstrap sequence.

## 20. Final Recommendation

Proceed to Phase 2 once the Founder has answered §16. The consolidation is net-positive and low-risk **provided the §10 extraction step happens before any deletion** — every DELETE candidate in this audit was checked for unique content, and the ones that have it (`agent-roles.md`, `project-context.md`, `03_DECISIONS.md`, `08_RISKS.md`, two specific mission reports, `AI_PLAYBOOK.md`) are marked MERGE-then-DELETE or UNKNOWN, not straight DELETE. The remainder — 10 `docs/project/*` files, 1 generator script, 2 fully-superseded reports, 14 of the 17 dated mission reports, and the root-level Russian handoff — are clean, low-risk deletions with git history as the archive, consistent with this mission's own instruction not to keep obsolete files "merely for historical archival value."

---

## Adversarial Self-Review

- **Did I recommend deleting anything without checking references first?** No — every §15 DELETE candidate was checked in §4/§10 for inbound references and unique content before being listed; three files that looked like clean duplicates on their filenames alone (`agent-roles.md`, `project-context.md`, `AI_PLAYBOOK.md`) were reclassified to UNKNOWN/MERGE once their content was actually read, per the mission's explicit instruction not to assume similarly-named or superficially-stale files are duplicates without comparing responsibilities.
- **Did I treat Founder-decision items as already decided?** No — §16 lists 8 open items and §15's "DELETE — conditional" bucket explicitly withholds three files from the clean-delete list pending those decisions.
- **Did I verify the `.agents` drift claim rather than repeating the Operating Model's own assertion?** Yes — a direct `diff` was run and quoted (§6B, §8); the claim was confirmed accurate, not merely repeated.
- **Did I verify the canonical-entry-points claim rather than trusting the Operating Model's summary?** Yes — `documentation-and-decision-hierarchy.md` was read in full directly by the Lead Agent (not only by a subagent) and its exact §2 list is quoted verbatim in §2 above.
- **Could `docs/project/*`'s automation (`scripts/project-handoff.ps1`) be load-bearing in a way this audit missed** (e.g. a CI job or pre-commit hook invoking it)? Not confirmed either way by this audit — no CI/hook reference to it was found by the reference-map subagent, but that subagent's search was targeted at documentation references, not exhaustively at `.github/workflows/*` or `package.json` scripts for this specific script. **Flagged as a gap**: Phase 2 step 8 should re-grep for `project-handoff.ps1` specifically (not just `docs/project`) in CI/scripts before deleting it.
- **Did this audit itself avoid creating a competing summary document?** It is one new file, matching the "the audit may be written to `docs/ai/ORUWA_AI_GOVERNANCE_CONSOLIDATION_AUDIT.md`" option the mission brief explicitly offered, and it is a one-time Phase 1 deliverable, not a new standing governance layer — it does not restate rules from Foundation/ADR/security/.cursor documents, only maps and classifies what already exists, consistent with the mission's design rule ("one canonical rule + references to that rule, over the same rule rewritten in five files").
- **Residual uncertainty**: item 7 above (automation dependency check) and the exact destination for `03_DECISIONS.md`/`08_RISKS.md`/`AI_PLAYBOOK.md` content are the main pieces of this audit that are genuinely unresolved rather than merely awaiting a rubber-stamp; they are called out as such in §16 rather than given a false-confidence recommendation.

**STOP — Phase 1 complete. No files were deleted, moved, rewritten, committed, pushed, or opened as a PR by this mission. Awaiting Founder / Strategic CTO review of §16 before any Phase 2 implementation.**
