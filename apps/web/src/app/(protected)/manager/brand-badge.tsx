import { colors } from '@/lib/ui/theme';

interface BrandBadgeProps {
  /** Used only for the badge's single-letter initial (e.g. tenant name). */
  label: string;
  size?: number;
}

/**
 * Canonical-theme circular initial badge for the Manager header, matching
 * the visual weight of the Mame To Cha reference's `BrandMark` without
 * depending on that demo tree's `BrandProvider` context (which the
 * canonical app never mounts). Text-only, CSS-drawn -- no logo asset.
 */
export function BrandBadge({ label, size = 40 }: BrandBadgeProps) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: colors.accent,
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        boxShadow: '0 4px 10px rgba(54, 43, 31, 0.16)',
      }}
    >
      {initial}
    </div>
  );
}
