/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
