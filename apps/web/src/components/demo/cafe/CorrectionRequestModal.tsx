'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { buttonPrimary, buttonSecondary, demoColors, input } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

export interface CorrectionRequestPayload {
  date: string;
  actualClockIn: string;
  actualClockOut: string;
  breakMinutes: number;
  message: string;
}

interface CorrectionRequestModalProps {
  open: boolean;
  onClose: () => void;
  defaultValues: CorrectionRequestPayload;
  onSubmit: (payload: CorrectionRequestPayload) => void;
}

const labelStyle = { fontSize: 13, color: demoColors.textMuted };

/** 勤務時間の修正を依頼: standalone correction-request form. Demo-only — closes and flips a local submitted flag, no backend call. */
export function CorrectionRequestModal({ open, onClose, defaultValues, onSubmit }: CorrectionRequestModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const [date, setDate] = useState(defaultValues.date);
  const [clockIn, setClockIn] = useState(defaultValues.actualClockIn);
  const [clockOut, setClockOut] = useState(defaultValues.actualClockOut);
  const [breakMinutes, setBreakMinutes] = useState(defaultValues.breakMinutes);
  const [message, setMessage] = useState(defaultValues.message);
  const [reasonError, setReasonError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(defaultValues.date);
    setClockIn(defaultValues.actualClockIn);
    setClockOut(defaultValues.actualClockOut);
    setBreakMinutes(defaultValues.breakMinutes);
    setMessage(defaultValues.message);
    setReasonError(false);
    setSubmitted(false);
  }, [open]);

  function handleSubmit() {
    if (submitted) return;
    if (message.trim().length === 0) {
      setReasonError(true);
      return;
    }
    onSubmit({ date, actualClockIn: clockIn, actualClockOut: clockOut, breakMinutes, message });
    setSubmitted(true);
  }

  return (
    <Modal open={open} onClose={onClose} title={t('correctionModalTitle')}>
      {submitted ? (
        <>
          <p style={{ fontSize: 14 }}>{t('correctionSubmittedFeedback')}</p>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" style={buttonPrimary} onClick={onClose}>
              {t('close')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('workDate')}</label>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} style={input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>{t('actualClockIn')}</label>
                <input type="time" value={clockIn} onChange={(event) => setClockIn(event.target.value)} style={input} />
              </div>
              <div>
                <label style={labelStyle}>{t('actualClockOut')}</label>
                <input type="time" value={clockOut} onChange={(event) => setClockOut(event.target.value)} style={input} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>{t('breakMinutesInput')}</label>
              <input
                type="number"
                min={0}
                step={5}
                value={breakMinutes}
                onChange={(event) => setBreakMinutes(Number(event.target.value))}
                style={input}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('reasonMessage')}</label>
              <textarea
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (reasonError) setReasonError(false);
                }}
                rows={3}
                placeholder={t('reasonPlaceholder')}
                style={{ ...input, resize: 'vertical', ...(reasonError ? { border: `1px solid ${demoColors.danger}` } : null) }}
                aria-invalid={reasonError}
              />
              {reasonError ? (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: demoColors.dangerText }}>{t('reasonRequiredError')}</p>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" style={buttonSecondary} onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="button" style={buttonPrimary} onClick={handleSubmit}>
              {t('submit')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
