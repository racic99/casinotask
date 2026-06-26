import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Supabase origin (https) and its realtime endpoint (wss) must be allowed in
// connect-src. Derived from the public URL so CSP stays correct per environment.
function supabaseConnectSources(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

// Content-Security-Policy. 'unsafe-inline' is required for Next.js/Tailwind's
// injected styles; scripts also need it (and 'unsafe-eval' only in dev for HMR)
// because this app does not run a nonce-based CSP pipeline.
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self' ${[...supabaseConnectSources(), isDev ? "ws:" : ""]
    .filter(Boolean)
    .join(" ")}`.trim(),
  `upgrade-insecure-requests`,
]
  .join("; ")
  .replace(/\s+/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
