'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OperationsExpectedTask, OperationsItemResponse } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { backLink, badgeStyle, card, colors, mutedText, pageStyle } from '@/lib/ui/theme';
import type { BadgeTone } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { tOperations } from './operations-i18n';
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

function stateBadgeTone(state: OperationsExpectedTask['state']): BadgeTone {
  switch (state) {
    case 'completed':
      return 'active';
    case 'overdue':
      return 'warning';
    case 'in_progress':
      return 'neutral';
    default:
      return 'inactive';
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

      <section style={{ ...card, marginTop: embedded ? 0 : 16 }}>
        {tasks === null ? (
          <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
        ) : sortedTasks.length === 0 ? (
          <p style={{ margin: 0, ...mutedText }}>{t('staffNoTasksToday')}</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {sortedTasks.map((task) => (
              <li
                key={task.scheduleId}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedScheduleId(task.scheduleId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedScheduleId(task.scheduleId);
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
                }}
                className={hoverStyles.buttonSecondary}
              >
                <div style={{ minWidth: 180, flex: '1 1 220px' }}>
                  <strong style={{ display: 'block' }}>{task.templateName}</strong>
                  {task.category ? <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>{task.category}</div> : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={badgeStyle('neutral')}>
                    {t('taskDueAt')} {task.dueTime.slice(0, 5)}
                    {task.windowEndTime ? ` ${t('taskWindowUntil')} ${task.windowEndTime.slice(0, 5)}` : ''}
                  </span>
                  <span style={badgeStyle(stateBadgeTone(task.state))}>{stateLabel(t, task.state)}</span>
                  {task.openExceptionCount > 0 ? (
                    <span style={badgeStyle('warning')}>
                      {task.openExceptionCount} {t('taskOpenExceptions')}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
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
