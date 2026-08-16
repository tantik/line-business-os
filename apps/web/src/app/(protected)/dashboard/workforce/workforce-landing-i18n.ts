import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the Workforce landing hub (`/dashboard/workforce`) --
 * previously the only canonical dashboard surface with no `LangProvider`/
 * `useLang` mechanism at all (English-only, including the "My staff
 * profile" card -- the STAFF-I18N-1 finding from
 * `docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`). Follows the
 * exact `manager-dashboard-i18n.ts` / `staff-dashboard-i18n.ts` pattern.
 * Japanese is the default language, matching the Japanese-first baseline.
 *
 * All newly authored Japanese copy in this file is machine-translated by an
 * AI agent and NEEDS NATIVE JAPANESE REVIEW before being relied on as final
 * customer-facing copy.
 */
interface WorkforceLandingDict {
  myProfileHeading: string;
  position: string;
  employmentType: string;
  status: string;
  statusActive: string;
  statusInactive: string;
  notSet: string;
  noProfile: string;
  profileUnavailable: string;
  staffHeading: string;
  staffDescription: string;
  openStaffDashboard: string;
  managerHeading: string;
  managerDescription: string;
  openManagerDashboard: string;
  recipesHeading: string;
  recipesDescription: string;
  viewRecipes: string;
}

const dictionary: Record<Lang, WorkforceLandingDict> = {
  ja: {
    myProfileHeading: 'マイスタッフプロフィール',
    position: '役職',
    employmentType: '雇用形態',
    status: 'ステータス',
    statusActive: '有効',
    statusInactive: '無効',
    notSet: '未設定',
    noProfile: 'あなたのアカウントに紐づくスタッフプロフィールはまだありません。',
    profileUnavailable: 'プロフィールを一時的に取得できません。',
    staffHeading: 'スタッフ',
    staffDescription: 'シフト希望の提出、公開されたスケジュールの確認、勤務報告・修正依頼の提出ができます。',
    openStaffDashboard: 'スタッフダッシュボードを開く',
    managerHeading: 'マネージャー',
    managerDescription: 'スタッフ・シフト希望・週間スケジュールを確認し、自動割り当てとシフト公開を行います。',
    openManagerDashboard: 'マネージャーダッシュボードを開く',
    recipesHeading: 'レシピ',
    recipesDescription: 'カテゴリ別に公開されたレシピとマニュアルを閲覧します。',
    viewRecipes: 'レシピを見る',
  },
  en: {
    myProfileHeading: 'My staff profile',
    position: 'Position',
    employmentType: 'Employment type',
    status: 'Status',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    notSet: 'Not set',
    noProfile: 'No staff profile linked to your account yet.',
    profileUnavailable: 'Your profile is temporarily unavailable.',
    staffHeading: 'Staff',
    staffDescription: 'Submit shift preferences, view your published schedule, and file work reports and correction requests.',
    openStaffDashboard: 'Open staff dashboard',
    managerHeading: 'Manager',
    managerDescription: 'Review staff, shift preferences, and the weekly schedule; run auto-distribution and publish shifts.',
    openManagerDashboard: 'Open manager dashboard',
    recipesHeading: 'Recipes',
    recipesDescription: 'Browse published recipes and manuals by category.',
    viewRecipes: 'View recipes',
  },
};

export const tWorkforceLanding = makeTranslator(dictionary);
