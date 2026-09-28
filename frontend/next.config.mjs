/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: plain HTML/CSS files in out/. No server compilation at
  // view time, so refresh can NEVER break styling. Serve with any static server.
  output: "export",
  // Lint is run separately during development; skipping it here keeps
  // production builds fast on the 4 GB demo machine.
  eslint: { ignoreDuringBuilds: true },
  // Faster dev compiles (smaller refresh-compile window) + smaller bundles.
  experimental: {
    optimizePackageImports: ["lucide-react", "@paper-design/shaders-react"],
  },
};
export default nextConfig;
