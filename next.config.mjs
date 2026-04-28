/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["msedge-tts"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async rewrites() {
    return [{ source: "/read/:path*", destination: "/" }];
  },
};

export default nextConfig;
