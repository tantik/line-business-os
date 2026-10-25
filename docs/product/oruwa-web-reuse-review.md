# Old sales-site material: reuse review (2026-10-25)

Status: **REVIEW** (Lead, Phase A of `docs/architecture/site-cabinet-console-plan.md`).
The folders were read only; nothing in them was changed. Founder decision
(2026-10-25): the new `oruwa.jp` is a **rebuild** with a new design and
structure, not a reskin. Only ideas, copy lines and facts worth keeping
carry over.

## 1. What was reviewed

| Folder | What it is | Stack | State |
|---|---|---|---|
| `D:\Dev\oruwa-web\oruwa-web` | "ORUWA Product Website" v1, own git repo (4 commits, last "Enable automatic Sakura deployments") | Next.js 16 static export (`output: 'export'`), React 19, plain CSS, Geist font; GitHub Action → SSH deploy to Sakura `~/www/oruwa`; `.htaccess` with CSP/nosniff/DENY | all copy in one 95-line file `components/SitePage.tsx`; JA + `/en`; legal pages are empty templates; contact form disabled |
| `D:\Dev\oruwa-web\oruwa-gpt` | a later single-page variant (Aug 29) built with an OpenAI "sites" tool | vinext (Vite-based Next) + Cloudflare Workers (wrangler), Tailwind 4, `@openai/sites-vite-plugin`; 11 patch CSS files (`freeze.css`, `spacing-fix.css`, `audit-fixes.css` …) | not a git repo; one long `app/page.tsx` (774 lines); lead form **fakes success** (timer, no send) |
| `D:\Dev\oruwa-web\generated-assets` | one OG image `oruwa-social-preview-1200x630.png` | — | byte-identical to `oruwa-web/public/og.png` |
| `D:\Dev\ORUWA-Sales-Kit-1` (similar, found under `D:\Dev`) | JA sales kit for the first café meeting: static HTML presentation, pilot offer, pricing, FAQ, print A4 sheets, meeting scripts (RU), "product truth" and pricing decisions | static HTML, no backend | no logo, QR or real screenshots ("placeholders, do not replace with invented material") |

Not reviewed: `ORUWA_Cafe_v2.2_Product_Specification1` in `oruwa-gpt` (a
.docx; product spec, not site material).

## 2. Copy themes in the old material

| Theme | Example lines (JA) | Where |
|---|---|---|
| One flow | 「日々の運営を、ひとつの流れに。」「店舗運営を、ひとつの流れに。」「毎日の業務を、ひとつにつなぐ。」 | oruwa-web hero, OG images, oruwa-gpt hero |
| Problem = scattered work | 「仕事はひとつ。管理は、ばらばら。」「シフト管理がLINEや紙に分かれている」「店長がスタッフに何度も確認している」「在庫不足に気づくのが遅い」 | oruwa-gpt "THE PROBLEM" |
| Before/after | BEFORE: LINE・Excel・紙・口頭・複数のアプリ・個人の記憶 → WITH ORUWA: 今日やること・シフト・在庫・確認事項 | oruwa-gpt |
| Role value | STAFF「今日、自分が何をすればいいか。」/ MANAGER「今、何が起きていて、何に対応する必要があるか。」/ OWNER「自分の事業で、何が起きているか。」 | oruwa-gpt |
| Attention first | 「見るべきことが、先に見える。」「ORUWAなら、確認が必要なことだけが見える。」 | oruwa-gpt, oruwa-web |
| LINE + Web | 「いつものLINEから。必要ならWebから。」「ORUWAはLINEだけに依存しません。」 | both |
| Day timeline | 07:30 開店準備 → 11:30 営業中 → 19:30 閉店チェック → 20:00 振り返り | oruwa-gpt |
| Not more tools | 「ツールを増やすのではなく、仕事をつなぐ。」 | oruwa-gpt |
| Honesty rules | no customer count, testimonial or rating; IZUMI IT figures marked as developer experience, not ORUWA adoption; concepts marked 構想中 | oruwa-web `docs/ORUWA_WEBSITE_V1.md`, Sales Kit `docs/decisions/0001-product-truth.md` |

## 3. Keep / adapt / drop

### 3.1 Keep (ideas and copy; native JA review still required)

| Item | Why | Source path |
|---|---|---|
| Problem list: シフトがLINEや紙に分かれている / 店長が何度も確認している / 在庫不足に気づくのが遅い / 日々の業務が人によって変わる | concrete café pains; matches the real product (shifts, inventory, Operations checklists) | `oruwa-gpt/app/page.tsx` L218–224 |
| Three-role framing (Staff / Manager / Owner, one question each) | clear, sells to the Owner while reassuring staff use | `oruwa-gpt/app/page.tsx` L303–318 |
| 「見るべきことが、先に見える。」 + the 要確認 list idea | matches the Manager attention panel that really exists | `oruwa-gpt/app/page.tsx` L524–566 |
| Before → with ORUWA contrast | strong sales device; redo it visually | `oruwa-gpt/app/page.tsx` L233–267 |
| A day in the café timeline | lets the buyer picture use; illustrate with real screens | `oruwa-gpt/app/page.tsx` L496–523 |
| LINE + Web honesty note (works without LINE; LINE OA costs are separate) | true (Founder 2026-10-18: works without LINE) and pre-empts an objection | `oruwa-web/components/SitePage.tsx` L26–31 |
| FAQ questions (小規模でも使える？ LINE公式アカウントは必要？ スマホで使える？ 英語は？ 導入期間は？) | real buyer questions; answers must be rewritten to current facts | `oruwa-web/components/SitePage.tsx` L58 |
| Product-truth rules (no fake numbers, testimonials or availability claims; concepts labelled) | keep as **site content policy** | `oruwa-web/docs/ORUWA_WEBSITE_V1.md` "Product truth"; `ORUWA-Sales-Kit-1/docs/decisions/0001-product-truth.md` |
| Brand separation: ORUWA = product brand; IZUMI IT COMPANY = developer ("Developed by …"); do not copy ORUWA pages to izumiit.com | SEO and clarity | `oruwa-web/docs/IZUMIIT_TRANSITION_NOTES.md`, `ORUWA-Sales-Kit-1/02-Sales-System/positioning/oruwa-brand.md` |
| Security headers baseline (CSP self-only, nosniff, DENY, Referrer-Policy, Permissions-Policy) | good default for a static site; move to Vercel headers | `oruwa-web/public/.htaccess` |
| Contact-form fields (会社名, お名前, メール, 電話, 業種, 店舗数, ご相談内容, privacy consent) | right fields; the accessible dialog pattern (focus trap, Escape, error focus) is reusable as an idea | `oruwa-gpt/app/lead-form-dialog.tsx` |
| Discovery questions / objections / demo script | inputs for site FAQ and the "導入の流れ" section | `ORUWA-Sales-Kit-1/docs/meeting/*` |

### 3.2 Adapt

| Item | Change |
|---|---|
| Hero line | 「ひとつの流れに／ひとつにつなぐ」 is generic (many SaaS say it). Test it against an outcome line for café owners (e.g. fewer confirmation messages, closing checks done) during the reference analysis; choose after native JA review |
| Logo mark `public/oruwa-mark.svg` (identical in both folders) and `favicon.svg` | usable as a temporary mark; the old docs call the logo "temporary"; brand/trademark check is a Founder input |
| Colour direction (warm ivory, ink/navy, ORUWA green, amber attention) | close to the product's design tokens; align with `@line-os/tokens` instead of a separate palette |
| IZUMI IT trust block (2018 founded; 400 vs **500+** projects) | **the two folders disagree (400 vs 500+)**; `oruwa-gpt` marks it `founder-required-before-production`. Use only after the Founder confirms the number |

### 3.3 Drop

| Item | Why |
|---|---|
| Both codebases (structure, CSS, components) | rebuild decision; `oruwa-gpt` is a patch-on-patch CSS stack on a beta toolchain (vinext beta, OpenAI sites plugin, Cloudflare Workers) that does not fit the monorepo/Vercel setup |
| Fake-success lead form | shows 「お問い合わせありがとうございます」 after a timer and sends nothing; a trust and legal risk if published |
| Hand-drawn UI mockups (`ProductPreview`, `StaffPreview`, `PlatformVisual`) with English labels | the new site uses **real product screenshots** from the clean demo tenant (4D), in Japanese |
| Concept packages shown on the home page (Salon, Cleaning, Construction, Procurement) | dilutes a premium single-product pitch; at most one "今後の展開" line until a second package is real |
| "Custom extensions / 個別開発" block (Web, Map, Fleet, AI) | sells IZUMI IT services, not ORUWA; belongs on izumiit.com |
| "Pricing: お問い合わせ" | a sales site should show the price (Founder will set it); keep 「お問い合わせ」 only for multi-location |
| Placeholder legal templates (［所有者確認後に記載］) | replaced by real texts in Phase F |
| `/login` placeholder page | the header link goes straight to `https://app.oruwa.jp/sign-in` |
| Sakura deploy workflow | site moves to Vercel with the monorepo (open question: keep Sakura — plan §10 item 7) |

## 4. Assets and provenance

| Asset | Path | Provenance | Use? |
|---|---|---|---|
| OG image v1 (ORUWA + 「店舗運営を、ひとつの流れに。」 + UI illustration) | `oruwa-web/generated-assets/oruwa-social-preview-1200x630.png` = `oruwa-web/oruwa-web/public/og.png` | the folder name says "generated"; most likely AI image generation (UNCERTAIN: tool, prompt and licence not recorded) | **no** (redo from the new design; record the source) |
| OG image v2 (ORUWA + 「毎日の業務を、ひとつにつなぐ。」 + line pattern), 1731×909 | `oruwa-web/oruwa-gpt/public/og.png` | made with the OpenAI sites tool (UNCERTAIN) | **no** for the same reason; the line-network motif is a usable idea |
| Logo mark / favicon | `oruwa-web/oruwa-web/public/oruwa-mark.svg`, `favicon.svg` (same in `oruwa-gpt/public`) | unknown author (UNCERTAIN: Founder-made or generated) | temporary only, after the Founder confirms ownership |
| QA screenshots | `oruwa-web/oruwa-web/artifacts/qa/*.png` | screenshots of the old site | reference only |
| Sales Kit brand/QR/screenshots | `ORUWA-Sales-Kit-1/assets/*` | empty (`.gitkeep`) | — |

Rules for generated images on the new site (Lead decision):

1. Prefer real product screenshots and real photos (Founder's own or
   licensed stock with a stored licence).
2. A generated image is allowed only with a record in the repo: tool, date,
   prompt, the tool's licence terms at that date, and a check that no real
   person, brand or logo is shown.
3. Japanese text inside images is set as live HTML text, not baked into
   the image (accessibility, SEO, native review).
4. AI-generated text and images get the same native JA review as everything
   else.

## 5. Proposed structure of the new site (premium, sales-focused, JA first)

One long sales page for café owners, plus a few supporting pages. The order
follows **problem → solution → proof → price → CTA**.

| # | Section | Content | Proof material |
|---|---|---|---|
| 1 | Hero | one outcome line for café owners + one sub-line; CTA 「無料で30日試す」 (trial, no card) + secondary 「デモを見る」; real Manager screen on a laptop + Staff screen on a phone | real screenshots (4D demo tenant) |
| 2 | Problem | 4 concrete pains (shift via LINE/paper, repeated checks, late stock shortages, closing checks done differently by each person) | — |
| 3 | Before → after | scattered tools → one screen of 「今日やること」 | short screen recording (muted loop) |
| 4 | Solution by role | Owner / 店長 / スタッフ, one question and one screen each | real screens |
| 5 | Modules | シフト・勤怠, 在庫・発注, レシピ, 衛生管理チェック (HACCP), 問題・引き継ぎ, 週次レビュー: one line + one screen each, only what exists | real screens; HACCP line cites the MHLW basis already used in presets |
| 6 | A day with ORUWA | 07:30 → 20:00 timeline with screens | real screens |
| 7 | LINE + Web | works in the browser; LINE as the staff's entry (when the client's own OA is linked); honest cost note | — |
| 8 | Trust | data separated per company (RLS, audit log), JA/EN, built in Japan by IZUMI IT COMPANY (confirmed figures only), support contact; later: first customer story with permission | security page summary; no fake logos or counts |
| 9 | Price | one plan, price tax included, "30日間無料・カード不要", what is included, cancel any time (terms from Phase F) | Stripe-backed price (Phase D) |
| 10 | Start in 3 steps | 申し込み → 店舗設定(数分) → スタッフ招待 | provisioning ≈ 70 s (4B-3) |
| 11 | FAQ | rewritten old FAQ + Sales Kit objections | — |
| 12 | Final CTA | trial + 相談する (contact form or LINE OA) | — |
| Footer | 特定商取引法に基づく表記, プライバシーポリシー, 利用規約, 運営会社, ログイン, EN | Phase F |

Supporting pages: `/pricing` (detail + 特商法 link), `/security`, `/contact`,
legal pages, `/en` (later). Concept packages are absent until the second
package is real.

Process (handoff 2026-10-25): Founder picks 3–5 reference sites → Lead
analysis (what each does well, with links) → wireframe of the sections above
→ copy draft → screenshots from 4D → build in `apps/site` → native JA
review → Phase F legal → launch.

## 6. Open points for the Founder

1. Prices and trial wording: the Sales Kit tiers and setup fees vs one plan
   with a free 30-day trial (plan §8.6).
2. IZUMI IT project count: 400 or 500+, and whether to show it at all.
3. Who made the logo mark, and may it be used.
4. Contact path at launch: a form (needs a small server function + spam
   protection + privacy text) or the LINE OA add-friend link + email only.
5. Keep the paid pilot (¥99,000) as an offer on the site, or sales-only.
