'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Recycle, ArrowRight, DollarSign, Trash2, Search, Filter, AlertCircle, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export interface OffcutRecord {
  id: string;
  source_wo_id: string;
  source_wo_no: string;
  customer_name?: string;
  grade?: string;
  size_od?: number;
  size_wt?: number;
  length_mtr: number;
  pcs: number;
  total_mtr: number;
  weight_mt?: number;
  work_center: string;
  created_at: string;
  status: 'ACTIVE' | 'COMMERCIAL' | 'SCRAPPED' | 'DIVERTED';
}

interface OffcutPoolManagerProps {
  onDivertRemnant: (remnant: OffcutRecord) => void;
  canManagePlans: boolean;
}

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function OffcutPoolManager({ onDivertRemnant, canManagePlans }: OffcutPoolManagerProps) {
  const [remnants, setRemnants] = useState<OffcutRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');

  const loadRemnants = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      // Query diversion plans that generated remnants or rejection declarations with off-cuts
      const { data, error } = await supabase
        .from('diversion_plans')
        .select(`
          id,
          source_wo_id,
          diverted_qty,
          reason,
          created_at,
          work_center,
          work_orders!diversion_plans_source_wo_id_fkey (
            work_order_no,
            customer_name,
            grade,
            size_od,
            size_wt
          )
        `)
        .ilike('reason', '%OFFCUT_REMNANT%')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Could not query offcut records directly, falling back:', error.message);
      }

      const parsed: OffcutRecord[] = ((data ?? []) as any[]).map((row) => {
        const match = row.reason?.match(/\[OFFCUT_REMNANT:\s*([\d.]+)\s*m(?:\s*x\s*(\d+))?\]/i);
        const len = match ? Number(match[1]) : 3.0;
        const pcs = match && match[2] ? Number(match[2]) : 1;
        const total = Number((len * pcs).toFixed(2));
        const wo = row.work_orders || {};
        const od = Number(wo.size_od || 0);
        const wt = Number(wo.size_wt || 0);
        const mt = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * total : 0;

        return {
          id: row.id,
          source_wo_id: row.source_wo_id,
          source_wo_no: wo.work_order_no || 'WO-N/A',
          customer_name: wo.customer_name || 'Generic Customer',
          grade: wo.grade || 'Grade N/A',
          size_od: od,
          size_wt: wt,
          length_mtr: len,
          pcs,
          total_mtr: total,
          weight_mt: Number(mt.toFixed(3)),
          work_center: row.work_center || 'BAND_SAW',
          created_at: row.created_at ? row.created_at.slice(0, 10) : 'Recent',
          status: 'ACTIVE',
        };
      });

      setRemnants(parsed);
    } catch (err: any) {
      toast.error('Failed to load remnants pool: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRemnants();
  }, [loadRemnants]);

  const filtered = useMemo(() => {
    return remnants.filter((r) => {
      if (statusFilter === 'ACTIVE' && r.status !== 'ACTIVE') return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.source_wo_no.toLowerCase().includes(q) ||
        (r.customer_name && r.customer_name.toLowerCase().includes(q)) ||
        (r.grade && r.grade.toLowerCase().includes(q))
      );
    });
  }, [remnants, search, statusFilter]);

  const handleCommercialDowngrade = async (remnant: OffcutRecord) => {
    if (!canManagePlans) return;
    if (!confirm(`Declare ${remnant.total_mtr}m (${remnant.pcs} pcs) of WO ${remnant.source_wo_no} as Secondary Commercial Sale?`)) return;

    try {
      const supabase = createClient();
      await supabase.from('rejection_declarations').insert({
        work_order_id: remnant.source_wo_id,
        stage_code: remnant.work_center,
        disposition_type: 'COMMERCIAL',
        declared_mtr: remnant.total_mtr,
        declared_pcs: remnant.pcs,
        reason: `Commercial sale from offcut remnant ${remnant.id} (${remnant.length_mtr}m)`,
      });
      toast.success(`Remnant ${remnant.id} declared as Commercial Secondary.`);
      await loadRemnants();
    } catch (err: any) {
      toast.error('Failed to update remnant: ' + err.message);
    }
  };

  const handleScrapCondemn = async (remnant: OffcutRecord) => {
    if (!canManagePlans) return;
    if (!confirm(`Condemn ${remnant.total_mtr}m of WO ${remnant.source_wo_no} to Melt Loss Scrap?`)) return;

    try {
      const supabase = createClient();
      await supabase.from('rejection_declarations').insert({
        work_order_id: remnant.source_wo_id,
        stage_code: remnant.work_center,
        disposition_type: 'SCRAP',
        declared_mtr: remnant.total_mtr,
        declared_pcs: remnant.pcs,
        reason: `Scrapped remnant ${remnant.id} (${remnant.length_mtr}m)`,
      });
      toast.success(`Remnant ${remnant.id} condemned to Scrap.`);
      await loadRemnants();
    } catch (err: any) {
      toast.error('Failed to condemn remnant: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
            <Recycle className="h-4 w-4 text-emerald-600" />
            Usable Off-cuts &amp; Remnants Pool (Rule 5C: &ge; 3.0m)
          </h3>
          <p className="text-slate-500 text-xs">
            Physical remnants available for fast 1-click reallocation or secondary commercial sale.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search WO, customer, grade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs min-h-[38px]"
            />
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'ACTIVE' ? 'ALL' : 'ACTIVE'))}
            className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-semibold cursor-pointer min-h-[38px] ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            {statusFilter === 'ACTIVE' ? 'Active Pool' : 'All Records'}
          </button>
        </div>
      </div>

      {/* Main Content: Mobile Card View + Desktop Table */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-lg border border-slate-200">
          Loading off-cuts inventory pool...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-lg border border-slate-200 text-xs space-y-1">
          <Layers className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-700">No active off-cuts currently in pool.</p>
          <p className="text-slate-400">
            When mother pipes are cut in "Cut &amp; Divert" mode, remnants &ge; 3.0m will automatically register here.
          </p>
        </div>
      ) : (
        <>
          {/* 1. Mobile Cards (< 768px) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((rem) => (
              <div key={rem.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-mono font-bold text-xs text-[#0078d4]">
                      {rem.source_wo_no}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                      {rem.customer_name}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                    {rem.length_mtr} m / pc
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">Size &amp; Grade</span>
                    <span className="font-semibold text-slate-800">
                      {rem.size_od}×{rem.size_wt}mm ({rem.grade})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">Available Qty</span>
                    <span className="font-bold text-slate-900">
                      {rem.pcs} pcs ({rem.total_mtr}m · {rem.weight_mt} MT)
                    </span>
                  </div>
                </div>

                {/* Mobile Action Buttons */}
                {canManagePlans && (
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDivertRemnant(rem)}
                      className="flex-1 min-h-[40px] rounded bg-[#0078d4] hover:bg-[#106ebe] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Divert to Order
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCommercialDowngrade(rem)}
                      title="Declare Commercial Sale"
                      className="min-h-[40px] px-3 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold inline-flex items-center justify-center cursor-pointer"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleScrapCondemn(rem)}
                      title="Condemn to Scrap"
                      className="min-h-[40px] px-3 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold inline-flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 2. Desktop Table (>= 768px) */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left">Source WO #</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Grade</th>
                  <th className="px-3 py-2 text-left">Size (OD×WT)</th>
                  <th className="px-3 py-2 text-right">Length (m/pc)</th>
                  <th className="px-3 py-2 text-right">Available Pcs</th>
                  <th className="px-3 py-2 text-right">Total Meters</th>
                  <th className="px-3 py-2 text-right">Weight (MT)</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((rem) => (
                  <tr key={rem.id} className="hover:bg-slate-50 font-mono">
                    <td className="px-3 py-2.5 font-bold text-[#0078d4]">{rem.source_wo_no}</td>
                    <td className="px-3 py-2.5 font-sans text-slate-700 max-w-[140px] truncate" title={rem.customer_name}>
                      {rem.customer_name}
                    </td>
                    <td className="px-3 py-2.5 font-sans font-semibold text-slate-800">{rem.grade}</td>
                    <td className="px-3 py-2.5 text-slate-800">{rem.size_od}×{rem.size_wt}mm</td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-800">{rem.length_mtr} m</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900">{rem.pcs}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900">{rem.total_mtr} m</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{rem.weight_mt} MT</td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      {canManagePlans ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDivertRemnant(rem)}
                            className="inline-flex items-center gap-1 rounded bg-[#0078d4] hover:bg-[#106ebe] text-white px-2.5 py-1 text-xs font-semibold cursor-pointer shadow-2xs"
                          >
                            <ArrowRight className="h-3 w-3" />
                            Divert
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCommercialDowngrade(rem)}
                            title="Declare Commercial Sale"
                            className="inline-flex items-center rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 text-xs font-semibold cursor-pointer"
                          >
                            <DollarSign className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleScrapCondemn(rem)}
                            title="Condemn to Scrap"
                            className="inline-flex items-center rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 px-2 py-1 text-xs font-semibold cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">View Only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
