// =============================================================================
// AEMS v2 — Role & Scoped Access Control Subsystem
// Enforces industrial role hierarchies (IT Admin, Admin, User) and
// strict Location -> Plant -> Department scoping.
// =============================================================================

import { User, UserScope, UserRole } from '@/types/database';

export interface ScopeCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if the user is authorized to perform edit/mutation operations
 * - IT Admin, Admin, and User can edit/manage records within their assigned department
 */
export function canUserEdit(user: User, scope?: UserScope | null): boolean {
  if (user.role === 'it_admin') return true;
  if (!user.is_active) return false;
  return scope ? scope.can_edit : true;
}

/** ADMIN and USER accounts are confined to their assigned Location / Plant / Department. */
export function isScopedRole(user: Pick<User, 'role'> | null | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'user';
}

/**
 * The Location / Plant / Department ids an account is assigned to (null = not restricted at that level).
 * The direct assignment on the user wins; otherwise the scope lists are used.
 */
export function getAssignedOrgUnits(
  user: Pick<User, 'location_id' | 'plant_id' | 'department_id'>,
  scope: UserScope | null | undefined
): { locationIds: string[] | null; plantIds: string[] | null; departmentIds: string[] | null } {
  const pick = (own: string | null | undefined, list: string[] | null | undefined) =>
    own ? [own] : list && list.length > 0 ? list : null;
  return {
    locationIds: pick(user.location_id, scope?.location_ids),
    plantIds: pick(user.plant_id, scope?.plant_ids),
    departmentIds: pick(user.department_id, scope?.department_ids),
  };
}

/**
 * Keeps only the org units (locations, plants or departments) an ADMIN / USER account may see.
 * A level without its own assignment is narrowed by the parent level; an account with nothing
 * assigned sees nothing.
 */
export function filterOrgUnitsForUser<T extends { id: string; location_id?: string | null; plant_id?: string | null }>(
  user: User,
  scope: UserScope | null | undefined,
  level: 'location' | 'plant' | 'department',
  items: T[]
): T[] {
  if (!isScopedRole(user)) return items;
  const units = getAssignedOrgUnits(user, scope);
  if (!units.locationIds && !units.plantIds && !units.departmentIds) return [];
  const own = level === 'location' ? units.locationIds : level === 'plant' ? units.plantIds : units.departmentIds;
  if (own) return items.filter((item) => own.includes(item.id));
  if (level === 'plant' && units.locationIds) {
    return items.filter((item) => item.location_id && units.locationIds!.includes(item.location_id));
  }
  if (level === 'department' && units.plantIds) {
    return items.filter((item) => !item.plant_id || units.plantIds!.includes(item.plant_id));
  }
  return items;
}

/**
 * Check if an asset or record falls within a user's assigned scope
 * - IT Admin: Global enterprise visibility (all locations, plants, departments)
 * - Admin & User: Strictly confined to their assigned Location, Plant, and Department
 */
export function isEntityInUserScope(
  user: User,
  scope: UserScope | null | undefined,
  entity: {
    category_id?: string | null;
    location_id?: string | null;
    plant_id?: string | null;
    department_id?: string | null;
    current_location_id?: string | null;
    current_plant_id?: string | null;
    current_department_id?: string | null;
  }
): boolean {
  // IT Admin has global visibility across all locations, plants, and departments
  if (user.role === 'it_admin') return true;

  const locId = entity.current_location_id || entity.location_id;
  const pltId = entity.current_plant_id || entity.plant_id;
  const deptId = entity.current_department_id || entity.department_id;
  const catId = entity.category_id;

  // ADMIN / USER only see records placed inside their own assigned units: a record with a
  // missing unit, or an account with nothing assigned, is outside scope.
  if (isScopedRole(user)) {
    const units = getAssignedOrgUnits(user, scope);
    if (!units.locationIds && !units.plantIds && !units.departmentIds) return false;
    if (units.locationIds && (!locId || !units.locationIds.includes(locId))) return false;
    if (units.plantIds && (!pltId || !units.plantIds.includes(pltId))) return false;
    if (units.departmentIds && (!deptId || !units.departmentIds.includes(deptId))) return false;
  }

  // Check direct user location_id, plant_id, department_id
  if (user.location_id && locId && user.location_id !== locId) {
    return false;
  }
  if (user.plant_id && pltId && user.plant_id !== pltId) {
    return false;
  }
  if (user.department_id && deptId && user.department_id !== deptId) {
    return false;
  }

  // Check UserScope arrays if assigned
  if (scope) {
    if (scope.location_ids && scope.location_ids.length > 0 && locId) {
      if (!scope.location_ids.includes(locId)) return false;
    }
    if (scope.plant_ids && scope.plant_ids.length > 0 && pltId) {
      if (!scope.plant_ids.includes(pltId)) return false;
    }
    if (scope.department_ids && scope.department_ids.length > 0 && deptId) {
      if (!scope.department_ids.includes(deptId)) return false;
    }
    if (scope.category_ids && scope.category_ids.length > 0 && catId) {
      if (!scope.category_ids.includes(catId)) return false;
    }
  }

  return true;
}

/**
 * Check if a user is allowed to perform soft-delete on an asset or entry
 * Rule: IT Admin and Admin only. Users CANNOT delete entries.
 */
export function canDeleteAsset(user: User, scope?: UserScope | null): boolean {
  if (user.role === 'it_admin') return true;
  if (user.role === 'admin' && canUserEdit(user, scope)) return true;
  return false;
}

/**
 * Check if a user is allowed to create other users
 * Rule: IT Admin (can create all roles) and Admin (can create 'user' role for their department only).
 * Standard Users CANNOT create users.
 */
export function canCreateUsers(user: User): boolean {
  return user.role === 'it_admin' || user.role === 'admin';
}

/**
 * Check if a user is allowed to run Bulk Excel Import
 * Rule: Strictly IT Admin. Admins and Users cannot see or run Bulk Import.
 */
export function canPerformBulkImport(user: User): boolean {
  return user.role === 'it_admin';
}

/**
 * Check if a user can access the Settings area
 * Rule: IT Admin (all tabs) and Admin (User Management tab only).
 * Standard Users CANNOT access Settings.
 */
export function canAccessSettings(user: User): boolean {
  return user.role === 'it_admin' || user.role === 'admin';
}

/**
 * Check if a user can access advanced configuration settings tabs (Master setup, Entry forms, Security Audit)
 * Rule: Strictly IT Admin.
 */
export function canAccessAdvancedSettings(user: User): boolean {
  return user.role === 'it_admin';
}

/**
 * Check if a user can approve/reject Damaged or Scrap reports
 * Rule: Admin or IT Admin with can_edit = true.
 */
export function canReviewDamageScrap(user: User, scope?: UserScope | null): boolean {
  if (user.role === 'it_admin') return true;
  if (user.role === 'admin' && canUserEdit(user, scope)) return true;
  return false;
}

/**
 * The primary IT Admin account. It can never be deleted, demoted or edited by anyone
 * else, and it is the only account allowed to grant or revoke IT Admin access.
 */
export const PRIMARY_IT_ADMIN_EMAIL = 'software.2040@pgel.in';

export function isPrimaryItAdmin(user: Pick<User, 'email'> | null | undefined): boolean {
  return (user?.email || '').trim().toLowerCase() === PRIMARY_IT_ADMIN_EMAIL;
}

/**
 * Check if an actor can assign a particular role to a new/existing user
 * - Primary IT Admin: any role
 * - Other IT Admins: any role except IT Admin
 * - Admin: User role ('user') only
 */
export function canAssignRole(
  actor: User,
  actorScope: UserScope | null | undefined,
  targetRole: UserRole
): boolean {
  if (actor.role === 'it_admin') return targetRole !== 'it_admin' || isPrimaryItAdmin(actor);
  if (actor.role !== 'admin') return false;

  // Admin can ONLY assign standard User role
  return targetRole === 'user';
}

/** Admin may only manage standard users that sit inside the Admin's own Location / Plant / Department. */
export function isUserWithinAdminScope(actor: User, target: Pick<User, 'role' | 'location_id' | 'plant_id' | 'department_id'>): boolean {
  if (target.role !== 'user') return false;
  if (actor.location_id && target.location_id !== actor.location_id) return false;
  if (actor.plant_id && target.plant_id !== actor.plant_id) return false;
  if (actor.department_id && target.department_id !== actor.department_id) return false;
  return true;
}

/**
 * Who may edit or delete a given user account.
 * - Primary IT Admin account: only itself may edit it; nobody may delete it.
 * - Other IT Admin accounts: only the Primary IT Admin.
 * - Admin / User accounts: any IT Admin; an Admin only for 'user' accounts in its own scope.
 */
export function canManageUserAccount(actor: User, target: User, action: 'edit' | 'delete'): { allowed: boolean; reason?: string } {
  if (isPrimaryItAdmin(target)) {
    if (action === 'delete') return { allowed: false, reason: 'The primary IT Admin account cannot be deleted.' };
    if (actor.id !== target.id) return { allowed: false, reason: 'Only the primary IT Admin can modify this account.' };
    return { allowed: true };
  }
  if (target.role === 'it_admin') {
    return isPrimaryItAdmin(actor)
      ? { allowed: true }
      : { allowed: false, reason: `Only the primary IT Admin (${PRIMARY_IT_ADMIN_EMAIL}) can modify or remove IT Admin accounts.` };
  }
  if (actor.role === 'it_admin') return { allowed: true };
  if (actor.role === 'admin' && action === 'edit' && actor.id !== target.id && isUserWithinAdminScope(actor, target)) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Access Denied: you can only manage standard users within your own location, plant and department.' };
}

/**
 * Determine inactivity timeout based on role
 * Set to 24 hours (86,400 seconds) to ensure uninterrupted workspace access
 */
export function getInactivityTimeoutSeconds(role: UserRole): number {
  return 24 * 60 * 60; // 24 hours
}
