'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fmt, n, mtFromMtr, extractBandSawCutsFromRemarks } from '@/lib/productionUtils';
import { getCurrentAppUser } from '@/lib/users/client';
import type { AppUserProfile } from '@/lib/users/types';
import type { Row, ProductionEntry } from '@/types';
import {
  Scissors,
  Search,
  RefreshCw,
  Layers,
  ArrowRight,
  TrendingUp,
  History,
  Calendar,
  Filter,
  CheckCircle2,
  Trash2,
  Edit2,
  AlertTriangle,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BandSawCuttingModal } from '@/components/production/modals/BandSawCuttingModal';
import { DeleteEntryModal } from '@/components/production/modals/DeleteEntryModal';
import { toast } from 'sonner';

export default function BandSawCuttingClient() {
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [queueRows, setQueueRows] = useState<Row[]>([]);
  const [historyEntries, setHistoryEntries] = useState<ProductionEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRowForCut, setSelectedRowForCut] = useState<Row | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Delete modal state
  const [deletingEntry, setDeletingEntry] = useState<ProductionEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load user
  useEffect(() => {
    async function loadUser() {
      try {
        const u = await getCurrentAppUser();
        setCurrentUser(u);
      } catch (e) {
        console.error('Failed to load current user', e);
      }
    }
    loadUser();
  }, []);

  // Fetch Band Saw Queue and Production History
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);

      // Fetch queue
      const queueRes = await fetch('/api/production/queue?stage=BAND_SAW', {
        cache: 'no-store',
      });
      const queueData = await queueRes.json();
      if (queueData?.data && Array.isArray(queueData.data)) {
        setQueueRows(queueData.data);
      }

      // Fetch stages to find BAND_SAW stage id
      const { data: stages } = await supabase
        .from('process_stages')
        .select('id, stage_code')
        .eq('stage_code', 'BAND_SAW');

      const bandSawStageId = stages?.[0]?.id;

      if (bandSawStageId) {
        const { data: logsData, error: logsErr } = await supabase
          .from('production_logs')
          .select(
            `id, work_order_id, stage_id, process_route_id, process_date, input_qty, output_qty, rejection_qty, heat_lot_no, remarks, created_at,
             work_orders (id, work_order_no, customer_name, grade, size_od, size_wt, l1, l2, avg_length),
             process_routes (id, route_code, route_name)`
          )
          .eq('stage_id', bandSawStageId)
          .order('created_at', { ascending: false })
          .limit(200);

        if (!logsErr && logsData) {
          const mapped: ProductionEntry[] = logsData.map((l: any) => {
            const wo = l.work_orders || {};
            const pr = l.process_routes || {};
            return {
              id: l.id,
              work_order_id: l.work_order_id,
              work_order_no: wo.work_order_no || 'N/A',
              customer_name: wo.customer_name || null,
              grade: wo.grade || null,
              specification: wo.grade || null,
              route_code: pr.route_code || 'CDS',
              stage_code: 'BAND_SAW',
              process_date: l.process_date,
              od: Number(wo.size_od || 0),
              wl: Number(wo.size_wt || 0),
              l1: Number(wo.l1 || 0),
              l2: Number(wo.l2 || 0),
              avg_length: Number(wo.avg_length || 6),
              input_qty: Number(l.input_qty || 0),
              output_mtr: Number(l.output_qty || 0),
              rejection_mtr: Number(l.rejection_qty || 0),
              heat_lot_no: l.heat_lot_no,
              remarks: l.remarks,
              created_at: l.created_at,
            };
          });
          setHistoryEntries(mapped);
        }
      }
    } catch (err) {
      console.error('Failed to load band saw data:', err);
      toast.error('Failed to load Band Saw queue data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered Queue Rows
  const filteredQueue = useMemo(() => {
    if (!searchTerm.trim()) return queueRows;
    const term = searchTerm.toLowerCase();
    return queueRows.filter(
      (r) =>
        r.work_order_no.toLowerCase().includes(term) ||
        (r.customer_name || '').toLowerCase().includes(term) ||
        (r.specification || '').toLowerCase().includes(term)
    );
  }, [queueRows, searchTerm]);

  // Filtered History Entries
  const filteredHistory = useMemo(() => {
    if (!searchTerm.trim()) return historyEntries;
    const term = searchTerm.toLowerCase();
    return historyEntries.filter(
      (e) =>
        e.work_order_no.toLowerCase().includes(term) ||
        (e.customer_name || '').toLowerCase().includes(term) ||
        (e.heat_lot_no || '').toLowerCase().includes(term)
    );
  }, [historyEntries, searchTerm]);

  // KPI Metrics
  const totalAvailablePcs = useMemo(
    () => queueRows.reduce((sum, r) => sum + Number(r.balance_to_make_pcs || 0), 0),
    [queueRows]
  );
  const totalAvailableMt = useMemo(
    () => queueRows.reduce((sum, r) => sum + Number(r.balance_to_make_mt || 0), 0),
    [queueRows]
  );

  const todayCutPcs = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return historyEntries
      .filter((e) => e.process_date === todayStr)
      .reduce((sum, e) => {
        const { cuts } = extractBandSawCutsFromRemarks(e.remarks);
        const cutCount = cuts?.reduce((s, c) => s + Number(c.pcs || 0), 0);
        return sum + (cutCount || (e.avg_length && e.output_mtr ? Math.round(e.output_mtr / e.avg_length) : 0));
      }, 0);
  }, [historyEntries]);

  const todayCutMt = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return historyEntries
      .filter((e) => e.process_date === todayStr)
      .reduce((sum, e) => sum + mtFromMtr(Number(e.output_mtr || 0), Number(e.od || 0), Number(e.wl || 0)), 0);
  }, [historyEntries]);

  const todayScrapMt = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return historyEntries
      .filter((e) => e.process_date === todayStr)
      .reduce((sum, e) => {
        const { scrapMt } = extractBandSawCutsFromRemarks(e.remarks);
        if (scrapMt !== null && scrapMt !== undefined) {
          return sum + Number(scrapMt);
        }
        return sum + mtFromMtr(Number(e.rejection_mtr || 0), Number(e.od || 0), Number(e.wl || 0));
      }, 0);
  }, [historyEntries]);

  const totalHistoryScrapMt = useMemo(() => {
    return historyEntries.reduce((sum, e) => {
      const { scrapMt } = extractBandSawCutsFromRemarks(e.remarks);
      if (scrapMt !== null && scrapMt !== undefined) {
        return sum + Number(scrapMt);
      }
      return sum + mtFromMtr(Number(e.rejection_mtr || 0), Number(e.od || 0), Number(e.wl || 0));
    }, 0);
  }, [historyEntries]);

  const avgYieldPct = useMemo(() => {
    const validYields = historyEntries
      .map((e) => extractBandSawCutsFromRemarks(e.remarks).yieldPct)
      .filter((y): y is number => y !== null && y > 0);
    if (validYields.length === 0) return 96.5;
    return validYields.reduce((a, b) => a + b, 0) / validYields.length;
  }, [historyEntries]);

  // Handlers
  const handleOpenCutModal = (row: Row) => {
    setSelectedRowForCut(row);
    setModalOpen(true);
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('production_logs').delete().eq('id', deletingEntry.id);
      if (error) throw error;
      toast.success('Band Saw cut log deleted successfully.');
      setDeletingEntry(null);
      fetchData();
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err?.message || 'Failed to delete cut entry.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header Banner - Light Theme */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Scissors size={22} className="rotate-90" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                  Band Saw Work Center
                </span>
                <span className="text-xs font-semibold text-slate-500">Cutting &amp; Sizing Station</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
                Band Saw Pipe Cutting &amp; Multi-Length Hub
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Precision cutting of mother tubes into target order lengths. Total Cut Pieces feed directly into downstream VDI QC Inspection.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href="/excel-import"
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" />
              Excel Import
            </Link>

            <Button
              onClick={fetchData}
              variant="outline"
              size="sm"
              disabled={refreshing}
              className="h-9 gap-1.5 border-slate-300 bg-white text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-95 transition-all"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Light KPI Metric Cards */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          {/* Mother Pipes to Cut */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
              Mother Pipes to Cut
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-black text-indigo-950">
                {totalAvailablePcs}
              </span>
              <span className="text-xs font-bold text-indigo-700">PCS</span>
            </div>
            <div className="text-[11px] font-medium text-indigo-600 mt-1">
              {fmt(totalAvailableMt, 2)} MT available
            </div>
          </div>

          {/* Cut Produced Today */}
          <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/50 to-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-sky-800 uppercase tracking-wider">
              Cut Produced Today
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-black text-sky-950">
                {todayCutPcs}
              </span>
              <span className="text-xs font-bold text-sky-700">PCS</span>
            </div>
            <div className="text-[11px] font-medium text-sky-600 mt-1">
              {fmt(todayCutMt, 2)} MT logged today
            </div>
          </div>

          {/* Scrap Generated */}
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Scrap Generated (MT)
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-black text-amber-950">
                {fmt(todayScrapMt, 3)}
              </span>
              <span className="text-xs font-bold text-amber-700">MT</span>
            </div>
            <div className="text-[11px] font-medium text-amber-600 mt-1">
              {fmt(totalHistoryScrapMt, 2)} MT total scrap
            </div>
          </div>

          {/* Avg Cutting Yield */}
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Avg Cutting Yield
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-black text-emerald-700">
                {avgYieldPct.toFixed(1)}%
              </span>
            </div>
            <div className="text-[11px] font-medium text-emerald-600 mt-1">
              High efficiency throughput
            </div>
          </div>

          {/* Next Stage Destination */}
          <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/50 to-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
              Next Destination
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <ArrowRight size={16} className="text-purple-600 shrink-0" />
              <span className="font-mono text-base sm:text-lg font-extrabold text-purple-950">
                VDI QC Check
              </span>
            </div>
            <div className="text-[11px] font-medium text-purple-600 mt-1">
              Gated quality inspection
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scissors size={14} className="rotate-90" />
            Cutting Queue ({queueRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History size={14} />
            Cutting History ({historyEntries.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search WO #, Customer, Grade..."
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      {/* Tab 1: Cutting Queue */}
      {activeTab === 'queue' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Work Orders Ready for Cutting
              </h3>
              <p className="text-[11px] text-slate-500">
                Pipes processed from previous stage (Heat Treatment / Hollow HT / Rolling HTC OK).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Work Order</th>
                  <th className="py-3 px-3">Customer / Grade</th>
                  <th className="py-3 px-3">Pipe Size (OD × WT)</th>
                  <th className="py-3 px-3">Target Length (L1/L2)</th>
                  <th className="py-3 px-3">Feeder Source</th>
                  <th className="py-3 px-3 text-right">Available to Cut (Pcs)</th>
                  <th className="py-3 px-3 text-right">Available Meters</th>
                  <th className="py-3 px-3 text-right">Weight (MT)</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Loading Band Saw Queue...
                    </td>
                  </tr>
                ) : filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <Scissors size={24} className="mx-auto mb-2 text-slate-300 rotate-90" />
                      No work orders currently awaiting cutting in the Band Saw queue.
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((row) => {
                    const l1 = Number(row.l1 || 0);
                    const l2 = Number(row.l2 || 0);
                    const lenLabel = l1 > 0 && l2 > 0 ? `${l1}m - ${l2}m` : l1 > 0 ? `${l1}m` : '6.0m';

                    return (
                      <tr key={row.work_order_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>WO #{row.work_order_no}</span>
                            {row.route_code && (
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {row.route_code}
                              </span>
                            )}
                          </div>
                          {row.child_work_orders && row.child_work_orders.length > 0 && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-800">
                              <span>Campaign ({row.child_work_orders.length} Child WOs)</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          <div>{row.customer_name || 'Standard Order'}</div>
                          <div className="text-[11px] font-semibold text-slate-500">{row.specification || 'SAE-1018'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-800">
                          {row.od} × {row.wl} mm
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">
                          <div className="font-semibold">{lenLabel}</div>
                          {row.child_work_orders && row.child_work_orders.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {row.child_work_orders.map((c: any, i: number) => {
                                const cL1 = Number(c.l1 || 0);
                                const cL2 = Number(c.l2 || 0);
                                const cStr = cL1 > 0 && cL2 > 0 ? (cL1 === cL2 ? `${cL1}m` : `${cL1}-${cL2}m`) : cL1 > 0 ? `${cL1}m` : '6.0m';
                                return (
                                  <div key={i} className="text-[10px] text-blue-700 font-mono flex items-center gap-1">
                                    <span className="text-slate-400">↳</span>
                                    <span>#{c.work_order_no}: {cStr}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {row.feeder_source_label || 'Heat Treatment Net OK'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-700 text-sm">
                          {row.balance_to_make_pcs} PCS
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800">
                          {fmt(Number(row.balance_to_make_mtr || 0))} m
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {fmt(Number(row.balance_to_make_mt || 0), 3)} MT
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            size="sm"
                            onClick={() => handleOpenCutModal(row)}
                            className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs"
                          >
                            <Scissors size={13} className="rotate-90" />
                            Record Cutting
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Cutting History */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Band Saw Cutting Transaction Log
              </h3>
              <p className="text-[11px] text-slate-500">
                Historical records of multi-length cutting batches with output piece breakdowns.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-3">Work Order</th>
                  <th className="py-3 px-3">Pipe Size</th>
                  <th className="py-3 px-4">Multi-Length Cut Breakdown</th>
                  <th className="py-3 px-3 text-right">Total Net Cuts (Pcs)</th>
                  <th className="py-3 px-3 text-right">Net Length (Mtr)</th>
                  <th className="py-3 px-3 text-right">Weight (MT)</th>
                  <th className="py-3 px-3 text-center">Yield %</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No cutting history records found.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((entry) => {
                    const { cuts, yieldPct, offcutMtr, scrapMtr, scrapMt, scrapPct, motherPcs } =
                      extractBandSawCutsFromRemarks(entry.remarks);
                    const netPcs =
                      cuts?.reduce((s, c) => s + Number(c.pcs || 0), 0) ||
                      (entry.avg_length && entry.output_mtr ? Math.round(entry.output_mtr / entry.avg_length) : 0);
                    const entryMt = mtFromMtr(
                      Number(entry.output_mtr || 0),
                      Number(entry.od || 0),
                      Number(entry.wl || 0)
                    );

                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600">{entry.process_date}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          WO #{entry.work_order_no}
                          <div className="text-[10px] font-normal text-slate-500">
                            {entry.customer_name || 'Standard'}
                            {entry.l1 ? (
                              <span className="ml-1.5 font-mono text-amber-700 font-medium">
                                (L: {entry.l1}{entry.l2 ? `-${entry.l2}` : ''}m)
                              </span>
                            ) : entry.avg_length ? (
                              <span className="ml-1.5 font-mono text-amber-700 font-medium">
                                (L: {entry.avg_length}m)
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-800">
                          {entry.od} × {entry.wl} mm
                        </td>
                        <td className="py-3 px-4">
                          {cuts && cuts.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {cuts.map((c, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-800"
                                >
                                  {c.pcs} pcs @ {c.len}m
                                </span>
                              ))}
                              {offcutMtr && offcutMtr > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-800">
                                  Offcut: {offcutMtr}m
                                </span>
                              ) : null}
                              {scrapMt && scrapMt > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                                  Scrap: {fmt(scrapMt, 3)} MT {scrapPct ? `(${scrapPct}%)` : ''}
                                </span>
                              ) : scrapMtr && scrapMtr > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                                  Scrap: {scrapMtr}m
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">
                              {entry.output_mtr}m ({netPcs} pcs)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-700 text-sm">
                          {netPcs} PCS
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800">
                          {fmt(Number(entry.output_mtr || 0))} m
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {fmt(entryMt, 3)} MT
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              (yieldPct || 100) >= 90
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {(yieldPct || 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {currentUser?.group === 'admin' || currentUser?.group === 'super_user' || currentUser?.role === 'admin' ? (
                            <button
                              type="button"
                              onClick={() => setDeletingEntry(entry)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              title="Delete entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cutting Modal */}
      {selectedRowForCut && modalOpen && (
        <BandSawCuttingModal
          row={selectedRowForCut}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedRowForCut(null);
          }}
          onSuccess={fetchData}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingEntry && (
        <DeleteEntryModal
          targetEntry={deletingEntry}
          onClose={() => setDeletingEntry(null)}
          onConfirm={handleDeleteEntry}
          delCheck={{ allowed: true }}
          isAdmin={currentUser?.group === 'admin' || currentUser?.role === 'admin'}
          isSuperUser={currentUser?.group === 'super_user'}
          workCenter="BAND_SAW"
          busy={isDeleting}
        />
      )}
    </div>
  );
}
