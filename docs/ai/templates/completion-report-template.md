# <Mission title> — Completion Report (<YYYY-MM-DD>)

Per [`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`](../ORUWA_AI_ENGINEERING_OPERATING_MODEL.md) §15.

## Executive result

One paragraph: what changed, why, and the mission's final status.

## Objective

Restate the mission objective this report closes out.

## Scope completed

What was actually delivered, vs. the mission's original scope — call out any
gap explicitly.

## Files changed

List with one-line purpose each.

## Architecture / data-flow impact

What changed structurally, if anything. "None" is a valid, common answer.

## Security impact

Explicit statement — including "none" — covering tenant isolation, RLS,
secrets, PII, and the approval boundaries in Operating Model §9.

## Tests / checks — exact results

Every check actually run and its actual result (pass/fail/count), not a
summary. Mark anything NOT TESTED explicitly (Operating Model §6).

## Browser / Preview evidence

Only if actually observed this session, with what was seen. Do not claim
this section's content without tool output backing it.

## Coverage matrix (actual)

Operating Model §19. Same 15 rows as the mission file's planned matrix, now
with the outcome: VERIFIED (evidence), N/A (reason), or NOT TESTED (with its
`DEBT-###` ID). If any row is NOT TESTED the final status below is **CLOSED
WITH GAPS**, and the gap is also named in the Executive result paragraph.
Independent reviewer findings and what changed after them are listed here in
one line each.

## Known limitations

What this mission did not address, on purpose or by scope boundary.

## Unresolved issues

Anything discovered but deliberately deferred, per Operating Model §16
(Stop discipline) — record for a future mission, do not pull it into this
report's scope. Every item has a row in
`docs/operations/deferred-debt-register.md`; list the `DEBT-###` IDs here.

## Git branch / HEAD / status

Exact branch, HEAD commit, working-tree state at report time.

## PR / CI / deployment state

PR number/link if any, CI result, Preview deployment state.

## Definition of Done matrix

Each DoD criterion (Operating Model §3, `oruwa-engineering-principles-and-governance.md`
§8) against actual evidence — met / not met / not applicable, with why.

## Final mission status

CLOSED / CLOSED WITH GAPS / PARTIAL / BLOCKED (Operating Model §19 "One
vocabulary"), and the exact next human gate if not fully closed.
