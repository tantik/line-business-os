'use client';

import { useEffect, useId, useState } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { buttonSecondary, card, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { ownerChecklistCopy } from './manager-dashboard-i18n';
import {
  readOwnerChecklistHidden,
  writeOwnerChecklistHidden,
  type OwnerChecklistState,
  type OwnerChecklistStepId,
} from './owner-checklist';

export interface OwnerChecklistCardProps {
  tenantId: string;
  state: OwnerChecklistState;
  /** Opens the existing place for each step (staff popup / schedule) -- the dashboard's own handlers. */
  onAction: (step: OwnerChecklistStepId) => void;
  /** Called right after 「閉じる」 hid the card, so the dashboard can move keyboard focus somewhere sensible (the focused button is gone). */
  onClosed?: () => void;
  lang: Lang;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 4B-4b 「はじめにやること」: rendered by the dashboard only for a caller with
 * core.role.manage (Owner/Admin). Not rendered when every REQUIRED step is
 * done (the optional 店長 step is shown but never counted), or
 * after 「閉じる」 in this browser (see owner-checklist.ts for the rules).
 * The hidden flag lives in localStorage, so the first server render cannot
 * know it: the card renders nothing until mounted, which avoids flashing a
 * card the Owner already closed (it appears right after hydration instead).
 */
export function OwnerChecklistCard({ tenantId, state, onAction, onClosed, lang }: OwnerChecklistCardProps) {
  const copy = ownerChecklistCopy[lang];
  const headingId = useId();
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    setHidden(readOwnerChecklistHidden(browserStorage(), tenantId));
  }, [tenantId]);

  if (hidden !== false || state.allDone) return null;

  const percent = state.total === 0 ? 0 : Math.round((state.doneCount / state.total) * 100);
  const progressText = copy.progress(state.doneCount, state.total);

  return (
    <section aria-labelledby={headingId} style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 id={headingId} style={{ margin: 0, fontSize: 16 }}>
          {copy.heading}
        </h2>
        <button
          type="button"
          className={hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, padding: '6px 12px' }}
          aria-label={copy.closeAriaLabel}
          onClick={() => {
            writeOwnerChecklistHidden(browserStorage(), tenantId);
            setHidden(true);
            onClosed?.();
          }}
        >
          {copy.close}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <div
          role="progressbar"
          aria-labelledby={headingId}
          aria-valuemin={0}
          aria-valuemax={state.total}
          aria-valuenow={state.doneCount}
          aria-valuetext={progressText}
          style={{ flex: '1 1 auto', minWidth: 0, height: 8, borderRadius: 999, background: colors.surfaceElevated, overflow: 'hidden' }}
        >
          <div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: colors.accent }} />
        </div>
        <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', ...mutedText }}>
          {progressText}
        </span>
      </div>

      <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {state.steps.map((step) => {
          const stepCopy = copy.steps[step.id];
          return (
            <li
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                padding: '8px 10px',
                borderRadius: 8,
                background: colors.surfaceElevated,
                minWidth: 0,
              }}
            >
              <span
                role="img"
                aria-label={step.done ? copy.statusDone : copy.statusTodo}
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1,
                  // Shape differs too (filled tick vs empty ring), never colour alone.
                  background: step.done ? colors.accent : colors.surface,
                  color: '#fff',
                  border: step.done ? `2px solid ${colors.accent}` : `2px solid ${colors.textMuted}`,
                }}
              >
                {step.done ? '✓' : ''}
              </span>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: step.done ? colors.textMuted : colors.textPrimary, overflowWrap: 'anywhere' }}>
                  {stepCopy.title}
                  {step.optional ? <span style={{ fontWeight: 400, ...mutedText }}>{copy.optionalTag}</span> : null}
                </div>
                {step.done ? null : (
                  <div style={{ fontSize: 12, marginTop: 2, overflowWrap: 'anywhere', ...mutedText }}>{stepCopy.hint}</div>
                )}
              </div>
              {step.done ? null : (
                <button
                  type="button"
                  className={hoverStyles.buttonSecondary}
                  style={{ ...buttonSecondary, marginLeft: 'auto' }}
                  onClick={() => onAction(step.id)}
                >
                  {stepCopy.action}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
