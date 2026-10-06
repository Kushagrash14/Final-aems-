// =============================================================================
// AEMS v2 — Excel asset report builder (client side). Produces a Summary sheet
// (counts + Location > Plant > Department breakdown) and an Asset Details sheet.
// =============================================================================

import * as XLSX from 'xlsx';
import type { Asset, Category, DamageScrapReport, Department, Location, PMComplaint, Plant } from '@/types/database';

export type AssetCondition = 'Assigned' | 'In-House' | 'Available (Stock)' | 'Under Maintenance' | 'Damaged' | 'Scrapped' | 'Missing';

export interface AssetExportLookups {
  locations: Location[];
  plants: Plant[];
  departments: Department[];
  categories?: Category[];
}

export interface AssetExportOptions extends AssetExportLookups {
  reportTitle: string;
  fileName: string;
  assets: Asset[];
  damageReports?: DamageScrapReport[];
  complaints?: PMComplaint[];
  /** Human readable filter scope, e.g. { Location: 'Pune', Plant: 'All Plants' }. */
  scope: Record<string, string>;
  generatedBy?: string;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}

/** Same precedence the dashboard KPI cards use, so report totals match the cards. */
export function makeConditionResolver(damageReports: DamageScrapReport[] = [], complaints: PMComplaint[] = []) {
  const openMissing = new Set(damageReports.filter((r) => r.report_type === 'missing' && r.status !== 'resolved').map((r) => r.asset_id));
  const openDamage = new Set(
    damageReports.filter((r) => (r.report_type === 'damaged' || r.report_type === 'scrap') && r.status !== 'resolved').map((r) => r.asset_id)
  );
  const scrapped = new Set(damageReports.filter((r) => r.status === 'approved' || r.report_type === 'scrap').map((r) => r.asset_id));
  const openComplaints = new Set(complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').map((c) => c.machine_id));

  return (a: Asset): AssetCondition => {
    if (a.status === 'missing' || openMissing.has(a.id)) return 'Missing';
    if (a.status === 'scrapped' || scrapped.has(a.id)) return 'Scrapped';
    if (a.status === 'damaged' || openDamage.has(a.id)) return 'Damaged';
    if (a.assigned_employee_id || a.assigned_employee) return 'Assigned';
    if (a.status === 'maintenance' || openComplaints.has(a.id)) return 'Under Maintenance';
    if (a.status === 'in_service') return 'In-House';
    return 'Available (Stock)';
  };
}

interface Counts {
  total: number;
  assigned: number;
  available: number;
  stock: number;
  inHouse: number;
  maintenance: number;
  damaged: number;
  missing: number;
  cost: number;
}

const emptyCounts = (): Counts => ({ total: 0, assigned: 0, available: 0, stock: 0, inHouse: 0, maintenance: 0, damaged: 0, missing: 0, cost: 0 });

function addToCounts(c: Counts, condition: AssetCondition, cost: number) {
  c.total += 1;
  c.cost += cost;
  if (condition === 'Assigned') c.assigned += 1;
  else if (condition === 'Available (Stock)') { c.stock += 1; c.available += 1; }
  else if (condition === 'In-House') { c.inHouse += 1; c.available += 1; }
  else if (condition === 'Under Maintenance') c.maintenance += 1;
  else if (condition === 'Damaged' || condition === 'Scrapped') c.damaged += 1;
  else if (condition === 'Missing') c.missing += 1;
}

export function exportAssetsToExcel(opts: AssetExportOptions): number {
  const locById = new Map(opts.locations.map((l) => [l.id, l]));
  const plantById = new Map(opts.plants.map((p) => [p.id, p]));
  const deptById = new Map(opts.departments.map((d) => [d.id, d]));
  const catById = new Map((opts.categories || []).map((c) => [c.id, c]));
  const conditionOf = makeConditionResolver(opts.damageReports, opts.complaints);

  const assets = opts.assets
    .filter((a) => !a.is_deleted)
    .map((a) => {
      const location = a.location?.name || locById.get(a.current_location_id)?.name || '';
      const plant = a.plant?.name || plantById.get(a.current_plant_id)?.name || '';
      const department = a.department?.name || deptById.get(a.current_department_id)?.name || '';
      return { asset: a, location, plant, department, condition: conditionOf(a), cost: Number(a.purchase_cost) || 0 };
    })
    .sort((x, y) =>
      x.location.localeCompare(y.location) ||
      x.plant.localeCompare(y.plant) ||
      x.department.localeCompare(y.department) ||
      (x.asset.asset_tag || '').localeCompare(y.asset.asset_tag || '')
    );

  const totals = emptyCounts();
  const groups = new Map<string, { location: string; plant: string; department: string; counts: Counts }>();
  for (const row of assets) {
    addToCounts(totals, row.condition, row.cost);
    const key = `${row.location}|${row.plant}|${row.department}`;
    if (!groups.has(key)) groups.set(key, { location: row.location, plant: row.plant, department: row.department, counts: emptyCounts() });
    addToCounts(groups.get(key)!.counts, row.condition, row.cost);
  }

  // ---- Summary sheet --------------------------------------------------------
  const summary: (string | number)[][] = [
    ['PG GROUPS — ASSET ENTRY MANAGEMENT SYSTEM (AEMS)'],
    [opts.reportTitle.toUpperCase()],
    [],
    ['Generated On', formatDateTime(new Date())],
  ];
  if (opts.generatedBy) summary.push(['Generated By', opts.generatedBy]);
  for (const [label, value] of Object.entries(opts.scope)) summary.push([label, value]);
  summary.push(
    [],
    ['ASSET SUMMARY', 'COUNT'],
    ['Total Assets', totals.total],
    ['Assigned (with Employee)', totals.assigned],
    ['Available (Stock + In-House)', totals.available],
    ['   - Stock Pool', totals.stock],
    ['   - In-House (Department use)', totals.inHouse],
    ['Under Maintenance', totals.maintenance],
    ['Damaged / Scrap', totals.damaged],
    ['Missing / Lost', totals.missing],
    ['Total Purchase Cost (INR)', totals.cost],
    [],
    ['LOCATION / PLANT / DEPARTMENT BREAKDOWN'],
    ['Location', 'Plant', 'Department', 'Total', 'Assigned', 'Available', 'Maintenance', 'Damaged / Scrap', 'Missing', 'Purchase Cost (INR)']
  );
  for (const g of groups.values()) {
    const c = g.counts;
    summary.push([g.location || '-', g.plant || '-', g.department || '-', c.total, c.assigned, c.available, c.maintenance, c.damaged, c.missing, c.cost]);
  }
  summary.push(['GRAND TOTAL', '', '', totals.total, totals.assigned, totals.available, totals.maintenance, totals.damaged, totals.missing, totals.cost]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 16 }, { wch: 10 }, { wch: 20 }];
  wsSummary['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
  ];

  // ---- Asset details sheet --------------------------------------------------
  const details = assets.map((row, i) => {
    const a = row.asset;
    const emp = a.assigned_employee;
    return {
      'S.No': i + 1,
      Location: row.location,
      Plant: row.plant,
      Department: row.department,
      'Asset Code': a.asset_tag || '',
      'Asset Type': a.category?.name || catById.get(a.category_id)?.name || '',
      'Asset Name': a.name || '',
      Brand: a.manufacturer || '',
      Model: a.model || '',
      'Serial Number': a.serial_number || '',
      Hostname: a.hostname || '',
      Status: row.condition,
      'Assigned To': emp?.full_name || '',
      'Emp Code': emp?.emp_code || '',
      'Employee Email': emp?.email || '',
      'Purchase Date': formatDate(a.purchase_date),
      'Purchase Cost (INR)': row.cost || '',
      'Vendor Name': a.vendor_name || '',
      'PO Number': a.po_number || '',
      'Warranty Expiry': formatDate(a.warranty_expiry),
      'Registered On': formatDate(a.created_at),
    };
  });
  const wsDetails = details.length
    ? XLSX.utils.json_to_sheet(details)
    : XLSX.utils.aoa_to_sheet([['No assets found for the selected filters.']]);
  if (details.length) {
    const widths = [6, 16, 16, 24, 20, 20, 24, 14, 20, 20, 16, 18, 24, 12, 28, 14, 16, 24, 16, 14, 14];
    wsDetails['!cols'] = widths.map((wch) => ({ wch }));
    wsDetails['!autofilter'] = { ref: wsDetails['!ref'] as string };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Asset Details');

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = opts.fileName.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${safeName}_${stamp}.xlsx`);
  return assets.length;
}
