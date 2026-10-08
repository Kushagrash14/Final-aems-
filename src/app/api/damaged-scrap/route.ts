import { NextRequest, NextResponse } from 'next/server';
import {
  getDamageScrapReports,
  createDamageScrapReport,
  updateDamageScrapReport,
  reviewDamageScrapReport,
  resolveDamageMissingReport,
  getAssetById,
} from '@/lib/store';
import { validateSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { canReviewDamageScrap, canUserEdit, isEntityInUserScope } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import type { Asset, User, UserScope } from '@/types/database';
import { getClientIp } from '@/lib/rateLimit';
import { safeErrorMessage } from '@/lib/apiErrors';

const OUT_OF_SCOPE_MESSAGE = 'Permission denied: this asset belongs to another location, plant or department.';

function assetInScope(user: User, scope: UserScope | null | undefined, asset: Asset | null | undefined): boolean {
  if (user.role === 'it_admin') return true;
  if (!asset) return false;
  return isEntityInUserScope(user, scope, {
    category_id: asset.category_id,
    location_id: asset.current_location_id,
    plant_id: asset.current_plant_id,
    department_id: asset.current_department_id,
  });
}

async function findReportAsset(reportId: string): Promise<{ found: boolean; asset: Asset | null }> {
  const report = (await getDamageScrapReports()).find((r) => r.id === reportId);
  if (!report) return { found: false, asset: null };
  return { found: true, asset: report.asset || (await getAssetById(report.asset_id)) };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized: active login session required' }, { status: 401 });
  }

  let reports = await getDamageScrapReports();

  // Apply facility & department scoping for Admin and Users
  if (validation.user.role !== 'it_admin') {
    reports = reports.filter((r) => assetInScope(validation.user!, validation.scope, r.asset));
  }

  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const assetId = body.assetId || body.asset_id;
    const reportType = body.reportType || body.report_type;
    const reason = body.reason || body.damage_description || body.description;
    const severity = body.severity || 'minor';
    const photoPaths = body.photoPaths || body.photo_paths || [];
    const documentUrl = body.documentUrl || body.document_url || null;
    const employeeId = body.employeeId || body.employee_id || null;
    const employeeName = body.employeeName || body.employee_name || null;
    const employeeEmail = body.employeeEmail || body.employee_email || null;

    if (!assetId || !reportType || !reason) {
      return NextResponse.json({ error: 'Asset ID, report type and reason are required' }, { status: 400 });
    }

    if (!canUserEdit(validation.user, validation.scope)) {
      return NextResponse.json({ error: 'View-only access: reporting is not permitted for this account' }, { status: 403 });
    }
    const asset = await getAssetById(assetId);
    if (!asset || asset.is_deleted) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    if (!assetInScope(validation.user, validation.scope, asset)) {
      return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 });
    }

    const report = await createDamageScrapReport({
      assetId,
      reportType,
      reason,
      severity,
      photoPaths,
      documentUrl,
      employeeId,
      employeeName,
      employeeEmail: employeeEmail || null,
      reportedBy: validation.user.id,
    });

    await logAuditEvent({
      event_category: 'data_change',
      user_id: validation.user.id,
      user_role: validation.user.role,
      action: `REPORT_${reportType.toUpperCase()}`,
      target_table: 'damage_scrap_reports',
      record_id: report.id,
      changes: { assetId, reason, severity, reportType },
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || 'Unknown',
    });

    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Failed to submit report');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { reportId, reason, severity, photoPaths, documentUrl } = await req.json();

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    if (!canUserEdit(validation.user, validation.scope)) {
      return NextResponse.json({ error: 'View-only access: editing reports is not permitted' }, { status: 403 });
    }
    const target = await findReportAsset(reportId);
    if (!target.found) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    if (!assetInScope(validation.user, validation.scope, target.asset)) {
      return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 });
    }

    const updated = await updateDamageScrapReport(reportId, {
      reason,
      severity,
      photo_paths: photoPaths,
      document_url: documentUrl,
    });

    return NextResponse.json({ success: true, report: updated });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Failed to update report');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canReviewDamageScrap(validation.user, validation.scope)) {
    return NextResponse.json({ error: 'Permission denied: Admin review required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { reportId, action, resolutionAction, decision, reviewRemarks, resolutionNotes, assignedEmployeeId } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 });
    }

    const target = await findReportAsset(reportId);
    if (!target.found) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    if (!assetInScope(validation.user, validation.scope, target.asset)) {
      return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 });
    }

    if (action === 'resolve' && resolutionAction) {
      await resolveDamageMissingReport({
        reportId,
        resolutionAction,
        resolutionNotes,
        assignedEmployeeId: assignedEmployeeId || null,
        reviewerId: validation.user.id,
      });

      await logAuditEvent({
        event_category: 'data_change',
        user_id: validation.user.id,
        user_role: validation.user.role,
        action: `RESOLVE_${resolutionAction.toUpperCase()}`,
        target_table: 'damage_scrap_reports',
        record_id: reportId,
        changes: { resolutionAction, resolutionNotes },
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent') || 'Unknown',
      });

      return NextResponse.json({ success: true, message: `Incident resolved via ${resolutionAction}` });
    }

    if (!['approved', 'rejected', 'resolved'].includes(decision)) {
      return NextResponse.json({ error: 'Decision must be approved, rejected or resolved' }, { status: 400 });
    }

    await reviewDamageScrapReport({
      reportId,
      decision,
      reviewRemarks,
      reviewerId: validation.user.id,
    });

    await logAuditEvent({
      event_category: 'data_change',
      user_id: validation.user.id,
      user_role: validation.user.role,
      action: `REVIEW_${decision.toUpperCase()}_REPORT`,
      target_table: 'damage_scrap_reports',
      record_id: reportId,
      changes: { decision, reviewRemarks },
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || 'Unknown',
    });

    return NextResponse.json({ success: true, message: `Report marked as ${decision}` });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Action failed');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

