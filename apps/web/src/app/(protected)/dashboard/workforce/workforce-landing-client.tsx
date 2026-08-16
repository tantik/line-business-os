'use client';

import Link from 'next/link';
import type { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { badgeStyle, buttonSecondary, card, colors, mutedText, pageStyle } from '@/lib/ui/theme';
import { primaryCard } from '../../_ui/workforce-theme';
import { tWorkforceLanding } from './workforce-landing-i18n';

export interface WorkforceLandingClientProps {
  tenantName: string;
  canAccessManager: boolean;
  profileResult: Awaited<ReturnType<typeof getMyWorkforceStaffProfile>>;
}

/** Small circular monogram badge, used to give each nav card a distinct visual marker (cafe operations feel, no icon library). */
function IconBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: colors.accentMuted,
        color: colors.accent,
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

/**
 * Outer wrapper: mounts the shared `LangProvider` (`@/lib/demo/cafe/i18n`,
 * the same JA/EN mechanism the canonical Manager/Staff dashboards use)
 * around the landing body -- previously this page had no lang mechanism at
 * all (STAFF-I18N-1 / general English-only landing page finding from
 * `docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`). Split out
 * because a component cannot call `useLang()` above its own `LangProvider`
 * ancestor.
 */
export function WorkforceLandingClient(props: WorkforceLandingClientProps) {
  return (
    <LangProvider>
      <WorkforceLandingBody {...props} />
    </LangProvider>
  );
}

/**
 * My staff profile card. `profileResult` is a `TenantAccessResult` of the
 * caller's own `api.workforce_my_staff_profile` row -- `data: null` means no
 * matching `workforce.employees` row exists (e.g. an Owner/Admin with no
 * staff record), not an error. Only the fields approved for display are
 * rendered: no `staff_id`, `location_id`, or `created_at`, and no name (the
 * view never exposes one).
 */
function MyStaffProfileCard({
  profileResult,
  t,
}: {
  profileResult: WorkforceLandingClientProps['profileResult'];
  t: (key: Parameters<typeof tWorkforceLanding>[1]) => string;
}) {
  return (
    <section style={primaryCard}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{t('myProfileHeading')}</h2>
      {profileResult.status === 'success' && profileResult.data ? (
        <dl style={{ margin: '12px 0 0', display: 'grid', rowGap: 8 }}>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>{t('position')}</dt>
            <dd style={{ margin: 0 }}>{profileResult.data.positionLabel ?? t('notSet')}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>{t('employmentType')}</dt>
            <dd style={{ margin: 0 }}>{profileResult.data.employmentType}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>{t('status')}</dt>
            <dd style={{ margin: 0 }}>
              <span style={badgeStyle(profileResult.data.isActive ? 'active' : 'inactive')}>
                {profileResult.data.isActive ? t('statusActive') : t('statusInactive')}
              </span>
            </dd>
          </div>
        </dl>
      ) : profileResult.status === 'success' ? (
        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('noProfile')}</p>
      ) : (
        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('profileUnavailable')}</p>
      )}
    </section>
  );
}

function WorkforceLandingBody({ tenantName, canAccessManager, profileResult }: WorkforceLandingClientProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tWorkforceLanding>[1]) => tWorkforceLanding(lang, key);

  return (
    <main style={pageStyle(720)}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Workforce</h1>
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            Cafe staff scheduling, shift reports, and recipes for {tenantName}.
          </p>
        </div>
        <PreviewLanguageToggle />
      </header>
      <MyStaffProfileCard profileResult={profileResult} t={t} />
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBadge label="S" />
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('staffHeading')}</h2>
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('staffDescription')}</p>
        <Link href="/staff" style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
          {t('openStaffDashboard')}
        </Link>
      </section>
      {canAccessManager ? (
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconBadge label="M" />
            <h2 style={{ margin: 0, fontSize: 16 }}>{t('managerHeading')}</h2>
          </div>
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('managerDescription')}</p>
          <Link href="/manager" style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
            {t('openManagerDashboard')}
          </Link>
        </section>
      ) : null}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBadge label="R" />
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('recipesHeading')}</h2>
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('recipesDescription')}</p>
        <Link href="/dashboard/workforce/recipes" style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
          {t('viewRecipes')}
        </Link>
      </section>
    </main>
  );
}
