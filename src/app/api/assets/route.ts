import { NextRequest, NextResponse } from 'next/server';
import { getAssets, createAsset } from '@/lib/store';
import { validateSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { canUserEdit, isEntityInUserScope } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized: active login session required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId') || undefined;
  const locationId = searchParams.get('locationId') || undefined;
  const plantId = searchParams.get('plantId') || undefined;
  const departmentId = searchParams.get('departmentId') || undefined;
  const search = searchParams.get('search') || undefined;
  const includeDeleted = searchParams.get('includeDeleted') === 'true';

  let assets = await getAssets({
    categoryId,
    locationId,
    plantId,
    departmentId,
    search,
    includeDeleted,
  });

  // Apply user scoping if authenticated as non-IT admin
  if (validation.valid && validation.user && validation.user.role !== 'it_admin') {
    assets = assets.filter((a) =>
      isEntityInUserScope(validation.user!, validation.scope || null, {
        category_id: a.category_id,
        location_id: a.current_location_id,
        plant_id: a.current_plant_id,
        department_id: a.current_department_id,
      })
    );
  }

  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canUserEdit(validation.user, validation.scope)) {
    return NextResponse.json({ error: 'View-only access: modifications are not permitted for this account' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { asset, peripherals, customValues, itAssetType } = body;

    // For Facility Admin or User, enforce their assigned location, plant, and department
    if (validation.user.role !== 'it_admin') {
      if (validation.user.location_id) asset.current_location_id = validation.user.location_id;
      if (validation.user.plant_id) asset.current_plant_id = validation.user.plant_id;
      if (validation.user.department_id) asset.current_department_id = validation.user.department_id;
    }

    if (!asset.name || !asset.category_id || !asset.current_location_id || !asset.current_plant_id || !asset.current_department_id) {
      return NextResponse.json({ error: 'Missing required asset fields (name, category/department, location, plant)' }, { status: 400 });
    }

    // Check scope containment
    if (!isEntityInUserScope(validation.user, validation.scope, {
      category_id: asset.category_id,
      location_id: asset.current_location_id,
      plant_id: asset.current_plant_id,
      department_id: asset.current_department_id,
    })) {
      return NextResponse.json({ error: 'Asset placement is outside your assigned administrative scope' }, { status: 403 });
    }

    const created = await createAsset(
      {
        ...asset,
        created_by: validation.user.id,
      },
      peripherals,
      customValues,
      validation.user.id,
      itAssetType
    );

    // Audit log
    await logAuditEvent({
      event_category: 'data_change',
      user_id: validation.user.id,
      user_role: validation.user.role,
      action: 'ASSET_CREATE',
      target_table: 'assets',
      record_id: created.id,
      changes: { asset_tag: created.asset_tag, name: created.name, category_id: created.category_id },
      ip_address: req.headers.get('x-forwarded-for') || '127.0.0.1',
      user_agent: req.headers.get('user-agent') || 'Unknown',
    });

    return NextResponse.json({ success: true, asset: created });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Asset creation failed';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
