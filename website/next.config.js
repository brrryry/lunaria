/** @type {import('next').NextConfig} */

// SEC-12: Allowlist of permitted hostnames for the backend proxy destination.
// Prevents SSRF if INTERNAL_API_URL is ever set to an attacker-controlled value.
const ALLOWED_BACKEND_HOSTS = ['backend', '127.0.0.1', 'localhost'];

function resolveBackendUrl() {
  const raw =
    process.env.INTERNAL_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'http://backend:3001'
      : 'http://127.0.0.1:3001');

  const cleaned = raw.replace(/\/+$/, '').replace(/\/api$/, '');

  try {
    const parsed = new URL(cleaned);
    if (!ALLOWED_BACKEND_HOSTS.includes(parsed.hostname)) {
      console.error(
        `[SECURITY] INTERNAL_API_URL hostname "${parsed.hostname}" is not in the allowed list ` +
        `(${ALLOWED_BACKEND_HOSTS.join(', ')}). Refusing to use it and falling back to safe default.`,
      );
      return process.env.NODE_ENV === 'production'
        ? 'http://backend:3001'
        : 'http://127.0.0.1:3001';
    }
  } catch {
    console.error('[SECURITY] INTERNAL_API_URL is not a valid URL. Falling back to safe default.');
    return 'http://127.0.0.1:3001';
  }

  return cleaned;
}

const nextConfig = {
  transpilePackages: ['@lunaria/types'],

  // SEC-11: Apply security headers to all responses from the Next.js server.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent the app from being embedded in iframes (clickjacking protection)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Do not send the Referer header — prevents JWT leakage via URL parameters
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Restrict browser feature access
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  async rewrites() {
    const backendUrl = resolveBackendUrl();
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

