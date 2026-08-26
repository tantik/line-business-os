/**
 * WP C2 (Track C, Cafe Manager Parity mission): additive, INERT-TODAY stub
 * for LINE push notifications. `core.line_channels` has no real tenant
 * credentials until a pilot client is onboarded, post-Cafe-v2.2 -- this
 * establishes the call-site contract now (event shape, call sites) so
 * wiring the real Messaging API push later is additive to those call
 * sites, not a re-touch of every one of them.
 *
 * **This is a Cafe-scoped placeholder, not the final architecture.** Per
 * `docs/foundation/platform-foundation-roadmap.md` (Notifications row):
 * notification delivery must become a platform-wide service before a
 * third vertical is added, or it violates Law 10 (Modular Without
 * Fragmentation) -- a module-specific implementation like this one is
 * exactly the anti-pattern that document warns about, tolerated only
 * because Cafe is still the platform's first and only vertical. A future
 * engineer picking this up for a second vertical must not treat this
 * module as the intended end state -- read that roadmap document's
 * Notifications row first.
 *
 * `queueLineNotification` never throws and never performs a network/DB
 * call yet -- it is always safe to call unconditionally after a write
 * succeeds, and a caller must never let its result affect that write's
 * own outcome.
 */

export type LineNotificationEventType =
  | 'correction_decision'
  | 'shift_exchange_decision'
  | 'schedule_published'
  | 'recipe_updated'
  | 'staff_message';

export interface LineNotificationEvent {
  type: LineNotificationEventType;
  tenantId: string;
  /** The employee this notification is ultimately for. `null` for a broadcast-shaped event (e.g. schedule_published) where the real send, once built, will fan out per-recipient itself -- never a mass/broadcast send from this stub. */
  targetStaffId: string | null;
  payload: Record<string, unknown>;
}

/**
 * No-op-safe stub: validates nothing, sends nothing, records nothing.
 * Exists only to fix the call shape every actual write site should call
 * once the real Messaging API push is built.
 */
export function queueLineNotification(_event: LineNotificationEvent): void {
  // Intentionally inert -- see module doc comment above.
}
