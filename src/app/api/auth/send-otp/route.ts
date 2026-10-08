import { NextRequest, NextResponse } from 'next/server';
import { createAndStoreOtp, getOtpRequestWaitSeconds, OTP_RESEND_COOLDOWN_SECONDS } from '@/lib/auth/otp';
import { formatRetryAfter, getClientIp, hitRateLimit } from '@/lib/rateLimit';
import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { SEED_USERS } from '@/lib/mock-data';
import { safeErrorMessage } from '@/lib/apiErrors';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid corporate email address required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim().slice(0, 254);
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'Unknown';

    const ipLimit = hitRateLimit(`otp-send-ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      await logAuditEvent({
        event_category: 'session',
        user_role: 'anonymous',
        action: 'OTP_RATE_LIMITED',
        ip_address: ip,
        user_agent: userAgent,
        changes: { email: normalizedEmail, scope: 'ip' },
      });
      return NextResponse.json(
        { error: `Too many OTP requests from this network. Please try again in ${formatRetryAfter(ipLimit.retryAfterSeconds)}.` },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
      );
    }

    // Verify that the user exists and is active in the database
    let isRegistered = false;
    let isActive = false;

    const memory = (globalThis as unknown as { __aems_memory?: { users: { email: string; is_active: boolean }[] } }).__aems_memory;
    const memoryUser = memory?.users?.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (env.isMockMode) {
      const mockUser = memoryUser || SEED_USERS.find((u) => u.email.toLowerCase() === normalizedEmail);
      if (mockUser) {
        isRegistered = true;
        isActive = Boolean(mockUser.is_active);
      }
    } else {
      const { data: dbUser, error: dbError } = await db
        .from('users')
        .select('id, email, is_active')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (dbError) {
        console.error('[AEMS Auth] User lookup failed:', dbError.message);
        return NextResponse.json({ error: 'Login service is temporarily unavailable.' }, { status: 503 });
      }
      if (dbUser) {
        isRegistered = true;
        isActive = Boolean(dbUser.is_active);
      }
    }

    // Reject unregistered or inactive accounts
    if (!isRegistered || !isActive) {
      await logAuditEvent({
        event_category: 'session',
        user_role: 'anonymous',
        action: 'LOGIN_UNAUTHORIZED_EMAIL',
        ip_address: ip,
        user_agent: userAgent,
        changes: { email: normalizedEmail, isRegistered, isActive },
      });
      return NextResponse.json(
        { error: 'Unauthorized Access. Please contact your IT Admin.' },
        { status: 403 }
      );
    }

    const waitSeconds = await getOtpRequestWaitSeconds(normalizedEmail);
    if (waitSeconds > 0) {
      await logAuditEvent({
        event_category: 'session',
        user_role: 'anonymous',
        action: 'OTP_RATE_LIMITED',
        ip_address: ip,
        user_agent: userAgent,
        changes: { email: normalizedEmail, scope: 'email', waitSeconds },
      });
      return NextResponse.json(
        {
          error:
            waitSeconds <= OTP_RESEND_COOLDOWN_SECONDS
              ? `An OTP was just sent. Please check your inbox or request a new code in ${formatRetryAfter(waitSeconds)}.`
              : `Too many OTP requests for this account. Please try again in ${formatRetryAfter(waitSeconds)}.`,
          retryAfterSeconds: waitSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      );
    }

    const result = await createAndStoreOtp(normalizedEmail);
    if (!result.success) {
      await logAuditEvent({
        event_category: 'session',
        user_role: 'anonymous',
        action: 'OTP_REQUEST_FAILED',
        ip_address: ip,
        user_agent: userAgent,
        changes: { email: normalizedEmail, error: result.message },
      });
      return NextResponse.json({ error: result.message || 'Failed to dispatch OTP' }, { status: 500 });
    }

    await logAuditEvent({
      event_category: 'session',
      user_role: 'anonymous',
      action: 'OTP_REQUESTED',
      ip_address: ip,
      user_agent: userAgent,
      changes: { email: normalizedEmail },
    });

    return NextResponse.json({
      success: true,
      message: 'OTP dispatched successfully',
    });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Internal server error');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
