'use client';

import * as React from 'react';
import { AlertDialog } from 'radix-ui';
import { Button, type ButtonVariant } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  /** `pending` blocks Escape/backdrop dismiss and disables both buttons — same contract as the retiring design-kit ConfirmDialog. */
  pending?: boolean;
  confirmVariant?: Extract<ButtonVariant, 'primary' | 'destructive'>;
}

/**
 * Built on Radix AlertDialog, which does NOT close on outside click by
 * default (unlike Dialog) — the correct default for a destructive
 * confirmation (audit: "retain explicit safety semantics"). `pending`
 * additionally blocks Escape so an in-flight action can't be interrupted
 * mid-request.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  pending = false,
  confirmVariant = 'primary',
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[var(--oruwa-z-overlay)] bg-overlay" />
        <div className="fixed inset-0 z-[var(--oruwa-z-modal)] flex items-center justify-center p-4">
          <AlertDialog.Content
            onEscapeKeyDown={(event) => {
              if (pending) event.preventDefault();
            }}
            className="w-full max-w-[440px] rounded-md bg-surface p-5 shadow-overlay outline-none"
          >
            <AlertDialog.Title className="text-lg font-bold text-text-primary">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-base text-text-muted">
              {description}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" size="md" disabled={pending}>
                  {cancelLabel}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={confirmVariant}
                  size="md"
                  loading={pending}
                  onClick={(event) => {
                    // AlertDialog.Action closes on click by default; keep the
                    // dialog open while `pending` is driven externally by the
                    // caller (it flips `open` off once the action settles).
                    event.preventDefault();
                    void onConfirm();
                  }}
                >
                  {confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
