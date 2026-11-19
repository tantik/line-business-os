# Session handoff 2026-11-19 — brand MIRAWII, DEBT-139 L3 done and live-checked

## 1. Decisions (Founder, 2026-11-19)

- **New brand: MIRAWII** (replaces ORUWA). Domains `mirawii.jp` / `.co.jp` / `.com` / `.app` were free on 2026-11-19; J-PlatPat: no ミラウィ / ミラウイ mark; risks to clear at the free INPIT / JPAA consultation: the ミライ family (418 similar-sound hits in 42X11 / 42P02 / 11C01) and Nintendo「Ｗｉｉ」(09 / 28 / 38 / 41 …). Consultation memo (local, git-excluded): `docs/commercial/trademark-consultation-mirawii-2026-11-19.md`.
- Company / support / QA mailbox: **mirawii.jp@gmail.com** (created by the Founder). Existing Cloud DEV QA users stay on `oruwa.jp+…@gmail.com` until the rename / domain move.
- Release order: free work first (DEBT-139 → rename in code → 4D demo + site on vercel.app → Owner cabinet + Stripe test mode + legal drafts), then purchases (domain after the trademark consultation, filing, lawyer, Vercel Pro from the first client incl. trial clients — Hobby forbids commercial use; Supabase stays Free until the 5th client, with our own daily backup), then domain switch + production pack.

## 2. Done and live (dev + Cloud DEV)

| PR | What | Cloud DEV |
|---|---|---|
| #695 | handoff 2026-11-05 (merged by the Founder) | — |
| #696 | L3a DB: move cancels open requests + future approved preferences, manager_scope (also in `api.manager_dashboard`), `my_locations.created_at` | **0156** |
| #697 | L3b web: 「店舗」 section, manager scope radio, move dialog, cancelled requests ignored everywhere, review fixes | — |

Reviews: DB security PASS (twice), general PASS, UX/i18n FAIL → fixed (P3-1 legacy Modal kept, DEBT-054 note).
Local pgTAP 89 files / 3450 PASS; apps/web 1322 / 1322; CI green.

**Live QA 2026-11-19, preview.oruwa.jp, 375 px, qa-4c-cafe-1 (owner1, isolated context):** add store (long name ellipsis), plan limit 3 (4th refused), duplicate name on rename, rename, archive / restore (saving status), archive warning for the viewed store, no archive item with one open store, has_active_staff refusal, move 山田 花子 本店 → 駅前店 and back (dialog over the staff popup, every consequence listed, focus stays in the list dialog), manager scope shown live (「この店舗のみの店長です。」), **store Manager (o1staff1 temporarily) sees neither 「店舗」 nor 「別の店舗へ移動」 in the DOM**, EN copy. State restored: 本店 + 駅前店 open, 山田 花子 = staff + admin at 本店, archived 「QA検証店」 left in the archive (cannot be deleted).
Not checked live: 1-store tenant as Owner (no Owner account for oruwa-cafe; the 1-open-store menu was checked on qa-4c-cafe-1), staff view after a move with real cancelled preferences (pgTAP covers the data).

## 3. Open / carried

- DEBT-139 (o) self-insert policy location; (p) server monthly auto-schedule ignores status — fix with the next auto-schedule migration, before release.
- 1 px horizontal overflow at 375 px on /manager from the schedule table / legacy modal overlay (pre-existing, not L3).
- Focus goes to `<body>` after the legacy rename modal closes (DEBT-016 / DEBT-054 family).

## 4. Next

L3c console (platform create / rename / activate location in admin/tenants) → L4 「全店舗」 totals for Owners → L5 cross-store probes → **rename to MIRAWII in code (stage B)** → 4D demo + site → cabinet + Stripe test mode → purchases → domain move → production pack.
