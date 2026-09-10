'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Save, X, RefreshCw } from 'lucide-react';

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
}

const EMPTY_FORM: Omit<SpecMasterRecord, 'id'> = {
  spec_key: '',
  spec_full: '',
  steel_grade: '',
  smys_mpa: null,
  uts_mpa: null,
  elongation_pct: null,
  hardness: '79 HRB MAX',
  straightness: '1:1000',
  color_spec: 'WHITE',
  rm_color: 'YELLOW + WHITE',
  whf_temp: '1220 C (+/- 40 C)',
  induction_temp: '850 C - 880 C',
  sizing_outlet_temp: '880 C TO 900 C',
  ht_cycle: 'NA',
  ht_condition: 'AS ROLLED / HFS',
  ndt: 'UT',
  holding_time_sec: 5,
  coating: 'BLACK VARNISH',
  end_condition: 'BEVEL END (30-35 deg) ROOT FACE (0.8 - 2.4MM)',
  bundling: 'HEXAGONAL',
  end_cap: 'PLASTIC PROTECTOR',
  is_min_wall: false,
  is_active: true,
};

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  name: string;
  value: string | number | null;
  onChange: (name: string, val: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
      />
    </div>
  );
}

export default function SpecMasterAdminClient() {
  const [records, setRecords] = useState<SpecMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SpecMasterRecord, 'id'>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const s = createClient();
    const { data, error } = await s
      .from('material_spec_master')
      .select('*')
      .order('spec_full', { ascending: true });
    if (!error && data) setRecords(data as SpecMasterRecord[]);
    else toast.error('Failed to load: ' + error?.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleField = (name: string, val: string) => {
    setForm((prev) => ({
      ...prev,
      [name]: ['smys_mpa', 'uts_mpa', 'elongation_pct', 'holding_time_sec'].includes(name)
        ? val === '' ? null : Number(val)
        : val,
    }));
  };

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (rec: SpecMasterRecord) => {
    setEditId(rec.id);
    const { id, ...rest } = rec;
    setForm(rest);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.spec_key.trim() || !form.spec_full.trim()) {
      toast.error('Spec Key and Spec Full Name are required.');
      return;
    }
    setSaving(true);
    const s = createClient();
    let error;
    if (editId) {
      ({ error } = await s.from('material_spec_master').update(form).eq('id', editId));
    } else {
      ({ error } = await s.from('material_spec_master').insert(form));
    }
    setSaving(false);
    if (error) {
      toast.error('Save failed: ' + error.message);
    } else {
      toast.success(editId ? 'Specification updated!' : 'Specification added!');
      setShowForm(false);
      load();
    }
  };

  const toggleActive = async (rec: SpecMasterRecord) => {
    const s = createClient();
    const { error } = await s
      .from('material_spec_master')
      .update({ is_active: !rec.is_active })
      .eq('id', rec.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${rec.spec_full} ${rec.is_active ? 'deactivated' : 'activated'}`);
      load();
    }
  };

  const handleDelete = async (rec: SpecMasterRecord) => {
    if (!confirm(`Delete "${rec.spec_full}"? This cannot be undone.`)) return;
    const s = createClient();
    const { error } = await s.from('material_spec_master').delete().eq('id', rec.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Deleted');
      load();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Material Specification Master</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage grade/specification data used by the Process Sheet dropdown</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
              <RefreshCw size={12} />Refresh
            </button>
            <button onClick={openNew} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer">
              <Plus size={12} />Add Specification
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-bold text-slate-600">Spec Key</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-600">Full Name</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-600">Steel Grade</th>
                  <th className="px-3 py-2 text-right font-bold text-slate-600">YST</th>
                  <th className="px-3 py-2 text-right font-bold text-slate-600">UTS</th>
                  <th className="px-3 py-2 text-right font-bold text-slate-600">El%</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-600">Color</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-600">NDT</th>
                  <th className="px-3 py-2 text-center font-bold text-slate-600">Min Wall</th>
                  <th className="px-3 py-2 text-center font-bold text-slate-600">Active</th>
                  <th className="px-3 py-2 text-center font-bold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${!rec.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 font-mono font-bold text-indigo-700">{rec.spec_key}</td>
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{rec.spec_full}</td>
                    <td className="px-3 py-2 text-slate-600">{rec.steel_grade}</td>
                    <td className="px-3 py-2 text-right font-mono">{rec.smys_mpa}</td>
                    <td className="px-3 py-2 text-right font-mono">{rec.uts_mpa}</td>
                    <td className="px-3 py-2 text-right font-mono">{rec.elongation_pct}</td>
                    <td className="px-3 py-2 text-slate-600">{rec.color_spec}</td>
                    <td className="px-3 py-2 text-slate-600">{rec.ndt}</td>
                    <td className="px-3 py-2 text-center">
                      {rec.is_min_wall
                        ? <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">YES</span>
                        : <span className="text-[10px] text-slate-400">NO</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleActive(rec)} className="cursor-pointer">
                        {rec.is_active
                          ? <ToggleRight size={18} className="text-green-500" />
                          : <ToggleLeft size={18} className="text-slate-400" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(rec)} className="p-1 rounded hover:bg-indigo-50 text-indigo-500 cursor-pointer"><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(rec)} className="p-1 rounded hover:bg-red-50 text-red-500 cursor-pointer"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">No specifications found. Run the SQL migration first.</div>
            )}
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-end" onClick={() => setShowForm(false)}>
            <div className="h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
                <h2 className="text-sm font-bold text-slate-800">{editId ? 'Edit Specification' : 'Add New Specification'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded cursor-pointer"><X size={16} className="text-slate-500" /></button>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Identification</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Spec Key (unique)" name="spec_key" value={form.spec_key} onChange={handleField} />
                    <Field label="Steel Grade" name="steel_grade" value={form.steel_grade} onChange={handleField} />
                  </div>
                  <div className="mt-2"><Field label="Full Specification Name" name="spec_full" value={form.spec_full} onChange={handleField} /></div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Mechanical Properties</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="YST Min (MPa)" name="smys_mpa" value={form.smys_mpa} onChange={handleField} type="number" />
                    <Field label="UTS Min (MPa)" name="uts_mpa" value={form.uts_mpa} onChange={handleField} type="number" />
                    <Field label="Elongation (%)" name="elongation_pct" value={form.elongation_pct} onChange={handleField} type="number" />
                    <Field label="Hardness" name="hardness" value={form.hardness} onChange={handleField} />
                    <Field label="Straightness" name="straightness" value={form.straightness} onChange={handleField} />
                    <div className="flex flex-col gap-0.5 justify-center">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Min Wall?</label>
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input type="checkbox" checked={form.is_min_wall} onChange={(e) => setForm((p) => ({ ...p, is_min_wall: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                        <span className="text-xs text-slate-700">Yes (SA210, BS3059 etc.)</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Colour Codes</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Pipe Colour" name="color_spec" value={form.color_spec} onChange={handleField} />
                    <Field label="RM / Billet Colour" name="rm_color" value={form.rm_color} onChange={handleField} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Thermal Parameters</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="WHF Temp" name="whf_temp" value={form.whf_temp} onChange={handleField} />
                    <Field label="Induction Furnace Temp" name="induction_temp" value={form.induction_temp} onChange={handleField} />
                    <Field label="Sizing Mill Outlet Temp" name="sizing_outlet_temp" value={form.sizing_outlet_temp} onChange={handleField} />
                    <Field label="HT Cycle" name="ht_cycle" value={form.ht_cycle} onChange={handleField} />
                  </div>
                  <div className="mt-2"><Field label="HT Condition" name="ht_condition" value={form.ht_condition} onChange={handleField} /></div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Testing</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="NDT Method" name="ndt" value={form.ndt} onChange={handleField} />
                    <Field label="Holding Time (sec)" name="holding_time_sec" value={form.holding_time_sec} onChange={handleField} type="number" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Finishing & Packaging</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Coating" name="coating" value={form.coating} onChange={handleField} />
                    <Field label="End Condition" name="end_condition" value={form.end_condition} onChange={handleField} />
                    <Field label="Bundling" name="bundling" value={form.bundling} onChange={handleField} />
                    <Field label="End Cap" name="end_cap" value={form.end_cap} onChange={handleField} />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">Active (show in dropdown)</span>
                  </label>
                </div>
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 cursor-pointer">
                  <Save size={12} />{saving ? 'Saving...' : 'Save Specification'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
