'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AppUserProfile } from '@/lib/users/types';
import {
  Bell,
  AlertTriangle,
  Clock,
  ExternalLink,
  CheckCircle,
  RefreshCw,
  X,
  Factory,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

export type AgingAlert = {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  od: number;
  wt: number;
  stage_code: string;
  stage_name: string;
  current_wip: number;
  current_wip_pcs: number;
  available_mt: number;
  last_activity_date: string;
  days_stuck: number;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  is_acknowledged?: boolean;
};

export default function AgingNotificationBell({
  currentUser,
}: {
  currentUser: AppUserProfile | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AgingAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // Attempt reading from vw_wip_aging view
      const { data, error } = await supabase
        .from('vw_wip_aging')
        .select('*')
        .order('days_stuck', { ascending: false });

      if (!error && data) {
        setAlerts((data as AgingAlert[]).filter(a => a.current_wip > 0));
        setLoading(false);
        return;
      }

      // Fallback if view not yet migrated on remote db:
      // Compute aging directly from vw_route_stage_wip and production_logs
      const [wipRes, prodRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*').gt('current_wip', 0),
        supabase.from('production_logs').select('work_order_id, stage_id, process_date').order('process_date', { ascending: false }),
      ]);

      if (wipRes.data) {
        const today = new Date();
        const fallbackAlerts: AgingAlert[] = wipRes.data.map((r: any) => {
          // Find latest log for this WO and stage
          const matchLog = (prodRes.data || []).find(
            (p: any) => p.work_order_id === r.work_order_id && p.stage_id === r.stage_id
          );
          const actDateStr = matchLog?.process_date || r.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
          const actDate = new Date(actDateStr);
          const diffDays = Math.max(0, Math.floor((today.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24)));
          const sev: 'NORMAL' | 'WARNING' | 'CRITICAL' =
            diffDays > 5 ? 'CRITICAL' : diffDays >= 3 ? 'WARNING' : 'NORMAL';

          return {
            work_order_id: r.work_order_id,
            work_order_no: r.work_order_no,
            customer_name: r.customer_name,
            grade: r.grade || 'Grade N/A',
            od: Number(r.od) || 0,
            wt: Number(r.wt) || 0,
            stage_code: r.stage_code,
            stage_name: r.stage_name || r.stage_code,
            current_wip: Number(r.current_wip) || 0,
            current_wip_pcs: Number(r.current_wip_pcs) || 0,
            available_mt: Number(r.available_mt) || 0,
            last_activity_date: actDateStr,
            days_stuck: diffDays,
            severity: sev,
            is_acknowledged: false,
          };
        });

        setAlerts(fallbackAlerts.filter(a => a.current_wip > 0));
      }
    } catch (err) {
      console.warn('Error loading WIP aging alerts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    // Refresh alerts periodically every 3 minutes
    const interval = setInterval(loadAlerts, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  // Determine user's target department scope
  const isPlantWide = useMemo(() => {
    if (!currentUser) return true;
    const group = currentUser.group || (currentUser.role === 'admin' ? 'admin' : currentUser.role === 'manager' ? 'super_user' : 'user');
    return group === 'admin' || group === 'super_user' || currentUser.work_center === 'ALL';
  }, [currentUser]);

  // Filter alerts by department
  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (!isPlantWide && currentUser) {
      const allowed = new Set(currentUser.allowed_stages || []);
      if (currentUser.work_center && currentUser.work_center !== 'ALL') {
        allowed.add(currentUser.work_center);
      }
      result = alerts.filter(a => allowed.has(a.stage_code));
    }
    // Only show warning or critical alerts in the bell popover (unacknowledged)
    return result.filter(a => a.days_stuck >= 3 && !a.is_acknowledged);
  }, [alerts, isPlantWide, currentUser]);

  const criticalCount = useMemo(
    () => filteredAlerts.filter(a => a.severity === 'CRITICAL').length,
    [filteredAlerts]
  );
  const warningCount = useMemo(
    () => filteredAlerts.filter(a => a.severity === 'WARNING').length,
    [filteredAlerts]
  );
  const totalCount = filteredAlerts.length;

  const acknowledgeAlert = async (alert: AgingAlert) => {
    const key = `${alert.work_order_id}_${alert.stage_code}`;
    setAcknowledgingId(key);
    try {
      const supabase = createClient();
      const userName = currentUser?.name || currentUser?.email || 'Operator';
      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + 2); // Snooze for 2 days

      const { error } = await supabase
        .from('aging_alert_acknowledgements')
        .upsert(
          {
            work_order_id: alert.work_order_id,
            stage_code: alert.stage_code,
            acknowledged_by: userName,
            notes: 'Acknowledged via Notification Bell',
            snooze_until: snoozeDate.toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'work_order_id,stage_code' }
        );

      if (!error) {
        setAlerts(prev =>
          prev.map(a =>
            a.work_order_id === alert.work_order_id && a.stage_code === alert.stage_code
              ? { ...a, is_acknowledged: true }
              : a
          )
        );
        toast.success(`Alert for ${alert.work_order_no} at ${alert.stage_name} acknowledged & snoozed for 2 days.`);
      } else {
        // Local state update fallback
        setAlerts(prev =>
          prev.map(a =>
            a.work_order_id === alert.work_order_id && a.stage_code === alert.stage_code
              ? { ...a, is_acknowledged: true }
              : a
          )
        );
        toast.success(`Alert acknowledged.`);
      }
    } catch (e) {
      toast.error('Could not acknowledge alert.');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const navigateToTracking = (woNo: string) => {
    setOpen(false);
    router.push(`/reports/tracking?wo=${encodeURIComponent(woNo)}`);
  };

  const navigateToAgingReport = () => {
    setOpen(false);
    router.push('/reports/aging');
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={totalCount > 0 ? `${totalCount} material stagnation alert(s)` : 'No stagnant WIP alerts'}
        aria-label={totalCount > 0 ? `View ${totalCount} material stagnation alert(s)` : 'View stagnant WIP alerts (none currently)'}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition cursor-pointer ${
          totalCount > 0
            ? criticalCount > 0
              ? 'border-red-300 bg-red-50/80 text-red-600 hover:bg-red-100 hover:border-red-400'
              : 'border-amber-300 bg-amber-50/80 text-amber-600 hover:bg-amber-100 hover:border-amber-400'
            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-2xs'
        }`}
      >
        <Bell className="h-4 w-4" />

        {/* Pulsing indicator if critical */}
        {criticalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 text-[10px] font-bold text-white items-center justify-center font-mono leading-none">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          </span>
        )}

        {/* Static badge if warnings only */}
        {criticalCount === 0 && warningCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 rounded-full bg-amber-500 text-[10px] font-bold text-white items-center justify-center font-mono leading-none">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Drawer */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-2xl z-50 animate-in fade-in zoom-in-95 text-xs overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">WIP Stagnation Alerts</span>
                {totalCount > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold font-mono ${
                    criticalCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {totalCount} Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isPlantWide
                  ? 'All Plant Work Centers'
                  : `Assigned Department: ${currentUser?.work_center || 'Shop Floor'}`}
              </p>
            </div>

            <button
              type="button"
              onClick={loadAlerts}
              disabled={loading}
              title="Refresh alerts"
              aria-label="Refresh alerts"
              className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          {/* Alert List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {loading && alerts.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Checking work centers...</span>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-8 text-center px-4">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div className="font-semibold text-slate-800">All Material Moving Smoothly</div>
                <p className="text-[11px] text-slate-500 mt-1 max-w-[240px] mx-auto">
                  No lots have exceeded dwell time thresholds at {isPlantWide ? 'any station' : 'your work center'}.
                </p>
              </div>
            ) : (
              filteredAlerts.map(alert => {
                const isCrit = alert.severity === 'CRITICAL';
                const key = `${alert.work_order_id}_${alert.stage_code}`;
                const isAcking = acknowledgingId === key;

                return (
                  <div
                    key={key}
                    className={`p-3 transition hover:bg-slate-50/80 ${
                      isCrit ? 'bg-red-50/25' : 'bg-amber-50/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => navigateToTracking(alert.work_order_no)}
                            className="font-bold text-slate-900 hover:text-[#0078d4] font-mono flex items-center gap-1 group"
                          >
                            <span>{alert.work_order_no}</span>
                            <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-[#0078d4]" />
                          </button>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase font-mono ${
                              isCrit
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {alert.days_stuck} Days Stuck
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                          {alert.customer_name || 'Generic Customer'} · {alert.od}×{alert.wt} mm ({alert.grade})
                        </div>

                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <Factory className="h-3 w-3 text-slate-400" />
                            {alert.stage_name}
                          </span>
                          <span>•</span>
                          <span className="font-mono font-bold text-slate-800">
                            {Number(alert.current_wip).toLocaleString()} Mtrs
                          </span>
                          <span>({Number(alert.current_wip_pcs).toFixed(0)} pcs)</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100/80 pt-2">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Since {alert.last_activity_date}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => acknowledgeAlert(alert)}
                          disabled={isAcking}
                          className="rounded bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle className="h-3 w-3 text-slate-500" />
                          <span>{isAcking ? 'Snoozing...' : 'Acknowledge'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateToTracking(alert.work_order_no)}
                          className="rounded bg-[#0078d4] hover:bg-[#106ebe] text-white px-2 py-1 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                        >
                          <span>Track</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Navigation to Full Report */}
          <div className="border-t border-slate-100 bg-slate-50 p-2 text-center">
            <button
              type="button"
              onClick={navigateToAgingReport}
              className="w-full rounded-md py-1.5 text-xs font-semibold text-[#0078d4] hover:bg-blue-50/80 hover:text-[#106ebe] transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>View Full WIP Aging & Bottlenecks Report</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
