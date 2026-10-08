// =============================================================================
// AEMS v2 — Global request guard (Next.js 16 proxy).
// Defence-in-depth in front of every API route: per-IP rate limiting, body size
// cap, cross-origin write blocking and a deny-by-default session cookie gate.
// Each route still performs its own full session + role validation.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { hitRateLimit, getClientIp } from '@/lib/rateLimit';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-constants';

const MINUTE = 60_000;
const API_LIMIT_PER_MINUTE = 300;
const PUBLIC_API_LIMIT_PER_MINUTE = 40;
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Endpoints reachable without a session (each enforces its own token / OTP checks). */
const PUBLIC_API: { prefix: string; methods?: string[] }[] = [
  { prefix: '/api/auth/send-otp', methods: ['POST'] },
  { prefix: '/api/auth/verify-otp', methods: ['POST'] },
  { prefix: '/api/auth/logout', methods: ['POST'] },
  { prefix: '/api/auth/me', methods: ['GET'] },
  { prefix: '/api/auth/heartbeat', methods: ['POST'] },
  { prefix: '/api/public/asset-approval/', methods: ['GET', 'POST'] },
  { prefix: '/api/qr/asset/', methods: ['GET'] },
  { prefix: '/api/pm/token/', methods: ['GET'] },
  { prefix: '/api/pm/complaint', methods: ['POST'] },
];

function isPublicApi(pathname: string, method: string): boolean {
  return PUBLIC_API.some(
    (entry) =>
      (pathname === entry.prefix || pathname.startsWith(entry.prefix)) &&
      (!entry.methods || entry.methods.includes(method))
  );
}

function deny(status: number, error: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') return deny(405, 'Method not allowed');

  const ip = getClientIp(req);
  const publicRoute = isPublicApi(pathname, method);

  const limit = hitRateLimit(
    `${publicRoute ? 'api-public' : 'api'}:${ip}`,
    publicRoute ? PUBLIC_API_LIMIT_PER_MINUTE : API_LIMIT_PER_MINUTE,
    MINUTE
  );
  if (!limit.allowed) {
    return deny(429, 'Too many requests. Please slow down and try again shortly.', {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return deny(413, 'Request body too large');

  if (STATE_CHANGING.has(method) && !isSameOrigin(req)) {
    return deny(403, 'Cross-origin request blocked');
  }

  if (!publicRoute && !req.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return deny(401, 'Unauthorized');
  }

  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
