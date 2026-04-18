/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep msedge-tts external from the server bundle — webpack's bundling
  // breaks its internal WebSocket handshake. pdfjs-dist also ships as ESM
  // with worker assets we don't want bundled server-side.
  serverExternalPackages: ["msedge-tts"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
