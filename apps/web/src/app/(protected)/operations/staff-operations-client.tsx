'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OperationsExpectedTask, OperationsItemResponse } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { backLink, mutedText, pageStyle } from '@/lib/ui/theme';
import { ListRow, MetadataText, StatusBadge } from '@line-os/ui';
import type { StatusTone } from '@line-os/ui';
import { formatTaskDueWindow, tOperations } from './operations-i18n';
import { TaskDetailModal } from './task-detail-modal';

export interface StaffOperationsClientProps {
  tenantName: string;
  locationName: string;
  tasks: OperationsExpectedTask[] | null;
  items: OperationsTemplateItem[] | null;
  responsesByInstanceId: Record<string, OperationsItemResponse[]>;
  businessDate: string;
  /** Skips this component's own page-level `<header>` when rendered inside a popup (mirrors `OperationsManagerClientProps.embedded`). */
  embedded?: boolean;
}

/** Sort weight -- overdue and not-yet-started rise to the top (most actionable first), completed sinks to the bottom. */
function statePriority(state: OperationsExpectedTask['state']): number {
  switch (state) {
    case 'overdue':
      return 0;
    case 'not_started':
      return 1;
    case 'in_progress':
      return 2;
    case 'completed':
      return 3;
    default:
      return 4;
  }
}

function stateTone(state: OperationsExpectedTask['state']): StatusTone {
  switch (state) {
    case 'completed':
      return 'success';
    case 'overdue':
      return 'critical';
    case 'in_progress':
      return 'info';
    default:
      return 'neutral';
  }
}

function stateLabel(t: (key: Parameters<typeof tOperations>[1]) => string, state: OperationsExpectedTask['state']): string {
  switch (state) {
    case 'completed':
      return t('taskStateCompleted');
    case 'overdue':
      return t('taskStateOverdue');
    case 'in_progress':
      return t('taskStateInProgress');
    default:
      return t('taskStateNotStarted');
  }
}

/**
 * Staff Operations task execution (Cafe v2.2 WP1 Operations, third UI slice)
 * -- today's expected tasks at the caller's own location, each opening a
 * checklist to record responses/report problems/complete. Standalone-page
 * wrapper: mounts its own `LangProvider` and page `<main>`, for the bare
 * deep-link edge case `/operations/page.tsx` still renders directly. The
 * canonical Staff-dashboard entry point instead opens `StaffOperationsBody`
 * embedded in a popup (`_ui/operations-staff-popup.tsx`), mirroring
 * `OperationsManagerClient`/`OperationsManagerBody`'s own split. No
 * scheduling, no template management, no Manager Attention/exceptions
 * resolution -- those remain Manager-only or later-slice surfaces.
 */
export function StaffOperationsClient(props: StaffOperationsClientProps) {
  return (
    <LangProvider>
      <main style={pageStyle(760)}>
        <StaffOperationsBody {...props} />
      </main>
    </LangProvider>
  );
}

export function StaffOperationsBody({
  tenantName,
  locationName,
  tasks,
  items,
  responsesByInstanceId,
  businessDate,
  embedded = false,
}: StaffOperationsClientProps) {
  const { lang } = useLang();
  const router = useRouter();
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const sortedTasks = useMemo(
    () =>
      [...(tasks ?? [])].sort(
        (a, b) => statePriority(a.state) - statePriority(b.state) || a.dueTime.localeCompare(b.dueTime) || a.scheduleId.localeCompare(b.scheduleId),
      ),
    [tasks],
  );

  const selectedTask = selectedScheduleId ? sortedTasks.find((task) => task.scheduleId === selectedScheduleId) ?? null : null;
  const selectedTaskItems = selectedTask ? (items ?? []).filter((item) => item.templateId === selectedTask.templateId && item.isActive) : [];
  const selectedTaskResponses = selectedTask?.instanceId ? (responsesByInstanceId[selectedTask.instanceId] ?? []) : [];

  function refresh() {
    router.refresh();
  }

  return (
    <>
      {!embedded ? (
        <header>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{t('staffPageTitle')}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PreviewLanguageToggle />
              <SignOutButton label={t('signOut')} />
            </div>
          </div>
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            {t('staffPageDescription')} {tenantName} · {locationName} · {businessDate}
          </p>
          <Link href="/staff" style={{ ...backLink, marginTop: 12 }}>
            {t('backToStaff')}
          </Link>
        </header>
      ) : null}

      <section
        className="rounded-md border border-border bg-surface p-3 shadow-card"
        style={{ marginTop: embedded ? 0 : 16 }}
      >
        {tasks === null ? (
          <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
        ) : sortedTasks.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>{t('staffNoTasksToday')}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedTasks.map((task) => (
              <ListRow
                key={task.scheduleId}
                onOpen={() => setSelectedScheduleId(task.scheduleId)}
                muted={task.state === 'completed'}
                title={task.templateName}
                subtitle={
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <MetadataText>{formatTaskDueWindow(lang, task.dueTime, task.windowEndTime)}</MetadataText>
                    {task.category ? <MetadataText>{task.category}</MetadataText> : null}
                  </div>
                }
                status={
                  <>
                    <StatusBadge tone={stateTone(task.state)} showIcon={task.state === 'overdue' || task.state === 'completed'}>
                      {stateLabel(t, task.state)}
                    </StatusBadge>
                    {task.isOverdueCritical ? (
                      <StatusBadge tone="critical">{t('taskCriticalMissedBadge')}</StatusBadge>
                    ) : null}
                    {task.openExceptionCount > 0 ? (
                      <StatusBadge tone="warning">
                        {task.openExceptionCount} {t('taskOpenExceptions')}
                      </StatusBadge>
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {selectedTask ? (
        <TaskDetailModal
          open
          onClose={() => setSelectedScheduleId(null)}
          task={selectedTask}
          items={selectedTaskItems}
          responses={selectedTaskResponses}
          lang={lang}
          onChange={refresh}
        />
      ) : null}
    </>
  );
}
