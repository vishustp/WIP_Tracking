'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Beaker,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  X,
  FlaskConical,
  Thermometer,
  ShieldCheck,
  Layers,
  Package,
  Gauge,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Eye,
  Lock,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
  Scale,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/permissions';
import { DEFAULT_SPEC_MASTER_RECORDS, type SpecMasterRecord } from '@/lib/specMasterDefaults';

const EMPTY_RECORD: Omit<SpecMasterRecord, 'id' | 'created_at' | 'updated_at'> = {
  spec_key: '',
  spec_full: '',
  steel_grade: '',
  smys_mpa: null,
  uts_mpa: null,
  elongation_pct: null,
  hardness: '',
  straightness: '1:1000',
  color_spec: '',
  rm_color: '',
  cds_od_tolerance: null,
  cds_wt_tolerance: null,
  hfs_od_tolerance: null,
  hfs_wt_tolerance: null,
  od_tolerance: null,
  wt_tolerance: null,
  hydro_pressure: null,
  whf_temp: '',
  induction_temp: '',
  sizing_outlet_temp: '',
  ht_cycle: 'NA',
  ht_condition: 'AS ROLLED / HFS',
  ndt: 'UT',
  holding_time_sec: 5,
  coating: 'BLACK VARNISH',
  end_condition: 'BEVEL END (30\u00b0-35\u00b0)',
  bundling: 'HEXAGONAL',
  end_cap: 'PLASTIC PROTECTOR',
  is_min_wall: false,
  is_active: true,
};

// â”€â”€â”€ Helper Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  hint,
  disabled,
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-bold text-slate-700">
        {label}
        {required && !disabled && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-1.5 text-xs font-semibold text-slate-900 border-2 rounded-lg transition-colors ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
            : 'bg-white border-slate-300 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100'
        }`}
      />
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 mt-5">
      <div className="p-1 bg-indigo-100 rounded text-indigo-700">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <h4 className="text-xs font-black uppercase tracking-wide text-indigo-900">{title}</h4>
    </div>
  );
}

// â”€â”€â”€ Edit/Add Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SpecEditModal({
  rec,
  isNew,
  readOnly = false,
  onClose,
  onSaved,
}: {
  rec: Partial<SpecMasterRecord>;
  isNew: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (saved: SpecMasterRecord) => void;
}) {
  const [form, setForm] = useState<Omit<SpecMasterRecord, 'id' | 'created_at' | 'updated_at'>>({
    spec_key: rec.spec_key ?? '',
    spec_full: rec.spec_full ?? '',
    steel_grade: rec.steel_grade ?? '',
    smys_mpa: rec.smys_mpa ?? null,
    uts_mpa: rec.uts_mpa ?? null,
    elongation_pct: rec.elongation_pct ?? null,
    hardness: rec.hardness ?? '',
    straightness: rec.straightness ?? '1:1000',
    color_spec: rec.color_spec ?? '',
    rm_color: rec.rm_color ?? '',
    cds_od_tolerance: rec.cds_od_tolerance ?? '',
    cds_wt_tolerance: rec.cds_wt_tolerance ?? '',
    hfs_od_tolerance: rec.hfs_od_tolerance ?? '',
    hfs_wt_tolerance: rec.hfs_wt_tolerance ?? '',
    od_tolerance: rec.od_tolerance ?? '',
    wt_tolerance: rec.wt_tolerance ?? '',
    hydro_pressure: rec.hydro_pressure ?? '',
    whf_temp: rec.whf_temp ?? '',
    induction_temp: rec.induction_temp ?? '',
    sizing_outlet_temp: rec.sizing_outlet_temp ?? '',
    ht_cycle: rec.ht_cycle ?? 'NA',
    ht_condition: rec.ht_condition ?? 'AS ROLLED / HFS',
    ndt: rec.ndt ?? 'UT',
    holding_time_sec: rec.holding_time_sec ?? 5,
    coating: rec.coating ?? 'BLACK VARNISH',
    end_condition: rec.end_condition ?? 'BEVEL END (30°-35°)',
    bundling: rec.bundling ?? 'HEXAGONAL',
    end_cap: rec.end_cap ?? 'PLASTIC PROTECTOR',
    is_min_wall: rec.is_min_wall ?? false,
    is_active: rec.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [fetchingAi, setFetchingAi] = useState(false);

  const numericFields = new Set(['smys_mpa', 'uts_mpa', 'elongation_pct', 'holding_time_sec']);

  const set = (key: keyof typeof form) => (val: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: numericFields.has(key) ? (val === '' ? null : Number(val)) : val,
    }));
  };

  const handleAutoFetchSpec = async () => {
    const query = form.spec_full.trim() || form.spec_key.trim();
    if (!query) {
      toast.error('Please enter a Spec Key or Specification Name first (e.g. A335 P22, A106 Gr B, SA210 A1, API 5L X52)');
      return;
    }
    setFetchingAi(true);
    try {
      const res = await fetch('/api/specs/ai-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Specification not recognized');
      }
      const spec = json.data;
      setForm((prev) => ({
        ...prev,
        spec_key: prev.spec_key || spec.spec_key,
        spec_full: spec.spec_full || prev.spec_full,
        steel_grade: spec.steel_grade || prev.steel_grade,
        smys_mpa: spec.smys_mpa ?? prev.smys_mpa,
        uts_mpa: spec.uts_mpa ?? prev.uts_mpa,
        elongation_pct: spec.elongation_pct ?? prev.elongation_pct,
        hardness: spec.hardness || prev.hardness,
        straightness: spec.straightness || prev.straightness,
        color_spec: spec.color_spec || prev.color_spec,
        rm_color: spec.rm_color || prev.rm_color,
        cds_od_tolerance: spec.cds_od_tolerance || prev.cds_od_tolerance,
        cds_wt_tolerance: spec.cds_wt_tolerance || prev.cds_wt_tolerance,
        hfs_od_tolerance: spec.hfs_od_tolerance || prev.hfs_od_tolerance,
        hfs_wt_tolerance: spec.hfs_wt_tolerance || prev.hfs_wt_tolerance,
        od_tolerance: spec.od_tolerance || prev.od_tolerance,
        wt_tolerance: spec.wt_tolerance || prev.wt_tolerance,
        hydro_pressure: spec.hydro_pressure || prev.hydro_pressure,
        whf_temp: spec.whf_temp || prev.whf_temp,
        induction_temp: spec.induction_temp || prev.induction_temp,
        sizing_outlet_temp: spec.sizing_outlet_temp || prev.sizing_outlet_temp,
        ht_cycle: spec.ht_cycle || prev.ht_cycle,
        ht_condition: spec.ht_condition || prev.ht_condition,
        ndt: spec.ndt || prev.ndt,
        holding_time_sec: spec.holding_time_sec ?? prev.holding_time_sec,
        coating: spec.coating || prev.coating,
        end_condition: spec.end_condition || prev.end_condition,
        bundling: spec.bundling || prev.bundling,
        end_cap: spec.end_cap || prev.end_cap,
        is_min_wall: spec.is_min_wall !== undefined ? spec.is_min_wall : prev.is_min_wall,
      }));
      const sourceBadge = json.source === 'AI_GENERATED' ? 'AI Model' : 'International Standards Database';
      toast.success(`✨ Loaded ${spec.spec_full} specifications from ${sourceBadge}!`);
    } catch (err: any) {
      toast.error(`Auto-fetch failed: ${err.message || err}`);
    } finally {
      setFetchingAi(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.spec_key.trim() || !form.spec_full.trim()) {
      toast.error('Spec Key and Full Name are required.');
      return;
    }
    setSaving(true);
    try {
      const s = createClient();
      const payload: any = { ...form, updated_at: new Date().toISOString() };

      // Determine if this is a dummy seed or local id (not an actual Postgres row id)
      const isSeedRecord =
        !rec.id ||
        rec.id.startsWith('00000000-') ||
        rec.id.startsWith('seed-') ||
        rec.id.startsWith('local-');

      let result: any;

      const attemptSave = async (dataPayload: any) => {
        // If it's a seed or new record, upsert on spec_key (do not pass dummy seed ID)
        if (isNew || isSeedRecord) {
          const { data, error } = await s
            .from('material_spec_master')
            .upsert(dataPayload, { onConflict: 'spec_key' })
            .select()
            .maybeSingle();
          return { data, error };
        }

        // Otherwise try updating by id
        const updateRes = await s
          .from('material_spec_master')
          .update(dataPayload)
          .eq('id', rec.id!)
          .select()
          .maybeSingle();

        // If 0 rows updated (e.g. ID not in DB), fallback to upsert on spec_key
        if (!updateRes.error && !updateRes.data) {
          return await s
            .from('material_spec_master')
            .upsert(dataPayload, { onConflict: 'spec_key' })
            .select()
            .maybeSingle();
        }

        return updateRes;
      };

      let { data, error } = await attemptSave(payload);

      if (error) {
        if (error.message?.includes('permission denied') || error.code === '42501') {
          result = { id: rec.id || `local-${Date.now()}`, ...payload };
          toast.info('Saved to session. To persist to database, run the SQL permissions fix in Supabase.');
        } else if (error.message?.includes('column') || error.code === '42703') {
          // Fallback if custom tolerance/hydro columns are not yet in Supabase table
          const corePayload = { ...payload };
          delete corePayload.cds_od_tolerance;
          delete corePayload.cds_wt_tolerance;
          delete corePayload.hfs_od_tolerance;
          delete corePayload.hfs_wt_tolerance;
          delete corePayload.od_tolerance;
          delete corePayload.wt_tolerance;
          delete corePayload.hydro_pressure;

          const { data: retryData, error: retryError } = await attemptSave(corePayload);
          if (retryError) throw retryError;
          result = { ...(retryData || {}), ...payload, id: retryData?.id || rec.id };
          toast.success(`"${form.spec_full}" saved successfully!`);
        } else {
          throw error;
        }
      } else {
        result = { ...(data || {}), ...payload, id: data?.id || rec.id };
        toast.success(`"${form.spec_full}" saved successfully!`);
      }
      onSaved(result as SpecMasterRecord);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#004f84] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                {readOnly ? `Specification Details: ${rec.spec_key}` : isNew ? 'Add New Specification' : `Edit: ${rec.spec_key}`}
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5">
                {readOnly ? 'Material Spec Master (Read-Only Reference)' : 'Material Spec Master Table'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close modal" title="Close modal" className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* AI Auto-Fetch Banner */}
          {!readOnly && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200/90 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-xs shrink-0 mt-0.5 sm:mt-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-950">AI & International Standards Auto-Fetch</span>
                    <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded">ASTM / ASME / API / BS / EN / DIN</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Enter any standard (e.g. <b>A335 P22</b>, <b>A106 Gr B</b>, <b>A213 T11</b>, <b>SA210 A1</b>, <b>API 5L X52</b>, <b>ST52</b>) to auto-fill mechanicals, tolerances, thermal cycles & hydro formula.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoFetchSpec}
                disabled={fetchingAi}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0 self-end sm:self-auto"
              >
                {fetchingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {fetchingAi ? 'Fetching Specs...' : '⚡ Auto-Fill from Standards'}
              </button>
            </div>
          )}

          {/* Identity */}
          <SectionHeader title="Identification" icon={Layers} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Spec Key"
              value={form.spec_key}
              onChange={set('spec_key')}
              placeholder="e.g. A106, A210, BS3059_320"
              required
              disabled={readOnly}
              hint="Short unique key, no spaces"
            />
            <FieldInput
              label="Full Specification Name"
              value={form.spec_full}
              onChange={set('spec_full')}
              placeholder="e.g. ASTM A106 Gr B (IBR)"
              required
              disabled={readOnly}
            />
            <FieldInput label="Steel Grade" value={form.steel_grade} onChange={set('steel_grade')} placeholder="e.g. SAE 1018 / 15C8 RS-03" disabled={readOnly} />
            <div className="grid grid-cols-2 gap-3">
              <FieldInput label="Pipe Colour Code" value={form.color_spec} onChange={set('color_spec')} placeholder="WHITE" disabled={readOnly} />
              <FieldInput label="RM Billet Colour" value={form.rm_color} onChange={set('rm_color')} placeholder="YELLOW + WHITE" disabled={readOnly} />
            </div>
          </div>

          {/* Mechanical Properties */}
          <SectionHeader title="Mechanical Properties" icon={Gauge} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FieldInput label="SMYS (MPa)" value={form.smys_mpa} onChange={set('smys_mpa')} type="number" placeholder="240" disabled={readOnly} />
            <FieldInput label="UTS Min (MPa)" value={form.uts_mpa} onChange={set('uts_mpa')} type="number" placeholder="415" disabled={readOnly} />
            <FieldInput label="Elongation Min (%)" value={form.elongation_pct} onChange={set('elongation_pct')} type="number" placeholder="21" disabled={readOnly} />
            <FieldInput label="Hardness Max" value={form.hardness} onChange={set('hardness')} placeholder="79 HRB MAX" disabled={readOnly} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <FieldInput label="Straightness" value={form.straightness} onChange={set('straightness')} placeholder="1:1000" disabled={readOnly} />
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Wall Type</label>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => !readOnly && setForm((p) => ({ ...p, is_min_wall: !p.is_min_wall }))}
                className={`mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                  readOnly ? 'cursor-default opacity-80 ' : 'cursor-pointer '
                }${
                  form.is_min_wall
                    ? 'bg-amber-50 border-amber-500 text-amber-800'
                    : 'bg-slate-50 border-slate-300 text-slate-600'
                }`}
              >
                {form.is_min_wall ? (
                  <ToggleRight className="w-4 h-4 text-amber-600" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                )}
                {form.is_min_wall ? 'Minimum Wall (0% minus tol)' : 'Nominal Wall (-12.5% tol)'}
              </button>
            </div>
          </div>

          {/* Dimensional Tolerances Notice (Option B: Dynamic Calculation in Process Sheet) */}
          <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-blue-950">Dynamic Sizing & Tolerances</p>
              <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                Per seamless mill standards, dimensional tolerances (OD & WT limits in mm), wall thickness expansion margins, and hydrostatic test pressures depend on size (OD × WT) and are dynamically calculated in the <strong>Process Sheet</strong> per route (CDS / HFS).
              </p>
            </div>
          </div>

          {/* Thermal */}
          <SectionHeader title="Thermal Parameters" icon={Thermometer} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldInput label="WHF Temperature" value={form.whf_temp} onChange={set('whf_temp')} placeholder="1220 C (+/- 40 C)" disabled={readOnly} />
            <FieldInput label="Induction Furnace Temp" value={form.induction_temp} onChange={set('induction_temp')} placeholder="850 C - 880 C" disabled={readOnly} />
            <FieldInput label="Sizing Mill Outlet Temp" value={form.sizing_outlet_temp} onChange={set('sizing_outlet_temp')} placeholder="880 C TO 900 C" disabled={readOnly} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="HT Cycle" value={form.ht_cycle} onChange={set('ht_cycle')} placeholder="NA / NORMALIZED & TEMPERED" disabled={readOnly} />
            <FieldInput label="HT Condition" value={form.ht_condition} onChange={set('ht_condition')} placeholder="AS ROLLED / HFS" disabled={readOnly} />
          </div>

          {/* Testing */}
          <SectionHeader title="Testing & Inspection" icon={ShieldCheck} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="NDT Method" value={form.ndt} onChange={set('ndt')} placeholder="UT / ET / MT" disabled={readOnly} />
            <FieldInput label="Holding Time (sec)" value={form.holding_time_sec} onChange={set('holding_time_sec')} type="number" placeholder="5" disabled={readOnly} />
          </div>

          {/* Finishing */}
          <SectionHeader title="Coating & Finishing" icon={Package} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="Coating" value={form.coating} onChange={set('coating')} placeholder="BLACK VARNISH" disabled={readOnly} />
            <FieldInput label="End Condition" value={form.end_condition} onChange={set('end_condition')} placeholder="BEVEL END (30-35)" disabled={readOnly} />
            <FieldInput label="Bundling" value={form.bundling} onChange={set('bundling')} placeholder="HEXAGONAL" disabled={readOnly} />
            <FieldInput label="End Cap" value={form.end_cap} onChange={set('end_cap')} placeholder="PLASTIC PROTECTOR" disabled={readOnly} />
          </div>

          {/* Active Flag */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-700">Active Status</p>
              <p className="text-[10px] text-slate-500">Inactive specs are hidden from the Process Sheet dropdown</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && setForm((p) => ({ ...p, is_active: !p.is_active }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                readOnly ? 'cursor-default opacity-80 ' : 'cursor-pointer '
              }${
                form.is_active
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                  : 'bg-slate-100 border-slate-300 text-slate-500'
              }`}
            >
              {form.is_active ? (
                <><ToggleRight className="w-4 h-4 text-emerald-600" /> Active</>
              ) : (
                <><ToggleLeft className="w-4 h-4 text-slate-400" /> Inactive</>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border-2 border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-60 transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : isNew ? 'Create Spec' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Delete Confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DeleteModal({
  rec,
  onClose,
  onDeleted,
}: {
  rec: SpecMasterRecord;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const s = createClient();
      const { error } = await s.from('material_spec_master').delete().eq('id', rec.id);
      if (error) {
        if (error.message?.includes('permission denied') || error.code === '42501') {
          toast.info('Deleted from session. Run the SQL permissions fix in Supabase to persist deletions.');
          onDeleted(rec.id);
          return;
        }
        throw error;
      }
      toast.success(`"${rec.spec_full}" deleted.`);
      onDeleted(rec.id);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-xl">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-sm font-black text-slate-800">Delete Specification?</h3>
        </div>
        <p className="text-xs text-slate-600 mb-2">You are about to permanently delete:</p>
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-5">
          <p className="text-sm font-bold text-red-800">{rec.spec_full}</p>
          <p className="text-xs text-red-600">Key: {rec.spec_key}</p>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          This action cannot be undone. Consider <strong>deactivating</strong> the spec instead if you need to retain the data.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border-2 border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {loading ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Row Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SpecRow({
  rec,
  onEdit,
  onView,
  onDelete,
  onToggleActive,
  canModify,
}: {
  rec: SpecMasterRecord;
  onEdit: (r: SpecMasterRecord) => void;
  onView: (r: SpecMasterRecord) => void;
  onDelete: (r: SpecMasterRecord) => void;
  onToggleActive: (r: SpecMasterRecord) => void;
  canModify: boolean;
}) {
  return (
    <tr className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${!rec.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 min-w-[120px]">
        <span className="inline-block px-2 py-0.5 text-[10px] font-black bg-indigo-100 text-indigo-800 rounded font-mono">
          {rec.spec_key}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-xs font-bold text-slate-800">{rec.spec_full}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{rec.steel_grade || '-'}</p>
        {(rec.cds_od_tolerance || rec.hfs_od_tolerance) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {rec.cds_od_tolerance && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-mono" title={`CDS Route: OD ${rec.cds_od_tolerance} | WT ${rec.cds_wt_tolerance || '±10%'}`}>
                <span className="font-bold text-blue-800">CDS:</span>
                <span>OD {rec.cds_od_tolerance.split('(')[0].trim()}</span>
              </span>
            )}
            {rec.hfs_od_tolerance && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-mono" title={`HFS Route: OD ${rec.hfs_od_tolerance} | WT ${rec.hfs_wt_tolerance || '+15/-12.5%'}`}>
                <span className="font-bold text-amber-900">HFS:</span>
                <span>OD {rec.hfs_od_tolerance.split('(')[0].trim()}</span>
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold text-slate-700">{rec.smys_mpa ?? '-'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold text-slate-700">{rec.uts_mpa ?? '-'}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold text-slate-700">{rec.elongation_pct != null ? `${rec.elongation_pct}%` : '-'}</span>
      </td>
      <td className="px-4 py-3">
        <div className="text-[10px] font-semibold text-slate-600">
          <div>{rec.color_spec || '-'}</div>
          <div className="text-slate-400">{rec.rm_color || '-'}</div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${
            rec.is_min_wall ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {rec.is_min_wall ? 'Min Wall' : 'Nominal'}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {canModify ? (
          <button onClick={() => onToggleActive(rec)} title={rec.is_active ? 'Click to deactivate' : 'Click to activate'} aria-label={rec.is_active ? `Deactivate spec ${rec.spec_key}` : `Activate spec ${rec.spec_key}`} className="cursor-pointer">
            {rec.is_active ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
            ) : (
              <XCircle className="w-4 h-4 text-slate-400 mx-auto" />
            )}
          </button>
        ) : (
          <div title={rec.is_active ? 'Active' : 'Inactive'}>
            {rec.is_active ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
            ) : (
              <XCircle className="w-4 h-4 text-slate-400 mx-auto" />
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          {canModify ? (
            <>
              <button
                onClick={() => onEdit(rec)}
                className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-600 transition-colors cursor-pointer"
                title="Edit specification"
                aria-label={`Edit spec ${rec.spec_key}`}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(rec)}
                className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors cursor-pointer"
                title="Delete specification"
                aria-label={`Delete spec ${rec.spec_key}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => onView(rec)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[11px] font-semibold transition-colors cursor-pointer"
              title="View specification details"
              aria-label={`View spec ${rec.spec_key} details`}
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              <span>Details</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SpecMasterAdminClient() {
  const { isAdmin, isSuperUser } = usePermissions();
  const canModify = isAdmin || isSuperUser;

  const [records, setRecords] = useState<SpecMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editTarget, setEditTarget] = useState<SpecMasterRecord | null>(null);
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);
  const [isNewMode, setIsNewMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SpecMasterRecord | null>(null);
  const [dbPermissionError, setDbPermissionError] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const s = createClient();
      const { data, error } = await s
        .from('material_spec_master')
        .select('*')
        .order('spec_full', { ascending: true });
      if (error) {
        console.warn('Database material_spec_master fetch error:', error);
        if (error.message?.includes('permission denied') || error.code === '42501') {
          setDbPermissionError(true);
        }
        setRecords(DEFAULT_SPEC_MASTER_RECORDS);
      } else if (data && data.length > 0) {
        setRecords(data as SpecMasterRecord[]);
        setDbPermissionError(false);
      } else {
        setRecords(DEFAULT_SPEC_MASTER_RECORDS);
      }
    } catch (err: any) {
      console.warn('Failed to load specs:', err);
      if (err?.message?.includes('permission denied') || err?.code === '42501') {
        setDbPermissionError(true);
      }
      setRecords(DEFAULT_SPEC_MASTER_RECORDS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRecords(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return records.filter((r) => {
      if (!showInactive && !r.is_active) return false;
      if (!q) return true;
      return (
        r.spec_key.toLowerCase().includes(q) ||
        r.spec_full.toLowerCase().includes(q) ||
        (r.steel_grade || '').toLowerCase().includes(q)
      );
    });
  }, [records, search, showInactive]);

  const handleToggleActive = async (rec: SpecMasterRecord) => {
    if (!canModify) return;
    try {
      const s = createClient();
      const { error } = await s
        .from('material_spec_master')
        .update({ is_active: !rec.is_active, updated_at: new Date().toISOString() })
        .eq('id', rec.id);
      if (error) {
        if (error.message?.includes('permission denied') || error.code === '42501') {
          setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, is_active: !r.is_active } : r)));
          toast.info(`"${rec.spec_full}" ${rec.is_active ? 'deactivated' : 'activated'} in session.`);
          return;
        }
        throw error;
      }
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, is_active: !r.is_active } : r)));
      toast.success(`"${rec.spec_full}" ${rec.is_active ? 'deactivated' : 'activated'}.`);
    } catch (err: any) {
      toast.error(`Toggle failed: ${err.message || err}`);
    }
  };

  const handleSaved = (saved: SpecMasterRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id || r.spec_key === saved.spec_key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved].sort((a, b) => a.spec_full.localeCompare(b.spec_full));
    });
    setEditTarget(null);
    setIsNewMode(false);
    setIsReadOnlyView(false);
  };

  const handleDeleted = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeleteTarget(null);
  };

  const activeCount = records.filter((r) => r.is_active).length;
  const inactiveCount = records.filter((r) => !r.is_active).length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      {/* Modals */}
      {(editTarget || isNewMode) && (
        <SpecEditModal
          rec={editTarget ?? EMPTY_RECORD}
          isNew={isNewMode}
          readOnly={isReadOnlyView}
          onClose={() => { setEditTarget(null); setIsNewMode(false); setIsReadOnlyView(false); }}
          onSaved={handleSaved}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          rec={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#004f84] rounded-xl shadow-md">
              <Beaker className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-800">Material Spec Master</h1>
                {!canModify && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                    <Lock className="w-3 h-3 text-amber-600" />
                    Read-Only
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage grades and specifications available across Process Sheets and Work Orders
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={loadRecords}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-100 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canModify && (
              <button
                onClick={() => { setEditTarget(null); setIsReadOnlyView(false); setIsNewMode(true); }}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#004f84] rounded-xl hover:bg-[#003b63] transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Spec
              </button>
            )}
          </div>
        </div>

        {/* Supabase Permissions Notice Banner */}
        {dbPermissionError && (
          <div className="mt-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  Supabase Database Table Permissions Required
                </h3>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  PostgreSQL returned <span className="font-semibold text-amber-950">permission denied for table material_spec_master</span>.
                  Standard plant specifications are loaded in fallback mode below. To enable cloud database persistence, run this command in your Supabase SQL Editor:
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <code className="bg-white border border-amber-300 text-slate-900 font-mono text-xs px-2.5 py-1 rounded-md select-all">
                    GRANT ALL ON TABLE public.material_spec_master TO anon, authenticated, service_role;
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('GRANT ALL ON TABLE public.material_spec_master TO anon, authenticated, service_role;');
                      setCopiedSql(true);
                      toast.success('SQL copied! Paste and run it in Supabase SQL Editor.');
                      setTimeout(() => setCopiedSql(false), 3000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied!' : 'Copy SQL Fix'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadRecords}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Connection</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
            <Layers className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-lg font-black text-slate-800">{records.length}</p>
              <p className="text-[10px] text-slate-500 font-semibold">Total Specs</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-lg font-black text-emerald-700">{activeCount}</p>
              <p className="text-[10px] text-slate-500 font-semibold">Active</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
            <XCircle className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-lg font-black text-slate-500">{inactiveCount}</p>
              <p className="text-[10px] text-slate-500 font-semibold">Inactive</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by spec key, name, or steel grade..."
            className="w-full pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 bg-slate-50 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
          />
        </div>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border-2 transition-colors whitespace-nowrap ${
            showInactive
              ? 'bg-slate-800 border-slate-800 text-white'
              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {showInactive ? 'Showing Inactive' : 'Show Inactive'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-sm font-semibold">Loading specifications...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <FlaskConical className="w-10 h-10 mb-3" />
            <p className="text-sm font-bold">No specifications found</p>
            <p className="text-xs mt-1">
              {search ? 'Try adjusting your search' : 'Click "Add New Spec" to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Key</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Specification / Grade</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-center">SMYS (MPa)</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-center">UTS (MPa)</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-center">Elong.</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Colour (Pipe / RM)</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-center">Wall</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-center">Active</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec) => (
                  <SpecRow
                    key={rec.id}
                    rec={rec}
                    canModify={canModify}
                    onEdit={(r) => { setEditTarget(r); setIsReadOnlyView(false); setIsNewMode(false); }}
                    onView={(r) => { setEditTarget(r); setIsReadOnlyView(true); setIsNewMode(false); }}
                    onDelete={setDeleteTarget}
                    onToggleActive={handleToggleActive}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 font-semibold">
            Showing {filtered.length} of {records.length} specifications
            {search && ` · filtered by "${search}"`}
          </div>
        )}
      </div>
    </div>
  );
}

