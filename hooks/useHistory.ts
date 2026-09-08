import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductionEntry } from "@/types";
import { extractPcsFromRemarks } from "@/lib/productionUtils";

export function useHistory(
  search: string,
  entryStage: string,
  entryRoute: string,
  fromDate: string,
  toDate: string
) {
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_production_entries",
        {
          p_search: debouncedSearch.trim() || null,
          p_stage_code: entryStage || null,
          p_route_code: entryRoute || null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }
      );
      if (rpcError) {
        setEntries([]);
        setError(rpcError.message);
        return;
      }

      const rawList = (data as ProductionEntry[]) || [];
      if (rawList.length === 0) {
        setEntries([]);
        return;
      }

      // Collect unique work order numbers to fetch their rolling plans and accurate stage lengths
      const woNos = Array.from(new Set(rawList.map((e: ProductionEntry) => e.work_order_no).filter(Boolean)));

      const { data: woData } = await supabase
        .from("work_orders")
        .select("id, work_order_no, ordered_qty_mtr, ordered_qty_pcs, l1, l2")
        .in("work_order_no", woNos);

      const woMap = new Map<string, any>();
      const woIds: string[] = [];
      ((woData as any[]) || []).forEach((w: any) => {
        woMap.set(w.work_order_no, w);
        woIds.push(w.id);
      });

      // Fetch rolling plans for these work orders
      const planMap = new Map<string, { mh_l1: number; mh_l2: number; mh_avg_length: number }>();
      if (woIds.length > 0) {
        const { data: rpData } = await supabase
          .from("rolling_plans")
          .select("work_order_id, mh_l1, mh_l2, status")
          .in("work_order_id", woIds);

        ((rpData as any[]) || []).forEach((rp: any) => {
          const l1 = Number(rp.mh_l1 || 0);
          const l2 = Number(rp.mh_l2 || 0);
          const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2;
          if (rp.work_order_id) {
            planMap.set(rp.work_order_id, { mh_l1: l1, mh_l2: l2, mh_avg_length: avg });
          }
          // Also check child work orders in multi-WO rolling plans
          if (rp.status) {
            try {
              const meta = typeof rp.status === "string" ? JSON.parse(rp.status) : rp.status;
              if (Array.isArray(meta?.child_work_orders)) {
                meta.child_work_orders.forEach((child: any) => {
                  if (child.work_order_id && !planMap.has(child.work_order_id)) {
                    planMap.set(child.work_order_id, { mh_l1: l1, mh_l2: l2, mh_avg_length: avg });
                  }
                });
              }
            } catch {}
          }
        });
      }

      // Enrich entries with stage-aware pieces and rounded whole integers
      const enrichedEntries: ProductionEntry[] = rawList.map((entry: ProductionEntry) => {
        const wo = woMap.get(entry.work_order_no);
        const plan = wo?.id ? planMap.get(wo.id) : null;
        const isMhStage = entry.stage_code === "ROLLING" || entry.stage_code === "HOLLOW_HEAT_TREATMENT";

        const mhLen = Number(plan?.mh_avg_length || plan?.mh_l1 || 0);
        const woAvg = Number(
          (wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : (wo?.l1 || wo?.l2)) ||
          entry.avg_length ||
          (Number(wo?.ordered_qty_mtr || 0) > 0 && Number(wo?.ordered_qty_pcs || 0) > 0
            ? Number(wo.ordered_qty_mtr) / Number(wo.ordered_qty_pcs)
            : 6.0)
        );

        const effectiveLen = isMhStage && mhLen > 0 ? mhLen : woAvg > 0 ? woAvg : 6.0;

        const outMtr = Number(entry.output_mtr || 0);
        const inMtr = Number(entry.input_mtr || 0);
        const rejMtr = Number(entry.rejection_mtr || 0);
        const htcMtr = Number(entry.htc_ok_mtr || 0);

        const { pcs: parsedPcs, rejPcs: parsedRejPcs, cleanRemarks } = extractPcsFromRemarks(entry.remarks);

        // If exact piece count was encoded in remarks (e.g. for Finishing or manual piece overrides), respect it directly!
        const outputPcs = parsedPcs != null
          ? parsedPcs
          : isMhStage && mhLen > 0
          ? Math.round(outMtr / mhLen)
          : (entry.output_pcs != null && Number(entry.output_pcs) > 0
              ? Math.round(Number(entry.output_pcs))
              : Math.round(outMtr / effectiveLen));

        const inputPcs = isMhStage && mhLen > 0
          ? Math.round(inMtr / mhLen)
          : (entry.input_pcs != null && Number(entry.input_pcs) > 0
              ? Math.round(Number(entry.input_pcs))
              : Math.round(inMtr / effectiveLen));

        const rejectionPcs = parsedRejPcs != null
          ? parsedRejPcs
          : isMhStage && mhLen > 0
          ? Math.round(rejMtr / mhLen)
          : (entry.rejection_pcs != null && Number(entry.rejection_pcs) > 0
              ? Math.round(Number(entry.rejection_pcs))
              : Math.round(rejMtr / effectiveLen));

        const htcOkPcs = isMhStage && mhLen > 0
          ? Math.round(htcMtr / mhLen)
          : (entry.htc_ok_pcs != null && Number(entry.htc_ok_pcs) > 0
              ? Math.round(Number(entry.htc_ok_pcs))
              : Math.round(htcMtr / effectiveLen));

        return {
          ...entry,
          remarks: cleanRemarks || entry.remarks,
          mh_avg_length: mhLen > 0 ? mhLen : undefined,
          mh_l1: plan?.mh_l1,
          mh_l2: plan?.mh_l2,
          output_pcs: outputPcs,
          input_pcs: inputPcs,
          rejection_pcs: rejectionPcs,
          htc_ok_pcs: htcOkPcs,
        };
      });

      setEntries(enrichedEntries);
    } catch (err: any) {
      setError(err?.message || "Failed to load history entries");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, entryStage, entryRoute, fromDate, toDate]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  return { entries, loading, error, reload: loadEntries };
}
