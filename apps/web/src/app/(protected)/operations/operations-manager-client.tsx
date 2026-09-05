'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OperationsTemplate, OperationsTemplateItem } from '@/lib/operations/templates';
import type { OperationsSchedule } from '@/lib/operations/schedules';
import type { OperationsExpectedTask } from '@/lib/operations/tasks';
import type { OperationsOpenException } from '@/lib/operations/exceptions';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { LoadingButton } from '@/components/ui/loading';
import { alertDanger, backLink, badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, colors, mutedText, pageStyle } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { tOperations } from './operations-i18n';
import { TemplateForm } from './template-form';
import { TemplateDetailModal } from './template-detail-modal';
import { TodayTasksSection } from './today-tasks-section';
import { AttentionSection } from './attention-section';

export interface OperationsManagerClientProps {
  tenantName: string;
  locationName: string;
  locationId: string;
  templates: OperationsTemplate[] | null;
  items: OperationsTemplateItem[] | null;
  schedules: OperationsSchedule[] | null;
  /** Today's expected Operations tasks at this Manager's own location -- see `page.tsx`. */
  todayTasks: OperationsExpectedTask[] | null;
  /** Currently-open Operations exceptions at this Manager's own location -- see `page.tsx`. */
  openExceptions: OperationsOpenException[] | null;
}

type StatusFilter = 'active' | 'retired';
type Section = 'templates' | 'today' | 'attention';

/**
 * Manager Operations Configuration -- Templates & Items only (Cafe v2.2 WP1
 * Operations, first UI slice). No scheduling ("apply template to a
 * location"), no task execution -- those are separate, later slices. Standalone
 * page (not a Manager-dashboard popup), mirroring `/recipes/page.tsx`'s exact
 * shape: its own `LangProvider`, its own header/back-link, a list + a
 * `Modal`-based create form + a `Modal`-based detail/edit view.
 */
export function OperationsManagerClient(props: OperationsManagerClientProps) {
  return (
    <LangProvider>
      <main style={pageStyle(880)}>
        <OperationsManagerBody {...props} />
      </main>
    </LangProvider>
  );
}

function OperationsManagerBody({
  tenantName,
  locationName,
  locationId,
  templates,
  items,
  schedules,
  todayTasks,
  openExceptions,
}: OperationsManagerClientProps) {
  const { lang } = useLang();
  const router = useRouter();
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  const [section, setSection] = useState<Section>('templates');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [adding, setAdding] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const openExceptionCount = (openExceptions ?? []).length;

  const visibleTemplates = useMemo(
    () => (templates ?? []).filter((template) => (statusFilter === 'active' ? template.isActive : !template.isActive)),
    [templates, statusFilter],
  );

  const selectedTemplate = selectedTemplateId ? (templates ?? []).find((tpl) => tpl.templateId === selectedTemplateId) ?? null : null;
  const selectedTemplateItems = selectedTemplateId ? (items ?? []).filter((item) => item.templateId === selectedTemplateId) : [];

  function refresh() {
    router.refresh();
  }

  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <SignOutButton label={t('signOut')} />
          </div>
        </div>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          {t('pageDescription')} {tenantName} · {locationName}
        </p>
        <Link href="/manager" style={{ ...backLink, marginTop: 12 }}>
          {t('backToManager')}
        </Link>
      </header>

      <div role="group" aria-label={t('sectionTemplatesTab')} style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, overflow: 'hidden', marginTop: 16 }}>
        {(['templates', 'today', 'attention'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={section === tab}
            onClick={() => setSection(tab)}
            style={{
              border: 0,
              minHeight: 36,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: section === tab ? colors.accent : 'transparent',
              color: section === tab ? '#fff' : colors.textMuted,
            }}
          >
            {tab === 'templates'
              ? t('sectionTemplatesTab')
              : tab === 'today'
                ? t('sectionTodayTab')
                : `${t('sectionAttentionTab')}${openExceptionCount > 0 ? ` (${openExceptionCount})` : ''}`}
          </button>
        ))}
      </div>

      {section === 'today' ? <TodayTasksSection t={t} tasks={todayTasks} /> : null}

      {section === 'attention' ? (
        <AttentionSection t={t} lang={lang} exceptions={openExceptions} tasksToday={todayTasks ?? []} items={items ?? []} onChange={refresh} />
      ) : null}

      {section === 'templates' && adding ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 15 }}>{t('newTemplateHeading')}</h2>
          {addError ? <div style={{ ...alertDanger, marginTop: 12 }}>{addError}</div> : null}
          <div style={{ marginTop: 14 }}>
            <TemplateForm
              locationId={locationId}
              formId="operations-template-add-form"
              lang={lang}
              onSuccess={() => {
                setAdding(false);
                refresh();
              }}
              onPendingChange={setAddPending}
              onErrorChange={setAddError}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <LoadingButton
              type="submit"
              form="operations-template-add-form"
              pending={addPending}
              pendingLabel={t('formSaving')}
              style={buttonPrimary}
              pendingStyle={buttonDisabled}
              className={hoverStyles.buttonPrimary}
            >
              {t('formCreateTemplate')}
            </LoadingButton>
            <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={() => setAdding(false)} disabled={addPending}>
              {t('formCancel')}
            </button>
          </div>
        </section>
      ) : section === 'templates' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
          <div role="group" aria-label={t('filterActive')} style={{ display: 'inline-flex', border: `1px solid ${colors.border}`, borderRadius: 999, overflow: 'hidden' }}>
            {(['active', 'retired'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={statusFilter === tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  border: 0,
                  minHeight: 36,
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: statusFilter === tab ? colors.accent : 'transparent',
                  color: statusFilter === tab ? '#fff' : colors.textMuted,
                }}
              >
                {tab === 'active' ? t('filterActive') : t('filterRetired')}
              </button>
            ))}
          </div>
          <button type="button" className={hoverStyles.buttonPrimary} style={{ ...buttonPrimary, marginLeft: 'auto' }} onClick={() => setAdding(true)}>
            {t('addTemplateButton')}
          </button>
        </div>
      ) : null}

      {section === 'templates' && !adding ? (
        <section style={{ ...card, marginTop: 16 }}>
          {templates === null ? (
            <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
          ) : visibleTemplates.length === 0 ? (
            <p style={{ margin: 0, ...mutedText }}>{statusFilter === 'active' ? t('noTemplatesYet') : t('noRetiredTemplates')}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {visibleTemplates.map((template) => (
                <li
                  key={template.templateId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTemplateId(template.templateId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedTemplateId(template.templateId);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 8,
                    background: colors.surfaceElevated,
                    flexWrap: 'wrap',
                    cursor: 'pointer',
                    opacity: template.isActive ? 1 : 0.65,
                  }}
                >
                  <div style={{ minWidth: 160, flex: '1 1 200px' }}>
                    <strong style={{ display: 'block' }}>{template.name}</strong>
                    {template.category ? <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>{template.category}</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={badgeStyle('neutral')}>{template.locationId === null ? t('templateScopeTenantWide') : t('templateScopeLocation')}</span>
                    <span style={badgeStyle(template.isActive ? 'active' : 'inactive')}>
                      {template.isActive ? t('templateActiveBadge') : t('templateRetiredBadge')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {selectedTemplate ? (
        <TemplateDetailModal
          open
          onClose={() => setSelectedTemplateId(null)}
          template={selectedTemplate}
          items={selectedTemplateItems}
          schedules={schedules ?? []}
          locationId={locationId}
          lang={lang}
          onChange={refresh}
        />
      ) : null}
    </>
  );
}
