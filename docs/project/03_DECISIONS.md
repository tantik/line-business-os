# ORUWA Decision Index

This file indexes accepted decisions; it does not copy the full ADR or Foundation text. Follow the linked source for exact wording.

| ID | Date | Decision | Reason / consequence | Reversible | Source |
|---|---|---|---|---|---|
| PS-001 | accepted baseline | One shared multi-tenant SaaS; no customer-specific forks | Reuse capabilities and preserve a single operational truth | Strategic, costly to reverse | [Core Laws](../foundation/core-laws-and-product-dna.md), [ADR 0010](../adr/0010-modular-product-governance-and-client-request-classification.md) |
| PS-002 | accepted baseline | RLS and tenant-scoped business data are mandatory; location-scoped data also carries `location_id` | Database-enforced tenant isolation | No routine exception | [ADR 0002](../adr/0002-multi-tenant-rls.md), [`AGENTS.md`](../../AGENTS.md) |
| PS-003 | accepted baseline | `service_role` is server-only and forbidden on the frontend | Prevent privileged client bypass | No routine exception | [`AGENTS.md`](../../AGENTS.md), [Security requirements](../security/security-requirements.md) |
| PS-004 | 2026-08-06 | Foundation v1.0 is Frozen | Prevent duplicate or speculative governance layers | Change only via Foundation evolution rules | [Documentation hierarchy §8](../foundation/documentation-and-decision-hierarchy.md) |
| PS-005 | accepted strategy | Cafe is the first active vertical | Prove reusable platform value through one complete vertical | Reconsider only through portfolio review | [Portfolio strategy](../foundation/oruwa-portfolio-and-module-strategy.md) |
| PS-006 | accepted strategy | Web is the independent application; LINE is a strategic channel | Product must remain useful without mandatory LINE coupling | Reversible by reviewed strategy change | [Core Laws](../foundation/core-laws-and-product-dna.md) |
| PS-007 | accepted baseline | AI assists; risky actions require human approval | Human authority at high-risk boundaries | No silent exception | [Core Laws](../foundation/core-laws-and-product-dna.md), [ADR 0004](../adr/0004-ai-human-in-the-loop.md) |
| PS-008 | Founder-provided, evidence pending | Platform subscription billing and merchant payments are separate domains | Avoid mixing SaaS entitlement with customer commerce | Requires formal source before implementation | Founder-provided project history |
| PS-009 | Founder-provided, evidence pending | Do not make a public one-hour onboarding claim before a successful rehearsal | Commercial claims require evidence | Yes, after verified rehearsal | Founder-provided project history |
| PS-010 | Founder-provided, evidence pending | Cafe v2.2 selection prioritizes purchase probability and onboarding impact; no heavy ERP | Keep scope commercially useful and deployable | Yes, through Product Review | Founder-provided project history |
| PS-011 | 2026-08-06 | Cafe v2.1 Preview temporarily accepts DB-trigger actor/timestamp stamping instead of full `writeAudit` events | Avoid mixing Preview Freeze with a privileged audit-platform build; full business audit remains mandatory before Commercial Release | Exception expires before Commercial Release | [ADR 0011](../adr/0011-cafe-v2-1-preview-audit-exception.md) |

P1-4 is no longer open for Preview Freeze. ADR 0011 does not waive the full
business-audit requirement for Commercial Release.
