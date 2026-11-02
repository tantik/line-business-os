# Purchase receipts (DEBT-136) — design, 2026-11-02

Status: Lead design. Rules approved by the Founder 2026-11-01 (DEBT-136 row).
Purchases module = capability: every package that includes `purchases`
(飲食店プラン, Stock, later ones) gets receipts; no package-specific code.

## 1. What exists

- `purchases.purchase_actions` (0089, 0120, 0137): append-only log of
  `bought` / `ordered` / `received` per inventory item; no price, no supplier
  (0120 non-goals). "Receipt" in today's code (`api.record_purchase_receipt`)
  means **goods received** (入荷), not a paper receipt — so the new entity is
  named **spend receipt** (`spend_receipts`) to avoid the clash.
- Permissions: `purchases.item.read`, `purchases.action.write` (employee,
  manager, tenant_admin, tenant_owner).
- Private photo pattern: `inventory-media` / `recipe-media` buckets (0052,
  0085), path `<tenant>/<location>/<row>/<uuid>.<ext>`, signed URLs.
- Settings pattern per location: `workforce.schedule_settings` (0034).

## 2. Reference products (checked 2026-11-02)

- freee 経費精算: photo or file upload → date / total / category drafted,
  user checks and submits, an approver approves
  ([freee support](https://support.freee.co.jp/hc/ja/articles/54708013912601),
  [freee: 経費精算の登録](https://support.freee.co.jp/hc/ja/articles/13567539052313-5-5-%E7%B5%8C%E8%B2%BB%E7%B2%BE%E7%AE%97%E3%81%A8%E6%9C%AA%E6%B1%BA%E6%B8%88%E5%8F%96%E5%BC%95%E3%81%AE%E7%99%BB%E9%8C%B2)).
- Restaurant purchase ledgers (e.g. 「なんでも仕入管理」) aggregate by
  supplier and closing date, with unit prices
  ([App Store](https://apps.apple.com/jp/app/id768455882)).
- We take the expense-app core (photo + date + total + category, submitter
  sees own, manager sees all) and skip OCR, approval, supplier and unit price
  (Founder 2026-11-01).

## 3. Data (one migration + pgTAP)

- `purchases.spend_receipts`: id, tenant_id, location_id, `purchased_on`
  (date, location-local), `amount_jpy` int ≥ 0 (nullable), `category`
  (`food` 食材 / `supplies` 消耗品・清掃 / `equipment` 備品 / `other` その他,
  nullable), `note` ≤ 200, `media_path` (nullable), `created_by`,
  `updated_by`, timestamps, `status` active|canceled, `canceled_at/by`,
  `cancel_reason` (required on cancel). No delete.
  Checks: amount or photo present; without linked items → category + note
  required.
- `purchases.spend_receipt_items` (receipt_id, action_id unique): links to
  `bought`/`received` actions of the same tenant+location; one action belongs
  to at most one receipt.
- `purchases.receipt_settings` per location: `receipts_enabled` (default
  true), `photo_mode` off | optional | required (default optional).
- Permission `purchases.receipt.manage` → tenant_owner, tenant_admin,
  manager (see all receipts + spend view, edit after the day, settings).
- Private bucket `purchase-receipts`; read = creator or manage holder at that
  location; tenant purge removes the objects (DEBT-103 c path).
- Writes only through RPCs (`api.create_spend_receipt`,
  `api.update_spend_receipt`, `api.cancel_spend_receipt`,
  `api.set_receipt_settings`), each audited in `audit.audit_logs`.
  Buyer may edit until the end of the location-local day of creation;
  afterwards only `purchases.receipt.manage`. Edits check only what changes
  (date window for a new date, photo mode for a new / removed photo, ownership
  for newly linked purchases), so a Manager can complete an old receipt;
  receipts switched off stop new receipts and staff edits, the Manager can
  still correct. Create is idempotent (`client_request_id` per form open).
- Reads: `api.spend_receipts` (own rows, or all with manage; amounts never
  reach other staff) and `api.spend_summary(month)` (manage only: totals by
  person and by category; receipts linked to purchased items and without a
  category are shown as 「仕入れ品」 — purchased stock items).

## 4. UI

- Purchases popup: after 「購入済み」/「入荷」 a toast-sized 「レシートを追加」
  action opens a sheet: photo (per `photo_mode`), amount, date, the item(s)
  just marked (pre-ticked; other items bought today can be ticked too).
- New tab 「レシート」: Staff = 「自分のレシート」; Manager = all receipts +
  monthly spend (total, by person, by category) + settings in the ••• menu.
- Receipt without items: 「+ レシート」 in the tab with category + note.
- JA/EN, mobile first, Design System components only.

## 5. Plan

| PR | Content | Gate |
|---|---|---|
| 1 | migration + pgTAP (rights, linking, edit window, cancel, settings, photo policies, isolation) | DB/security review, Cloud DEV apply |
| 2 | lib + popup UI + spend view + settings | UX/i18n review, live check on preview (phone size) |

Estimate 5–7 working days. Out of scope: OCR, approval, supplier, unit price,
CSV export (later, if asked), 電子帳簿保存法 compliance (state it in the terms).
