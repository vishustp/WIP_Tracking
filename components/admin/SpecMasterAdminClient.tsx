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
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SpecMasterRecord {
  id: string;
  spec_key: string;
  spec_full: string;
  steel_grade: string | null;
  smys_mpa: number | null;
  uts_mpa: number | null;
  elongation_pct: number | null;
  hardness: string | null;
  straightness: string | null;
  color_spec: string | null;
  rm_color: string | null;
  whf_temp: string | null;
  induction_temp: string | null;
  sizing_outlet_temp: string | null;
  ht_cycle: string | null;
  ht_condition: string | null;
  ndt: string | null;
  holding_time_sec: number | null;
  coating: string | null;
  end_condition: string | null;
  bundling: string | null;
  end_cap: string | null;
  is_min_wall: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

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
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-bold text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-colors"
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
  onClose,
  onSaved,
}: {
  rec: Partial<SpecMasterRecord>;
  isNew: boolean;
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
    whf_temp: rec.whf_temp ?? '',
    induction_temp: rec.induction_temp ?? '',
    sizing_outlet_temp: rec.sizing_outlet_temp ?? '',
    ht_cycle: rec.ht_cycle ?? 'NA',
    ht_condition: rec.ht_condition ?? 'AS ROLLED / HFS',
    ndt: rec.ndt ?? 'UT',
    holding_time_sec: rec.holding_time_sec ?? 5,
    coating: rec.coating ?? 'BLACK VARNISH',
    end_condition: rec.end_condition ?? 'BEVEL END (30\u00b0-35\u00b0)',
    bundling: rec.bundling ?? 'HEXAGONAL',
    end_cap: rec.end_cap ?? 'PLASTIC PROTECTOR',
    is_min_wall: rec.is_min_wall ?? false,
    is_active: rec.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const numericFields = new Set(['smys_mpa', 'uts_mpa', 'elongation_pct', 'holding_time_sec']);

  const set = (key: keyof typeof form) => (val: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: numericFields.has(key) ? (val === '' ? null : Number(val)) : val,
    }));
  };

  const handleSubmit = async () => {
    if (!form.spec_key.trim() || !form.spec_full.trim()) {
      toast.error('Spec Key and Full Name are required.');
      return;
    }
    setSaving(true);
    try {
      const s = createClient();
      const payload = { ...form, updated_at: new Date().toISOString() };

      let result: any;
      if (isNew) {
        const { data, error } = await s
          .from('material_spec_master')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await s
          .from('material_spec_master')
          .update(payload)
          .eq('id', rec.id!)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      toast.success(`"${form.spec_full}" ${isNew ? 'created' : 'updated'} successfully!`);
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
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-700 to-indigo-900 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                {isNew ? 'Add New Specification' : `Edit: ${rec.spec_key}`}
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5">Material Spec Master Table</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-2 max-h-[75vh] overflow-y-auto">
          {/* Identity */}
          <SectionHeader title="Identification" icon={Layers} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Spec Key"
              value={form.spec_key}
              onChange={set('spec_key')}
              placeholder="e.g. A106, A210, BS3059_320"
              required
              hint="Short unique key, no spaces"
            />
            <FieldInput
              label="Full Specification Name"
              value={form.spec_full}
              onChange={set('spec_full')}
              placeholder="e.g. ASTM A106 Gr B (IBR)"
              required
            />
            <FieldInput label="Steel Grade" value={form.steel_grade} onChange={set('steel_grade')} placeholder="e.g. SAE 1018 / 15C8 RS-03" />
            <div className="grid grid-cols-2 gap-3">
              <FieldInput label="Pipe Colour Code" value={form.color_spec} onChange={set('color_spec')} placeholder="WHITE" />
              <FieldInput label="RM Billet Colour" value={form.rm_color} onChange={set('rm_color')} placeholder="YELLOW + WHITE" />
            </div>
          </div>

          {/* Mechanical Properties */}
          <SectionHeader title="Mechanical Properties" icon={Gauge} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FieldInput label="SMYS (MPa)" value={form.smys_mpa} onChange={set('smys_mpa')} type="number" placeholder="240" />
            <FieldInput label="UTS Min (MPa)" value={form.uts_mpa} onChange={set('uts_mpa')} type="number" placeholder="415" />
            <FieldInput label="Elongation Min (%)" value={form.elongation_pct} onChange={set('elongation_pct')} type="number" placeholder="21" />
            <FieldInput label="Hardness Max" value={form.hardness} onChange={set('hardness')} placeholder="79 HRB MAX" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <FieldInput label="Straightness" value={form.straightness} onChange={set('straightness')} placeholder="1:1000" />
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Wall Type</label>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, is_min_wall: !p.is_min_wall }))}
                className={`mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
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

          {/* Thermal */}
          <SectionHeader title="Thermal Parameters" icon={Thermometer} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldInput label="WHF Temperature" value={form.whf_temp} onChange={set('whf_temp')} placeholder="1220 C (+/- 40 C)" />
            <FieldInput label="Induction Furnace Temp" value={form.induction_temp} onChange={set('induction_temp')} placeholder="850 C - 880 C" />
            <FieldInput label="Sizing Mill Outlet Temp" value={form.sizing_outlet_temp} onChange={set('sizing_outlet_temp')} placeholder="880 C TO 900 C" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="HT Cycle" value={form.ht_cycle} onChange={set('ht_cycle')} placeholder="NA / NORMALIZED & TEMPERED" />
            <FieldInput label="HT Condition" value={form.ht_condition} onChange={set('ht_condition')} placeholder="AS ROLLED / HFS" />
          </div>

          {/* Testing */}
          <SectionHeader title="Testing & Inspection" icon={ShieldCheck} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="NDT Method" value={form.ndt} onChange={set('ndt')} placeholder="UT / ET / MT" />
            <FieldInput label="Holding Time (sec)" value={form.holding_time_sec} onChange={set('holding_time_sec')} type="number" placeholder="5" />
          </div>

          {/* Finishing */}
          <SectionHeader title="Coating & Finishing" icon={Package} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="Coating" value={form.coating} onChange={set('coating')} placeholder="BLACK VARNISH" />
            <FieldInput label="End Condition" value={form.end_condition} onChange={set('end_condition')} placeholder="BEVEL END (30-35)" />
            <FieldInput label="Bundling" value={form.bundling} onChange={set('bundling')} placeholder="HEXAGONAL" />
            <FieldInput label="End Cap" value={form.end_cap} onChange={set('end_cap')} placeholder="PLASTIC PROTECTOR" />
          </div>

          {/* Active Flag */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-700">Active Status</p>
              <p className="text-[10px] text-slate-500">Inactive specs are hidden from the Process Sheet dropdown</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
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
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-60 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : isNew ? 'Create Spec' : 'Save Changes'}
          </button>
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
      if (error) throw error;
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
  onDelete,
  onToggleActive,
}: {
  rec: SpecMasterRecord;
  onEdit: (r: SpecMasterRecord) => void;
  onDelete: (r: SpecMasterRecord) => void;
  onToggleActive: (r: SpecMasterRecord) => void;
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
        <button onClick={() => onToggleActive(rec)} title={rec.is_active ? 'Click to deactivate' : 'Click to activate'} className="cursor-pointer">
          {rec.is_active ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
          ) : (
            <XCircle className="w-4 h-4 text-slate-400 mx-auto" />
          )}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onEdit(rec)}
            className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-600 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(rec)}
            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SpecMasterAdminClient() {
  const [records, setRecords] = useState<SpecMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editTarget, setEditTarget] = useState<SpecMasterRecord | null>(null);
  const [isNewMode, setIsNewMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SpecMasterRecord | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const s = createClient();
      const { data, error } = await s
        .from('material_spec_master')
        .select('*')
        .order('spec_full', { ascending: true });
      if (error) throw error;
      setRecords((data as SpecMasterRecord[]) || []);
    } catch (err: any) {
      toast.error(`Failed to load specs: ${err.message || err}`);
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
    try {
      const s = createClient();
      const { error } = await s
        .from('material_spec_master')
        .update({ is_active: !rec.is_active, updated_at: new Date().toISOString() })
        .eq('id', rec.id);
      if (error) throw error;
      setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, is_active: !r.is_active } : r)));
      toast.success(`"${rec.spec_full}" ${rec.is_active ? 'deactivated' : 'activated'}.`);
    } catch (err: any) {
      toast.error(`Toggle failed: ${err.message || err}`);
    }
  };

  const handleSaved = (saved: SpecMasterRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved].sort((a, b) => a.spec_full.localeCompare(b.spec_full));
    });
    setEditTarget(null);
    setIsNewMode(false);
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
          onClose={() => { setEditTarget(null); setIsNewMode(false); }}
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
            <div className="p-3 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl shadow-md">
              <Beaker className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800">Material Spec Master</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage grades and specifications available in the Process Sheet dropdown
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={loadRecords}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => { setEditTarget(null); setIsNewMode(true); }}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-700 rounded-xl hover:bg-indigo-800 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Spec
            </button>
          </div>
        </div>

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
                    onEdit={(r) => { setEditTarget(r); setIsNewMode(false); }}
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

