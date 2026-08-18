import type { ReactNode } from 'react';
import { colors, mutedText } from '@/lib/ui/theme';

interface EmptyStateProps {
  /** Short glyph/emoji or small icon element shown above the text. Optional. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** e.g. an "Add recipe" button, rendered below the text. */
  action?: ReactNode;
}

/** Shared placeholder for an empty list/section (no recipes yet, no inventory items yet, Needs-attention fully clear). */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 8,
        padding: '32px 16px',
        color: colors.textMuted,
      }}
    >
      {icon ? <div style={{ fontSize: 32, lineHeight: 1 }}>{icon}</div> : null}
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>{title}</p>
      {description ? <p style={{ ...mutedText, margin: 0, fontSize: 13.5, maxWidth: 360 }}>{description}</p> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}
