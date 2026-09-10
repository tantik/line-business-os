'use client';

import type { OperationsExpectedTask } from '@/lib/operations/tasks';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { ListRow, MetadataText, StatusBadge } from '@line-os/ui';
import type { StatusTone } from '@line-os/ui';
import { formatTaskDueWindow } from './operations-i18n';
import type { tOperations } from './operations-i18n';

type TFn = (key: Parameters<typeof tOperations>[1]) => string;

/** Sort weight -- overdue and not-yet-started rise to the top (most actionable first), completed sinks to the bottom. Mirrors `staff-operations-client.tsx`'s `statePriority`. */
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

function stateLabel(t: TFn, state: OperationsExpectedTask['state']): string {
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

export interface TodayTasksSectionProps {
  t: TFn;
  lang: Lang;
  /** Already filtered to today's business date at the Manager's own location -- see `page.tsx`. */
  tasks: OperationsExpectedTask[] | null;
}

/**
 * Manager's read-only overview of today's expected Operations tasks at their
 * own location -- state (not_started/in_progress/overdue/completed) and open
 * exception count per task. The Manager never executes tasks here (that
 * remains Staff-only, `staff-operations-client.tsx`); no click-through, no
 * checklist modal. `ListRow` (Design System v1) replaces the hand-built
 * `<li>` — same data, Status/Metadata/Action model applied (state is the
 * only real status badge; due time/category are plain `MetadataText`).
 */
export function TodayTasksSection({ t, lang, tasks }: TodayTasksSectionProps) {
  const sortedTasks = [...(tasks ?? [])].sort(
    (a, b) => statePriority(a.state) - statePriority(b.state) || a.dueTime.localeCompare(b.dueTime) || a.scheduleId.localeCompare(b.scheduleId),
  );

  return (
    <section className="mt-4 rounded-md border border-border bg-surface p-3 shadow-card">
      {tasks === null ? (
        <p className="m-0 p-2 text-sm text-text-muted">{t('unavailable')}</p>
      ) : sortedTasks.length === 0 ? (
        <p className="m-0 p-2 text-sm text-text-muted">{t('todayNoTasksToday')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {sortedTasks.map((task) => (
            <ListRow
              key={task.scheduleId}
              title={task.templateName}
              muted={task.state === 'completed'}
              subtitle={
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <MetadataText>
                    {formatTaskDueWindow(lang, task.dueTime, task.windowEndTime)}
                  </MetadataText>
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
  );
}
