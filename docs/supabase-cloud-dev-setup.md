# Supabase Cloud Dev Project — Setup & Preparation (Phase 1B)

This guide explains how a **human** creates and prepares a separate Supabase
**Cloud dev** project for LINE Business OS, safely, and records the completed
Phase 1B Cloud dev apply. Read `docs/phase-1-core-db.md` first for the
local-first flow and the existing migration scaffold.

> ✅ **Status: Phase 1B Cloud dev apply complete.** The human-created Supabase
> **Cloud dev** project has been prepared, linked, and the scaffold migrations
> `0000`–`0012` have been applied to it under the full approval gate. See
> [Phase 1B Cloud dev apply — completed status](#phase-1b-cloud-dev-apply--completed-status).
>
> ⚠ Every future Cloud-writing command remains gated behind explicit human
> approval (see [Approval gate before Cloud write](#approval-gate-before-cloud-write)).
> Future schema changes are **new forward migrations only**; destructive
> commands stay forbidden.

## Purpose

Prepare a dedicated Supabase **Cloud dev** project so the team can later run the
same `supabase/migrations` against a hosted environment — kept separate from any
future production project — **without** touching Cloud until a human explicitly
approves it. This document describes the human steps, the values to collect, and
the safety gates around them.

## Scope

- Document how a human creates the Cloud dev project in the Supabase dashboard.
- Document the values to collect from that project (with placeholders only).
- Document secret-handling rules and the placeholder env names this repo uses.
- Document which commands are safe (after approval) vs forbidden.
- Document a non-destructive link plan, migration visibility plan, dry-run plan,
  the approval gate, and rollback/stop conditions.

## What this document does not do

This document is preparation, process, and record-keeping only. It does not
itself perform any Cloud action, and the completed apply it records introduced
no product code:

- ❌ Does **not** create a real Supabase project via API or CLI (a human created
  it in the dashboard).
- ❌ Does **not** run `supabase link`, `supabase db push`, `supabase db pull`,
  `supabase db reset`, or any other Supabase command as part of this doc.
- ❌ Does **not** store real project refs, URLs, keys, passwords, or access
  tokens anywhere in the repo.
- ❌ Does **not** modify existing migrations or add product features.
- ❌ Does **not** migrate or move `tantik/cafe-shift` or `tantik/line-app`.

> The one-time Cloud dev apply of the scaffold migrations was performed by a
> human under the approval gate and is recorded below in
> [Phase 1B Cloud dev apply — completed status](#phase-1b-cloud-dev-apply--completed-status).
> It applied only the existing `0000`–`0012` scaffold — no new migrations and no
> product features.

## Phase 1B Cloud dev apply — completed status

Phase 1B Cloud dev project preparation is **complete**. The following was done
by a human, under the full [approval gate](#approval-gate-before-cloud-write),
against the **human-created Supabase Cloud dev project**:

- ✅ Cloud dev project created manually by the human in the Supabase dashboard
  (dev environment only).
- ✅ Supabase CLI authenticated and the local repo linked to the Cloud dev
  project (interactive; no secrets committed).
- ✅ `supabase migration list` reviewed: local `0000`–`0012` present; remote
  history empty before the push.
- ✅ `supabase db push --dry-run` reviewed: showed exactly the `0000`–`0012`
  scaffold and nothing else.
- ✅ Local DB gate passed against the local database (Files = 2, Tests = 39,
  PASS).
- ✅ Explicit human approval recorded for the real Cloud dev push.
- ✅ Real `supabase db push` applied the scaffold migrations `0000`–`0012` to the
  Cloud dev project.
- ✅ Post-push `supabase migration list` verified **Local = Remote** for
  `0000`–`0012`.
- ✅ Local Supabase stack stopped after the push.

Important boundaries that remain true after this apply:

- The Cloud project is a **dev environment only**. **No production project
  exists yet.**
- **No product features were added** by this apply — only the existing scaffold
  schema (`0000`–`0012`) was applied.
- **`cafe-shift` and `line-app` were not moved or migrated.**
- **Future schema changes must be new forward migrations only** (append-only;
  see `PROJECT_BRIEF.md` §15). Never edit, renumber, or replace `0000`–`0012`.
- **Destructive / history-rewriting commands remain forbidden**, including:
  - `supabase db reset --linked`
  - `supabase db reset --db-url ...`
  - `supabase db pull`
  - `supabase migration repair`
- **Any future real `supabase db push`** requires, in order: a new migration,
  review of `supabase migration list`, a reviewed `supabase db push --dry-run`,
  and a fresh explicit human approval. Agents never self-approve this gate.

> No real project ref, database password, direct connection string,
> anon/publishable key, service-role/secret key, or access token is recorded in
> this document or anywhere in the repo. Real values live only in the untracked
> repo-root `.env` / a secrets manager.

## Required human-created Supabase project

A human (repo owner / maintainer) performs this manually in the
[Supabase dashboard](https://supabase.com/dashboard):

1. Sign in to the Supabase dashboard.
2. Create a **new project** dedicated to development, separate from any future
   production project.
3. Choose a strong database password and store it **only** in a password manager
   (never in the repo — see [Secret handling rules](#secret-handling-rules)).
4. Wait for provisioning to finish, then collect the values listed in
   [Required values to collect](#required-values-to-collect).

This is a human-only step. No agent or script creates the project.

## Recommended project name

Use this name for the Cloud **dev** project (documentation only):

```
line-business-os-dev
```

Keeping `-dev` in the name makes it obvious in the dashboard that this is the
development project and not production.

## Region guidance

- Choose a region **close to the primary user base / production target**. For a
  Japanese-SMB platform, a Japan or nearest-available Asia-Pacific region (for
  example, Tokyo) minimizes latency.
- Use the **same region** you intend to use for the future production project so
  dev behavior matches production as closely as possible.
- The dev project can stay on the free tier at this stage — do not provision
  paid/dedicated infrastructure ahead of real demand (see `PROJECT_BRIEF.md` §3).

## Required values to collect

After the human creates the project, collect these from the Supabase dashboard
(Project Settings → API / Database). **Store them outside the repo** (password
manager + the untracked repo-root `.env`; see
`docs/operations/env-inventory.md`). The values below are **placeholders only**:

```
SUPABASE_PROJECT_REF=<supabase-project-ref>
SUPABASE_DB_PASSWORD=<database-password>
SUPABASE_URL=<project-api-url>
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_SECRET_KEY=<preferred-current-sb_secret_*-key>
SUPABASE_SERVICE_ROLE_KEY=<legacy-service_role-key-fallback-during-migration>
SUPABASE_ACCESS_TOKEN=<personal-access-token-for-ci-only-if-needed-later>
```

Where to find each:

| Value | Where in dashboard | Notes |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | Project Settings → General (Reference ID) | Also visible in the project URL. |
| `SUPABASE_DB_PASSWORD` | Set during project creation | Cannot be re-read; reset if lost. Store in a password manager. |
| `SUPABASE_URL` | Project Settings → API (Project URL) | Public API URL. |
| `SUPABASE_ANON_KEY` | Project Settings → API (anon / publishable key) | Frontend-safe **only with RLS**. |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys (current Secret key, `sb_secret_*`) | **Preferred** privileged key. **Server-only.** Bypasses RLS. Never ship to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (legacy service_role key) | **Server-only.** Legacy fallback during the secret-key migration. Bypasses RLS. Never ship to the browser. |
| `SUPABASE_ACCESS_TOKEN` | Account → Access Tokens | Personal access token for CI **only if needed later**; not required for this phase. |

## Secret handling rules

- **service_role / secret key is server-only.** It bypasses RLS by design and
  belongs only in `apps/api`, `apps/worker`, and `packages/db` server contexts.
  Never import it or read `SUPABASE_SERVICE_ROLE_KEY` in `apps/web`.
- **anon / publishable key can be used by the frontend only with RLS.** The web
  app relies on the anon key plus PostgreSQL Row Level Security for tenant
  isolation — never the service role key.
- **No real secret is ever committed.** No real project refs, URLs, keys,
  passwords, service-role keys, or access tokens go into git — ever.
- **The repo-root `.env` must remain untracked.** Keep real generic
  server/operator values in the repo-root `.env` (or your environment / a
  secrets manager). Confirm it is git-ignored and never staged. (`.env.local` /
  `.env.cloud.local` are deprecated Mame To Cha tooling — not the generic
  operator store; see `docs/operations/env-inventory.md`.)
- **`.env.example` may contain placeholders only.** It documents variable names
  and shape, never real values.
- **`SUPABASE_DB_PASSWORD` and `SUPABASE_ACCESS_TOKEN` live only in a password
  manager / secrets store**, never in the repo, never in chat, never in logs.

## Placeholder env names

These are the env variable **names** used by the project. Real values live only
in the untracked repo-root `.env` / a secrets manager. `.env.example` already
documents the local-first Supabase variables; the Cloud dev project reuses the
same names with Cloud values supplied at runtime:

```
SUPABASE_URL=<project-api-url>
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_SECRET_KEY=<preferred-current-sb_secret_*-key>
SUPABASE_SERVICE_ROLE_KEY=<legacy-service_role-key-fallback-during-migration>

# Used by the Supabase CLI / tooling when (and only when) linking is approved:
SUPABASE_PROJECT_REF=<supabase-project-ref>
SUPABASE_DB_PASSWORD=<database-password>
SUPABASE_ACCESS_TOKEN=<personal-access-token-for-ci-only-if-needed-later>

# Frontend public mirrors (only NEXT_PUBLIC_* reach the browser):
NEXT_PUBLIC_SUPABASE_URL=<project-api-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

> Only the anon/publishable key and URL belong in `NEXT_PUBLIC_*`. The
> service-role key must never be placed in any `NEXT_PUBLIC_*` variable.

## Safe commands after approval

These commands are **allowed only after explicit human approval** and only once
the Cloud project + link details have been reviewed. They do not perform a Cloud
schema write on their own:

```bash
# Link the local repo to the reviewed Cloud project (interactive; prompts for
# the DB password — do not paste it into the repo or commit it).
pnpm exec supabase link --project-ref <supabase-project-ref>

# Show how local migrations compare to the linked project (read-only).
pnpm exec supabase migration list

# Show what a push WOULD do, without writing anything (read-only dry run).
pnpm exec supabase db push --dry-run
```

Run them in this order: `link` → `migration list` → `db push --dry-run`. Review
the output of each before considering any real write.

## Forbidden commands

Do **not** run these without explicit, separate human approval. Several are
destructive and/or write to Cloud:

```bash
pnpm exec supabase db push          # applies migrations to the linked (Cloud) DB
pnpm exec supabase db pull          # pulls remote schema; forbidden unless approved
pnpm exec supabase db reset         # DESTRUCTIVE; never run against Cloud
pnpm exec supabase migration repair # rewrites migration history; do not run
```

`supabase db reset` against a linked Cloud project would **drop and recreate the
remote database** — it is never acceptable for Cloud.

## Non-destructive link plan

`supabase link` associates the local repo with the Cloud project but does **not**
apply migrations by itself. Plan:

1. Human creates the Cloud dev project (see above) and reviews the project ref.
2. Human reviews this link plan and explicitly approves linking.
3. Run `pnpm exec supabase link --project-ref <supabase-project-ref>`.
4. When prompted for the database password, enter it interactively — never
   commit it or paste it into tracked files.
5. Confirm the link succeeded and stop. **Linking alone writes no schema.**

## Migration visibility plan

Before any Cloud write, make the migration state visible and reviewable:

1. Run `pnpm exec supabase migration list` to compare local vs remote
   migrations.
2. Confirm the local series `0000`–`0012` is intact and unmodified (migrations
   are append-only; see `PROJECT_BRIEF.md` §15).
3. Confirm no unexpected remote migrations exist on the fresh dev project.
4. Capture the output for the approval discussion (no secrets in the output).

## Dry-run plan

The dry run shows what a push **would** do without writing:

1. After linking + reviewing the migration list, run
   `pnpm exec supabase db push --dry-run`.
2. Review the planned changes: they should match the known `0000`–`0012`
   scaffold and nothing else.
3. If the dry run shows anything unexpected (extra/missing migrations, drift),
   **stop** and investigate before requesting write approval.
4. The dry run performs **no** writes; it is safe to run once linking is
   approved.

## Approval gate before Cloud write

A real Cloud write (`supabase db push` without `--dry-run`) requires **all** of
the following, in order:

1. ✅ Local `supabase db reset` + `supabase test db` pass cleanly (local only).
2. ✅ Cloud dev project created and project ref reviewed by the repo owner.
3. ✅ `supabase link` completed and reviewed.
4. ✅ `supabase migration list` reviewed (local `0000`–`0012` intact, no
   surprises).
5. ✅ `supabase db push --dry-run` reviewed and shows only the expected scaffold.
6. ✅ **Explicit human go-ahead** to run the real push.

Until every box is checked, **no** real `supabase db push` runs. Agents never
self-approve this gate.

## Rollback / stop conditions

Stop immediately and report if any of these occur:

- Any required value is missing, looks wrong, or would have to be committed to
  the repo to proceed.
- `supabase migration list` shows the local `0000`–`0012` series modified, or
  unexpected remote migrations.
- `supabase db push --dry-run` shows drift or changes beyond the known scaffold.
- A command would write to Cloud without the full approval gate satisfied.
- Any secret (password, service-role key, access token) is about to be logged,
  pasted into tracked files, or committed.

Rollback notes:

- **Before any real push**, there is nothing to roll back on Cloud — linking and
  dry runs write no schema. To undo a link locally, remove the generated link
  state (e.g. the local `supabase/.temp` link artifacts) and re-review.
- **If a real push was approved and run** and something is wrong, do **not** run
  `supabase db reset` against Cloud. Instead, fix forward with a **new** forward
  migration (migrations are append-only) and re-review under the approval gate.

## Phase 1B checklist

- [x] Read `docs/phase-1-core-db.md` and this document fully.
- [x] Human created the Cloud dev project in the dashboard (dev environment
      only; production project does not exist yet).
- [x] Region chosen to match the production target (e.g. Tokyo / nearest APAC).
- [x] Required values collected into the untracked repo-root `.env` / password
      manager (placeholders only in the repo).
- [x] Confirmed the repo-root `.env` is untracked and no real secret is staged.
- [x] Confirmed `.env.example` contains placeholders only.
- [x] Local DB gate passed (local only).
- [x] Link plan reviewed and approved by the repo owner.
- [x] (After approval) `supabase link` run and reviewed.
- [x] (After approval) `supabase migration list` reviewed — `0000`–`0012`
      intact; remote empty before push.
- [x] (After approval) `supabase db push --dry-run` reviewed — only expected
      scaffold.
- [x] Explicit human go-ahead recorded before the real `supabase db push`.
- [x] Real `supabase db push` applied `0000`–`0012` to the Cloud dev project;
      post-push `supabase migration list` verified Local = Remote.
- [x] No real secrets committed; no forbidden command run.
