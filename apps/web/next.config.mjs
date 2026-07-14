import { buildPreviewRewrites } from './src/lib/preview/rewrite-config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting runs as a dedicated repo-wide step (`pnpm lint` via ESLint flat
  // config), so skip Next's built-in build-time lint to avoid requiring the
  // legacy eslint-config-next setup.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@line-os/ui', '@line-os/workforce', '@line-os/booking', '@line-os/config'],
  // Preserve legacy demo URLs by redirecting into the module namespaces.
  async redirects() {
    return [
      { source: '/shifts', destination: '/workforce/shifts', permanent: false },
      { source: '/manager', destination: '/workforce/manager', permanent: false },
    ];
  },
  // Phase 1N-4C Slice B1: host-based routing for the Mame To Cha DB-backed
  // preview shell. `beforeFiles` so this overrides the physical public
  // `/mame-to-cha/*` demo pages conditionally, only on `preview.oruwa.jp` -
  // every other host keeps serving the physical pages unchanged. This is
  // intentionally NOT folded into `src/middleware.ts`, which is scoped to
  // Supabase session-cookie refresh only.
  async rewrites() {
    return { beforeFiles: buildPreviewRewrites() };
  },
};

export default nextConfig;
