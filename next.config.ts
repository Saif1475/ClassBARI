import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const jitsi = process.env.NEXT_PUBLIC_JITSI_DOMAIN ? ` https://${process.env.NEXT_PUBLIC_JITSI_DOMAIN}` : "";

// What pages may load and where they may be shown.
// shortcut: 'unsafe-inline' scripts stay allowed (Next.js needs them unless every page is rendered per request with a
// nonce), so this limits where scripts and frames come from but is not a full shield against an injected script.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net${dev ? " 'unsafe-eval'" : ""}`, // jsDelivr: the text reader (tesseract.js)
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:", // fonts are served from our own address (src/app/fonts.ts)
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  `connect-src 'self' data: blob: https: wss:${dev ? " ws:" : ""}`,
  `frame-src https://www.youtube-nocookie.com https://meet.jit.si${jitsi}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // nobody may show Instanton Campus inside their own page (clickjacking)
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: `camera=(self${jitsi.replace(/ (\S+)/, ' "$1"')}), microphone=(self${jitsi.replace(/ (\S+)/, ' "$1"')}), display-capture=(self${jitsi.replace(/ (\S+)/, ' "$1"')}), geolocation=(), payment=(), usb=()` },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core"], // the chat → PDF route starts a real browser; it must not be bundled
  allowedDevOrigins: ["192.168.0.225"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next", // the real-accounts check builds a separate copy (scripts/real-check.mjs)
  // Android app links (see src/app/api/assetlinks/route.ts).
  rewrites: async () => [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
