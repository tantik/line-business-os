# <WORKSTREAM>_HANDOFF (<YYYY-MM-DD>)

Durable handoff for a **fresh** Claude Code session. This file, git, and the
repository's own tests/docs are the source of truth — not any prior chat's
conversational memory. Everything below is VERIFIED against tool output in
the session that wrote this handoff, unless explicitly marked INFERRED or
UNKNOWN (Operating Model §6).

File name follows the existing repository convention:
`docs/ai/<WORKSTREAM>_HANDOFF_<DATE>.md`.

## 1. Repository / git state (VERIFIED)

Branch, HEAD commit + message, ancestry relative to `origin/dev`/`origin/main`,
working-tree status (staged/unstaged/untracked — list untracked files
explicitly and state whether they predate this workstream and must be left
alone), recommended branch for the next session if one is needed.

## 2. Relevant merged/open PRs

PR number, title, merge/CI/Preview status, files changed, one line on why it
matters to this workstream.

## 3. Verified results (CLOSED — do not reopen without new evidence)

Anything this session confirmed and the next session should treat as settled
fact, with the evidence that makes it VERIFIED rather than INFERRED.

## 4. Known defects / open issues

Recorded but explicitly not to be fixed by the next session unless
authorized. Severity, reproduction evidence, file/function citation.

## 5. Relevant existing documentation

What to read before investigating further, in priority order, with one line
on why each matters and a warning to re-verify currency rather than cite as
still-accurate fact.

## 6. State believed relevant but not fully verified

Mark clearly: VERIFIED to exist vs. TO VERIFY. Do not let the next session
assume a file's existence implies its classification or behavior.

## 7. Architecture / security constraints (binding)

Restate only the constraints specific to this workstream; do not restate
the full Operating Model or `AGENTS.md` — link them instead.

## 8. Explicit prohibitions for the next session

What is out of scope even though related, per the originating mission's
scope (Operating Model §3).

## 9. New workstream — full objective

Verbatim from the Founder/mission instructions where one exists — do not
paraphrase away detail the next session will need.

## 10. Required deliverable

Exact file path and structure the next session must produce.

## 11. Mission-specific approval boundaries / deviations

Do not restate the Operating Model here — the new session reads
[`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`](../ORUWA_AI_ENGINEERING_OPERATING_MODEL.md)
itself for the general autonomy, evidence, and context-management rules
(Operating Model = how we work; this handoff = where we stopped). Record
only what is specific to this mission: any tightening or loosening of the
Operating Model default already agreed for this mission (with reasoning),
any approval boundary already hit or about to be hit, and any deviation
already agreed with the Founder that the next session must not
re-litigate.

## 12. What must NOT be accidentally modified

Specific records, tenants, branches, configuration — named precisely enough
that the next session cannot mistake them for fair game.

---

No secrets, passwords, tokens, or service_role values are recorded anywhere
in this handoff.
