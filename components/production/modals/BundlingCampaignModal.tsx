'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Package, CheckCircle2, AlertTriangle, Crown, Link2, RefreshCw } from 'lucide-react';
import { Row } from '@/types';
import { calc, fmt, n, mtFromMtr } from '@/lib/productionUtils';

export interface CampaignBundle {
  id: string;
  wo_id: string;
  bundle_no: string;
  pcs: string;
  mtr: string;
  remarks: string;
}

export interface BundlingCampaignModalProps {
  bundlingCampaign: Row;
  campaignBundles: CampaignBundle[];
  onClose: () => void;
  onAddBundle: (woId: string, defaultPrefix?: string) => void;
  onRemoveBundle: (bundleId: string) => void;
  onUpdateBundleField: (
    bundleId: string,
    field: 'bundle_no' | 'pcs' | 'mtr' | 'remarks',
    val: string,
    avgLen?: number
  ) => void;
  onApplyToGrid: () => void;
  onSaveBundles: () => Promise<void>;
  saving: boolean;
}

export function BundlingCampaignModal({
  bundlingCampaign,
  campaignBundles,
  onClose,
  onAddBundle,
  onRemoveBundle,
  onUpdateBundleField,
  onApplyToGrid,
  onSaveBundles,
  saving,
}: BundlingCampaignModalProps) {
  const totalEnteredMtr = campaignBundles.reduce((sum, v) => sum + n(v.mtr), 0);
  const totalEnteredPcs = campaignBundles.reduce((sum, v) => sum + n(v.pcs), 0);
  const totalBundleCount = campaignBundles.filter((v) => n(v.pcs) > 0 || n(v.mtr) > 0).length;

  const maxAvailMtr =
    n(bundlingCampaign.max_allowed_mtr) > 0
      ? n(bundlingCampaign.max_allowed_mtr)
      : n(bundlingCampaign.balance_to_make_mtr);
  const maxAvailPcs =
    n(bundlingCampaign.max_allowed_pcs) > 0
      ? n(bundlingCampaign.max_allowed_pcs)
      : calc(bundlingCampaign).avg > 0
      ? Math.round(maxAvailMtr / calc(bundlingCampaign).avg)
      : n(bundlingCampaign.balance_to_make_pcs);

  const exceeds = maxAvailPcs > 0 && totalEnteredPcs > maxAvailPcs;

  const masterCalc = calc(bundlingCampaign);
  const ordersList = [
    {
      id: bundlingCampaign.work_order_id,
      work_order_no: bundlingCampaign.work_order_no,
      customer_name: bundlingCampaign.customer_name,
      grade: bundlingCampaign.specification || null,
      size_od: bundlingCampaign.od,
      size_wt: bundlingCampaign.wl,
      avg: masterCalc.avg || 6.0,
      isMaster: true,
      total_order_pcs: bundlingCampaign.total_order_pcs || 0,
      total_order_mtr: bundlingCampaign.total_order_mtr || 0,
      total_order_mt: bundlingCampaign.total_order_mt || 0,
      balance_to_make_pcs: bundlingCampaign.balance_to_make_order_pcs ?? bundlingCampaign.balance_to_make_pcs ?? 0,
      balance_to_make_mtr: bundlingCampaign.balance_to_make_order_mtr ?? bundlingCampaign.balance_to_make_mtr ?? 0,
      balance_to_make_mt: bundlingCampaign.balance_to_make_order_mt ?? bundlingCampaign.balance_to_make_mt ?? 0,
      finished_pcs:
        bundlingCampaign.finished_output_pcs ||
        (masterCalc.avg > 0 ? Math.round(Number(bundlingCampaign.finished_output_mtr || 0) / masterCalc.avg) : 0),
      finished_mtr: bundlingCampaign.finished_output_mtr || 0,
      capping_pcs: Math.round(Number(bundlingCampaign.total_order_pcs || 0) * 1.1),
      capping_mtr: bundlingCampaign.order_capping_mtr || Number(((bundlingCampaign.total_order_mtr || 0) * 1.1).toFixed(3)),
    },
    ...(bundlingCampaign.child_work_orders || []).map((c: any) => {
      const childTotalMtr = Number(c.total_order_mtr || c.planned_mtr || 0);
      const childAvg = (c.l1 && c.l2 ? (c.l1 + c.l2) / 2 : c.l1) || masterCalc.avg || 6.0;
      const childTotalPcs =
        Number(c.total_order_pcs || c.planned_pcs || 0) || (childAvg > 0 ? Math.round(childTotalMtr / childAvg) : 0);
      const childOd = Number(c.size_od || bundlingCampaign.od || 0);
      const childWt = Number(c.size_wt || bundlingCampaign.wl || 0);
      const childTotalMt = Number(c.total_order_mt || c.planned_mt || 0) || mtFromMtr(childTotalMtr, childOd, childWt);
      const childFinishedMtr = Number(c.finished_output_mtr || 0);
      const childFinishedPcs =
        Number(c.finished_output_pcs || 0) || (childAvg > 0 ? Math.round(childFinishedMtr / childAvg) : 0);
      const childBalMtr = Number(c.balance_to_make_mtr ?? Math.max(0, childTotalMtr - childFinishedMtr));
      const childBalPcs = childAvg > 0 ? Math.round(childBalMtr / childAvg) : 0;
      const childBalMt = mtFromMtr(childBalMtr, childOd, childWt);
      const childCapPcs = Math.round(childTotalPcs * 1.1);
      const childCapMtr = Number(c.order_capping_mtr || (childTotalMtr * 1.1).toFixed(3));

      return {
        id: c.work_order_id || c.id,
        work_order_no: c.work_order_no,
        customer_name: c.customer_name,
        grade: c.grade,
        size_od: c.size_od,
        size_wt: c.size_wt,
        avg: childAvg,
        isMaster: false,
        total_order_pcs: childTotalPcs,
        total_order_mtr: childTotalMtr,
        total_order_mt: childTotalMt,
        balance_to_make_pcs: childBalPcs,
        balance_to_make_mtr: childBalMtr,
        balance_to_make_mt: childBalMt,
        finished_pcs: childFinishedPcs,
        finished_mtr: childFinishedMtr,
        capping_pcs: childCapPcs,
        capping_mtr: childCapMtr,
      };
    }),
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-teal-100 p-2 text-teal-700">
            <Package size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Finishing Multi-WO Bundler</h3>
              <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[11px] font-bold">
                Master: {bundlingCampaign.work_order_no}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Enter multiple bundles across Master and Child work orders. Finishing production equals the sum of bundles.
            </p>
          </div>
        </div>
      }
      onClose={onClose}
      maxWidth="7xl"
    >
      <div className="flex flex-col">
        {/* Campaign WIP Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-teal-50/60 border-b border-teal-100 px-6 py-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-600">
              Available WIP from VDI QC (OK):{' '}
              <b className="font-mono text-slate-900 text-sm">{fmt(maxAvailMtr)} MTR</b> (
              <span className="font-mono">{fmt(maxAvailPcs)} PCS</span>)
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">
              Linked Orders: <b>{ordersList.length}</b>
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono font-bold">
            <span className={exceeds ? 'text-rose-600' : 'text-teal-900'}>
              Total Bundled: {totalBundleCount} Bundles · {fmt(totalEnteredPcs)} PCS · {fmt(totalEnteredMtr)} MTR
            </span>
            <span className="text-slate-500">
              Remaining: {fmt(Math.max(0, maxAvailMtr - totalEnteredMtr))} MTR
            </span>
          </div>
        </div>

        {/* Work Orders Bundling List */}
        <div className="p-6 space-y-4 bg-slate-50/40">
          {ordersList.map((wo) => {
            const woBundles = campaignBundles.filter((b) => b.wo_id === wo.id);
            const woEnteredPcs = woBundles.reduce((s, b) => s + n(b.pcs), 0);
            const woEnteredMtr = woBundles.reduce((s, b) => s + n(b.mtr), 0);
            const woValidBundlesCount = woBundles.filter((b) => n(b.pcs) > 0 || n(b.mtr) > 0).length;
            const maxCapPcs = wo.capping_pcs || (wo.total_order_pcs > 0 ? Math.round(wo.total_order_pcs * 1.1) : 0);
            const woExceeds110 = maxCapPcs > 0 && woEnteredPcs + (wo.finished_pcs || 0) > maxCapPcs;

            return (
              <div key={wo.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {/* Work Order Card Header */}
                <div
                  className={`px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 ${
                    wo.isMaster ? 'bg-indigo-50/40' : 'bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {wo.isMaster ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[11px] font-bold">
                        <Crown size={11} /> Master Order
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-[11px] font-semibold">
                        <Link2 size={11} /> Child Order
                      </span>
                    )}
                    <span className="font-mono text-sm sm:text-base font-bold text-slate-900">
                      {wo.work_order_no}
                    </span>
                    <span className="text-xs text-slate-600">
                      {wo.customer_name || '—'} ·{' '}
                      <span className="font-mono text-slate-500 font-medium">
                        {wo.size_od} × {wo.size_wt} mm (Avg: {fmt(wo.avg, 'm')})
                      </span>
                    </span>
                  </div>

                  {/* Summary & Live Finishing Production Sum for this WO */}
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-500">
                      Order: <b>{fmt(wo.total_order_pcs)} PCS</b> ({fmt(wo.total_order_mtr, 'm')})
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-indigo-900">
                      Balance: <b>{fmt(wo.balance_to_make_pcs)} PCS</b> ({fmt(wo.balance_to_make_mtr, 'm')})
                    </span>
                    <span className="text-slate-300">|</span>
                    <div
                      className={`rounded-lg px-2.5 py-1 font-sans text-xs font-bold border transition-colors ${
                        woExceeds110
                          ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-300'
                          : 'bg-teal-50 border-teal-300 text-teal-900'
                      }`}
                    >
                      Finishing Production:{' '}
                      <span className="font-mono text-xs sm:text-sm font-black text-teal-950">
                        {fmt(woEnteredPcs)} PCS
                      </span>{' '}
                      ({fmt(woEnteredMtr)} MTR)
                      <span className="ml-1 text-[11px] opacity-75">[{woValidBundlesCount} Bundles]</span>
                    </div>
                  </div>
                </div>

                {/* Bundles Table for this Work Order */}
                <div className="p-3">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-bold w-12 text-center">#</th>
                        <th className="px-3 py-2 font-bold w-48">Bundle / Lot No.</th>
                        <th className="px-3 py-2 font-bold w-32 text-center bg-blue-50 text-blue-900">
                          Bundle PCS
                        </th>
                        <th className="px-3 py-2 font-bold w-36 text-center bg-blue-50 text-blue-900">
                          Bundle MTR
                        </th>
                        <th className="px-3 py-2 font-bold">Remarks</th>
                        <th className="px-3 py-2 font-bold w-14 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {woBundles.map((b, bIdx) => (
                        <tr key={b.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-center font-bold text-slate-400 font-mono">
                            {bIdx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="e.g. BDL-01"
                              value={b.bundle_no}
                              onChange={(e) =>
                                onUpdateBundleField(b.id, 'bundle_no', e.target.value, wo.avg)
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center bg-blue-50/20">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={b.pcs}
                              onChange={(e) =>
                                onUpdateBundleField(b.id, 'pcs', e.target.value, wo.avg)
                              }
                              className="w-24 mx-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono font-bold text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center bg-blue-50/20">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0.00"
                              value={b.mtr}
                              onChange={(e) =>
                                onUpdateBundleField(b.id, 'mtr', e.target.value, wo.avg)
                              }
                              className="w-28 mx-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono font-bold text-teal-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Optional bundle notes..."
                              value={b.remarks}
                              onChange={(e) =>
                                onUpdateBundleField(b.id, 'remarks', e.target.value, wo.avg)
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-teal-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => onRemoveBundle(b.id)}
                              title="Delete this bundle row"
                              className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 cursor-pointer transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Add Bundle Button & 110% Warning */}
                  <div className="mt-2.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onAddBundle(wo.id, wo.work_order_no)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-teal-500 bg-teal-50/50 hover:bg-teal-100 text-teal-800 font-bold px-3 py-1.5 text-xs cursor-pointer transition-colors shadow-2xs"
                    >
                      <Plus size={14} /> Add Bundle to {wo.work_order_no}
                    </button>

                    {woExceeds110 && (
                      <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                        ⚠️ Total for {wo.work_order_no} ({fmt(woEnteredPcs)} PCS) exceeds 110% maximum order limit ({fmt(maxCapPcs)} PCS)!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {exceeds && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>
                Total bundled pieces ({fmt(totalEnteredPcs)} PCS) exceeds available finishing WIP ({fmt(maxAvailPcs)} PCS).
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500">
            Finishing Production will update to the <b>sum of all bundles</b> entered.
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="teal"
              size="sm"
              onClick={onApplyToGrid}
              disabled={saving || totalEnteredPcs <= 0}
            >
              <CheckCircle2 size={14} />
              Apply to Production Grid ({totalBundleCount} Bundles)
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onSaveBundles}
              disabled={saving || totalEnteredPcs <= 0 || exceeds}
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Saving Bundles...
                </>
              ) : (
                <>
                  <Package size={14} />
                  Record All Bundles ({fmt(totalEnteredMtr)} MTR / {totalBundleCount} Bundles)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default BundlingCampaignModal;
