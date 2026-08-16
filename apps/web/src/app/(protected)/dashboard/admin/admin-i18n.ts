import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';
import type { MembershipStatus, TenantKind } from '@/lib/tenant/types';

/**
 * JA/EN strings for the tenant Admin page (`/dashboard/admin`). Reuses the
 * existing `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`), the same one the canonical Staff dashboard
 * already uses -- a new dictionary, not a new i18n system. Replaces this
 * page's previous hardcoded Russian copy (Mission 1, Cafe v2.1 Product/UX
 * Reconciliation Audit §8/§12, Defect A): the page has no documented reason
 * to have ever been Russian, and Japanese-first is this product's default
 * per `LangProvider`'s own `en`/`ja` default.
 */
interface AdminDashboardDict {
  pageTitle: string;
  pageDescription: string;
  backToDashboard: string;
  activeTenantHeading: string;
  membersHeading: string;
  membersDescription: string;
  membersTotalLabel: string;
  membersEmpty: string;
  membersUnauthorized: string;
  membersError: string;
  tableTenant: string;
  tableSlug: string;
  tableKind: string;
  tableLocationScope: string;
  tableStatus: string;
  allLocations: string;
  locationsTitle: string;
  locationsDescription: string;
  modulesTitle: string;
  modulesDescription: string;
  membersRolesTitle: string;
  membersRolesDescription: string;
  billingTitle: string;
  billingDescription: string;
  securityHeading: string;
  securityBody: string;
}

const dictionary: Record<Lang, AdminDashboardDict> = {
  en: {
    pageTitle: 'Tenant admin',
    pageDescription:
      'Read-only mode: review the current customer, tenant scope, and base SaaS modules. Management actions will be added in a later phase.',
    backToDashboard: 'Back to dashboard',
    activeTenantHeading: 'Active customer / tenant',
    membersHeading: 'Visible members',
    membersDescription:
      'Read-only list: members of the current tenant, retrieved through a secure API facade. Management actions are not available yet.',
    membersTotalLabel: 'total:',
    membersEmpty: 'No members available.',
    membersUnauthorized: 'Member list is not available for this tenant.',
    membersError: 'Could not load the member list.',
    tableTenant: 'Tenant',
    tableSlug: 'Slug',
    tableKind: 'Kind',
    tableLocationScope: 'Location scope',
    tableStatus: 'Status',
    allLocations: 'All locations',
    locationsTitle: 'Locations / business sites',
    locationsDescription:
      'Manage physical addresses, branches, and business sites. Actions are currently disabled and will be added in a later phase.',
    modulesTitle: 'SaaS modules',
    modulesDescription:
      'Activate additional modules, plugins, and integrations for the selected customer / tenant. Actions are currently disabled and will be added in a later phase.',
    membersRolesTitle: 'Members and roles',
    membersRolesDescription:
      'Manage access, add new staff, and configure roles. Actions are currently disabled and will be added in a later phase.',
    billingTitle: 'Billing / subscriptions',
    billingDescription:
      'Manage the subscription, view invoices, limits, and pricing. Actions are currently disabled and will be added in a later phase.',
    securityHeading: 'Security',
    securityBody:
      'This page runs under strict access control. For security, it never displays sensitive user data (such as email, phone numbers, user ID, or auth ID), internal role parameters, metadata, configuration, or raw database errors.',
  },
  ja: {
    pageTitle: 'テナント管理',
    pageDescription:
      '読み取り専用モードです。現在の顧客、テナントの範囲、基本SaaSモジュールを確認できます。管理操作は今後のフェーズで追加されます。',
    backToDashboard: 'ダッシュボードに戻る',
    activeTenantHeading: '現在の顧客 / テナント',
    membersHeading: '閲覧可能なメンバー',
    membersDescription:
      '読み取り専用の一覧です。安全なAPIファサード経由で取得した、現在のテナントのメンバーを表示します。管理操作はまだ利用できません。',
    membersTotalLabel: '合計:',
    membersEmpty: '閲覧可能なメンバーはいません。',
    membersUnauthorized: 'このテナントではメンバー一覧を利用できません。',
    membersError: 'メンバー一覧を読み込めませんでした。',
    tableTenant: 'テナント',
    tableSlug: 'スラッグ',
    tableKind: '種別',
    tableLocationScope: '店舗の範囲',
    tableStatus: 'ステータス',
    allLocations: 'すべての店舗',
    locationsTitle: '店舗 / 拠点',
    locationsDescription:
      '物理的な住所、支店、拠点を管理します。操作は現在無効になっており、今後のフェーズで追加されます。',
    modulesTitle: 'SaaSモジュール',
    modulesDescription:
      '選択した顧客 / テナント向けに、追加モジュール、プラグイン、連携機能を有効化します。操作は現在無効になっており、今後のフェーズで追加されます。',
    membersRolesTitle: 'メンバーと権限',
    membersRolesDescription:
      'アクセス権の管理、新しいスタッフの追加、権限の設定を行います。操作は現在無効になっており、今後のフェーズで追加されます。',
    billingTitle: '請求 / サブスクリプション',
    billingDescription:
      'サブスクリプション、請求書、上限、料金プランを管理します。操作は現在無効になっており、今後のフェーズで追加されます。',
    securityHeading: 'セキュリティ',
    securityBody:
      'このページは厳格なアクセス制御のもとで動作します。安全のため、ユーザーの機密情報（メールアドレス、電話番号、ユーザーID、認証IDなど）、内部の権限パラメータ、メタデータ、設定情報、生のデータベースエラーは一切表示しません。',
  },
};

export const tAdminDashboard = makeTranslator(dictionary);

/**
 * F5 (`docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`): the member
 * table previously rendered `tenantKind`/`membershipStatus` as raw DB enum
 * values (`client_template`, `invited`, ...). Both are true fixed enums
 * (`@/lib/tenant/types.ts`), unlike `workforce.employees.employment_type`
 * (free text, deliberately left unmapped elsewhere) -- safe to give a
 * closed label map.
 */
const tenantKindLabels: Record<Lang, Record<TenantKind, string>> = {
  en: { demo: 'Demo', client_template: 'Client template', client: 'Client' },
  ja: { demo: 'デモ', client_template: 'クライアントテンプレート', client: 'クライアント' },
};

export function tenantKindLabel(lang: Lang, kind: TenantKind): string {
  return tenantKindLabels[lang][kind];
}

const membershipStatusLabels: Record<Lang, Record<MembershipStatus, string>> = {
  en: { invited: 'Invited', active: 'Active', suspended: 'Suspended', revoked: 'Revoked' },
  ja: { invited: '招待中', active: '有効', suspended: '停止中', revoked: '取消済み' },
};

export function membershipStatusLabel(lang: Lang, status: MembershipStatus): string {
  return membershipStatusLabels[lang][status];
}
