'use client';

/**
 * ORUWA Business OS platform loading indicator (Loader #12,
 * css-loaders.com/classic/). The single loading animation for every module
 * (Cafe today; Salon/Clinic/Construction/AI/Admin/Customer Portal etc. as
 * they're built) -- no module may define its own spinner/loader markup.
 *
 * Themable without a hardcoded color: the dot color reads `--brand-primary`
 * from whatever ancestor sets it (falls back to the Cafe accent tone if
 * unset, so it renders correctly with zero setup). A future module's theme
 * provider only needs to set `--brand-primary` on its root to reskin every
 * loading surface built on this component.
 */
export type BrandLoaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Pixel height of the loader's dot row at each size (natural/reference size is `md`, 50px -- the snippet's original size). Width scales with it (the animation is a fixed 6-dot-wide sequence). */
const SIZE_HEIGHT_PX: Record<BrandLoaderSize, number> = {
  xs: 18,
  sm: 28,
  md: 50,
  lg: 72,
  xl: 96,
};

export function BrandLoader({ size = 'md', label = 'Loading' }: { size?: BrandLoaderSize; label?: string }) {
  const scale = SIZE_HEIGHT_PX[size] / SIZE_HEIGHT_PX.md;
  return (
    <div
      className="brand-loader"
      role="status"
      aria-label={label}
      style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
    >
      <style>{`
        .brand-loader {
          width: calc(6*30px);
          height: 50px;
          display: flex;
          color: var(--brand-primary, #8d7958);
          filter: drop-shadow(30px 25px 0 currentColor)
                  drop-shadow(60px 0 0 currentColor)
                  drop-shadow(120px 0 0 currentColor);
          clip-path: inset(0 100% 0 0);
          animation: brand-loader-12 2s infinite steps(7);
        }
        .brand-loader:before {
          content: "";
          width: 30px;
          height: 25px;
          --c: no-repeat radial-gradient(farthest-side, currentColor 92%, #0000);
          background:
            var(--c) left /70% 70%,
            var(--c) right/20% 20%,
            var(--c) top 0 right 15%/20% 20%,
            var(--c) bottom 0 right 15%/20% 20%;
        }
        @keyframes brand-loader-12 {
          100% { clip-path: inset(0 -30px 0 0); }
        }
      `}</style>
    </div>
  );
}
