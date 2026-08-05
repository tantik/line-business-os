import type { Lang } from './i18n';

export interface DemoHelpContent {
  title: string;
  ariaLabel: string;
  body: string;
}

export type DemoHelpContentByLang = Record<Lang, DemoHelpContent>;

function bilingual(ja: DemoHelpContent, en: DemoHelpContent): DemoHelpContentByLang {
  return { ja, en };
}

/**
 * Static Japanese help copy for the cafe demo's `?` popovers.
 * Kept separate from i18n.*.ts because this help system is JA-only by design (demo sales-support copy, not a translated UI string).
 *
 * The Recipes-related items below (`HELP_RECIPES_*`) are the one exception:
 * `RecipeDetail`/`RecipeView` are shared with the real Mame To Cha DB-backed
 * Staff preview, which DOES support an EN/JA toggle for recipe content, so
 * these four are lang-keyed (`Record<Lang, DemoHelpContent>`, same shape as
 * `i18n.recipes.ts`'s `RECIPES_DICT`) instead of a single JA-only object.
 * The Staff/Manager help items above stay untouched, single-language
 * `DemoHelpContent` objects -- those screens have no EN/JA toggle.
 */

export const HELP_STAFF_WORK_STATUS = bilingual({
  title: '勤務状況の使い方',
  ariaLabel: '勤務状況の説明を開く',
  body: `勤務状況では、スタッフの出勤・退勤・休憩開始・休憩終了を記録します。

出勤する場合:
1. 勤務を開始するときに「出勤」ボタンを押します。
2. 出勤時刻が記録され、ステータスが勤務中に変わります。
3. ボタンの表示は「退勤」に変わります。

退勤する場合:
1. 勤務を終了するときに「退勤」ボタンを押します。
2. 退勤時刻が記録されます。
3. 出勤時刻、退勤時刻、休憩時間から実働時間が計算されます。
4. 本番導入時には、この勤務記録を店長が確認できるようにします。

休憩する場合:
1. 勤務中に「休憩開始」ボタンを押します。
2. 休憩時間の記録が始まり、ボタンの表示は「休憩終了」に変わります。
3. 休憩が終わったら「休憩終了」ボタンを押します。
4. 休憩時間は実働時間には含まれません。

注意:
このデモでは画面上の動作確認のみ行います。本番導入時には実際の勤務記録として保存します。`,
}, {
  title: 'How Work status works',
  ariaLabel: 'Open the Work status help',
  body: `Use Work status to record clock-in, clock-out, and breaks.

Clock in / out:
1. Select Clock in when work begins.
2. Select Clock out when work ends.
3. Worked time is calculated from those records minus breaks.

Breaks:
1. Select Start break when the break begins.
2. Select End break when work resumes.
3. Break time is excluded from worked time.`,
});

export const HELP_STAFF_SHIFT_TABLE = bilingual({
  title: 'シフト表の見方',
  ariaLabel: 'シフト表の説明を開く',
  body: `シフト表では、今週の勤務予定を確認できます。

表示内容:
- 「1」「2」「3」は勤務時間帯を表します。
- 「通」は通し勤務を表します。
- 「休暇」は勤務できない日を表します。
- 「−」はまだシフトが設定されていない日を表します。

使い方:
1. 「全体」では全スタッフのシフトを確認できます。
2. 「自分だけ」では自分のシフトだけを確認できます。
3. 「前の週」「今日」「次の週」で週を切り替えられます。
4. 自分の過去日のセルを開くと、その日の勤務記録を確認できます。
5. 必要がある場合は勤務時間の修正依頼を送れます。`,
}, {
  title: 'How to read the Shift schedule',
  ariaLabel: 'Open the Shift schedule help',
  body: `The schedule shows the team's weekly shifts.

- Shift codes identify working-time patterns.
- A dash means no shift is assigned.
- Use All or Only me to change the visible staff.
- Use Previous week, Today, and Next week to move between weeks.
- Open your past shift to review attendance or request a correction.`,
});

export const HELP_STAFF_TRANSPORT_MESSAGE = bilingual({
  title: '交通費と本日のメッセージ',
  ariaLabel: '交通費と本日のメッセージの説明を開く',
  body: `この欄では、その日の交通費と店長への連絡事項を入力できます。

交通費:
1. その日に発生した交通費を入力します。
2. 前回入力した金額を参考として表示します。
3. 本番導入時には月間レポートや確認作業に利用できます。

本日のメッセージ:
1. 遅刻・早退・共有事項など、店長に伝えたい内容を入力します。
2. 「保存」を押すと、店長側のダッシュボードで確認できる想定です。
3. 英語で入力された場合、本番導入時には翻訳表示も検討できます。`,
}, {
  title: 'Transport and daily message',
  ariaLabel: 'Open the Transport and daily message help',
  body: `Use this section to record today's transport cost and a message for the manager.

- Enter only the transport cost for this workday.
- Use the message for lateness, early departure, or an operational note.
- Select Save to update today's work report.`,
});

export const HELP_STAFF_NEXT_MONTH_PREFERENCE = bilingual({
  title: '来月のシフト希望の出し方',
  ariaLabel: '来月のシフト希望の説明を開く',
  body: `来月の勤務希望を提出するための画面です。

使い方:
1. 「来月のシフト希望を提出」ボタンを押します。
2. カレンダーから日付を選びます。
3. 希望するシフト種別を選びます。
4. 勤務できない日は「休暇」を選びます。
5. 未定の場合は「−」のままにできます。

本番導入時:
スタッフが提出した希望をもとに、店長がシフト作成を行いやすくなります。`,
}, {
  title: "How to submit next month's availability",
  ariaLabel: "Open the next month's availability help",
  body: `Submit the days and shift patterns you can work next month.

1. Open the availability calendar.
2. Choose a shift type for available days.
3. Mark days when you cannot work as unavailable.
4. Submit the completed preference to the manager.`,
});

export const HELP_RECIPES_SHARING: Record<Lang, DemoHelpContent> = {
  ja: {
    title: 'レシピ共有の使い方',
    ariaLabel: 'レシピ共有の説明を開く',
    body: `レシピ共有では、スタッフがスマートフォンから商品の作り方を確認できます。

使い方:
1. 上部のレシピカードから確認したい商品を選びます。
2. 材料、作り方、補足メモを確認します。
3. 日本語・英語を切り替えて確認できます。
4. 本番導入時にはLINEリッチメニューから直接開く導線を想定しています。

目的:
新人スタッフや外国人スタッフでも、同じ手順を見ながら作業できるようにするための機能です。`,
  },
  en: {
    title: 'How to use Recipe Sharing',
    ariaLabel: 'Open the Recipe Sharing help',
    body: `Recipe Sharing lets staff check how to make each item from their smartphone.

How to use:
1. Choose the item you want to check from the recipe cards at the top.
2. Check the ingredients, steps, and any extra notes.
3. Switch between Japanese and English as needed.
4. In production, this is expected to open directly from a LINE rich menu.

Purpose:
So that new or non-Japanese-speaking staff can follow the same steps while working.`,
  },
};

export const HELP_RECIPES_INGREDIENTS: Record<Lang, DemoHelpContent> = {
  ja: {
    title: '材料の見方',
    ariaLabel: '材料の説明を開く',
    body: `材料欄には、商品を作るために必要な材料と分量を表示します。

使い方:
1. 作業前に必要な材料を確認します。
2. 分量を確認して、味や品質が毎回同じになるようにします。
3. 本番導入時には店舗ごとのレシピ登録・編集に対応できます。`,
  },
  en: {
    title: 'How to read Ingredients',
    ariaLabel: 'Open the Ingredients help',
    body: `The ingredients section shows what's needed to make the item, and how much of each.

How to use:
1. Check the ingredients you need before starting.
2. Check the quantities so taste and quality stay consistent every time.
3. In production, this can support per-location recipe registration/editing.`,
  },
};

export const HELP_RECIPES_STEPS: Record<Lang, DemoHelpContent> = {
  ja: {
    title: '作り方の見方',
    ariaLabel: '作り方の説明を開く',
    body: `作り方欄には、商品の調理手順を順番に表示します。

使い方:
1. 1番から順番に確認します。
2. 慣れていないスタッフでも同じ手順で作業できます。
3. 手順が変わった場合、本番導入時には店長側から更新できるようにします。`,
  },
  en: {
    title: 'How to read Steps',
    ariaLabel: 'Open the Steps help',
    body: `The steps section shows the preparation steps in order.

How to use:
1. Follow the steps in order, starting from step 1.
2. Even staff who aren't used to the recipe yet can work the same way.
3. If a step changes, in production the manager will be able to update it.`,
  },
};

export const HELP_RECIPES_MEMO: Record<Lang, DemoHelpContent> = {
  ja: {
    title: '補足メモの使い方',
    ariaLabel: '補足メモの説明を開く',
    body: `補足メモには、通常の手順だけでは伝わりにくい注意点や追加説明を表示します。

例:
- 抹茶液の作り方
- ソースの事前準備
- 提供前の確認ポイント
- 季節メニューの注意点

目的:
口頭説明に頼らず、スタッフ全員が同じ品質で提供できるようにするためです。`,
  },
  en: {
    title: 'How to use Notes',
    ariaLabel: 'Open the Notes help',
    body: `Notes show extra points or explanations that the regular steps alone don't cover.

Examples:
- How to make the matcha liquid
- Preparing the sauce in advance
- Things to check before serving
- Notes for seasonal menu items

Purpose:
So every staff member can provide the same quality without relying on verbal explanations.`,
  },
};

export const HELP_MANAGER_ALERTS = bilingual({
  title: '要確認の見方',
  ariaLabel: '要確認の説明を開く',
  body: `要確認には、店長が確認すべき内容をまとめて表示します。

表示される例:
- 勤務時間の修正依頼
- シフト希望未提出
- 人員不足
- スタッフからのメッセージ

使い方:
1. 要確認の内容を確認します。
2. シフト表の「!」が付いたセルを開きます。
3. 勤務記録や修正依頼の詳細を確認します。
4. 必要に応じて承認・後で確認などの対応を行います。`,
}, {
  title: 'How to use Needs review',
  ariaLabel: 'Open the Needs review help',
  body: `Needs review lists specific items that require a manager decision.

Examples:
- attendance correction requests;
- missing shift preferences;
- understaffed days;
- staff messages.

Open the related action to review the staff member, date, details, and available decision.`,
});

export const HELP_MANAGER_SHIFT_TABLE = bilingual({
  title: '店長用シフト表の使い方',
  ariaLabel: '店長用シフト表の説明を開く',
  body: `店長用シフト表では、スタッフごとの週間シフトを確認・編集できます。

使い方:
1. 表のセルをクリックしてシフト内容を確認します。
2. 過去日は勤務実績の確認画面が開きます。
3. 今日以降の日付ではシフト編集画面が開きます。
4. 日付欄に付いた「!」は、必要人数に対して人員が不足している日を示します。
5. 「前の週」「今日」「次の週」で週を切り替えられます。

注意:
このデモでは画面上の確認・編集のみです。本番導入時には実データとして保存します。`,
}, {
  title: 'How to use the Manager shift schedule',
  ariaLabel: 'Open the Manager shift schedule help',
  body: `Use the weekly schedule to review and edit staff shifts.

1. Select a staff/date cell to open that shift.
2. Future shifts can be created or edited.
3. Past shifts open their recorded information.
4. An exclamation mark identifies an understaffed day.
5. Use Previous week, Today, and Next week to change the week.`,
});

export const HELP_MANAGER_AUTO_SCHEDULE = bilingual({
  title: '自動シフト作成の考え方',
  ariaLabel: '自動シフト作成の説明を開く',
  body: `自動シフト作成は、スタッフの希望や必要人数をもとにシフト案を作る機能のデモです。

想定する条件:
- 曜日ごとの必要人数
- スタッフの希望シフト
- 勤務可能日
- 最大勤務時間
- 休暇希望

本番導入時:
実店舗のルールに合わせて、シフト案を作成し、店長が最終確認できる形にします。`,
}, {
  title: 'How automatic shift creation works',
  ariaLabel: 'Open the automatic shift creation help',
  body: `Automatic shift creation prepares a draft from:

- required staffing by weekday;
- submitted staff preferences;
- unavailable days;
- maximum monthly hours.

The result remains a draft until a manager reviews and publishes it.`,
});

export const HELP_MANAGER_MONTHLY_REPORT = bilingual({
  title: '月間レポートCSVの見方',
  ariaLabel: '月間レポートCSVの説明を開く',
  body: `月間レポートでは、スタッフ別の実働時間、時給、交通費、概算支給額を確認できます。

使い方:
1. 「月間レポートCSV」を押します。
2. スタッフ別の月間サマリーを確認します。
3. 本番導入時にはCSV出力により、月末集計や給与確認の作業を減らせます。

注意:
このデモの月間レポートは概算表示です。正式な給与計算ではありません。`,
}, {
  title: 'How to use the monthly report',
  ariaLabel: 'Open the monthly report help',
  body: `The monthly report summarizes worked hours and operational records by staff member.

Estimated earnings are an operational estimate only. They are not payroll and do not include taxes, overtime rules, insurance, or deductions.`,
});

export const HELP_MANAGER_STAFF_RECIPE_MANAGEMENT = bilingual({
  title: 'スタッフ・レシピ管理の使い方',
  ariaLabel: 'スタッフ・レシピ管理の説明を開く',
  body: `スタッフ管理では、スタッフ情報を確認・編集する想定です。
レシピ管理では、店舗の商品レシピを登録・編集する想定です。

スタッフ管理:
- 名前
- 表示名
- 時給
- LINE User ID
- ステータス
- メモ

レシピ管理:
- レシピ名
- 説明
- 写真
- 材料
- 作り方
- 補足メモ
- 公開/下書きステータス

本番導入時:
店舗ごとのスタッフ情報やレシピ情報として保存します。`,
}, {
  title: 'Staff, Recipes, and Inventory',
  ariaLabel: 'Open the Staff, Recipes, and Inventory help',
  body: `Staff management:
- add and edit staff profiles;
- maintain position, employment type, and active status.

Recipe management:
- review recipes and instructions;
- change the content type supported by the current data model.

Inventory:
- maintain item targets and reorder points;
- review current quantities and shortages.`,
});

export const HELP_MANAGER_SETTINGS = bilingual({
  title: '設定の使い方',
  ariaLabel: '設定の説明を開く',
  body: `設定では、店舗ごとのシフト作成ルールを管理する想定です。

設定例:
- 曜日ごとの各シフト必要人数
- スタッフ最大勤務時間
- シフト種別
- 勤務時間帯

目的:
店舗の運用ルールを登録して、シフト作成や月間集計をしやすくするためです。`,
}, {
  title: 'How to use Settings',
  ariaLabel: 'Open the Settings help',
  body: `Settings controls the store's scheduling rules.

- required staff per shift, by weekday;
- maximum monthly hours;
- reusable shift types and working times.

Deactivate a shift type when it should no longer be offered. Existing historical shifts remain unchanged.`,
});
