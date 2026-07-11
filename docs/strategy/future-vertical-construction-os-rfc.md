# Future Vertical RFC: Construction OS

**Status: RFC / Future Vertical / Not Current Sprint**

This document is a planning reference only. It does not authorize
implementation, migrations, routes, LINE bot flows, or pricing for
Construction OS. Read with [`../product/mvp-roadmap.md`](../product/mvp-roadmap.md),
[`../product/modules.md`](../product/modules.md), and
[`../architecture/overview.md`](../architecture/overview.md).

## 1. Executive Summary

Construction OS is a possible future vertical of LINE Business OS, aimed at
small and medium construction and renovation companies in Japan. It is not
part of the current sprint and must not interrupt the active priorities:
Cafe package / Workforce MVP, Salon package / Booking direction, and Clinic
package / Booking direction.

This document exists to preserve the Construction OS concept in enough
detail that it is not lost or reinvented from scratch later, and to record
the architecture implications that should inform current platform decisions
(naming, schema shape, generic concepts) even while the vertical itself
stays unbuilt. Nothing here changes the current roadmap.

The goal is a LINE-first operating system for construction operations, not
"just another CRM." CRM is one module among several; the core value is
connecting field workers, foremen, managers, owners, and clients through a
single ecosystem that starts from how these companies already communicate —
LINE.

## 2. Problem

Small and medium construction and renovation companies in Japan commonly
run operations through informal, fragmented channels:

- Field communication happens over LINE (individual chats, informal groups),
  outside any system of record.
- Progress photos are scattered across individual workers' phones, rarely
  organized by project or site.
- Documents (contracts, drawings, permits, material lists) live in different
  places — paper, email, personal cloud drives — with no shared structure.
- Status updates are manual and verbal: managers call foremen to ask "how is
  it going," rather than reading a current status.
- Clients ask for progress updates through ad hoc calls or messages, with no
  controlled way to share status without exposing internal chatter.
- Each project/site has a weak or nonexistent history — it is hard to
  reconstruct what happened, when, and who reported it.
- Materials, tasks, and delays are hard to track systematically, so
  bottlenecks are discovered late.

## 3. Target ICP

**Hypothesis, not confirmed market fact** — to be validated per Section 13.

Likely first target customers:

- Small and medium construction / renovation companies in Japan.
- Roughly 3–100 staff.
- Companies where LINE is already used informally for field communication.
- Owners/managers who want visibility into field progress but do not want to
  adopt heavy enterprise construction-management software.

Possible sub-niches to explore:

- Renovation companies (リフォーム).
- Interior construction / fit-out companies.
- Small general contractors.
- Repair and maintenance companies.
- Remodeling businesses.

## 4. Why LINE-first

- Field staff (foremen, workers) are unlikely to adopt a complex CRM or
  project-management tool as their primary interface — the friction is too
  high for people who are not at a desk.
- LINE is already the default communication channel in Japan and is already
  familiar to field staff without any training.
- LINE should be treated as the **primary operational interface for field
  workers**: sending a photo or message in LINE should be the main way work
  gets logged, not a separate step on top of "real" data entry.
- A dashboard (for managers/owners) and a client portal (for clients) can
  exist as the structured view on top of that LINE-originated data, used by
  people who are already at a desk or reviewing progress deliberately.
- Philosophy: do not force field workers to change their behavior and adopt
  CRM habits. Make the system work from the communication behavior they
  already have.

## 5. Existing Competitors

Japan already has construction management / field management tools that
overlap with parts of this concept. These are listed as **competitors to
research and track**, not as verified claims about their current state:

- ANDPAD
- KANNA
- Photoruction
- SPIDERPLUS
- Other construction DX / field management tools in the Japanese market

No prices, market share, customer counts, or specific feature claims are
asserted here. **All competitor facts, pricing, adoption numbers, and
current feature sets must be verified with up-to-date sources before any
go-to-market decisions.**

## 6. Differentiation

Possible differentiation versus existing tools, to be validated rather than
assumed:

- LINE-first field workflow instead of a standalone app field workers must
  learn.
- AI-assisted intake of photos/messages to reduce manual data entry, with
  human confirmation before anything becomes an authoritative status.
- Lightweight enough for small companies that cannot justify enterprise
  construction-management software.
- Structured project/site history built automatically from field activity.
- A client-facing progress portal that shares a controlled subset of
  project status, distinct from the internal operational view.
- Human-approved updates as a first-class concept, not an afterthought.
- Built as a vertical package inside LINE Business OS — sharing Core, auth,
  tenant/RLS, RBAC, and audit infrastructure with other verticals — rather
  than a separate one-off product with its own foundation.

## 7. MVP Hypothesis

Future MVP, narrowly scoped as:

**"Construction Photo & Progress OS via LINE"**

Should include:

- Projects / sites.
- Project stages.
- Photo upload/intake.
- LINE message/photo intake concept.
- Manager dashboard.
- Work log.
- Basic client portal / progress view.
- AI-assisted classification with human confirmation.

Explicitly excluded from MVP:

- Full finance.
- Full inventory/materials system.
- Defect detection.
- Automatic quality judgement.
- Legal/compliance judgement.
- Fully autonomous client notifications (no human in the loop).
- Full contract/payment automation.

## 8. Modules Needed

Future modules, in the same shape as existing modules described in
[`../product/modules.md`](../product/modules.md) (own schema, own package of
typed contracts, tenant/location scoping, RLS, RBAC, audit, demo +
client-template seed):

- Core (reused as-is)
- CRM
- Projects/Sites
- Tasks/Stages
- Workforce (likely reusable from the existing Workforce module)
- Media / Photo Diary
- Documents
- Client Portal
- Materials
- Finance
- AI Intake
- Notifications
- Analytics
- Audit Logs (reused as-is, via the existing audit infrastructure)

Existing LINE Business OS concepts that may be directly reusable: Core
tenant/location/membership/RBAC, the audit log system, the Workforce
employee/shift concepts (foremen and crews resemble shift-based staff), and
the AI human-in-the-loop approval pattern already required platform-wide
(`AGENTS.md` rule 8).

## 9. Architecture Implications

This is the most important section for present-day decisions, even though
Construction OS itself is not being built now.

- Keep `tenant_id` as the company boundary — one customer company remains
  one tenant, consistent with the current platform model.
- Keep `location_id` as the physical shop/office/location boundary.
- Plan for a future `project_id` concept for construction sites, renovation
  jobs, or other long-running client engagements. This does not need to
  exist today, but naming and schema decisions elsewhere should not assume
  every tenant's work is location-only with no project-level grouping.
- Do not hardcode platform concepts around cafe-only terminology. Prefer
  generic naming that already anticipates other verticals:
  - `module_key`: `workforce`, `booking`, `crm`, `projects`, etc.
  - `industry_key`: `cafe`, `salon`, `clinic`, `construction`, etc.
  - `knowledge_items`: a generic concept covering recipes (cafe), manuals,
    checklists, and site instructions (construction).
  - `media_assets`: a generic concept covering future photos, videos, and
    documents across verticals.
  - `audit_logs`: already generic; continue recording important business
    and security events regardless of vertical.
- Cafe recipes and construction site instructions should share a generic
  "knowledge item" concept where practical, rather than each vertical
  inventing its own bespoke content model.
- Future photo/video/document storage must be tenant-scoped and
  permission-controlled, consistent with existing PII/data-protection rules
  in `AGENTS.md`.
- AI actions must be logged, consistent with the existing audit requirement.
- AI-suggested updates and human-approved updates must be distinguishable in
  the data model — never collapse them into a single "status" with no
  provenance.
- Client portal data must be scoped so that one client cannot access another
  client's project or another tenant's data at all — this is a stricter
  boundary than internal staff access and needs its own review, not a reuse
  of staff-level RLS policies by default.
- Never use `service_role` on the frontend — this applies to Construction OS
  exactly as it does to every current module.
- RLS and tenant isolation remain mandatory for any future Construction OS
  schema, with no exceptions.

## 10. Risks

- Overbuilding Construction OS before the Cafe pilot has generated revenue
  or validated the platform approach.
- Strong existing competitors (ANDPAD, KANNA, Photoruction, SPIDERPLUS, and
  others) with an established presence in Japanese construction DX.
- AI misclassification of photos, messages, or status — especially
  consequential given the legal/commercial weight of construction status
  claims.
- Client trust risk if a client-facing portal shows inaccurate or
  unconfirmed status.
- Storage cost growth from photo/video/document volume at scale.
- Privacy and data protection risk around site photos, client information,
  and location data.
- Permission complexity from adding a client-portal audience on top of the
  existing staff/manager/owner roles.
- Operational complexity of supporting another full vertical alongside
  Cafe/Workforce and Salon/Clinic Booking.
- Scope creep: Construction OS pulling engineering attention away from
  current priorities.
- Legal/commercial risk if AI-generated content is ever interpreted as an
  authoritative claim about quality, defects, completion, or payment
  readiness (see Section 11 safety note below).

**AI safety note:** AI must be treated as assistive, not authoritative.
Construction OS must never claim that AI can reliably determine
legal/commercially significant facts such as construction quality, defects,
completion status, payment readiness, contractual compliance, or safety
compliance, without human confirmation. This mirrors the platform-wide rule
that "AI never writes business data directly" (`AGENTS.md` rule 8) and
should be treated as even stricter for this vertical given the legal stakes
involved in construction status claims.

## 11. Do-not-build-now List

- Do not build Construction OS now.
- Do not add DB migrations for Construction OS now.
- Do not add frontend routes for Construction OS now.
- Do not add LINE bot flows for Construction OS now.
- Do not change current Cafe / Workforce sprint priorities.
- Do not create fake production commitments related to Construction OS.
- Do not add pricing pages for Construction OS yet.
- Do not promise AI defect detection, legal compliance, or automatic
  completion judgement, now or in future marketing/sales material, without
  an explicit human-confirmation step.

## 12. Validation Plan

Future validation steps to complete before any implementation decision:

- Interview 5–10 small construction / renovation companies in Japan.
- Confirm current workflow around LINE usage, photo handling, reporting, and
  client communication.
- Collect real examples of photo/report chaos (concrete before/after
  material for the problem statement in Section 2).
- Identify willingness to pay and at what price range.
- Compare against existing tools (ANDPAD, KANNA, Photoruction, SPIDERPLUS,
  and others) on features actually used, not marketing claims.
- Test whether a LINE-first workflow is genuinely valuable to these
  companies, or whether they already tolerate/prefer existing tools.
- Validate whether a client-facing progress portal is actually a selling
  point, or a nice-to-have nobody asks for.
- Validate storage/cost expectations for photo- and video-heavy usage
  patterns.
- Decide, based on the above, whether Construction OS deserves active
  development.

## 13. Revisit Criteria

Construction OS should be revisited only after:

- The Cafe demo has been shown to the first client.
- The Cafe pilot has started or is scheduled.
- The Workforce MVP has a stable pilot path.
- First sales materials are ready.
- There is either revenue, strong design-partner evidence, or direct access
  to construction companies for validation.

## 14. Final Decision

Construction OS is accepted as a future strategic vertical reference for
LINE Business OS, but it is explicitly **not approved for active
implementation in the current phase**.
