// =============================================================================
// AEMS v2 — Enterprise Audit Logging & Security Risk Analyzer
// =============================================================================

import { AuditEventCategory, AuditLog, AuditRiskLevel, User } from '@/types/database';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { SEED_AUDIT_LOGS, SEED_USERS } from '@/lib/mock-data';

let inMemoryAuditLogs: AuditLog[] = [...SEED_AUDIT_LOGS];

export interface RecordAuditParams {
  event_category: AuditEventCategory;
  user_id?: string | null;
  user_role: string;
  action: string;
  target_table?: string;
  record_id?: string;
  changes?: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
  location_id?: string | null;
  plant_id?: string | null;
  department_id?: string | null;
  location_name?: string | null;
  plant_name?: string | null;
  department_name?: string | null;
  emp_code?: string | null;
  session_duration?: string | null;
}

/**
 * Automatically calculates risk level for security events.
 * Rule: >2 failed logins in 15 minutes = warning (yellow)
 * Rule: >3 failed logins in 15 minutes = critical (red)
 */
async function calculateRiskLevel(
  action: string,
  ip_address?: string,
  emailOrId?: string
): Promise<AuditRiskLevel> {
  if (!action.includes('FAIL') && !action.includes('DENIED') && !action.includes('UNAUTHORIZED')) {
    return 'normal';
  }

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  let failedCount = 0;

  if (env.isMockMode) {
    failedCount = inMemoryAuditLogs.filter((log) => {
      const matchIp = ip_address && log.ip_address === ip_address;
      const isRecent = log.created_at >= fifteenMinutesAgo;
      const isFailed = log.action.includes('FAIL') || log.action.includes('DENIED');
      return isRecent && (matchIp || isFailed);
    }).length;
  } else {
    try {
      const { count } = await db
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fifteenMinutesAgo)
        .ilike('action', '%FAIL%')
        .eq('ip_address', ip_address || '');

      failedCount = count || 0;
    } catch {
      failedCount = 1;
    }
  }

  // Adding the current attempt (+1)
  const totalFails = failedCount + 1;
  if (totalFails > 3) return 'critical';
  if (totalFails > 2) return 'warning';
  return 'normal';
}

/**
 * Record an immutable audit log entry
 */
export async function logAuditEvent(params: RecordAuditParams): Promise<void> {
  const risk_level = await calculateRiskLevel(params.action, params.ip_address, params.user_id || undefined);

  // If user_id provided in mock, attempt to auto-enrich location/plant/dept/emp_code if not supplied
  let enrichedEmpCode = params.emp_code || null;
  if (env.isMockMode && params.user_id && !enrichedEmpCode) {
    const matchedUser = SEED_USERS.find((u) => u.id === params.user_id);
    if (matchedUser) {
      enrichedEmpCode = matchedUser.emp_code || null;
    }
  }

  const logEntry: AuditLog = {
    id: crypto.randomUUID(),
    event_category: params.event_category,
    user_id: params.user_id || null,
    user_role: params.user_role,
    action: params.action,
    target_table: params.target_table || null,
    record_id: params.record_id || null,
    changes: params.changes || null,
    risk_level,
    ip_address: params.ip_address || null,
    user_agent: params.user_agent || null,
    location_id: params.location_id || null,
    plant_id: params.plant_id || null,
    department_id: params.department_id || null,
    location_name: params.location_name || null,
    plant_name: params.plant_name || null,
    department_name: params.department_name || null,
    emp_code: enrichedEmpCode,
    session_duration: params.session_duration || null,
    created_at: new Date().toISOString(),
  };

  if (env.isMockMode) {
    inMemoryAuditLogs.unshift(logEntry);
    return;
  }

  const { error } = await db.from('audit_logs').insert(logEntry);
  if (error) {
    console.error('Failed to write audit log to database:', error.message);
  }
}

/**
 * Query audit logs with pagination and multi-dimensional filters
 */
export async function getAuditLogs(filter?: {
  event_category?: string;
  risk_level?: string;
  locationId?: string;
  plantId?: string;
  departmentId?: string;
  search?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const limit = filter?.limit || 150;

  if (env.isMockMode) {
    let result = [...inMemoryAuditLogs].map((log) => {
      const userObj = log.user_id ? SEED_USERS.find((u) => u.id === log.user_id) : undefined;
      return {
        ...log,
        emp_code: log.emp_code || userObj?.emp_code || null,
        user: userObj || log.user,
      };
    });

    if (filter?.event_category) {
      result = result.filter((l) => l.event_category === filter.event_category);
    }
    if (filter?.risk_level) {
      result = result.filter((l) => l.risk_level === filter.risk_level);
    }
    if (filter?.locationId) {
      result = result.filter((l) => l.location_id === filter.locationId || l.user?.location_id === filter.locationId);
    }
    if (filter?.plantId) {
      result = result.filter((l) => l.plant_id === filter.plantId || l.user?.plant_id === filter.plantId);
    }
    if (filter?.departmentId) {
      result = result.filter((l) => l.department_id === filter.departmentId || l.user?.department_id === filter.departmentId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.user_role.toLowerCase().includes(q) ||
          (l.ip_address && l.ip_address.includes(q)) ||
          (l.emp_code && l.emp_code.toLowerCase().includes(q)) ||
          (l.user?.full_name && l.user.full_name.toLowerCase().includes(q)) ||
          (l.user?.email && l.user.email.toLowerCase().includes(q)) ||
          (l.location_name && l.location_name.toLowerCase().includes(q)) ||
          (l.plant_name && l.plant_name.toLowerCase().includes(q)) ||
          (l.department_name && l.department_name.toLowerCase().includes(q)) ||
          (l.target_table && l.target_table.toLowerCase().includes(q))
      );
    }
    return result.slice(0, limit);
  }

  let query = db
    .from('audit_logs')
    .select('*, user:users(*)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filter?.event_category) query = query.eq('event_category', filter.event_category);
  if (filter?.risk_level) query = query.eq('risk_level', filter.risk_level);
  if (filter?.locationId) query = query.eq('location_id', filter.locationId);
  if (filter?.plantId) query = query.eq('plant_id', filter.plantId);
  if (filter?.departmentId) query = query.eq('department_id', filter.departmentId);

  const { data, error } = await query;
  if (error || !data) return [];
  let fetchedLogs = data as AuditLog[];

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    fetchedLogs = fetchedLogs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.user_role.toLowerCase().includes(q) ||
        (l.ip_address && l.ip_address.includes(q)) ||
        (l.emp_code && l.emp_code.toLowerCase().includes(q)) ||
        (l.user?.full_name && l.user.full_name.toLowerCase().includes(q)) ||
        (l.user?.email && l.user.email.toLowerCase().includes(q))
    );
  }

  return fetchedLogs;
}

/**
 * Generate standard RFC 4180 CSV export string from audit logs
 */
export function generateAuditCsv(logs: AuditLog[]): string {
  const headers = [
    'Timestamp',
    'User Name',
    'Email',
    'Employee ID',
    'Category',
    'Action',
    'User Role',
    'Target Entity',
    'Risk Level',
    'IP Address',
    'Session Duration',
    'Location',
    'Plant',
    'Department',
    'Details/Changes',
  ];

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = logs.map((log) => [
    escapeCsv(log.created_at),
    escapeCsv(log.user?.full_name || 'System / Direct'),
    escapeCsv(log.user?.email || ''),
    escapeCsv(log.emp_code || log.user?.emp_code || ''),
    escapeCsv(log.event_category),
    escapeCsv(log.action),
    escapeCsv(log.user_role),
    escapeCsv(log.target_table || ''),
    escapeCsv(log.risk_level),
    escapeCsv(log.ip_address || ''),
    escapeCsv(log.session_duration || 'Active Session'),
    escapeCsv(log.location_name || ''),
    escapeCsv(log.plant_name || ''),
    escapeCsv(log.department_name || ''),
    escapeCsv(log.changes ? JSON.stringify(log.changes) : ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}
