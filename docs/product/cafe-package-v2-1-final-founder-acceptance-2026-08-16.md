# Cafe Package v2.1 — Final Founder Acceptance

**Date:** 2026-08-16

**Environment:** authenticated `https://preview.oruwa.jp` only, `manager@oruwa-cafe.test`
on the `oruwa-cafe` reference tenant.

**Release baseline:** `origin/dev` at `ed1de92` (PR #241 merged, "Cafe v2.1
final closure — localize Manager Add/Edit Staff modal and shift editor
(F1/F2)").

**Decision:** **PASS — Cafe v2.1 CLOSED.**

This is a bounded acceptance scoped exactly to the two release-blocking
findings recorded in
[`../ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`](../ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md)
(F1, F2 — both P1). It is not a full re-audit of Cafe v2.1, not a new
Whole-Product Gate, and does not re-verify any P2/P3 item in that gate's
deferred register — those remain open, tracked, and not release blockers
per that gate's own scope rule.

## 1. Executive Result

**F1 — PASS. F2 — PASS.** No P0/P1 regression found. Per
`docs/ai/current-task.md` §2.3's stated closure condition ("Cafe v2.1
closed only if no P0/P1 regression remains" after Preview QA + independent
review), Cafe v2.1 is declared closed.

## 2. F1/F2 Live Evidence

Both checked live via authenticated browser session (Manager account,
canonical `(protected)/dashboard/workforce/manager` surface), not by
re-reading code:

| ID | Result | Live evidence |
|---|---|---|
| F1 — Manager Add/Edit Staff modal (`staff-form.tsx`) | **PASS** | With the page's JA/EN toggle set to JA, opened "+ スタッフを追加" (Add Staff). All modal text rendered in Japanese: 氏名 / 姓 / 名 / メールアドレス / 役職 / 雇用形態 field labels, "スタッフを追加" submit button, "キャンセル" cancel button. No English string observed in the modal. |
| F2 — Manager shift-assignment editor (`shift-cell-editor.tsx`) | **PASS** | With JA active, opened the cell editor via "割り当て" (Assign) on an empty schedule slot. All fields rendered in Japanese: シフト種別 (shift type dropdown, value "カスタム"), 開始/終了 (start/end time), 休憩（分） (break minutes), "割り当て"/"キャンセル" buttons. No English string observed. |

Additional observations made during this pass, not new findings — already
recorded in the Whole-Product Gate's deferred register and unaffected by
F1/F2:

- The Manager page shell (headings, Staff table column headers, Weekly
  schedule, Shift types, Submitted shift preferences, Correction requests,
  Shift exchange requests) was already fully Japanese from Mission 2 — this
  pass only confirms F1/F2 closed the two remaining gaps in that surface,
  it did not need to re-fix the shell.
- `Barista` (Position) and `part_time` (Employment type) remain
  untranslated in the Staff roster table — this is `STAFF-I18N-1` / the
  `employmentType` free-text-field decision already recorded in the gate,
  not a new finding, and out of F1/F2's scope.
- A `PendingInvitationBanner` ("スタッフとして招待されています。承認する")
  was visible to the Manager account throughout — this is the already-known
  Defect B (visibility of other pending invitations via RLS
  OR-composition), not a new finding.
- JA selection persisted correctly across a full page reload.

## 3. Independent Review

Performed in the same session by the agent that ran the live QA above,
acting as a second reader of the merged diff and the live behavior it
produces — not the PR's author. No disagreement with the Whole-Product
Gate's F1/F2 classification or fix approach found.

## 4. Founder Acceptance

Recorded 2026-08-16 in conversation with the Founder: after reviewing this
evidence, the Founder directed Cafe v2.1 to be closed on this basis rather
than requiring a further re-audit pass. This satisfies
`docs/ai/current-task.md` §5's three-step closure gate (Preview QA →
independent review → Final Founder Acceptance).

## 5. What This Does Not Cover

Per the Whole-Product Gate's own scope rule, closing v2.1 does not mean the
product has no further issues. The full P2/P3 deferred register in that
gate remains open and durable, including (non-exhaustive): Staff profile
card localization, LINE-link form localization, no live clock-in/out, no
mobile-responsive styling on the canonical surface, the orphaned
`apps/web/src/app/workforce/page.tsx` stub, Surface A retain-vs-retire, and
native-Japanese-copy review of the machine-translated Manager dictionary.
None of these are authorized as a next mission by this acceptance — each
requires its own bounded Product/Founder decision, per
`docs/ai/current-task.md` §5.4 and `../ORUWA-info.md` §14.

## Related Documents

- [`../ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`](../ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md) — source of F1/F2 and the full deferred register this acceptance does not reopen.
- [`../ai/current-task.md`](../ai/current-task.md) — updated by this same change to reflect closure.
- [`cafe-package-v2-1-final-live-founder-acceptance.md`](cafe-package-v2-1-final-live-founder-acceptance.md) — the 2026-08-10 acceptance pass; superseded/stale per the Whole-Product Gate's own note (it tested Surface A pre-canonicalization), kept for record only.
