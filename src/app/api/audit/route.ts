import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs, generateAuditCsv } from '@/lib/audit';
import { validateSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permission denied: Audit logs are restricted to Admins' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const event_category = searchParams.get('category') || undefined;
  const risk_level = searchParams.get('risk') || undefined;
  const locationId = searchParams.get('locationId') || undefined;
  const plantId = searchParams.get('plantId') || undefined;
  const departmentId = searchParams.get('departmentId') || undefined;
  const search = searchParams.get('search') || undefined;
  const exportCsv = searchParams.get('export') === 'csv';

  const logs = await getAuditLogs({
    event_category,
    risk_level,
    locationId,
    plantId,
    departmentId,
    search,
  });

  if (exportCsv) {
    const csvContent = generateAuditCsv(logs);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="aems_audit_logs_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  return NextResponse.json({ logs });
}

