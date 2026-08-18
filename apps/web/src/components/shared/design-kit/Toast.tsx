'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { colors } from '@/lib/ui/theme';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  /** Show a toast; auto-dismisses after `durationMs` (default 4000). Returns nothing — fire-and-forget. */
  show: (message: string, options?: { tone?: ToastTone; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLE: Record<ToastTone, { background: string; color: string; border: string }> = {
  success: { background: colors.successMuted, color: colors.success, border: colors.success },
  error: { background: colors.dangerMuted, color: colors.dangerText, border: colors.danger },
  info: { background: colors.accentMuted, color: colors.accent, border: colors.accent },
};

/**
 * Auto-dismissing toast/snackbar stack. Replaces the ad hoc conditional
 * success/error `<div>` banners scattered through popup/form call sites —
 * a single provider mounted once near the root of a page/layout, then any
 * descendant calls `useToast().show(...)`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: { tone?: ToastTone; durationMs?: number }) => {
      const id = nextId.current++;
      const tone = options?.tone ?? 'info';
      const durationMs = options?.durationMs ?? 4000;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 1200,
          width: 'min(420px, calc(100vw - 32px))',
        }}
      >
        {toasts.map((toast) => {
          const tone = TONE_STYLE[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${tone.border}`,
                background: tone.background,
                color: tone.color,
                fontSize: 14,
                boxShadow: '0 8px 24px rgba(54, 43, 31, 0.16)',
              }}
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
