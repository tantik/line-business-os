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
};

export default nextConfig;
