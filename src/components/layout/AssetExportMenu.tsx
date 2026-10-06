'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, X, Loader2, FileSpreadsheet, Upload } from 'lucide-react';
import type { Asset, Category, DamageScrapReport, Department, Location, PMComplaint, Plant } from '@/types/database';
import { exportAssetsToExcel, makeConditionResolver, type AssetCondition } from '@/lib/assetExport';

interface AssetExportMenuProps {
  locations: Location[];
  plants: Plant[];
  departments: Department[];
  categories: Category[];
  isItAdmin: boolean;
  generatedBy?: string;
}

type ExportMode = 'all' | 'filtered';
type StatusFilter = 'ALL' | 'assigned' | 'available' | 'maintenance' | 'damaged' | 'missing';

const STATUS_OPTIONS: { value: StatusFilter; label: string; matches: AssetCondition[] }[] = [
  { value: 'ALL', label: 'All Statuses', matches: [] },
  { value: 'assigned', label: 'Assigned (with Employee)', matches: ['Assigned'] },
  { value: 'available', label: 'Available (Stock + In-House)', matches: ['Available (Stock)', 'In-House'] },
  { value: 'maintenance', label: 'Under Maintenance', matches: ['Under Maintenance'] },
  { value: 'damaged', label: 'Damaged / Scrap', matches: ['Damaged', 'Scrapped'] },
  { value: 'missing', label: 'Missing / Lost', matches: ['Missing'] },
];

const selectClass =
  'w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:outline-none focus:border-blue-500 cursor-pointer text-xs';

export default function AssetExportMenu({ locations, plants, departments, categories, isItAdmin, generatedBy }: AssetExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ExportMode>('all');
  const [locationId, setLocationId] = useState('');
  const [plantId, setPlantId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const plantOptions = useMemo(
    () => (locationId ? plants.filter((p) => p.location_id === locationId) : plants),
    [plants, locationId]
  );

  const deptOptions = useMemo(() => {
    if (plantId) return departments.filter((d) => !d.plant_id || d.plant_id === plantId);
    if (locationId) {
      const ids = new Set(plantOptions.map((p) => p.id));
      return departments.filter((d) => !d.plant_id || ids.has(d.plant_id));
    }
    return departments;
  }, [departments, plantOptions, plantId, locationId]);

  const categoryOptions = useMemo(() => {
    const deptNames = new Set(departments.map((d) => d.name.trim().toUpperCase()));
    return categories.filter((c) => c.is_active !== false && !deptNames.has(c.name.trim().toUpperCase()));
  }, [categories, departments]);

  const handleExport = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (mode === 'filtered') {
        if (locationId) params.set('locationId', locationId);
        if (plantId) params.set('plantId', plantId);
        if (deptId) params.set('departmentId', deptId);
        if (categoryId) params.set('categoryId', categoryId);
      }
      const [assetRes, damageRes, complaintRes] = await Promise.all([
        fetch(`/api/assets${params.toString() ? `?${params}` : ''}`),
        fetch('/api/damaged-scrap').catch(() => null),
        fetch('/api/pm/complaint').catch(() => null),
      ]);
      if (!assetRes.ok) throw new Error('Could not load assets. Please refresh and try again.');
      const assetData = await assetRes.json();
      const damageReports: DamageScrapReport[] = damageRes?.ok ? (await damageRes.json()).reports || [] : [];
      const complaints: PMComplaint[] = complaintRes?.ok ? (await complaintRes.json()).complaints || [] : [];

      let assets: Asset[] = (assetData.assets || []).filter((a: Asset) => !a.is_deleted);
      const statusOption = STATUS_OPTIONS.find((s) => s.value === status)!;
      if (mode === 'filtered' && status !== 'ALL') {
        const conditionOf = makeConditionResolver(damageReports, complaints);
        assets = assets.filter((a) => statusOption.matches.includes(conditionOf(a)));
      }

      if (assets.length === 0) {
        setMessage({ type: 'error', text: 'No assets found for the selected filters.' });
        return;
      }

      const nameOf = (list: { id: string; name: string }[], id: string, all: string) =>
        mode === 'filtered' && id ? list.find((x) => x.id === id)?.name || id : all;
      const scope: Record<string, string> = {
        'Export Type': mode === 'all' ? 'All Assets' : 'Filtered Assets',
        Location: nameOf(locations, locationId, isItAdmin ? 'All Locations' : 'All (within your access)'),
        Plant: nameOf(plants, plantId, 'All Plants'),
        Department: nameOf(departments, deptId, 'All Departments'),
        'Asset Type': nameOf(categories, categoryId, 'All Asset Types'),
        Status: mode === 'filtered' ? statusOption.label : 'All Statuses',
      };

      const count = exportAssetsToExcel({
        reportTitle: mode === 'all' ? 'Complete Asset Register' : 'Filtered Asset Report',
        fileName: mode === 'all' ? 'AEMS_All_Assets' : 'AEMS_Asset_Report',
        assets,
        damageReports,
        complaints,
        locations,
        plants,
        departments,
        categories,
        scope,
        generatedBy,
      });
      setMessage({ type: 'success', text: `Excel downloaded with ${count} asset${count === 1 ? '' : 's'}.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Export failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((prev) => !prev); setMessage(null); }}
        title="Export assets to Excel"
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold shadow-xs transition-colors cursor-pointer ${
          open ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border-white/10'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Export</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 text-slate-800 rounded-2xl p-4 shadow-2xl z-[100] space-y-3 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold tracking-wide uppercase text-slate-900">Export Assets</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([
              ['all', 'All Assets', isItAdmin ? 'All locations, plants & departments' : 'Everything in your access'],
              ['filtered', 'With Filters', 'Choose location, plant, department'],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setMode(value); setMessage(null); }}
                className={`text-left p-2.5 rounded-xl border-2 transition-colors cursor-pointer ${
                  mode === value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`font-extrabold ${mode === value ? 'text-emerald-700' : 'text-slate-800'}`}>{label}</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{hint}</div>
              </button>
            ))}
          </div>

          {mode === 'filtered' && (
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Location</label>
                <select
                  value={locationId}
                  onChange={(e) => { setLocationId(e.target.value); setPlantId(''); setDeptId(''); }}
                  className={selectClass}
                >
                  <option value="">All Locations</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Plant</label>
                <select value={plantId} onChange={(e) => { setPlantId(e.target.value); setDeptId(''); }} className={selectClass}>
                  <option value="">All Plants</option>
                  {plantOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Department</label>
                <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className={selectClass}>
                  <option value="">All Departments</option>
                  {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Asset Type</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
                  <option value="">All Asset Types</option>
                  {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-500 leading-snug">
            Excel will contain a <strong>Summary</strong> sheet (Total, Assigned, Available, Damaged, Missing with
            Location / Plant / Department breakdown) and an <strong>Asset Details</strong> sheet.
          </p>

          {message && (
            <div
              className={`px-3 py-2 rounded-xl text-[11px] font-semibold border ${
                message.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{loading ? 'Preparing Excel...' : 'Download Excel'}</span>
          </button>

          {isItAdmin && (
            <Link
              href="/bulk-import"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-500 hover:text-blue-600 pt-1 border-t border-slate-100"
            >
              <Upload className="w-3 h-3" />
              <span>Need to import? Open Bulk Import page</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
