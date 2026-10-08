import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/auth/otp';
import { createActiveSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { logAuditEvent } from '@/lib/audit';
import { SEED_USERS } from '@/lib/mock-data';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { User } from '@/types/database';
import { clearRateLimit, formatRetryAfter, getClientIp, hitRateLimit, isRateLimited } from '@/lib/rateLimit';
import { safeErrorMessage } from '@/lib/apiErrors';

const OTP_FAIL_LIMIT = 10;
const OTP_FAIL_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'Unknown';

    if (!email || !otp || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email and OTP code are required' }, { status: 400 });
    }

    const failKey = `otp-fail-email:${email.toLowerCase().trim()}`;
    const ipLimit = hitRateLimit(`otp-verify-ip:${ip}`, 30, 15 * 60 * 1000);
    const emailLock = isRateLimited(failKey, OTP_FAIL_LIMIT, OTP_FAIL_WINDOW_MS);
    if (!ipLimit.allowed || !emailLock.allowed) {
      const wait = Math.max(ipLimit.retryAfterSeconds, emailLock.retryAfterSeconds);
      await logAuditEvent({
        event_category: 'session',
        user_role: 'anonymous',
        action: 'OTP_VERIFY_RATE_LIMITED',
        ip_address: ip,
        user_agent: userAgent,
        changes: { email, scope: ipLimit.allowed ? 'email' : 'ip' },
      });
      return NextResponse.json(
        { error: `Too many incorrect attempts. Please try again in ${formatRetryAfter(wait)}.` },
        { status: 429, headers: { 'Retry-After': String(wait) } }
      );
    }

    const verification = await verifyOtp(email, otp);
    if (!verification.success) {
      hitRateLimit(failKey, OTP_FAIL_LIMIT, OTP_FAIL_WINDOW_MS);
      // Log failed attempt (will automatically calculate risk level)
      await logAuditEvent({
        event_category: 'session',
        user_role: 'anonymous',
        action: 'LOGIN_FAILED_ATTEMPT',
        ip_address: ip,
        user_agent: userAgent,
        changes: { email, reason: verification.message },
      });
      return NextResponse.json({ error: verification.message || 'Invalid or expired OTP' }, { status: 401 });
    }

    clearRateLimit(failKey);

    // Find the user record
    let user: User | null = null;
    const normalizedEmail = email.toLowerCase().trim();

    const memory = (globalThis as unknown as { __aems_memory?: { users: User[] } }).__aems_memory;
    const memoryUser = memory?.users?.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (env.isMockMode) {
      user = memoryUser || SEED_USERS.find((u) => u.email.toLowerCase() === normalizedEmail) || null;
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized Access. Please contact your IT Admin.' }, { status: 403 });
      }
    } else {
      const { data, error } = await db
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (error) {
        console.error('[AEMS Auth] User lookup failed:', error.message);
        return NextResponse.json({ error: 'Login service is temporarily unavailable.' }, { status: 503 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Unauthorized Access. Please contact your IT Admin.' }, { status: 403 });
      }
      user = data as User;
    }

    if (!user.is_active) {
      await logAuditEvent({
        event_category: 'session',
        user_id: user.id,
        user_role: user.role,
        action: 'LOGIN_BLOCKED_INACTIVE_USER',
        ip_address: ip,
        user_agent: userAgent,
      });
      return NextResponse.json({ error: 'Unauthorized Access. Please contact your IT Admin.' }, { status: 403 });
    }

    // Single active session enforcement: Terminates old sessions and issues new token
    const { rawToken, session } = await createActiveSession(user, { ip, userAgent });

    // Log successful login
    await logAuditEvent({
      event_category: 'session',
      user_id: user.id,
      user_role: user.role,
      action: 'LOGIN_SUCCESS',
      ip_address: ip,
      user_agent: userAgent,
      changes: { sessionId: session.id },
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });

    // Set session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: rawToken,
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Login verification failed');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
