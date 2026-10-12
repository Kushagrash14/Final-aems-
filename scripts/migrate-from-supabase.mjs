#!/usr/bin/env node
// =============================================================================
// AEMS — one-time migration: Supabase (Postgres + Storage)  ->  MySQL + S3
//
//   node scripts/migrate-from-supabase.mjs --dry-run            (read only, prints a report)
//   node scripts/migrate-from-supabase.mjs --fresh              (empties target tables, then migrates)
//   node scripts/migrate-from-supabase.mjs                      (upsert by id; safe to re-run)
//
// Options:
//   --env=<file>        settings file (default: .env.migration)
//   --only=a,b          migrate only these tables
//   --skip-files        copy rows only, leave file links untouched
//   --move-base64       also move base64 (data:) attachments out of the DB into S3
//   --map=<file>        JSON column renames: { "assets": { "old_column": "new_column" } }
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const TABLE_ORDER = [
  'locations',
  'plants',
  'users',
  'departments',
  'user_scopes',
  'categories',
  'category_form_fields',
  'employees',
  'assets',
  'asset_custom_values',
  'asset_peripherals',
  'asset_assignments',
  'asset_transfers',
  'damage_scrap_reports',
  'pm_machines',
  'pm_schedules',
  'pm_complaints',
  'audit_logs',
  'email_templates',
  'smart_mail_campaigns',
  'asset_approval_requests',
];
// Login sessions and OTPs are never migrated; everyone signs in again on the new system.
const NEVER_MIGRATE = new Set(['auth_otps', 'user_sessions']);

const PRIMARY_IT_ADMIN = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'software.2040@pgel.in',
  full_name: 'Software Team (IT Admin)',
};

const PAGE_SIZE = 1000;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const FILE_COLUMN_HINT = /(path|url|photo|document|attachment|evidence|image|invoice|file)/i;
const RELATIVE_FILE = /^[\w\-./ ()%]+\.[a-z0-9]{2,5}$/i;

// ----------------------------------------------------------------------------- args & settings
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  })
);
const DRY_RUN = Boolean(args['dry-run']);
const FRESH = Boolean(args.fresh);
const SKIP_FILES = Boolean(args['skip-files']);
const MOVE_BASE64 = Boolean(args['move-base64']);
const ONLY = typeof args.only === 'string' ? new Set(args.only.split(',').map((s) => s.trim())) : null;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) {
    console.error(`Settings file not found: ${file}\nCopy scripts/env.migration.example to .env.migration and fill it in.`);
    process.exit(1);
  }
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const cfg = loadEnvFile(path.resolve(typeof args.env === 'string' ? args.env : '.env.migration'));
const columnMap = typeof args.map === 'string' ? JSON.parse(fs.readFileSync(path.resolve(args.map), 'utf8')) : {};

for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DB_HOST', 'DB_USER', 'DB_NAME']) {
  if (!cfg[key]) {
    console.error(`Missing ${key} in settings file`);
    process.exit(1);
  }
}
if (!SKIP_FILES && !DRY_RUN && !cfg.AWS_S3_BUCKET) {
  console.error('Missing AWS_S3_BUCKET (or run with --skip-files)');
  process.exit(1);
}

const SUPABASE_URL = cfg.SUPABASE_URL.replace(/\/+$/, '');
const SUPA_HEADERS = {
  apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
};
const DEFAULT_BUCKET = cfg.SUPABASE_STORAGE_BUCKET || '';

const s3 = new S3Client({
  region: cfg.AWS_REGION || 'ap-south-1',
  credentials:
    cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: cfg.AWS_ACCESS_KEY_ID, secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY }
      : undefined,
});

const report = {
  started_at: new Date().toISOString(),
  mode: DRY_RUN ? 'dry-run' : FRESH ? 'fresh' : 'upsert',
  tables: {},
  old_tables_not_in_new: [],
  files: { copied: 0, reused: 0, failed: [] },
};

// ----------------------------------------------------------------------------- Supabase
async function listSupabaseTables() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: SUPA_HEADERS });
  if (!res.ok) throw new Error(`Cannot reach Supabase (${res.status}). Check SUPABASE_URL and the service role key.`);
  const spec = await res.json();
  return Object.keys(spec.definitions || {});
}

async function fetchAllRows(table) {
  const rows = [];
  let ordered = true;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const order = ordered ? '&order=id.asc' : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${order}&limit=${PAGE_SIZE}&offset=${offset}`, {
      headers: SUPA_HEADERS,
    });
    if (res.status === 400 && ordered && offset === 0) {
      ordered = false;
      offset -= PAGE_SIZE;
      continue;
    }
    if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// ----------------------------------------------------------------------------- files
const fileCache = new Map();
const STORAGE_URL = /https?:\/\/[^\s"'<>]+?\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/\s"'?<>]+)\/([^\s"'?<>]+)(?:\?[^\s"'<>]*)?/g;

const safeSegment = (s) => s.replace(/[^a-zA-Z0-9._-]/g, '_') || '_';

async function existsInS3(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: cfg.AWS_S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyStorageObject(bucket, objectPath) {
  const cacheKey = `${bucket}/${objectPath}`;
  if (fileCache.has(cacheKey)) return fileCache.get(cacheKey);

  const decoded = decodeURIComponent(objectPath);
  const key = `uploads/legacy/${safeSegment(bucket)}/${decoded.split('/').map(safeSegment).join('/')}`;
  const newUrl = `/api/files/${key}`;

  if (DRY_RUN) {
    fileCache.set(cacheKey, newUrl);
    report.files.copied++;
    return newUrl;
  }

  try {
    if (await existsInS3(key)) {
      report.files.reused++;
    } else {
      const encodedPath = decoded.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${encodedPath}`, { headers: SUPA_HEADERS });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.AWS_S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: res.headers.get('content-type') || 'application/octet-stream',
        })
      );
      report.files.copied++;
    }
    fileCache.set(cacheKey, newUrl);
    return newUrl;
  } catch (err) {
    report.files.failed.push({ file: cacheKey, error: String(err?.message || err) });
    fileCache.set(cacheKey, null);
    return null;
  }
}

async function moveDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m || !m[2]) return dataUrl;
  const mime = m[1] || 'application/octet-stream';
  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
  const hash = crypto.createHash('sha256').update(m[3]).digest('hex').slice(0, 32);
  const key = `uploads/legacy/base64/${hash}.${ext}`;
  if (DRY_RUN) {
    report.files.copied++;
    return `/api/files/${key}`;
  }
  try {
    if (await existsInS3(key)) {
      report.files.reused++;
    } else {
      await s3.send(new PutObjectCommand({ Bucket: cfg.AWS_S3_BUCKET, Key: key, Body: Buffer.from(m[3], 'base64'), ContentType: mime }));
      report.files.copied++;
    }
    return `/api/files/${key}`;
  } catch (err) {
    report.files.failed.push({ file: `base64:${hash}`, error: String(err?.message || err) });
    return dataUrl;
  }
}

async function rewriteString(value, columnName) {
  if (value.startsWith('data:')) return MOVE_BASE64 ? moveDataUrl(value) : value;

  let out = value;
  const matches = [...value.matchAll(STORAGE_URL)];
  for (const m of matches) {
    const newUrl = await copyStorageObject(m[1], m[2]);
    if (newUrl) out = out.replace(m[0], newUrl);
  }
  if (matches.length) return out;

  if (DEFAULT_BUCKET && FILE_COLUMN_HINT.test(columnName) && RELATIVE_FILE.test(value) && !value.startsWith('/api/')) {
    const newUrl = await copyStorageObject(DEFAULT_BUCKET, value.replace(/^\/+/, ''));
    if (newUrl) return newUrl;
  }
  return value;
}

async function rewriteFiles(value, columnName) {
  if (SKIP_FILES || value == null) return value;
  if (typeof value === 'string') return rewriteString(value, columnName);
  if (Array.isArray(value)) return Promise.all(value.map((v) => rewriteFiles(v, columnName)));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await rewriteFiles(v, k);
    return out;
  }
  return value;
}

// ----------------------------------------------------------------------------- MySQL
function toMysqlValue(meta, value) {
  if (value === undefined || value === null) return null;
  const type = meta.dataType;
  if (type === 'json') return JSON.stringify(value);
  if (type === 'datetime' || type === 'timestamp') {
    if (value === '') return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toISOString().replace('T', ' ').replace('Z', '');
  }
  if (type === 'date') {
    if (value === '') return null;
    const s = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function loadMysqlColumns(conn) {
  const [rows] = await conn.query(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY ORDINAL_POSITION',
    [cfg.DB_NAME]
  );
  const tables = new Map();
  for (const r of rows) {
    if (!tables.has(r.t)) tables.set(r.t, new Map());
    tables.get(r.t).set(r.c, { dataType: String(r.d).toLowerCase() });
  }
  return tables;
}

function buildInsert(table, columns, batch) {
  const cols = columns.map((c) => `\`${c}\``).join(', ');
  const params = [];
  const tuples = batch.map((row) => {
    const parts = columns.map((c) => {
      if (!(c in row)) return 'DEFAULT';
      params.push(row[c]);
      return '?';
    });
    return `(${parts.join(', ')})`;
  });
  const updates = columns.filter((c) => c !== 'id').map((c) => `\`${c}\` = VALUES(\`${c}\`)`);
  const onDup = updates.length ? ` ON DUPLICATE KEY UPDATE ${updates.join(', ')}` : ' ON DUPLICATE KEY UPDATE `id` = `id`';
  return { sql: `INSERT INTO \`${table}\` (${cols}) VALUES ${tuples.join(', ')}${onDup}`, params };
}

async function writeRows(conn, table, columns, rows, stats) {
  const flush = async (batch) => {
    if (!batch.length) return;
    try {
      const { sql, params } = buildInsert(table, columns, batch);
      await conn.query(sql, params);
      stats.written += batch.length;
    } catch {
      for (const row of batch) {
        try {
          const { sql, params } = buildInsert(table, columns, [row]);
          await conn.query(sql, params);
          stats.written++;
        } catch (err) {
          stats.failed.push({ id: row.id ?? null, error: String(err?.message || err).slice(0, 300) });
        }
      }
    }
  };

  let batch = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (batch.length && (bytes + size > MAX_BATCH_BYTES || batch.length >= 200)) {
      await flush(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(row);
    bytes += size;
  }
  await flush(batch);
}

// ----------------------------------------------------------------------------- main
async function main() {
  console.log(`AEMS migration — mode: ${report.mode}${SKIP_FILES ? ', rows only' : ''}${MOVE_BASE64 ? ', moving base64 to S3' : ''}`);

  const conn = await mysql.createConnection({
    host: cfg.DB_HOST,
    port: Number(cfg.DB_PORT || 3306),
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD || '',
    database: cfg.DB_NAME,
    ssl: cfg.DB_SSL === 'true' ? 'Amazon RDS' : undefined,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
  await conn.query("SET time_zone = '+00:00'");

  const mysqlTables = await loadMysqlColumns(conn);
  if (!mysqlTables.has('assets')) throw new Error('Target MySQL schema not found. Load aws/mysql_schema.sql first.');

  const supaTables = await listSupabaseTables();
  report.old_tables_not_in_new = supaTables.filter((t) => !mysqlTables.has(t) && !NEVER_MIGRATE.has(t));

  const tables = TABLE_ORDER.filter((t) => (!ONLY || ONLY.has(t)) && mysqlTables.has(t));

  if (!DRY_RUN) await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  if (FRESH && !DRY_RUN) {
    for (const t of [...tables].reverse()) {
      if (supaTables.includes(t)) await conn.query(`DELETE FROM \`${t}\``);
    }
    console.log('Target tables emptied.');
  }

  for (const table of tables) {
    const stats = { in_supabase: 0, written: 0, failed: [], dropped_columns: [], missing_in_old: [] };
    report.tables[table] = stats;

    if (!supaTables.includes(table)) {
      stats.note = 'table not present in Supabase — skipped';
      console.log(`- ${table}: not in Supabase, skipped`);
      continue;
    }

    const targetCols = mysqlTables.get(table);
    const renames = columnMap[table] || {};
    const rows = await fetchAllRows(table);
    stats.in_supabase = rows.length;

    const dropped = new Set();
    const seen = new Set();
    const prepared = [];
    for (const raw of rows) {
      const row = {};
      for (const [oldCol, value] of Object.entries(raw)) {
        const col = renames[oldCol] || oldCol;
        const meta = targetCols.get(col);
        if (!meta) {
          dropped.add(oldCol);
          continue;
        }
        seen.add(col);
        row[col] = toMysqlValue(meta, await rewriteFiles(value, col));
      }
      prepared.push(row);
    }
    stats.dropped_columns = [...dropped];
    stats.missing_in_old = [...targetCols.keys()].filter((c) => !seen.has(c));

    if (!DRY_RUN && prepared.length) {
      await writeRows(conn, table, [...seen], prepared, stats);
    }

    const tail = DRY_RUN ? '' : ` -> written ${stats.written}, failed ${stats.failed.length}`;
    console.log(`- ${table}: ${stats.in_supabase} rows${tail}${dropped.size ? ` (old-only columns ignored: ${[...dropped].join(', ')})` : ''}`);
  }

  if (!DRY_RUN) {
    // The primary IT Admin must always be able to sign in on the new system.
    const [admins] = await conn.query('SELECT id FROM users WHERE email = ?', [PRIMARY_IT_ADMIN.email]);
    if (!admins.length) {
      await conn.query("INSERT INTO users (id, email, full_name, role, is_active) VALUES (?, ?, ?, 'it_admin', 1)", [
        PRIMARY_IT_ADMIN.id,
        PRIMARY_IT_ADMIN.email,
        PRIMARY_IT_ADMIN.full_name,
      ]);
      await conn.query('INSERT IGNORE INTO user_scopes (user_id, can_edit) VALUES (?, 1)', [PRIMARY_IT_ADMIN.id]);
      console.log(`Primary IT Admin ${PRIMARY_IT_ADMIN.email} re-created.`);
    } else {
      await conn.query("UPDATE users SET role = 'it_admin', is_active = 1 WHERE email = ?", [PRIMARY_IT_ADMIN.email]);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  await conn.end();

  report.finished_at = new Date().toISOString();
  const reportFile = path.resolve(`migration-report-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  const failedRows = Object.values(report.tables).reduce((n, s) => n + s.failed.length, 0);
  console.log('\nFiles:', DRY_RUN ? `${report.files.copied} would be copied to S3` : `${report.files.copied} copied, ${report.files.reused} already in S3, ${report.files.failed.length} failed`);
  if (report.old_tables_not_in_new.length) console.log('Supabase tables with no place in the new system:', report.old_tables_not_in_new.join(', '));
  console.log(`Rows failed: ${failedRows}`);
  console.log(`Full report: ${reportFile}`);
}

main().catch((err) => {
  console.error('\nMigration stopped:', err?.message || err);
  process.exit(1);
});
