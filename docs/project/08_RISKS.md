# ORUWA Current Risks

> **Superseded, 2026-08-15 (ORUWA AI Governance Consolidation, Phase 2B).**
> `docs/project/*` is retired as an active state system; this file is kept
> only pending Phase 2C deletion — do not update it further. Still-current,
> actionable risks were migrated to `docs/operations/risk-register.md`,
> which also records which risks below were judged stale/resolved and why.

| Risk | Severity | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|
| Mixed working tree with untracked research/generated files | High | Accidental scope pollution or data loss | Explicit paths only; no `git add .`, clean, reset, stash, or unrelated restore | Task owner | Open |
| Stale task/handoff documents | High | Agent resumes obsolete work | Git preflight; label freshness; update `current-task` in next evidence change | CTO / task owner | Open |
| Technical PASS mistaken for commercial readiness | High | Unsupported release/sales claims | Separate engineering, live acceptance, Founder, and commercial gates | Founder / Product | Open |
| P1-4 audit logging unresolved | High | Mutation audit policy may remain unmet | Founder decision: bounded exception or lightweight audit path | Founder / CTO | Open |
| Incomplete Staff/Preview acceptance | High | Role or workflow defects escape | Isolated Manager and Staff sessions; fail-closed checks | QA / CTO | Open |
| Incomplete performance baseline | Medium | Unverified responsiveness claims | Reproducible user-observed measurements; no fake server/DB conclusions | QA | Open |
| Public one-hour onboarding claim unvalidated | High | Commercial trust risk | Rehearsal before any public promise | Founder / Ops | Open |
| Remaining Cafe research incomplete | Medium | Weak or oversized v2.2 selection | Finish module research before scope freeze | Product | Open |
| IAC resume-from-BLOCKED process gap | High | Automated resume may overwrite manual remediation | Treat hand-guided resume as unsafe until fixed in orchestrator | IAC owner | Open, Founder-reported |
| Documentation drift | Medium | Project State becomes misleading | Update state/next task/changelog at significant events; link checks | Task owner | Open |
| Blind auto-handoff updates | Medium | Subjective claims become false facts or changelog noise | Automation reads Git facts but requires a human-supplied significant event, evidence, and next task; no hidden Git hook | Task owner | Mitigated by design |
| Tenant isolation, RLS, service-role, migration regression | Critical | Cross-tenant exposure or production damage | Follow AGENTS/security/ADR gates; explicit approval for high-risk changes | CTO / Security | Continuous |
| Premature Platform Foundation or second vertical | Medium | Cafe critical path and cash validation delayed | Demand-led platform work; research gate for next vertical | Founder / Product | Open |
