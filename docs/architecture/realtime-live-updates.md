# Live updates by push (Supabase Realtime) — architecture

Status: approved by the Founder 2026-10-17 ("do it now, before QA4"); closes
DEBT-095. Replaces periodic polling on the canonical Staff/Manager surfaces.

## Problem

Until now the only way a screen learned about another user's change was to
ask the server on a timer (2.5 s until 2026-10-15, 60 s since #588). Each ask
is a Vercel function call plus ~5 Supabase calls, whether or not anything
changed. The Manager dashboard had no live updates at all: new requests,
mail, issues from Staff appeared only after a reload.

## Design: "signal, then fetch"

1. The browser opens one WebSocket to Supabase Realtime (not to Vercel) and
   joins **private** Broadcast channels for its tenant.
2. An `AFTER INSERT/UPDATE/DELETE` trigger on each live table calls
   `realtime.send()` with a tiny payload — **no row data, no PII**:
   `{ "area": "schedule", "location": "<uuid|null>", "by": "<auth uid|null>" }`.
3. The browser receives the signal and refreshes only the affected data
   through the existing, RLS-checked read paths (Server Actions or
   `router.refresh()`). The signal itself grants nothing.

So a request to the server happens only when something actually changed,
and the change shows in ~1–2 s.

### Topics (tenant-scoped; location filtered on the client)

| Topic | Who may join (policy on `realtime.messages`) | Gets |
|---|---|---|
| `oruwa:<tenant>:staff` | an active employee of the tenant, or a holder of `workforce.shift.read` | changes every staff member may see: published schedule, shift types, recipes, issues/handover, operations, inventory, purchases, roster |
| `oruwa:<tenant>:manager` | holder of `workforce.request.manage` anywhere in the tenant | everything a Manager dashboard shows, incl. drafts, requests, staff mail, attendance, auto-schedule runs |
| `oruwa:<tenant>:emp:<employee>` | the employee themself (`workforce.is_own_employee`) | own mail from the Manager, decisions on own requests/exchanges, own attendance |

Join rules live in one `security definer` function,
`core.realtime_topic_allowed(topic)`, called by a single `select` policy on
`realtime.messages` (Broadcast only). There is no `insert` policy: browsers
cannot send. Location is in the payload, not the topic, so tenant-wide rows
(`location_id is null`) and location-scoped Managers both work; the only
cross-location disclosure inside one tenant is "something changed at
location X" (no content) — accepted.

### Trigger

One generic trigger function `core.realtime_signal()`; per-table arguments
name the area and audiences. It:
- dedupes per transaction (`set_config('oruwa.rt_sent', …, true)`), so an
  auto-schedule run inserting 87 shifts sends one signal per topic;
- sends to Staff only for staff-visible rows (e.g. a shift only when it is
  or was published; mail only when Manager-authored → the employee's topic);
- never breaks the business write (`exception when others then null`);
- is transactional: a rolled-back write sends nothing.

### Client

- `useLiveSignals` (`apps/web/src/lib/realtime/`) — one browser Supabase
  client, subscribes to the given topics, ignores other locations and the
  user's own changes (`by === me`; own writes already refresh), and calls
  `onResync` after a reconnect.
- Staff: `schedule` → re-fetch the displayed week; `mail` → re-fetch mail;
  any other area → debounced (1.5 s) `router.refresh()`.
- Manager: any area → debounced `router.refresh()`.
- Recipes pages: `recipes` → their existing re-fetch.
- Safety net: the `useVisiblePolling` timer stays at **15 min** (visible,
  non-idle tabs only) plus one refresh on reconnect / tab return, in case a
  signal is missed while the socket was down.
- The preview-host-only Surface A (`lib/preview/*`) keeps 60 s polling.

## Limits (Supabase Free, checked 2026-10-17)

200 concurrent Realtime connections, 100 messages/s, 2 M messages/month,
100 channels per connection, 256 KB broadcast payload. One open screen =
one connection with 2–3 channels. Enough for the 6-tenant test and the first
customers; paid plan only with real sales.

## Not in scope

LINE notifications, Web Push, presence ("who is online"), Realtime for the
legacy preview surface.
