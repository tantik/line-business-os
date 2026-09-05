'use client';

import type { OperationsExpectedTask } from '@/lib/operations/tasks';
import type { BadgeTone } from '@/lib/ui/theme';
import { badgeStyle, card, colors, mutedText } from '@/lib/ui/theme';
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
  /** Already filtered to today's business date at the Manager's own location -- see `page.tsx`. */
  tasks: OperationsExpectedTask[] | null;
}

/**
 * Manager's read-only overview of today's expected Operations tasks at their
 * own location -- state (not_started/in_progress/overdue/completed) and open
 * exception count per task. The Manager never executes tasks here (that
 * remains Staff-only, `staff-operations-client.tsx`); no click-through, no
 * checklist modal.
 */
export function TodayTasksSection({ t, tasks }: TodayTasksSectionProps) {
  const sortedTasks = [...(tasks ?? [])].sort(
    (a, b) => statePriority(a.state) - statePriority(b.state) || a.dueTime.localeCompare(b.dueTime) || a.scheduleId.localeCompare(b.scheduleId),
  );

  return (
    <section style={{ ...card, marginTop: 16 }}>
      {tasks === null ? (
        <p style={{ margin: 0, ...mutedText }}>{t('unavailable')}</p>
      ) : sortedTasks.length === 0 ? (
        <p style={{ margin: 0, ...mutedText }}>{t('todayNoTasksToday')}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {sortedTasks.map((task) => (
            <li
              key={task.scheduleId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 8,
                background: colors.surfaceElevated,
                flexWrap: 'wrap',
              }}
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
  );
}
