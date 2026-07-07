# Cafe Workforce — Internal Pricing Notes

Status: **Internal only. Not for external distribution or public publication as-is.**

Read with: [`cafe-workforce-pilot-package-ja.md`](./cafe-workforce-pilot-package-ja.md),
[`../product/mvp-roadmap.md`](../product/mvp-roadmap.md).

## Purpose

Record the pricing decisions made for the first cafe client (Phase 1J-3) and
the internal hypothesis for future pricing tiers, so pricing conversations
stay consistent across sales materials without re-deriving numbers each time.

## First development partner price (current, committed)

This is the price already communicated for the first real cafe client
(ギュウさん). See
[`cafe-workforce-first-client-message-ja.md`](./cafe-workforce-first-client-message-ja.md)
and
[`cafe-workforce-pilot-package-ja.md`](./cafe-workforce-pilot-package-ja.md)
for the client-facing wording.

| Item | Value |
| --- | --- |
| Pilot duration | 8 weeks |
| Pilot price | Free |
| Setup fee (first partner only) | 0円 |
| Continuation price | 月額4,980円（税別） |
| LINE Official Account cost | Separate, borne by the client if incurred |

This is explicitly a **development partner pilot price**, not the public
standard price. It must not be quoted to a second or later client as the
default offer without a deliberate decision to do so.

## Future internal pricing hypothesis (not yet public, not yet committed)

These are planning-stage tiers only, for internal alignment. None of these
have been validated with a real client beyond the first development partner,
and none should appear on a public website or in a client-facing quote until
reviewed.

| Tier | Setup fee | Monthly price |
| --- | --- | --- |
| 開発協力プラン (development partner) | 個別相談 (case-by-case) | 月額4,980円〜 |
| 通常プラン (standard) | 50,000円〜 | 月額9,800円〜19,800円 |
| カスタム導入 (custom implementation) | 150,000円〜 | 個別見積 (custom quote) |

## Why a setup fee exists later

The first development partner gets 0円 setup because the build itself is
still validating the product with real usage — the client is effectively
co-funding product validation with their time and feedback, not just buying
a finished product. Once the product moves past the pilot/development-partner
stage into the 通常プラン tier, a setup fee reflects real, recurring cost on
our side for each new tenant: tenant onboarding, LINE Official Account/LIFF
setup assistance, initial data/staff import, and configuration support that
does not scale to zero marginal cost per client the way the software itself
does.

## Cost considerations

Before finalizing any public price, the following real costs must be checked
and are **not assumed or invented in this document**:

- Supabase (database/hosting) pricing at expected tenant/data volume.
- Vercel hosting/bandwidth pricing at expected traffic.
- LINE Official Account messaging costs (LINE's own pricing tiers change and
  vary by message volume/type).
- Any OpenAI/translation API costs if recipe translation or AI features move
  from static hand-authored content to a real API-backed pipeline.

**Do not publish or quote external service costs from memory.** Confirm
current pricing directly from each provider before using it to justify or
set a public price.

## Positioning

- The current offer is a **pilot**, not a subscription commitment — framing
  should emphasize low-risk trial, not a sales close.
- Continuation pricing (月額4,980円) is deliberately low relative to the
  eventual 通常プラン range, to reflect that the first partner is accepting
  more uncertainty (fewer features, less support, no SLA) than a later
  standard client will.
- Never position this product as payroll or as legal/statutory attendance
  compliance — pricing language should never imply either, since the product
  explicitly excludes both (see
  [`cafe-workforce-pilot-package-ja.md`](./cafe-workforce-pilot-package-ja.md)).

## Public website pricing direction

Do not publish specific prices publicly yet. When ready, the likely direction
is a simple three-tier presentation mirroring the table above (development
partner / standard / custom), with the standard tier's price range shown and
the custom tier marked "お問い合わせください." Any public pricing page requires:

- Confirmed real infrastructure/API costs (see Cost considerations above).
- At least one completed pilot's real usage data to sanity-check that the
  月額9,800円〜19,800円 standard range still makes sense.
- A separate, deliberate decision — this document does not authorize
  publishing prices on its own.
