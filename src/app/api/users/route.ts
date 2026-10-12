import { NextRequest, NextResponse } from 'next/server';
import { getUsersWithScopes, updateUserScope, createUser, updateUser, deleteUser, getCategories } from '@/lib/store';
import { validateSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { canAssignRole, canManageUserAccount, getAssignedOrgUnits, isPrimaryItAdmin, PRIMARY_IT_ADMIN_EMAIL } from '@/lib/permissions';
import { invalidateSessionValidationCache } from '@/lib/auth/session';
import type { User } from '@/types/database';

async function findUser(userId: string): Promise<User | null> {
  const users = await getUsersWithScopes();
  return users.find((u) => u.id === userId) || null;
}
import { logAuditEvent } from '@/lib/audit';
import { getClientIp } from '@/lib/rateLimit';
import { safeErrorMessage } from '@/lib/apiErrors';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  let users = await getUsersWithScopes();

  // If Admin, only return users within their assigned department, plant, and location
  if (validation.user.role === 'admin') {
    const self = validation.user;
    const units = getAssignedOrgUnits(self, validation.scope);
    const hasAssignment = !!(units.locationIds || units.plantIds || units.departmentIds);
    users = users.filter((u) => {
      if (u.id === self.id) return true;
      if (!hasAssignment) return false;
      const theirs = getAssignedOrgUnits(u, u.scope);
      const inside = (mine: string[] | null, their: string[] | null) =>
        !mine || (!!their && their.every((id) => mine.includes(id)));
      return (
        inside(units.locationIds, theirs.locationIds) &&
        inside(units.plantIds, theirs.plantIds) &&
        inside(units.departmentIds, theirs.departmentIds)
      );
    });
  }

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // IT Admin and Admin are allowed to register users
  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin') {
    return NextResponse.json({ error: 'Access Denied: You do not have permission to register users' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      email,
      full_name,
      phone,
      emp_code,
      role = 'user',
      location_id,
      plant_id,
      department_id,
      sub_department,
      can_edit = true,
      category_ids = null,
      location_ids = null,
      plant_ids = null,
      department_ids = null,
    } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Valid Mail ID is required' }, { status: 400 });
    }
    if (!full_name || !full_name.trim()) {
      return NextResponse.json({ error: 'User full name is required' }, { status: 400 });
    }

    if (!['it_admin', 'admin', 'user'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Allowed roles are IT ADMIN (it_admin), ADMIN (admin), or USER (user).' },
        { status: 400 }
      );
    }

    if (role === 'it_admin' && !isPrimaryItAdmin(validation.user)) {
      return NextResponse.json(
        { error: `Access Denied: only the primary IT Admin (${PRIMARY_IT_ADMIN_EMAIL}) can create IT Admin accounts` },
        { status: 403 }
      );
    }

    // Role and Scope enforcement:
    // If Admin is registering, they can ONLY create role 'user' within their own Location, Plant, Department
    let resolvedRole: 'it_admin' | 'admin' | 'user' = role as 'it_admin' | 'admin' | 'user';
    let resolvedLocId = location_id || null;
    let resolvedPltId = plant_id || null;
    let resolvedDeptId = department_id || null;
    const actorIsAdmin = validation.user.role === 'admin';
    let adminDeptIds: string[] = [];

    if (actorIsAdmin) {
      if (role !== 'user') {
        return NextResponse.json(
          { error: 'Access Denied: Admins can only register standard Users within their assigned department' },
          { status: 403 }
        );
      }
      resolvedRole = 'user';
      const units = getAssignedOrgUnits(validation.user, validation.scope);
      const withinAdmin = (requested: string | null, allowed: string[] | null) =>
        allowed ? (requested && allowed.includes(requested) ? requested : allowed[0]) : null;
      resolvedLocId = withinAdmin(resolvedLocId, units.locationIds);
      resolvedPltId = withinAdmin(resolvedPltId, units.plantIds);
      resolvedDeptId = withinAdmin(resolvedDeptId, units.departmentIds);
      adminDeptIds = Array.isArray(department_ids) && units.departmentIds
        ? department_ids.filter((id: unknown): id is string => typeof id === 'string' && units.departmentIds!.includes(id))
        : [];
      if (resolvedDeptId && !adminDeptIds.includes(resolvedDeptId)) adminDeptIds.unshift(resolvedDeptId);
      if (!resolvedLocId || !resolvedPltId || !resolvedDeptId) {
        return NextResponse.json(
          { error: 'Access Denied: users can only be registered inside your own Location, Plant and Department' },
          { status: 403 }
        );
      }
    }

    const isItAdmin = resolvedRole === 'it_admin';
    const createdUser = await createUser(
      {
        email: email.trim(),
        full_name: full_name.trim(),
        phone: phone || null,
        emp_code: emp_code ? emp_code.trim() : null,
        role: resolvedRole,
        location_id: isItAdmin ? null : resolvedLocId,
        plant_id: isItAdmin ? null : resolvedPltId,
        department_id: isItAdmin ? null : resolvedDeptId,
        sub_department: isItAdmin ? null : (sub_department && sub_department.toLowerCase() !== 'none' ? sub_department.trim().slice(0, 255) : null),
      },
      {
        can_edit: isItAdmin ? true : Boolean(can_edit),
        category_ids: isItAdmin ? null : (Array.isArray(category_ids) && category_ids.length > 0 ? category_ids : null),
        location_ids: isItAdmin ? null : (!actorIsAdmin && Array.isArray(location_ids) && location_ids.length > 0 ? location_ids : (resolvedLocId ? [resolvedLocId] : null)),
        plant_ids: isItAdmin ? null : (!actorIsAdmin && Array.isArray(plant_ids) && plant_ids.length > 0 ? plant_ids : (resolvedPltId ? [resolvedPltId] : null)),
        department_ids: isItAdmin ? null : actorIsAdmin ? adminDeptIds : (Array.isArray(department_ids) && department_ids.length > 0 ? department_ids : (resolvedDeptId ? [resolvedDeptId] : null)),
        sub_department: isItAdmin ? null : (sub_department && sub_department.toLowerCase() !== 'none' ? sub_department.trim().slice(0, 255) : null),
      }
    );

    await logAuditEvent({
      event_category: 'data_change',
      user_id: validation.user.id,
      user_role: validation.user.role,
      action: 'USER_REGISTERED',
      target_table: 'users',
      record_id: createdUser.id,
      changes: {
        email: createdUser.email,
        full_name: createdUser.full_name,
        emp_code: createdUser.emp_code,
        role: createdUser.role,
        location_id,
        plant_id,
        department_id,
        sub_department,
      },
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || 'Unknown',
    });

    return NextResponse.json({ success: true, user: createdUser });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Failed to register user');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // IT Admin and Admin are allowed to modify users
  if (validation.user.role !== 'it_admin' && validation.user.role !== 'admin') {
    return NextResponse.json({ error: 'Access Denied: You do not have permission to modify user accounts' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      userId,
      full_name,
      email,
      phone,
      emp_code,
      targetRole,
      can_edit,
      category_ids,
      location_ids,
      plant_ids,
      department_ids,
      location_id,
      plant_id,
      department_id,
      sub_department,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const target = await findUser(userId);
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const access = canManageUserAccount(validation.user, target, 'edit');
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 });
    }

    const roleChanging = targetRole !== undefined && targetRole !== target.role;
    if (isPrimaryItAdmin(target)) {
      if (roleChanging) {
        return NextResponse.json({ error: 'The primary IT Admin role cannot be changed.' }, { status: 403 });
      }
      if (email !== undefined && email.toLowerCase().trim() !== PRIMARY_IT_ADMIN_EMAIL) {
        return NextResponse.json({ error: 'The primary IT Admin email cannot be changed.' }, { status: 403 });
      }
    }

    // Role assignment verification
    if (roleChanging) {
      const isAllowed = canAssignRole(validation.user, validation.scope, targetRole);
      if (!isAllowed) {
        return NextResponse.json({ error: 'Access Denied: You are not authorized to assign this role' }, { status: 403 });
      }
    }

    // An Admin can only keep the user inside the Admin's own Location / Plant / Department.
    const actorIsAdmin = validation.user.role === 'admin';
    let adminDeptIds: string[] | null = null;
    if (actorIsAdmin) {
      const units = getAssignedOrgUnits(validation.user, validation.scope);
      const withinAdmin = (requested: string | null | undefined, fallback: string | null | undefined, allowed: string[] | null) => {
        if (!allowed) return fallback || null;
        if (requested && allowed.includes(requested)) return requested;
        if (fallback && allowed.includes(fallback)) return fallback;
        return allowed[0];
      };
      body.location_id = withinAdmin(location_id, target.location_id, units.locationIds);
      body.plant_id = withinAdmin(plant_id, target.plant_id, units.plantIds);
      body.department_id = withinAdmin(department_id, target.department_id, units.departmentIds);
      if (units.departmentIds) {
        adminDeptIds = Array.isArray(department_ids)
          ? department_ids.filter((id: unknown): id is string => typeof id === 'string' && units.departmentIds!.includes(id))
          : [];
        if (body.department_id && !adminDeptIds.includes(body.department_id)) adminDeptIds.unshift(body.department_id);
      }
    }
    const effLocationId = actorIsAdmin ? body.location_id : location_id;
    const effPlantId = actorIsAdmin ? body.plant_id : plant_id;
    const effDepartmentId = actorIsAdmin ? body.department_id : department_id;
    const effLocationIds = actorIsAdmin ? null : location_ids;
    const effPlantIds = actorIsAdmin ? null : plant_ids;
    const effDepartmentIds = actorIsAdmin ? adminDeptIds : department_ids;

    // User profile updates
    const isItAdmin = (targetRole ?? target.role) === 'it_admin';
    const userUpdates: Record<string, unknown> = {};
    if (full_name !== undefined) userUpdates.full_name = full_name.trim();
    if (email !== undefined) userUpdates.email = email.toLowerCase().trim();
    if (phone !== undefined) userUpdates.phone = phone || null;
    if (emp_code !== undefined) userUpdates.emp_code = emp_code ? emp_code.trim() : null;
    if (targetRole !== undefined) userUpdates.role = targetRole;
    if (isItAdmin) {
      userUpdates.location_id = null;
      userUpdates.plant_id = null;
      userUpdates.department_id = null;
      userUpdates.sub_department = null;
    } else {
      if (effLocationId !== undefined) userUpdates.location_id = effLocationId || null;
      if (effPlantId !== undefined) userUpdates.plant_id = effPlantId || null;
      if (effDepartmentId !== undefined) userUpdates.department_id = effDepartmentId || null;
      if (sub_department !== undefined) {
        userUpdates.sub_department = sub_department && sub_department.toLowerCase() !== 'none' ? sub_department.trim().slice(0, 255) : null;
      }
    }

    if (Object.keys(userUpdates).length > 0) {
      await updateUser(userId, userUpdates);
    }

    // User scopes updates
    const resolvedLocationIds = isItAdmin ? null : (effLocationIds && effLocationIds.length > 0 ? effLocationIds : (effLocationId ? [effLocationId] : null));
    const resolvedPlantIds = isItAdmin ? null : (effPlantIds && effPlantIds.length > 0 ? effPlantIds : (effPlantId ? [effPlantId] : null));
    const resolvedDeptIds = isItAdmin ? null : (effDepartmentIds && effDepartmentIds.length > 0 ? effDepartmentIds : (effDepartmentId ? [effDepartmentId] : null));

    await updateUserScope(userId, {
      can_edit: isItAdmin ? true : Boolean(can_edit ?? true),
      category_ids: isItAdmin ? null : (category_ids && category_ids.length > 0 ? category_ids : null),
      location_ids: resolvedLocationIds,
      plant_ids: resolvedPlantIds,
      department_ids: resolvedDeptIds,
      sub_department: isItAdmin ? null : (sub_department && sub_department.toLowerCase() !== 'none' ? sub_department.trim().slice(0, 255) : null),
    });
    invalidateSessionValidationCache();

    await logAuditEvent({
      event_category: 'data_change',
      user_id: validation.user.id,
      user_role: validation.user.role,
      action: 'USER_UPDATED',
      target_table: 'users',
      record_id: userId,
      changes: { userUpdates, can_edit, category_ids, resolvedLocationIds, resolvedPlantIds, resolvedDeptIds },
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || 'Unknown',
    });

    return NextResponse.json({ success: true, message: 'User updated successfully' });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Failed to update user');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const validation = await validateSessionToken(token);

  if (!validation.valid || !validation.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Strictly IT Admin
  if (validation.user.role !== 'it_admin') {
    return NextResponse.json({ error: 'Access Denied: Only IT Administrators can delete users' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || searchParams.get('id');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  // Prevent self-deletion
  if (userId === validation.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own administrative account' }, { status: 400 });
  }

  try {
    const target = await findUser(userId);
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const access = canManageUserAccount(validation.user, target, 'delete');
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 });
    }

    const success = await deleteUser(userId);
    if (!success) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    invalidateSessionValidationCache();

    await logAuditEvent({
      event_category: 'data_change',
      user_id: validation.user.id,
      user_role: validation.user.role,
      action: 'USER_DELETED',
      target_table: 'users',
      record_id: userId,
      changes: { deleted_user_id: userId },
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || 'Unknown',
    });

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (err: unknown) {
    const errorMsg = safeErrorMessage(err, 'Failed to delete user');
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
