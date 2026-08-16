'use client';

import Link from 'next/link';
import type { TenantAdminMember } from '@/lib/tenant/admin-members';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { card, colors, linkAccent, mutedText, tableCell, tableHeaderCell } from '@/lib/ui/theme';
import { membershipStatusLabel, tAdminDashboard, tenantKindLabel } from './admin-i18n';
import type { Lang } from '@/lib/demo/cafe/i18n';

export interface AdminMembersData {
  status: 'success' | 'unauthorized' | 'unexpected_error';
  data: TenantAdminMember[] | null;
}

const sectionCardKeys = [
  { titleKey: 'locationsTitle', descriptionKey: 'locationsDescription' },
  { titleKey: 'modulesTitle', descriptionKey: 'modulesDescription' },
  { titleKey: 'membersRolesTitle', descriptionKey: 'membersRolesDescription' },
  { titleKey: 'billingTitle', descriptionKey: 'billingDescription' },
] as const;

export interface AdminDashboardClientProps {
  tenantName: string;
  tenantSlug: string;
  members: AdminMembersData;
}

/**
 * Outer wrapper: mounts the shared `LangProvider` around the Admin page
 * body, matching the same pattern the canonical Staff dashboard uses --
 * a component cannot call `useLang()` above its own `LangProvider` ancestor.
 */
export function AdminDashboardClient(props: AdminDashboardClientProps) {
  return (
    <LangProvider>
      <AdminDashboardBody {...props} />
    </LangProvider>
  );
}

function AdminMembersSection({
  members,
  t,
  lang,
}: {
  members: AdminMembersData;
  t: (key: Parameters<typeof tAdminDashboard>[1]) => string;
  lang: Lang;
}) {
  if (members.status === 'success' && members.data) {
    return (
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>{t('membersHeading')}</h2>
            <p style={{ margin: '6px 0 0', ...mutedText }}>{t('membersDescription')}</p>
          </div>
          <span style={{ ...mutedText, fontSize: 14, whiteSpace: 'nowrap' }}>
            {t('membersTotalLabel')} {members.data.length}
          </span>
        </div>

        {members.data.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('membersEmpty')}</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={tableHeaderCell}>{t('tableTenant')}</th>
                  <th style={tableHeaderCell}>{t('tableSlug')}</th>
                  <th style={tableHeaderCell}>{t('tableKind')}</th>
                  <th style={tableHeaderCell}>{t('tableLocationScope')}</th>
                  <th style={tableHeaderCell}>{t('tableStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((member, index) => (
                  <tr key={`${member.tenantId}:${member.locationId ?? 'all'}:${member.membershipStatus}:${index}`}>
                    <td style={tableCell}>
                      <strong>{member.tenantName}</strong>
                    </td>
                    <td style={{ ...tableCell, overflowWrap: 'anywhere' }}>{member.tenantSlug}</td>
                    <td style={tableCell}>{tenantKindLabel(lang, member.tenantKind)}</td>
                    <td style={{ ...tableCell, overflowWrap: 'anywhere' }}>{member.locationId ?? t('allLocations')}</td>
                    <td style={tableCell}>{membershipStatusLabel(lang, member.membershipStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{t('membersHeading')}</h2>
      <p style={{ margin: '8px 0 0', ...mutedText }}>
        {members.status === 'unauthorized' ? t('membersUnauthorized') : t('membersError')}
      </p>
    </section>
  );
}

function AdminDashboardBody({ tenantName, tenantSlug, members }: AdminDashboardClientProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tAdminDashboard>[1]) => tAdminDashboard(lang, key);

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>{t('pageTitle')}</h1>
          <PreviewLanguageToggle />
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 15, lineHeight: '1.5' }}>{t('pageDescription')}</p>
        <Link href="/dashboard" style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}>
          {t('backToDashboard')}
        </Link>
      </header>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 'bold' }}>{t('activeTenantHeading')}</h2>
        <p style={{ margin: 0 }}>
          <strong>{tenantName}</strong> <span style={mutedText}>({tenantSlug})</span>
        </p>
      </section>

      <AdminMembersSection members={members} t={t} lang={lang} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
        {sectionCardKeys.map((item) => (
          <section key={item.titleKey} style={{ ...card, marginTop: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>{t(item.titleKey)}</h3>
            <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 13, lineHeight: '1.4' }}>{t(item.descriptionKey)}</p>
          </section>
        ))}
      </div>

      <section
        style={{
          border: `1px solid ${colors.danger}`,
          backgroundColor: colors.dangerMuted,
          color: colors.dangerText,
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 'bold', color: colors.danger }}>{t('securityHeading')}</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: '1.4' }}>{t('securityBody')}</p>
      </section>
    </>
  );
}
