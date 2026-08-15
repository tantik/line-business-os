# ORUWA operational risk register

Current, actionable risks only. A resolved or superseded risk is removed,
not kept for history — git history preserves the record. Each entry:
risk, impact, current status, mitigation, owner/gate, last verified date.

| Risk | Impact | Status | Mitigation | Owner / gate | Last verified |
|---|---|---|---|---|---|
| Long-lived untracked files in the working tree (docs, generated types, stray migrations) accumulate across sessions | Accidental scope pollution, or a future session mistaking one for in-scope work | Open — confirmed present via `git status` | Explicit-path staging only; never `git add -A`/`.`; each new session re-reads `git status` rather than trusting a prior session's file list | Task owner, every session | 2026-08-15 |
| Tenant isolation / RLS / `service_role` / migration regression | Cross-tenant data exposure or production damage | Continuous — no open incident, this is a standing discipline risk, not a one-off | Follow `AGENTS.md`/`.cursor/rules/01-security.mdc`/`02-database-rls.mdc`/security-requirements.md gates; explicit human approval for any migration/RLS/Auth change | CTO / Security review lens, every DB-touching PR | 2026-08-15 |
| A technical/engineering PASS is mistaken for commercial release readiness | Unsupported release or sales claims to a real customer | Open — Cafe v2.0 and v2.1 both currently have engineering-level PASS results without a declared Commercial Release | Keep Engineering PASS, Founder Technical Freeze, and Commercial Release explicitly distinct in every acceptance report (`docs/ai/review-checklists.md` "Founder Acceptance order") | Founder / Product | 2026-08-15 |
| Public "one-hour onboarding" commercial claim is unvalidated | Commercial trust risk if claimed before proven | Open — no rehearsal recorded yet | Do not make the claim publicly before a successful, evidenced rehearsal | Founder / Ops | 2026-08-15 |
| Starting Platform Foundation work or a second vertical before Cafe (the first vertical) is commercially validated | Diverts effort from the critical path and cash validation | Open — relevant while Cafe v2.1 open items (`docs/ai/current-task.md` §2.3) and v2.2 scope are still unresolved | Demand-led platform work only; require a research/product-review gate before starting a second vertical | Founder / Product | 2026-08-15 |

## Out of scope for this register

Risks that were in the retired `docs/project/08_RISKS.md` but are not
carried forward here, and why:

- **Stale task/handoff documents** — addressed structurally: `docs/ai/current-task.md`
  is now the single canonical state file (`docs/project/*` retired), removing
  the dual-tracker cause of this risk.
- **Blind auto-handoff updates** — specific to `scripts/project-handoff.ps1`
  automation, which is retired along with `docs/project/*`.
- **Incomplete performance baseline**, **remaining Cafe research incomplete**
  — product/engineering backlog items, not standing operational risks; see
  `docs/product/cafe-v2-2-candidate-backlog.md` and
  `docs/ai/current-task.md` §2.3 instead.
- **IAC resume-from-BLOCKED process gap** — concerns a separate orchestrator
  tool, not evidenced as current against this repository; not carried
  forward without fresher confirmation.
- **P1-4 audit logging** — resolved for Preview scope by ADR 0011; the
  remaining "full business audit required before Commercial Release"
  constraint is already recorded there, not duplicated here.
