/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Recipe photos are validated to 2 MiB in the action. Leave multipart
    // overhead so oversize uploads reach our localized validation result
    // instead of crashing before the Server Action runs.
    serverActions: { bodySizeLimit: '3mb' },
  },
  // Linting runs as a dedicated repo-wide step (`pnpm lint` via ESLint flat
  // config), so skip Next's built-in build-time lint to avoid requiring the
  // legacy eslint-config-next setup.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@line-os/ui', '@line-os/workforce', '@line-os/booking', '@line-os/config'],
};

export default nextConfig;
