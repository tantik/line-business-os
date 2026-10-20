# P6 audit — industry-specific decisions in shared modules (2026-10-20)

Task P6 of `platform-packages-model.md` §4. Rule (§3): every industry-specific
decision belongs in **package configuration**, never in shared module code.
This audit lists the cafe / food decisions found in shared code and the shared
DB on `dev` at `ddefafd`, and what happens to each. Read-only sweep of
`apps/web/src/**`, `packages/**`, `supabase/migrations/**`; comments and the
demo folder ignored unless live screens use them.

Homes: `apps/web/src/lib/packages/vocabulary.ts` (P5, words) and
`apps/web/src/lib/packages/config.ts` (P6, behaviour flags), both keyed by
`core.packages.code`; Cafe values = today's behaviour.

## Moved in P6 (no behaviour change for the Cafe package)

| # | What | Before | After |
|---|---|---|---|
| A1–A6 | Japanese food-allergen list (29 codes, 消費者庁 食品表示基準), allergen block on the Inventory item form, allergen summary/tags on recipe detail, kitchen disclaimer | Always shown; list duplicated 3× in shared Inventory / Recipes code | One Cafe file `lib/packages/cafe/allergens.ts`; UI shown only when the package flag `allergens` is on (Cafe: on). A hidden block never clears stored allergens |
| A7 | Machine-translation prompt says "Japanese food/beverage-recipe text … for a cafe staff app" for every tenant | Hard-coded in `openai-provider.ts` | `translationDomainHint` from package config; Cafe = identical text, other packages neutral |
| A8 | "Cafe staff scheduling, shift reports, and recipes" (hard-coded English) on `/dashboard/workforce` | Not translated | JA/EN copy without "Cafe" |

## Kept, with a trigger (deferred-debt-register DEBT-106 … DEBT-108)

| # | What | Why not now | Trigger |
|---|---|---|---|
| B1 | Allergen list as a CHECK on shared `inventory.items` (0121/0124) and in `api.set_inventory_item_allergens` | Only Cafe exists; the UI flag already hides it elsewhere; medium migration (lookup table per package) | First non-food package that uses Inventory |
| A9/B3/B4 | Units `kg/g/L/mL/pcs` closed by CHECK in 3 tables + 1 RPC, default `kg`; conversion only kg↔g, L↔mL | Medium-high migration; fits Cafe | First package needing bottle/box/roll units (Cleaning, Salon) |
| B5 | Issue categories closed list (incl. `cleaning`, `customer`) | Mostly generic | Cleaning package |
| B7 | `schedule_settings` default headcount `[3,3,3,3,3,2,4]` | Provisioning should set it from the package template | Stage 4B provisioning |
| B10 | Salon / client-template seed tenants adopted into `cafe` | Local data only | Salon package |
| B11 | Global `module_registry.nav_sort_order` = Cafe order | Deliberate (P4 review): one consistent order while Cafe is the only package | Second package with a different order |
| C1 | HACCP presets installed by a manual script into `oruwa-cafe` only | Already DEBT-100 | Stage 4B |
| C2 | `packages/db/scripts/cafe-package-template.ts` (`cafe-v2`) disagrees with the DB Cafe package (v3); used only by its own test | Retire or merge into package data | Stage 4B provisioning |
| A11 | Pilot shift window codes (`AM/PM/A-P/SHORT_AM`, alias `KONS`) in the shared scheduling engine (+ Edge copy) | Deprecated, needs a careful engine change | Next scheduling-engine change |
| A13 | Shared i18n / UI infrastructure lives under `lib/demo/cafe` and `components/demo/cafe` (~90 importers) | Rename only, large diff | Before the second package's UI work |
| D1–D6 | 店舗 / 店長 / 営業日 / 材料 and module names hard-coded in popup and attention titles (bypassing the P5 vocabulary) | Words, covered by extending `vocabulary.ts` keys | Second package's copy pass |

## Not industry-specific (stays)

¥ and `ja-JP` formatting, `Asia/Tokyo`, the 40 h / 5 days Labour Standards Act
defaults, the Operations module (free-text units and categories, no °C in
shared code), content kinds recipe / instruction, `is_popular` as a generic
"featured" flag.
