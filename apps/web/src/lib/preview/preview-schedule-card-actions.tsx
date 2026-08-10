'use client';

import { useState, useTransition } from 'react';
import { AutoScheduleModal } from '@/components/demo/cafe/AutoScheduleModal';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';
import { buttonPrimary, demoColors } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_AUTO_SCHEDULE } from '@/lib/demo/cafe/helpContent';
import { previewPublishSchedule, previewRunAutoDistribution } from './actions/schedule-actions';
import { previewWriteMessage } from './write-result';
import type { AutoDistributionInvalidInputReason } from './auto-distribution-requirements';
import { addIsoDays } from '@/lib/workforce/timezone';
import { deriveActiveScheduleWindowCodes, type UnplacedEmployee, type UnplacedReason } from '@/lib/workforce/auto-distribute';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

/** Short, actionable reason text for why a submitted preference did not become a draft assignment - shown (deduped) when an auto-distribution run creates zero shifts, instead of a single generic "check availability" message that discards the real reason. */
const UNPLACED_REASON_JA: Record<UnplacedReason, string> = {
  headcount_filled: '希望した時間帯の必要人数がすでに埋まっています',
  no_staffing_requirement: 'その曜日・時間帯には必要人数が設定されていません',
  max_period_hours_exceeded: 'スタッフの月間上限時間を超えるため配置できません',
  already_assigned: '同じ日にすでに別のシフトが割り当てられています',
  unknown_shift_type: '希望に存在しないシフト種別が指定されています',
  inactive_shift_type: '希望に無効化されたシフト種別が指定されています',
};

const UNPLACED_REASON_EN: Record<UnplacedReason, string> = {
  headcount_filled: 'the requested time window is already fully staffed',
  max_period_hours_exceeded: "it would exceed the staff member's monthly hour limit",
  no_staffing_requirement: 'no headcount is required for that day/window',
  already_assigned: 'the staff member is already assigned elsewhere that day',
  unknown_shift_type: 'the preference references a shift type that no longer exists',
  inactive_shift_type: 'the preference references a disabled shift type',
};

/** Message for a zero-draft auto-distribution run: reuses the algorithm's own `unplaced` reasons (deduped) when it has any, instead of always blaming "check submitted availability" - that generic text is only accurate when nobody was even blocked (e.g. every active employee is a non-submitter). */
function describeEmptyAutoScheduleResult(lang: Lang, unplaced: UnplacedEmployee[]): string {
  if (unplaced.length === 0) {
    return lang === 'ja'
      ? '条件に合うシフトを作成できませんでした。スタッフの希望提出状況をご確認ください。'
      : 'No shifts could be created for the current requirements. Please check submitted staff availability.';
  }
  const reasons = Array.from(new Set(unplaced.map((u) => u.reason)));
  const dict = lang === 'ja' ? UNPLACED_REASON_JA : UNPLACED_REASON_EN;
  const reasonText = reasons.map((reason) => dict[reason]).join(lang === 'ja' ? '、' : '; ');
  return lang === 'ja'
    ? `条件に合うシフトを作成できませんでした（${reasonText}）。`
    : `No shifts could be created (${reasonText}).`;
}

/** Message for an `invalid_input` auto-distribution result, keyed by the server's typed reason instead of collapsing every cause into "no active shift types" - `no_active_windows` and `no_positive_headcount` are distinct, actionable configuration states, and `malformed_input` falls back to the generic write-result message since it has no single actionable fix. */
function describeAutoScheduleInvalidInput(lang: Lang, reason: AutoDistributionInvalidInputReason | undefined, t: (key: Parameters<typeof tManager>[1]) => string): string {
  if (reason === 'no_positive_headcount') {
    return lang === 'ja'
      ? '曜日ごとの必要人数がすべて0のため、自動作成できません。「設定」で必要人数を入力してください。'
      : 'All configured headcounts are zero, so shifts cannot be auto-created. Enter a required headcount under Settings first.';
  }
  if (reason === 'malformed_input') return previewWriteMessage(lang, 'invalid_input');
  // 'no_active_windows' (the default/unknown-reason fallback) - the
  // pre-existing, still-accurate message for this specific cause.
  return t('autoScheduleNoWindowsConfigured');
}

/**
 * Demo/Preview manager UX parity: the demo's シフト表 card keeps its
 * auto-schedule and publish actions as header buttons. Preview uses the exact
 * same presentation dialog while keeping its real, allowlisted Server Action.
 */
export interface PreviewScheduleCardActionsProps {
  periodStart: string;
  periodEnd: string;
  requiredHeadcountByWeekday: number[];
  shiftTypes: WorkforceShiftType[];
  hasUnpublishedChanges: boolean;
  /**
   * Called after a successful auto-distribute/publish so the caller
   * (`PreviewManagerViewChrome`) can re-fetch just the currently-displayed
   * week (`previewGetScheduleWeek`) - never `router.refresh()`, which would
   * re-run the whole Manager page. Preview Manager architecture, perf
   * phase 2.
   */
  onScheduleChanged: () => Promise<void>;
}

export function PreviewScheduleCardActions({
  periodStart,
  periodEnd,
  requiredHeadcountByWeekday,
  shiftTypes,
  hasUnpublishedChanges,
  onScheduleChanged,
}: PreviewScheduleCardActionsProps) {
  const [scheduleActionsOpen, setScheduleActionsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const [publishFeedbackIsError, setPublishFeedbackIsError] = useState(true);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);

  function createSchedule() {
    setPublishFeedback(null);
    // Founder's 2026-08-05 decision: one staffing-requirement row per active
    // shift window (AM/PM/etc.), each carrying the same per-weekday
    // headcount -- never a single windowCode: 'ALL' row, and never split
    // across windows. This client-side check is only a fast pre-flight for
    // the common case -- `previewRunAutoDistribution` independently
    // re-derives the active windows and per-weekday headcount from the
    // server-resolved tenant/location's own shift types and schedule
    // settings, and never trusts this payload as authoritative (a stale
    // `shiftTypes`/`requiredHeadcountByWeekday` prop cannot widen what the
    // server actually runs).
    const activeWindowCodes = deriveActiveScheduleWindowCodes(shiftTypes);
    if (activeWindowCodes.length === 0) {
      setPublishFeedbackIsError(true);
      setPublishFeedback(t('autoScheduleNoWindowsConfigured'));
      return;
    }
    startTransition(async () => {
      const result = await previewRunAutoDistribution({
        periodStart,
        periodEnd,
        staffingRequirements: requiredHeadcountByWeekday.flatMap((requiredHeadcount, weekday) =>
          activeWindowCodes.map((windowCode) => ({
            workDate: addIsoDays(periodStart, weekday),
            windowCode,
            requiredHeadcount,
          })),
        ),
        overwriteExisting: false,
      });
      if (result.status === 'success') {
        await onScheduleChanged();
        const { draftCount, shortages, unplaced } = result.data;
        if (draftCount === 0) {
          setPublishFeedbackIsError(true);
          setPublishFeedback(describeEmptyAutoScheduleResult(lang, unplaced));
        } else if (shortages.length > 0) {
          setPublishFeedbackIsError(false);
          setPublishFeedback(
            lang === 'ja'
              ? `${draftCount}件のシフトを作成しました。${shortages.length}件の時間帯で人員が不足しています。`
              : `${draftCount} shift(s) created. ${shortages.length} time window(s) remain understaffed.`,
          );
        } else {
          // A fully successful run (every requirement filled, nothing left
          // short) previously left `publishFeedback` cleared with no
          // confirmation at all - the manager had no way to tell the run
          // succeeded versus silently doing nothing.
          setPublishFeedbackIsError(false);
          setPublishFeedback(
            lang === 'ja' ? `${draftCount}件のシフトを作成しました。` : `${draftCount} shift(s) created.`,
          );
        }
      } else if (result.status === 'invalid_input') {
        // The server distinguishes why an auto-distribution request was
        // rejected (no active windows vs. an all-zero configured headcount
        // vs. a malformed payload) via `result.reason` - route each to its
        // own accurate message instead of always blaming "no active shift
        // types configured".
        setPublishFeedbackIsError(true);
        setPublishFeedback(describeAutoScheduleInvalidInput(lang, result.reason, t));
      } else {
        setPublishFeedbackIsError(true);
        setPublishFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  function publishSchedule() {
    setPublishConfirmOpen(false);
    const formData = new FormData();
    formData.set('periodStart', periodStart);
    formData.set('periodEnd', periodEnd);
    setPublishFeedback(null);
    startTransition(async () => {
      const result = await previewPublishSchedule(formData);
      if (result.status === 'success') {
        await onScheduleChanged();
      } else {
        setPublishFeedbackIsError(true);
        setPublishFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" style={buttonPrimary} onClick={() => setScheduleActionsOpen(true)} disabled={isPending}>
        {t('autoScheduleButton')}
      </button>
      <DemoHelpButton content={HELP_MANAGER_AUTO_SCHEDULE} />
      <button
        type="button"
        style={{ ...buttonPrimary, background: hasUnpublishedChanges ? demoColors.accent : demoColors.textMuted }}
        onClick={() => setPublishConfirmOpen(true)}
        disabled={isPending || !hasUnpublishedChanges}
      >
        {t('publishScheduleButton')}
      </button>

      <AutoScheduleModal
        open={scheduleActionsOpen}
        onClose={() => setScheduleActionsOpen(false)}
        onConfirm={createSchedule}
        description={`${periodStart}〜${periodEnd} ${t('autoScheduleConfirmBody')}`}
      />
      <ConfirmDialog
        open={publishConfirmOpen}
        title={lang === 'ja' ? 'この週のシフトを公開しますか？' : 'Publish this week\'s schedule?'}
        confirmLabel={t('publishScheduleButton')}
        cancelLabel={t('cancel')}
        pending={isPending}
        onCancel={() => setPublishConfirmOpen(false)}
        onConfirm={publishSchedule}
      >
        {lang === 'ja'
          ? '下書きのシフトが確定し、スタッフ画面に表示されます。公開前に内容を確認してください。'
          : 'Draft shifts will become visible to Staff. Review the schedule before publishing.'}
      </ConfirmDialog>
      {publishFeedback ? (
        // `flexBasis: '100%'` forces this onto its own full-width row inside
        // the wrapping button row above instead of squeezing into whatever
        // partial space is left next to the last button (the layout bug the
        // founder saw: warning text visually colliding with/breaking across
        // the Auto-schedule/Publish controls at narrow widths).
        <span
          style={{
            fontSize: 12,
            color: publishFeedbackIsError ? '#B42318' : demoColors.textMuted,
            flexBasis: '100%',
            display: 'block',
            wordBreak: 'break-word',
          }}
        >
          {publishFeedback}
        </span>
      ) : null}
    </div>
  );
}
