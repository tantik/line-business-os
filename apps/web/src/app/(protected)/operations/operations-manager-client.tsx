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
import { alertDanger, backLink, buttonDisabled, buttonPrimary, buttonSecondary, card, mutedText, pageStyle } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { Button, ListRow, MetadataText, SegmentedControl, StatusBadge } from '@line-os/ui';
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
  /** Non-null only when the `items` read itself failed (as opposed to a legitimate empty list) -- see `page.tsx`'s `readErrorMessage`. Threaded to `TemplateDetailModal` so a real read failure is never shown as "No items yet". */
  itemsError: string | null;
  schedules: OperationsSchedule[] | null;
  /** Non-null only when the `schedules` read itself failed (as opposed to a legitimate empty list) -- see `page.tsx`'s `readErrorMessage`. Threaded to `TemplateDetailModal` so a real read failure is never shown as "No schedule yet" (live QA 2026-09-05: an undeployed read view was silently masked as "no schedules"). */
  schedulesError: string | null;
  /** Today's expected Operations tasks at this Manager's own location -- see `page.tsx`. */
  todayTasks: OperationsExpectedTask[] | null;
  /** Currently-open Operations exceptions at this Manager's own location -- see `page.tsx`. */
  openExceptions: OperationsOpenException[] | null;
  /** Skips this component's own page-level `<header>` when rendered inside a popup (mirrors `PurchasesDashboardClientProps.embedded`/`InventoryDashboardClientProps.embedded`). */
  embedded?: boolean;
}

type StatusFilter = 'active' | 'retired';
type Section = 'templates' | 'today' | 'attention';

/**
 * Manager Operations Configuration -- Templates/Items, Scheduling, Today and
 * Attention (Cafe v2.2 WP1 Operations, all Manager-facing UI slices).
 * Standalone-page wrapper: mounts its own `LangProvider` and page `<main>`,
 * for the bare deep-link edge case `/operations/page.tsx` still renders
 * directly. The canonical Manager-dashboard entry point instead opens
 * `OperationsManagerBody` embedded in a popup (`_ui/operations-manager-popup.tsx`),
 * mirroring `PurchasesDashboardClient`/`PurchasesDashboardBody`'s split.
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

export function OperationsManagerBody({
  tenantName,
  locationName,
  locationId,
  templates,
  items,
  itemsError,
  schedules,
  schedulesError,
  todayTasks,
  openExceptions,
  embedded = false,
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
      {!embedded ? (
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
      ) : null}

      <div style={{ marginTop: embedded ? 0 : 16 }}>
        <SegmentedControl
          aria-label={t('sectionSwitcherLabel')}
          value={section}
          onValueChange={(value) => setSection(value as Section)}
          options={[
            { value: 'templates', label: t('sectionTemplatesTab') },
            { value: 'today', label: t('sectionTodayTab') },
            {
              value: 'attention',
              label: `${t('sectionAttentionTab')}${openExceptionCount > 0 ? ` (${openExceptionCount})` : ''}`,
            },
          ]}
        />
      </div>

      {section === 'today' ? <TodayTasksSection t={t} lang={lang} tasks={todayTasks} /> : null}

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
          <SegmentedControl
            aria-label={t('templateFilterLabel')}
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            options={[
              { value: 'active', label: t('filterActive') },
              { value: 'retired', label: t('filterRetired') },
            ]}
          />
          <Button variant="primary" size="md" className="ml-auto" onClick={() => setAdding(true)}>
            {t('addTemplateButton')}
          </Button>
        </div>
      ) : null}

      {section === 'templates' && !adding ? (
        <section className="mt-4 rounded-md border border-border bg-surface p-3 shadow-card">
          {templates === null ? (
            <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
          ) : visibleTemplates.length === 0 ? (
            <p style={{ margin: 0, ...mutedText }}>{statusFilter === 'active' ? t('noTemplatesYet') : t('noRetiredTemplates')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {visibleTemplates.map((template) => (
                <ListRow
                  key={template.templateId}
                  onOpen={() => setSelectedTemplateId(template.templateId)}
                  muted={!template.isActive}
                  title={template.name}
                  subtitle={template.category ? <MetadataText>{template.category}</MetadataText> : undefined}
                  status={
                    <>
                      <MetadataText>{template.locationId === null ? t('templateScopeTenantWide') : t('templateScopeLocation')}</MetadataText>
                      <StatusBadge tone={template.isActive ? 'success' : 'muted'} showIcon={false}>
                        {template.isActive ? t('templateActiveBadge') : t('templateRetiredBadge')}
                      </StatusBadge>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {selectedTemplate ? (
        <TemplateDetailModal
          open
          onClose={() => setSelectedTemplateId(null)}
          template={selectedTemplate}
          items={selectedTemplateItems}
          itemsError={itemsError}
          schedules={schedules ?? []}
          schedulesError={schedulesError}
          locationId={locationId}
          lang={lang}
          onChange={refresh}
        />
      ) : null}
    </>
  );
}
