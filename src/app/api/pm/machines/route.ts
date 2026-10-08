import { NextRequest, NextResponse } from 'next/server';
import { getPMMachines } from '@/lib/store';
import { validateSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isEntityInUserScope } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user, scope } = validation;
  const machines = (await getPMMachines()).filter((m) => isEntityInUserScope(user, scope, m));
  return NextResponse.json({ machines });
}
