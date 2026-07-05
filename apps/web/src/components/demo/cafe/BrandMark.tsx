import { demoColors } from '@/lib/demo/cafe/theme';

interface BrandMarkProps {
  size?: number;
}

/** Small circular logo mark used in the header of all three demo screens. Text-only placeholder — no client logo/photo. */
export function BrandMark({ size = 44 }: BrandMarkProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${demoColors.accent}, ${demoColors.accentStrong})`,
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        boxShadow: '0 4px 10px rgba(54, 43, 31, 0.16)',
      }}
    >
      M
    </div>
  );
}
