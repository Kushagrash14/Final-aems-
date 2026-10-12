'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

export interface ScopeOption {
  value: string;
  label: string;
}

interface ScopeMultiSelectProps {
  options: ScopeOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  allowCustom?: boolean;
  customPlaceholder?: string;
  disabled?: boolean;
}

export default function ScopeMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  allowCustom = false,
  customPlaceholder = 'Type and press Add',
  disabled = false,
}: ScopeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const labelOf = (value: string) => options.find((o) => o.value === value)?.label || value;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const customOptions = selected
    .filter((v) => !options.some((o) => o.value === v))
    .map((v) => ({ value: v, label: v }));
  const allOptions = [...options, ...customOptions];

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    const existing = allOptions.find((o) => o.label.toLowerCase() === value.toLowerCase());
    const next = existing ? existing.value : value;
    if (!selected.includes(next)) onChange([...selected, next]);
    setCustom('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[34px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 cursor-pointer flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-slate-400 py-0.5">{placeholder}</span>
          ) : (
            selected.map((value) => (
              <span
                key={value}
                className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 font-semibold rounded-md px-1.5 py-0.5 max-w-full"
              >
                <span className="truncate">{labelOf(value)}</span>
                {!disabled && (
                  <X
                    className="w-3 h-3 shrink-0 hover:text-rose-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(value);
                    }}
                  />
                )}
              </span>
            ))
          )}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-500" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 max-h-56 overflow-y-auto">
          {allOptions.length === 0 && !allowCustom && (
            <div className="px-2 py-1.5 text-xs text-slate-400">No options available</div>
          )}
          {allOptions.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left cursor-pointer ${checked ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                  {checked && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
          {allowCustom && (
            <div className="flex items-center gap-1 pt-1.5 mt-1 border-t border-slate-100">
              <input
                type="text"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder={customPlaceholder}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={addCustom}
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
