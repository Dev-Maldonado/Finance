import type { NextConfig } from "next";
const development = process.env.NODE_ENV !== 'production';
const deployment = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_FINORA_DEPLOYMENT_ENV || 'development';
const connect = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'];
try {
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jqxuwhvkcdfxuxfktzmw.supabase.co');
  connect.push(project.origin, project.origin.replace(/^http/, 'ws'));
} catch { /* Invalid configuration is rejected by supabasePublicConfig. */ }
if (development) connect.push('http://localhost:*', 'ws://localhost:*', 'http://127.0.0.1:*', 'ws://127.0.0.1:*');
const csp = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  // Next's streamed bootstrap and Recharts styles require inline content. No remote script sources.
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  `connect-src ${[...new Set(connect)].join(' ')}`, "worker-src 'self' blob:",
].join('; ');
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 2 },
  env: { NEXT_PUBLIC_FINORA_DEPLOYMENT_ENV: deployment },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
