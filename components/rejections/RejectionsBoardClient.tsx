// components/rejections/RejectionsBoardClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  PlusCircle,
  Search,
  RefreshCw,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ClipboardCheck,
  XCircle,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserSession } from '@/contexts/UserSessionContext';
import { RejectionDeclaration, RejectionStatus } from '@/types';
import {
  REJECTION_REASON_LABELS,
  REJECTION_STATUS_BADGES,
  REJECTION_STATUS_LABELS,
  WORK_CENTER_OPTIONS,
  canDeclareRejection,
  canVerifyRejection,
  canApproveRejection,
  RejectionFilterOptions,
  RejectionSummaryKpis,
} from '@/lib/rejections/types';
import { fetchRejections, fetchRejectionSummaryKpis } from '@/lib/rejections/client';
import DeclareRejectionModal from './DeclareRejectionModal';
import VerifyRejectionModal from './VerifyRejectionModal';
import ApproveRejectionModal from './ApproveRejectionModal';

const WORK_CENTER_COLOR_MAP: Record<string, string> = {
  ROLLING: 'bg-orange-100 text-orange-800 border-orange-200',
  HOLLOW_HEAT_TREATMENT: 'bg-amber-100 text-amber-800 border-amber-200',
  DRAW: 'bg-blue-100 text-blue-800 border-blue-200',
  PILGER: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  HEAT_TREATMENT: 'bg-rose-100 text-rose-800 border-rose-200',
  BAND_SAW: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  VDI: 'bg-purple-100 text-purple-800 border-purple-200',
  FINISHING: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function RejectionsBoardClient() {
  const { profile: currentUser } = useUserSession();

  // Data state
  const [declarations, setDeclarations] = useState<RejectionDeclaration[]>([]);
  const [kpis, setKpis] = useState<RejectionSummaryKpis>({
    pendingQcCount: 0,
    pendingPpcCount: 0,
    approvedCount: 0,
    approvedTotalMt: 0,
    approvedTotalPcs: 0,
    totalPendingHoldMtr: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modals state
  const [declareModalOpen, setDeclareModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState<RejectionDeclaration | null>(null);

  // Permissions based on user profile
  const userRole = currentUser?.role || currentUser?.role_title || '';
  const isDeclarant = canDeclareRejection(userRole);
  const isVerifier = canVerifyRejection(userRole);
  const isApprover = canApproveRejection(userRole);

  const loadData = useCallback(async () => {
    setLoading(true);
    const filterOpts: RejectionFilterOptions = {
      status: activeTab === 'ALL' ? undefined : activeTab,
      workCenter: selectedWorkCenter === 'ALL' ? undefined : selectedWorkCenter,
      search: searchQuery.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    const [rejsRes, kpisRes] = await Promise.all([
      fetchRejections(filterOpts),
      fetchRejectionSummaryKpis(),
    ]);

    if (rejsRes.error) {
      toast.error(`Failed to load declarations: ${rejsRes.error}`);
    } else {
      setDeclarations(rejsRes.data);
    }

    if (!kpisRes.error) {
      setKpis(kpisRes.data);
    }

    setLoading(false);
  }, [activeTab, selectedWorkCenter, searchQuery, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenVerify = (decl: RejectionDeclaration) => {
    setSelectedDeclaration(decl);
    setVerifyModalOpen(true);
  };

  const handleOpenApprove = (decl: RejectionDeclaration) => {
    setSelectedDeclaration(decl);
    setApproveModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
      {/* Page Title & Main Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Second Declaration Console
              </h1>
              <p className="text-sm text-slate-500">
                Universal mill second & salvage declarations, 3-tier QC/PPC authorization, and active WIP deductions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {isDeclarant && (
            <button
              onClick={() => setDeclareModalOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-sm transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Declare Second</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending QC */}
        <div className="p-4 bg-white border border-amber-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending QC Verification</div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{kpis.pendingQcCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">Awaiting physical inspection</div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <ClipboardCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Pending PPC */}
        <div className="p-4 bg-white border border-blue-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Pending PPC Approval</div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{kpis.pendingPpcCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">QC verified, awaiting write-off</div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Approved This Month */}
        <div className="p-4 bg-white border border-emerald-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved & Written Off</div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
              {kpis.approvedTotalPcs} <span className="text-sm font-normal text-slate-500">PCS</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">{fmt(kpis.approvedTotalMt, 3)} MT deducted from WIP</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Active Hold */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">Material Under Review</div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
              {fmt(kpis.totalPendingHoldMtr, 1)} <span className="text-sm font-normal text-slate-500">m</span>
            </div>
            <div className="text-xs text-amber-600 mt-0.5 font-medium">Flagged on work center queues</div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 border-b border-slate-200 pb-2 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Items' },
            { id: 'PENDING_QC', label: 'Pending QC', count: kpis.pendingQcCount },
            { id: 'PENDING_PPC', label: 'Pending PPC', count: kpis.pendingPpcCount },
            { id: 'APPROVED', label: 'Approved (Deducted)', count: kpis.approvedCount },
            { id: 'REJECTED_BY_QC', label: 'Rejected by QC' },
            { id: 'REJECTED_BY_PPC', label: 'Rejected by PPC' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeTab === tab.id ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search WO#, customer, heat/lot, REJ#..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Work Center */}
          <div>
            <select
              value={selectedWorkCenter}
              onChange={(e) => setSelectedWorkCenter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
            >
              {WORK_CENTER_OPTIONS.map((wc) => (
                <option key={wc.code} value={wc.code}>
                  {wc.label}
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
              placeholder="From Date"
            />
          </div>

          {/* To Date */}
          <div>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
              placeholder="To Date"
            />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-3.5">Declaration #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Work Center</th>
                <th className="py-3 px-3">Work Order #</th>
                <th className="py-3 px-3">Customer & Grade</th>
                <th className="py-3 px-3">Size (OD×WT)</th>
                <th className="py-3 px-3 text-right">Declared (PCS/m/MT)</th>
                <th className="py-3 px-3 text-right">Approved (PCS/m/MT)</th>
                <th className="py-3 px-3">Reason Category & Remarks</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    <span>Loading rejection declarations...</span>
                  </td>
                </tr>
              ) : declarations.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No rejection declarations found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery || activeTab !== 'ALL' || selectedWorkCenter !== 'ALL'
                        ? 'Try clearing active filters to see all records'
                        : 'Click "Declare Rejection" above to log a new rejection'}
                    </p>
                  </td>
                </tr>
              ) : (
                declarations.map((decl) => {
                  const statusBadge = REJECTION_STATUS_BADGES[decl.status] || {
                    label: decl.status,
                    className: 'bg-slate-100 text-slate-700',
                  };
                  const wcColor = WORK_CENTER_COLOR_MAP[decl.work_center] || 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={decl.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Declaration No */}
                      <td className="py-3 px-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {decl.declaration_no}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap font-mono">
                        {decl.declared_at.slice(0, 10)}
                      </td>

                      {/* Work Center */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${wcColor}`}>
                          {decl.work_center}
                        </span>
                      </td>

                      {/* Work Order */}
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {decl.work_orders?.work_order_no || '—'}
                      </td>

                      {/* Customer & Grade */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{decl.work_orders?.customer_name || '—'}</div>
                        <div className="text-[11px] text-slate-500">{decl.work_orders?.grade || '—'}</div>
                      </td>

                      {/* Size */}
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {decl.work_orders?.size_od && decl.work_orders?.size_wt
                          ? `${decl.work_orders.size_od} × ${decl.work_orders.size_wt}`
                          : '—'}
                      </td>

                      {/* Declared */}
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        <div className="font-bold text-slate-900">{decl.rejected_pcs} PCS</div>
                        <div className="text-[11px] text-slate-500">{fmt(decl.rejected_mtr, 1)}m · {fmt(decl.rejected_mt, 3)}MT</div>
                      </td>

                      {/* Approved */}
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        {decl.status === 'APPROVED' ? (
                          <>
                            <div className="font-bold text-emerald-800">{decl.ppc_approved_pcs ?? decl.rejected_pcs} PCS</div>
                            <div className="text-[11px] text-emerald-600">
                              {fmt(decl.ppc_approved_mtr ?? decl.rejected_mtr, 1)}m · {fmt(decl.ppc_approved_mt ?? decl.rejected_mt, 3)}MT
                            </div>
                          </>
                        ) : decl.status === 'PENDING_PPC' ? (
                          <div className="text-[11px] text-blue-700 font-medium">
                            QC: {decl.qc_verified_pcs} PCS ({fmt(decl.qc_verified_mtr, 1)}m)
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Reason & Remarks */}
                      <td className="py-3 px-3 max-w-xs">
                        <div className="font-medium text-slate-800 truncate" title={REJECTION_REASON_LABELS[decl.reason_category]}>
                          {REJECTION_REASON_LABELS[decl.reason_category] || decl.reason_category}
                        </div>
                        <div className="text-[11px] text-slate-500 italic truncate" title={decl.production_remarks}>
                          &ldquo;{decl.production_remarks}&rdquo;
                        </div>
                        {decl.qc_remarks && (
                          <div className="text-[10px] text-blue-700 font-medium truncate" title={`QC: ${decl.qc_remarks}`}>
                            QC: {decl.qc_remarks}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {decl.status === 'PENDING_QC' && (
                          <button
                            onClick={() => handleOpenVerify(decl)}
                            disabled={!isVerifier}
                            className={`inline-flex items-center space-x-1 px-3 py-1 rounded-md text-xs font-semibold shadow-sm transition-colors ${
                              isVerifier
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            title={isVerifier ? 'Inspect & verify rejection' : 'Requires QC Inspector permission'}
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            <span>Verify (QC)</span>
                          </button>
                        )}

                        {decl.status === 'PENDING_PPC' && (
                          <button
                            onClick={() => handleOpenApprove(decl)}
                            disabled={!isApprover}
                            className={`inline-flex items-center space-x-1 px-3 py-1 rounded-md text-xs font-semibold shadow-sm transition-colors ${
                              isApprover
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            title={isApprover ? 'Authorize & deduct from active WIP' : 'Requires PPC Manager permission'}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Approve (PPC)</span>
                          </button>
                        )}

                        {decl.status === 'APPROVED' && (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-medium text-xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Deducted</span>
                          </span>
                        )}

                        {(decl.status === 'REJECTED_BY_QC' || decl.status === 'REJECTED_BY_PPC') && (
                          <span className="inline-flex items-center space-x-1 text-rose-700 font-medium text-xs">
                            <XCircle className="w-4 h-4 text-rose-600" />
                            <span>Declined</span>
                          </span>
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

      {/* Modals */}
      <DeclareRejectionModal
        isOpen={declareModalOpen}
        onClose={() => setDeclareModalOpen(false)}
        onSuccess={loadData}
        currentUser={currentUser}
      />

      <VerifyRejectionModal
        isOpen={verifyModalOpen}
        declaration={selectedDeclaration}
        onClose={() => {
          setVerifyModalOpen(false);
          setSelectedDeclaration(null);
        }}
        onSuccess={loadData}
        currentUser={currentUser}
      />

      <ApproveRejectionModal
        isOpen={approveModalOpen}
        declaration={selectedDeclaration}
        onClose={() => {
          setApproveModalOpen(false);
          setSelectedDeclaration(null);
        }}
        onSuccess={loadData}
        currentUser={currentUser}
      />
    </div>
  );
}
