// =============================================================================
// AEMS v2 — Small in-process sliding-window rate limiter + trusted client IP helper.
// Per server process only; durable limits (e.g. OTP per email) are enforced from the DB.
// =============================================================================

import type { NextRequest } from 'next/server';

type Buckets = Map<string, number[]>;

const store: Buckets = ((globalThis as unknown as { __aems_rate_limits?: Buckets }).__aems_rate_limits ??= new Map());

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Records one hit for `key` and reports whether it is within `limit` hits per `windowMs`. */
export function hitRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const recent = (store.get(key) || []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    store.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  store.set(key, recent);
  if (store.size > 10_000) {
    for (const [k, times] of store) {
      if (!times.some((t) => t > now - windowMs)) store.delete(k);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Reports whether `key` is currently over the limit without recording a hit. */
export function isRateLimited(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const recent = (store.get(key) || []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Client IP as seen by the nearest proxy. Load balancers (AWS ALB, nginx) append the real
 * client address as the LAST entry of X-Forwarded-For; earlier entries are client-controlled.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 100);
  }
  return (req.headers.get('x-real-ip') || '127.0.0.1').slice(0, 100);
}

export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
