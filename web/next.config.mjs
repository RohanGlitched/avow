import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: { "/opengraph-image": ["./app/_og/**"] },
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};
export default nextConfig;
