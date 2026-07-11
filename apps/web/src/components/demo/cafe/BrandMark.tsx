import { useBrand } from '@/lib/demo/brand';

interface BrandMarkProps {
  size?: number;
}

/**
 * Small circular wordmark used in the header of all demo screens across both
 * the generic and client-branded (`/mame-to-cha*`) route trees. Text-only
 * placeholder built from CSS — no logo image asset exists or is used. Reads
 * colors/initial from the active `BrandProvider`.
 */
export function BrandMark({ size = 44 }: BrandMarkProps) {
  const brand = useBrand();
  const initial = brand.name.charAt(0).toUpperCase();

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${brand.accent}, ${brand.accentStrong})`,
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
