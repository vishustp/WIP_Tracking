"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  X,
  Layers,
  ChevronDown,
  ChevronRight,
  Factory,
  Lock,
  ShieldAlert,
  Crown,
  Link2,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQueue } from "@/hooks/useQueue";
import { useHistory } from "@/hooks/useHistory";
import { validateProductionEntry } from "@/lib/productionValidation";
import { calc, fmt, n, mtrFromPcs, pcsFromMtr, mtFromMtr } from "@/lib/productionUtils";
import { StageCode, STAGES, Row, ProductionEntry } from "@/types";
import { usePermissions, getGroupConfig, getFormAccess } from "@/lib/permissions";
import FormAccessBanner from "@/components/common/FormAccessBanner";

export default function ProductionEntryGrid() {
  const supabase = useMemo(() => createClient(), []);
  const {
    user,
    group,
    groupConfig,
    roleTitle,
    department,
    workCenter,
    workCenterLabel,
    isStageAllowed,
    canDeleteForStage,
    canEditForStage,
    canCreateForStage,
    isAdmin,
    isSuperUser,
    isUserGroup,
  } = usePermissions();

  // --- State ---
  const [stage, setStage] = useState<StageCode>("ROLLING");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [search, setSearch] = useState("");
  const [woFilter, setWoFilter] = useState("");
  const [entryStage, setEntryStage] = useState("");
  const [entryRoute, setEntryRoute] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Expandable work center WIP breakdown per row
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showWipSummary, setShowWipSummary] = useState(true);

  // Edit modal state
  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [editMtr, setEditMtr] = useState("");
  const [editPcs, setEditPcs] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRejectionMtr, setEditRejectionMtr] = useState("");
  const [editRejectionPcs, setEditRejectionPcs] = useState("");
  const [editHtcMtr, setEditHtcMtr] = useState("");
  const [editHtcPcs, setEditHtcPcs] = useState("");
  const [editHeatLot, setEditHeatLot] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete modal state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Campaign multi-work order bundling modal state (Rule 2)
  const [bundlingCampaign, setBundlingCampaign] = useState<Row | null>(null);
  const [bundleEntries, setBundleEntries] = useState<
    Record<string, { pcs: string; mtr: string; bundleNo: string; remarks: string }>
  >({});
  const [bundlingSaving, setBundlingSaving] = useState(false);

  // --- Data fetching ---
  const { rows, setRows, loading: queueLoading, reload: reloadQueue } = useQueue(stage);
  const { entries, loading: historyLoading, reload: reloadHistory } = useHistory(
    search,
    entryStage,
    entryRoute,
    fromDate,
    toDate
  );

  const [factoryWip, setFactoryWip] = useState<any[]>([]);
  const [serverSummary, setServerSummary] = useState<any[] | null>(null);
  const [childWoIds, setChildWoIds] = useState<Set<string>>(new Set());

  const loadFactoryWip = useCallback(async () => {
    try {
      try {
        const qRes = await fetch(`/api/production/queue?stage=${stage}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
        });
        if (qRes.ok) {
          const json = await qRes.json();
          if (Array.isArray(json?.summary)) {
            setServerSummary(json.summary);
          }
        }
      } catch {
        // ignore
      }

      const [wipRes, plansRes] = await Promise.all([
        supabase.from("vw_route_stage_wip").select("*"),
        supabase.from("rolling_plans").select("status, work_order_id").not("status", "is", null),
      ]);
      if (wipRes.data) setFactoryWip(wipRes.data);
      if (plansRes.data) {
        const cIds = new Set<string>();
        for (const p of plansRes.data) {
          try {
            const parsed = typeof p.status === "string" ? JSON.parse(p.status) : p.status;
            if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
              for (const c of parsed.child_work_orders) {
                if (c.work_order_id) cIds.add(c.work_order_id);
                if (c.id) cIds.add(c.id);
              }
            } else if (parsed?.is_child && p.work_order_id) {
              cIds.add(p.work_order_id);
            }
          } catch {
            // ignore JSON parse error
          }
        }
        setChildWoIds(cIds);
      }
    } catch {
      // ignore
    }
  }, [supabase, stage]);

  useEffect(() => {
    loadFactoryWip();
  }, [loadFactoryWip, stage]);

  const routes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.route_code))).sort(),
    [entries]
  );

  const stageFormAccess = useMemo(() => {
    return getFormAccess(user, 'production_entry', stage);
  }, [user, stage]);
  const isAllowed = stageFormAccess.isAllowed;

  // Toggle single row expansion
  const toggleRowExpansion = (key: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Filter queue rows by Work Order No, Customer, Grade, or Master Plan No
  const filteredRows = useMemo(() => {
    if (!woFilter.trim()) return rows;
    const q = woFilter.toLowerCase().trim();
    return rows.filter((r) =>
      (r.work_order_no || "").toLowerCase().includes(q) ||
      (r.customer_name || "").toLowerCase().includes(q) ||
      (r.specification || "").toLowerCase().includes(q) ||
      (r.master_plan_no || "").toLowerCase().includes(q) ||
      (r.child_work_orders && r.child_work_orders.some((c: any) =>
        (c.work_order_no || "").toLowerCase().includes(q) ||
        (c.customer_name || "").toLowerCase().includes(q)
      ))
    );
  }, [rows, woFilter]);

  // Toggle all rows expansion
  const toggleAllRows = () => {
    const targetRows = filteredRows.length > 0 ? filteredRows : rows;
    const allExpanded = targetRows.every((r) => expandedRows[`${r.work_order_id}|${r.route_id}`]);
    const newState: Record<string, boolean> = { ...expandedRows };
    targetRows.forEach((r) => {
      newState[`${r.work_order_id}|${r.route_id}`] = !allExpanded;
    });
    setExpandedRows(newState);
  };

  // --- Row update helper with bidirectional PCS <-> MTR conversion ---
  const updateRow = (
    key: string,
    field: keyof Pick<
      Row,
      "pcs" | "mtr" | "rejection_pcs" | "rejection_mtr" | "htc_ok_pcs" | "htc_ok_mtr" | "heat_lot_no" | "remarks"
    >,
    value: string
  ) => {
    setRows((current) =>
      current.map((r) => {
        if (`${r.work_order_id}|${r.route_id}` !== key) return r;

        // Rule 5: Rolling Mtr and MT calculated based on MH dimensions if applicable
        const mhL1 = Number(r.mh_l1 || 0);
        const mhL2 = Number(r.mh_l2 || 0);
        const computedMhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : (mhL1 || mhL2 || 0);
        const effectiveMhAvg = Number(r.mh_avg_length || 0) > 0 ? Number(r.mh_avg_length) : computedMhAvg;
        const effectiveAvg =
          stage === "ROLLING" && effectiveMhAvg > 0
            ? effectiveMhAvg
            : n(r.avg_length);

        if (field === "pcs") {
          const mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, pcs: value, mtr };
        }
        if (field === "mtr") {
          const pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg));
          return { ...r, mtr: value, pcs };
        }
        if (field === "rejection_pcs") {
          const rejection_mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, rejection_pcs: value, rejection_mtr };
        }
        if (field === "rejection_mtr") {
          const rejection_pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg));
          return { ...r, rejection_mtr: value, rejection_pcs };
        }
        if (field === "htc_ok_pcs") {
          const htc_ok_mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, htc_ok_pcs: value, htc_ok_mtr };
        }
        if (field === "htc_ok_mtr") {
          const htc_ok_pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg));
          return { ...r, htc_ok_mtr: value, htc_ok_pcs };
        }
        return { ...r, [field]: value };
      })
    );
  };

  // --- Aggregate WIP across all work orders in current queue & factory-wide ---
  const workCenterSummary = useMemo(() => {
    if (serverSummary && serverSummary.length > 0) {
      const baseList = serverSummary.map((s) => ({ ...s }));
      const activeItem = baseList.find((x) => x.stage_code === stage);
      if (activeItem) {
        activeItem.availMtr = rows.reduce((sum, r) => sum + Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0), 0);
        activeItem.availPcs = rows.reduce((sum, r) => sum + Number(r.balance_to_make_pcs ?? r.max_allowed_pcs ?? 0), 0);
        activeItem.availMt = rows.reduce((sum, r) => {
          const isRoll = stage === "ROLLING";
          const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
          const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
          const mtrVal = Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
          return sum + mtFromMtr(mtrVal, od, wt);
        }, 0);
        activeItem.count = rows.length;
      }
      return baseList;
    }

    const summary: Record<string, { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }> = {
      ROLLING: { label: "Rolling Mill", stage_code: "ROLLING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HOLLOW_HEAT_TREATMENT: { label: "Hollow Heat Treatment", stage_code: "HOLLOW_HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      DRAW: { label: "Draw Bench", stage_code: "DRAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HEAT_TREATMENT: { label: "Heat Treatment", stage_code: "HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      FINISHING: { label: "Finishing Line", stage_code: "FINISHING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
    };

    const resolveStageCode = (w: any): StageCode | null => {
      if (!w) return null;
      const raw = String(w.stage_code || w.stage_name || w.stage_id || "").toUpperCase().trim();
      if (raw === "HOLLOW_HEAT_TREATMENT" || raw.includes("HOLLOW")) return "HOLLOW_HEAT_TREATMENT";
      if (raw === "ROLLING" || raw.includes("ROLL")) return "ROLLING";
      if (raw === "DRAW" || raw.includes("DRAW")) return "DRAW";
      if (raw === "HEAT_TREATMENT" || raw.includes("HEAT")) return "HEAT_TREATMENT";
      if (raw === "FINISHING" || raw.includes("FINISH")) return "FINISHING";
      return null;
    };

    // 1. Process factoryWip if available
    let hasFactoryData = false;
    if (factoryWip && factoryWip.length > 0) {
      factoryWip.forEach((w) => {
        const sc = resolveStageCode(w);
        if (sc && summary[sc]) {
          // Rule 2: In pre-finishing stages (ROLLING, HOLLOW_HEAT_TREATMENT, DRAW, HEAT_TREATMENT),
          // child work orders are bundled under the master campaign. Do not double count them!
          if (sc !== "FINISHING" && childWoIds.has(w.work_order_id)) {
            return;
          }

          const mtr = Number(w.current_wip ?? w.available_mtr ?? 0);
          let pcs = Number(w.current_wip_pcs ?? w.available_pcs ?? 0);
          const isMhStage = sc === "ROLLING" || sc === "HOLLOW_HEAT_TREATMENT" || sc === "DRAW";
          const mhAvgLen = Number(w.mh_avg_length || w.mh_l1 || 0);
          const avgLen = (isMhStage && mhAvgLen > 0) ? mhAvgLen : Number(w.avg_length || 6.0);
          if (pcs === 0 && mtr > 0 && avgLen > 0) {
            pcs = Number((mtr / avgLen).toFixed(2));
          }
          const isMhDim = sc === "ROLLING" || sc === "HOLLOW_HEAT_TREATMENT" || sc === "DRAW";
          const od = isMhDim && w.mh_od ? Number(w.mh_od) : Number(w.od || w.size_od || 0);
          const wt = isMhDim && w.mh_wt ? Number(w.mh_wt) : Number(w.wl || w.wt || w.size_wt || 0);
          const mt = Number(w.available_mt ?? w.current_wip_mt ?? mtFromMtr(mtr, od, wt));

          if (mtr > 0 || pcs > 0) {
            summary[sc].availMtr += mtr;
            summary[sc].availPcs += pcs;
            summary[sc].availMt += mt;
            summary[sc].count += 1;
            hasFactoryData = true;
          }
        }
      });
    }

    // 2. Also ensure rows in active queue contribute if factoryWip was empty or incomplete
    if (rows && rows.length > 0) {
      rows.forEach((r) => {
        if (r.work_centers_wip && r.work_centers_wip.length > 0) {
          r.work_centers_wip.forEach((w) => {
            const sc = resolveStageCode(w);
            if (sc && summary[sc]) {
              if (sc !== "FINISHING" && childWoIds.has(r.work_order_id)) {
                return;
              }
              const mtr = Number(w.available_mtr || 0);
              const pcs = Number(w.available_pcs || 0);
              const isRoll = sc === "ROLLING";
              const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
              const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
              const mt = Number(w.available_mt ?? mtFromMtr(mtr, od, wt));
              if (!hasFactoryData) {
                summary[sc].availMtr += mtr;
                summary[sc].availPcs += pcs;
                summary[sc].availMt += mt;
                if (mtr > 0 || pcs > 0) summary[sc].count += 1;
              }
            }
          });
        } else {
          const sc = resolveStageCode({ stage_code: r.stage_code || stage });
          if (sc && summary[sc] && !hasFactoryData) {
            if (sc !== "FINISHING" && childWoIds.has(r.work_order_id)) {
              return;
            }
            const mtr = Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
            const pcs = Number(r.balance_to_make_pcs ?? r.max_allowed_pcs ?? 0);
            const isRoll = sc === "ROLLING";
            const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
            const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
            const mt = mtFromMtr(mtr, od, wt);
            summary[sc].availMtr += mtr;
            summary[sc].availPcs += pcs;
            summary[sc].availMt += mt;
            if (mtr > 0 || pcs > 0) summary[sc].count += 1;
          }
        }
      });

      // Guarantee the active selected stage card matches the active queue table exactly
      const activeSc = resolveStageCode({ stage_code: stage });
      if (activeSc && summary[activeSc]) {
        const queueTotalMtr = rows.reduce((sum, r) => {
          if (r.is_child && r.master_wo_id) return sum;
          return sum + Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
        }, 0);
        const queueTotalPcs = rows.reduce((sum, r) => {
          if (r.is_child && r.master_wo_id) return sum;
          return sum + Number(r.balance_to_make_pcs ?? r.max_allowed_pcs ?? 0);
        }, 0);
        const queueTotalMt = rows.reduce((sum, r) => {
          if (r.is_child && r.master_wo_id) return sum;
          const isRoll = activeSc === "ROLLING";
          const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
          const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
          const mtrVal = Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
          return sum + mtFromMtr(mtrVal, od, wt);
        }, 0);

        summary[activeSc].availMtr = queueTotalMtr;
        summary[activeSc].availPcs = queueTotalPcs;
        summary[activeSc].availMt = queueTotalMt;
        summary[activeSc].count = rows.filter((r) => !(r.is_child && r.master_wo_id)).length;
      }
    }

    return Object.values(summary);
  }, [factoryWip, rows, stage, childWoIds, serverSummary]);

  // --- Batch save (atomic) ---
  async function save() {
    setMessage("");
    setError("");

    if (!isStageAllowed(stage)) {
      setError(`Permission Denied: Your account (${groupConfig.name}) is assigned to ${workCenterLabel}. You can only record data for your assigned work center.`);
      return;
    }

    const selected = rows.filter((r) => n(r.mtr) > 0 || n(r.pcs) > 0);
    if (!selected.length) {
      setError("Enter Production PCS/MTR for at least one row.");
      return;
    }

    // Validate all rows
    const allErrors = selected.flatMap((r) => validateProductionEntry(r, stage));
    if (allErrors.length) {
      setError(allErrors.map((e) => `${e.workOrder}: ${e.message}`).join(" | "));
      return;
    }

    setSaving(true);
    try {
      const payload = selected.map((r) => {
        const d = calc(r);
        return {
          work_order_id: r.work_order_id,
          route_id: r.route_id,
          stage_code: r.stage_code,
          input_qty: d.mtr,
          output_qty: d.mtr,
          rejection_qty: d.rejectionMtr,
          htc_ok: stage === "ROLLING" ? d.htcMtr : 0,
          output_pcs: d.pcs || null,
          rejection_pcs: d.rejectionPcs || null,
          htc_ok_pcs: stage === "ROLLING" ? (d.htcPcs || null) : null,
          heat_lot_no: r.heat_lot_no || null,
          remarks: r.remarks || null,
        };
      });

      // Use the unified production record API (supports standard & multi-WO bundling seamlessly)
      const res = await fetch("/api/production/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: payload,
          p_process_date: date,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "Failed to save production.");
      }

      setMessage("All production entries saved successfully.");
      await Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()]);
    } catch (e: unknown) {
      console.error("Full error:", e);
      setError(e instanceof Error ? e.message : "Failed to save production.");
    } finally {
      setSaving(false);
    }
  }

  // --- Multi-Work Order Campaign Bundling Handlers (Rule 2) ---
  const openCampaignBundling = (r: Row) => {
    setBundlingCampaign(r);
    const initial: Record<string, { pcs: string; mtr: string; bundleNo: string; remarks: string }> = {};

    // Initialize Master entry
    initial[r.work_order_id] = {
      pcs: "",
      mtr: "",
      bundleNo: r.heat_lot_no || "",
      remarks: "",
    };

    // Initialize Child entries if linked
    if (r.child_work_orders && r.child_work_orders.length > 0) {
      r.child_work_orders.forEach((c: any) => {
        const cId = c.work_order_id || c.id;
        if (cId) {
          initial[cId] = {
            pcs: "",
            mtr: "",
            bundleNo: r.heat_lot_no || "",
            remarks: "",
          };
        }
      });
    }

    setBundleEntries(initial);
  };

  const updateBundleEntry = (
    woId: string,
    field: "pcs" | "mtr" | "bundleNo" | "remarks",
    val: string,
    avgLen: number
  ) => {
    setBundleEntries((prev) => {
      const current = prev[woId] || { pcs: "", mtr: "", bundleNo: "", remarks: "" };
      let pcs = current.pcs;
      let mtr = current.mtr;

      if (field === "pcs") {
        pcs = val;
        mtr = val === "" ? "" : String(mtrFromPcs(n(val), avgLen).toFixed(3).replace(/\.?0+$/, ""));
      } else if (field === "mtr") {
        mtr = val;
        pcs = val === "" ? "" : String(pcsFromMtr(n(val), avgLen));
      } else {
        return { ...prev, [woId]: { ...current, [field]: val } };
      }

      return {
        ...prev,
        [woId]: {
          ...current,
          pcs,
          mtr,
        },
      };
    });
  };

  const saveCampaignBundling = async () => {
    if (!bundlingCampaign) return;

    const entered = Object.entries(bundleEntries).filter(
      ([_, v]) => n(v.mtr) > 0 || n(v.pcs) > 0
    );

    if (!entered.length) {
      setError("Please enter bundling PCS or MTR for at least one work order.");
      return;
    }

    const totalBundledMtr = entered.reduce((sum, [_, v]) => sum + n(v.mtr), 0);
    const maxAvailMtr =
      n(bundlingCampaign.max_allowed_mtr) > 0
        ? n(bundlingCampaign.max_allowed_mtr)
        : n(bundlingCampaign.balance_to_make_mtr);

    if (totalBundledMtr > maxAvailMtr + 0.05) {
      setError(
        `Total bundled quantity (${fmt(totalBundledMtr)} MTR) exceeds available finishing WIP (${fmt(
          maxAvailMtr
        )} MTR).`
      );
      return;
    }

    // Validate that bundling for each work order does not exceed 110% of its total order quantity
    const masterTotalMtr = Number(bundlingCampaign.total_order_mtr || 0);
    const masterCapMtr = Number(bundlingCampaign.order_capping_mtr || (masterTotalMtr * 1.10).toFixed(3));
    const masterFinished = Number(bundlingCampaign.finished_output_mtr || 0);

    for (const [woId, v] of entered) {
      const enteredMtr = n(v.mtr);
      if (woId === bundlingCampaign.work_order_id) {
        if (masterTotalMtr > 0 && enteredMtr + masterFinished > masterCapMtr + 0.05) {
          setError(
            `Work Order ${bundlingCampaign.work_order_no}: Bundled quantity (${fmt(enteredMtr)} MTR${masterFinished > 0 ? ` + already finished ${fmt(masterFinished)} MTR` : ""}) exceeds maximum allowed 110% of Total Order Quantity (${fmt(masterTotalMtr)} MTR, max capping: ${fmt(masterCapMtr)} MTR).`
          );
          return;
        }
      } else {
        const child = (bundlingCampaign.child_work_orders || []).find(
          (c: any) => (c.work_order_id || c.id) === woId
        );
        if (child) {
          const cTotalMtr = Number(child.total_order_mtr || child.planned_mtr || 0);
          const cCapMtr = Number(child.order_capping_mtr || (cTotalMtr * 1.10).toFixed(3));
          const cFinished = Number(child.finished_output_mtr || 0);
          if (cTotalMtr > 0 && enteredMtr + cFinished > cCapMtr + 0.05) {
            setError(
              `Work Order ${child.work_order_no}: Bundled quantity (${fmt(enteredMtr)} MTR${cFinished > 0 ? ` + already finished ${fmt(cFinished)} MTR` : ""}) exceeds maximum allowed 110% of Total Order Quantity (${fmt(cTotalMtr)} MTR, max capping: ${fmt(cCapMtr)} MTR).`
            );
            return;
          }
        }
      }
    }

    setBundlingSaving(true);
    try {
      const payload = entered.map(([woId, v]) => ({
        work_order_id: woId,
        route_id: bundlingCampaign.route_id,
        stage_code: "FINISHING",
        input_qty: n(v.mtr),
        output_qty: n(v.mtr),
        rejection_qty: 0,
        htc_ok: 0,
        heat_lot_no: v.bundleNo || null,
        remarks: v.remarks ? `Bundle: ${v.remarks}` : "Campaign Bundling",
      }));

      const res = await fetch("/api/production/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: payload,
          p_process_date: date,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "Failed to record campaign bundling.");
      }

      setMessage(`Campaign bundling recorded successfully across ${entered.length} work orders!`);
      setBundlingCampaign(null);
      await Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()]);
    } catch (e: unknown) {
      console.error("Bundling error:", e);
      setError(e instanceof Error ? e.message : "Failed to record campaign bundling.");
    } finally {
      setBundlingSaving(false);
    }
  };

  const getEntryAvgLength = (entry: ProductionEntry | null) => {
    if (!entry) return 6.0;
    const isMhStage = entry.stage_code === "ROLLING" || entry.stage_code === "HOLLOW_HEAT_TREATMENT";
    const rowMatch = rows.find((r) => r.work_order_no === entry.work_order_no || r.work_order_id === entry.work_order_id);
    const mhL1 = Number(entry.mh_l1 || rowMatch?.mh_l1 || 0);
    const mhL2 = Number(entry.mh_l2 || rowMatch?.mh_l2 || 0);
    const computedMhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : (mhL1 || mhL2 || 0);
    const mhLen = Number(entry.mh_avg_length || rowMatch?.mh_avg_length || computedMhAvg || 0);
    const woLen = Number(
      entry.avg_length ||
      rowMatch?.avg_length ||
      (Number(rowMatch?.total_order_mtr || 0) > 0 && Number(rowMatch?.total_order_pcs || 0) > 0
        ? Number(rowMatch?.total_order_mtr) / Number(rowMatch?.total_order_pcs)
        : 6.0)
    );
    return isMhStage && mhLen > 0 ? mhLen : woLen > 0 ? woLen : 6.0;
  };

  // --- Edit handlers with bidirectional PCS <-> MTR ---
  function openEdit(entry: ProductionEntry) {
    setEditing(entry);
    const avg = getEntryAvgLength(entry);
    const isMhStage = entry.stage_code === "ROLLING" || entry.stage_code === "HOLLOW_HEAT_TREATMENT";
    const effOutPcs = isMhStage && avg > 0
      ? Math.round(Number(entry.output_mtr || 0) / avg)
      : (Number(entry.output_pcs || 0) > 0 ? Math.round(Number(entry.output_pcs)) : (avg > 0 && Number(entry.output_mtr || 0) > 0 ? Math.round(Number(entry.output_mtr) / avg) : ""));
    const effRejPcs = isMhStage && avg > 0
      ? Math.round(Number(entry.rejection_mtr || 0) / avg)
      : (Number(entry.rejection_pcs || 0) > 0 ? Math.round(Number(entry.rejection_pcs)) : (avg > 0 && Number(entry.rejection_mtr || 0) > 0 ? Math.round(Number(entry.rejection_mtr) / avg) : ""));
    const effHtcPcs = isMhStage && avg > 0
      ? Math.round(Number(entry.htc_ok_mtr || 0) / avg)
      : (Number(entry.htc_ok_pcs || 0) > 0 ? Math.round(Number(entry.htc_ok_pcs)) : (avg > 0 && Number(entry.htc_ok_mtr || 0) > 0 ? Math.round(Number(entry.htc_ok_mtr) / avg) : ""));

    setEditDate(entry.process_date.slice(0, 10));
    setEditMtr(String(entry.output_mtr || ""));
    setEditPcs(String(effOutPcs));
    setEditRejectionMtr(String(entry.rejection_mtr || ""));
    setEditRejectionPcs(String(effRejPcs));
    setEditHtcMtr(String(entry.htc_ok_mtr || ""));
    setEditHtcPcs(String(effHtcPcs));
    setEditHeatLot(entry.heat_lot_no || "");
    setEditRemarks(entry.remarks || "");
  }

  function changeEditPcs(value: string) {
    setEditPcs(value);
    const avg = getEntryAvgLength(editing);
    if (value === "") {
      setEditMtr("");
    } else {
      setEditMtr(String(mtrFromPcs(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditMtr(value: string) {
    setEditMtr(value);
    const avg = getEntryAvgLength(editing);
    if (value === "") {
      setEditPcs("");
    } else {
      setEditPcs(String(pcsFromMtr(n(value), avg)));
    }
  }

  function changeEditRejectionPcs(value: string) {
    setEditRejectionPcs(value);
    const avg = getEntryAvgLength(editing);
    if (value === "") {
      setEditRejectionMtr("");
    } else {
      setEditRejectionMtr(String(mtrFromPcs(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditRejectionMtr(value: string) {
    setEditRejectionMtr(value);
    const avg = getEntryAvgLength(editing);
    if (value === "") {
      setEditRejectionPcs("");
    } else {
      setEditRejectionPcs(String(pcsFromMtr(n(value), avg)));
    }
  }

  function changeEditHtcPcs(value: string) {
    setEditHtcPcs(value);
    const avg = getEntryAvgLength(editing);
    if (value === "") {
      setEditHtcMtr("");
    } else {
      setEditHtcMtr(String(mtrFromPcs(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditHtcMtr(value: string) {
    setEditHtcMtr(value);
    const avg = getEntryAvgLength(editing);
    if (value === "") {
      setEditHtcPcs("");
    } else {
      setEditHtcPcs(String(pcsFromMtr(n(value), avg)));
    }
  }

  async function updateEntry() {
    if (!editing) return;
    setEditSaving(true);
    setError("");
    setMessage("");

    const editCheck = canEditForStage(editing.stage_code);
    if (!editCheck.allowed) {
      setError(editCheck.reason || `Permission Denied: Your user group cannot modify entries for stage ${editing.stage_code}.`);
      setEditSaving(false);
      return;
    }

    const avg = getEntryAvgLength(editing);
    const mtr = editPcs.trim() !== "" ? mtrFromPcs(n(editPcs), avg) : n(editMtr);
    const rejection = editRejectionPcs.trim() !== "" ? mtrFromPcs(n(editRejectionPcs), avg) : n(editRejectionMtr);
    const htc = editHtcPcs.trim() !== "" ? mtrFromPcs(n(editHtcPcs), avg) : n(editHtcMtr);

    if (!editDate) {
      setError("Production date is required.");
      setEditSaving(false);
      return;
    }
    if (mtr <= 0) {
      setError("Production quantity (PCS / MTR) must be greater than zero.");
      setEditSaving(false);
      return;
    }
    if (rejection < 0 || rejection > mtr + 0.001) {
      setError("Rejection cannot exceed production quantity.");
      setEditSaving(false);
      return;
    }
    // Heat Lot No is optional / can be null
    if (editing.stage_code === "ROLLING" && htc > (mtr - rejection) + 0.001) {
      setError("HTC OK cannot exceed Net Rolling output (Production - Rejection).");
      setEditSaving(false);
      return;
    }
    if (editing.stage_code !== "ROLLING" && htc !== 0) {
      setError("HTC OK can only be entered at Rolling.");
      setEditSaving(false);
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc("update_production_entry", {
        p_production_id: editing.id,
        p_process_date: editDate,
        p_output_qty: mtr,
        p_rejection_qty: rejection,
        p_htc_ok: editing.stage_code === "ROLLING" ? htc : 0,
        p_heat_lot_no: editHeatLot.trim() || null,
        p_remarks: editRemarks.trim() || null,
      });
      if (rpcError) throw rpcError;

      setMessage("Production entry updated successfully.");
      setEditing(null);
      await Promise.all([reloadQueue(), reloadHistory()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setEditSaving(false);
    }
  }

  // --- Delete handler ---
  async function deleteEntry() {
    if (!deleteId) return;
    setDeleteBusy(true);
    setError("");
    setMessage("");

    const targetEntry = entries.find((e) => e.id === deleteId);
    if (targetEntry) {
      const delCheck = canDeleteForStage(targetEntry.stage_code);
      if (!delCheck.allowed) {
        setError(delCheck.reason || "Permission Denied: Unauthorized to delete this entry.");
        setDeleteBusy(false);
        return;
      }
    }

    try {
      const { error: rpcError } = await supabase.rpc("delete_production_entry", {
        p_production_id: deleteId,
      });
      if (rpcError) throw rpcError;

      // Reconcile work order status if no remaining production logs exist for this order
      const targetWoNo = targetEntry?.work_order_no;
      if (targetWoNo) {
        const { data: woData } = await supabase
          .from("work_orders")
          .select("id")
          .eq("work_order_no", targetWoNo)
          .maybeSingle();

        const woId = targetEntry?.work_order_id || woData?.id;
        if (woId) {
          const { data: remainingLogs } = await supabase
            .from("production_logs")
            .select("id")
            .eq("work_order_id", woId)
            .limit(1);

          if (!remainingLogs || remainingLogs.length === 0) {
            const { data: plans } = await supabase
              .from("rolling_plans")
              .select("id")
              .eq("work_order_id", woId)
              .limit(1);

            const newStatus = plans && plans.length > 0 ? "Scheduled" : "Pending Plan";
            await supabase
              .from("work_orders")
              .update({ status: newStatus })
              .eq("id", woId);
          }
        }
      }

      setDeleteId(null);
      setMessage("Production entry deleted successfully.");
      await Promise.all([reloadQueue(), reloadHistory()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Header & Stage Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Production Entry & WIP Tracking
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xs">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as StageCode)}
              className="h-9 rounded-lg border-0 bg-transparent px-3 text-sm font-semibold text-slate-800 focus:ring-0 cursor-pointer"
            >
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()])}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw size={14} className={queueLoading || historyLoading ? "animate-spin text-blue-600" : "text-slate-500"} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-800 shadow-xs">
          <AlertTriangle size={16} className="mt-0.5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Work Centers WIP Overview */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Work Center WIP Summary
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowWipSummary(!showWipSummary)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            {showWipSummary ? "Hide Summary" : "Show Summary"}
          </button>
        </div>

        {showWipSummary && (
          <div className="grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-3 lg:grid-cols-5 bg-slate-50/20">
            {workCenterSummary.map((wc) => {
              const isSelected = wc.stage_code === stage;
              return (
                <div
                  key={wc.stage_code}
                  onClick={() => setStage(wc.stage_code)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    isSelected
                      ? "border-blue-500/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 shadow-xs ring-1 ring-blue-500/30"
                      : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-700 truncate">{wc.label}</span>
                    {isSelected && (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-bold text-white shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-base font-bold font-mono text-slate-900 tracking-tight">
                      {fmt(wc.availPcs)}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">PCS</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {fmt(wc.availMtr, " MTR")} · <span className="text-blue-700 font-semibold">{fmt(wc.availMt, " MT")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Access & Permissions Banner */}
      <FormAccessBanner access={stageFormAccess} className="mb-2" />

      {/* Production Date & Entry Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Shift Process Date
            </label>
            <input
              type="date"
              value={date}
              disabled={!isAllowed}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
          </div>
          <div className="border-l border-slate-200 pl-3">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Queue Status
            </span>
            <span className="mt-1 inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-800">
              {woFilter.trim()
                ? `${filteredRows.length} of ${rows.length} ${rows.length === 1 ? 'Order' : 'Orders'}`
                : `${rows.length} ${rows.length === 1 ? 'Order' : 'Orders'} in Queue`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAllRows}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <Layers size={13} className="text-slate-500" />
            {rows.every((r) => expandedRows[`${r.work_order_id}|${r.route_id}`])
              ? "Collapse All WIP Flows"
              : "Expand All WIP Flows"}
          </button>
        </div>
      </div>

      {/* Queue Entry Grid Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              {STAGES.find((x) => x.code === stage)?.label || stage} Queue
            </h2>
            <span className="rounded-full bg-slate-200/70 px-2 py-0.2 text-[11px] font-semibold text-slate-700 font-mono">
              {woFilter.trim() ? `${filteredRows.length} of ${rows.length}` : rows.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Work Order No. Filter Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={woFilter}
                onChange={(e) => setWoFilter(e.target.value)}
                placeholder="Filter by WO No, Customer, Grade..."
                className="h-8 w-48 sm:w-64 rounded-lg border border-slate-300 bg-white pl-8 pr-7 text-xs font-medium text-slate-800 placeholder-slate-400 shadow-2xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {woFilter && (
                <button
                  type="button"
                  onClick={() => setWoFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  title="Clear filter"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {(stage === "DRAW" || stage === "HOLLOW_HEAT_TREATMENT" || stage === "HEAT_TREATMENT") && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                <Crown size={12} /> Master Orders Consolidated
              </span>
            )}
            {stage === "FINISHING" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                <Package size={12} /> Finishing & Bundling Station
              </span>
            )}
          </div>
        </div>

        {queueLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading work order production queue...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No WIP available in queue for {STAGES.find((x) => x.code === stage)?.label}. Record production in preceding stages first.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <p>No work orders match filter &ldquo;{woFilter}&rdquo; in {STAGES.find((x) => x.code === stage)?.label} queue.</p>
            <button
              type="button"
              onClick={() => setWoFilter("")}
              className="mt-2 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-100/70 text-slate-700">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Order & Specs</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Route</th>
                  <th className="py-2.5 px-3 text-left font-semibold">{stage === "ROLLING" ? "Plan Balance & Capping" : "Available WIP & Capping"}</th>
                  <th className="py-2.5 px-3 text-center font-semibold bg-blue-50/50">Production *</th>
                  <th className="py-2.5 px-3 text-center font-semibold bg-rose-50/40">Rejection</th>
                  {stage === "ROLLING" && (
                    <th className="py-2.5 px-3 text-center font-semibold bg-emerald-50/40">HTC OK</th>
                  )}
                  {(stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT") && (
                    <th className="py-2.5 px-3 text-left font-semibold">Heat Lot No.</th>
                  )}
                  <th className="py-2.5 px-3 text-left font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r) => {
                  const key = `${r.work_order_id}|${r.route_id}`;
                  const isExpanded = !!expandedRows[key];
                  const d = calc(r);
                  const isRollingStage = stage === "ROLLING";
                  const stageOd = isRollingStage && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
                  const stageWt = isRollingStage && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);

                  const availMtr = n(r.balance_to_make_mtr);
                  const effAvg = d.avg > 0 ? d.avg : (n(r.avg_length) || 6);
                  const availPcs = isRollingStage && effAvg > 0
                    ? Math.round(availMtr / effAvg)
                    : (n(r.balance_to_make_pcs) > 0 ? Math.round(n(r.balance_to_make_pcs)) : (effAvg > 0 ? Math.round(availMtr / effAvg) : 0));
                  const availMt = n(r.balance_to_make_mt) > 0 ? n(r.balance_to_make_mt) : mtFromMtr(availMtr, stageOd, stageWt);

                  const maxAllowed =
                    n(r.max_allowed_mtr) > 0 ? n(r.max_allowed_mtr) : (isRollingStage ? availMtr * 1.1 : availMtr);
                  const maxAllowedPcs =
                    n(r.max_allowed_pcs) > 0
                      ? n(r.max_allowed_pcs)
                      : effAvg > 0
                      ? Math.round(maxAllowed / effAvg)
                      : 0;

                  return (
                    <tr key={key} className="hover:bg-slate-50/50 transition-colors group">
                      {/* Work Order Info */}
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{r.work_order_no}</span>
                          <button
                            type="button"
                            onClick={() => toggleRowExpansion(key)}
                            title="Toggle Work Center WIP Pipeline"
                            className={`inline-flex items-center gap-0.5 rounded px-2 py-1 text-xs font-semibold border transition-colors ${
                              isExpanded
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                            }`}
                          >
                            <Layers size={10} />
                            WIP Flow
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </button>
                        </div>

                        {/* Master / Child Badges & Quick Action (Rule 1 & Rule 2) */}
                        {r.is_master && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[11px] font-bold">
                              <Crown size={11} /> Master Order
                            </span>
                            {stage === "FINISHING" && (
                              <button
                                type="button"
                                onClick={() => openCampaignBundling(r)}
                                className="inline-flex items-center gap-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white px-2 py-0.5 text-[11px] font-bold shadow-xs cursor-pointer transition-colors"
                                title="Bundle finished tubes across master and child orders"
                              >
                                <Package size={11} />
                                Multi-WO Bundler {r.child_work_orders?.length ? `(${r.child_work_orders.length} Children)` : ''}
                              </button>
                            )}
                          </div>
                        )}

                        {r.is_child && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-[11px] font-semibold">
                              <Link2 size={11} /> Child Order (Master: {r.master_wo_no || 'Linked'})
                            </span>
                          </div>
                        )}

                        <div className="text-sm text-slate-600 mt-1 truncate max-w-[170px]">
                          {r.customer_name || "—"}
                        </div>
                        <div className="text-[12px] text-slate-500 font-mono mt-0.5">
                          {r.od ? `${r.od} × ${r.wl ?? "—"} mm` : "—"} · Avg: {fmt(d.avg, "m")}
                        </div>
                        {stage === "ROLLING" && r.mh_od && (
                          <div className="text-xs text-indigo-700 font-mono bg-indigo-50/80 rounded px-1.5 py-0.2 mt-0.5 inline-block">
                            MH: {r.mh_od} × {r.mh_wt} mm ({fmt(r.mh_avg_length, "m")})
                          </div>
                        )}
                      </td>

                      {/* Route */}
                      <td className="py-3 px-3 align-top">
                        <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800">
                          {r.route_code}
                        </span>
                        <div className="text-xs text-slate-500 mt-1">
                          Mult: ×{fmt(r.multiple || 1)}
                        </div>
                      </td>

                      {/* Available WIP & Capping */}
                      <td className="py-3 px-3 align-top">
                        {isRollingStage ? (
                          <div className="space-y-2 min-w-[210px]">
                            {/* Remaining to Roll (Plan - Production) */}
                            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded px-2.5 py-1.5 shadow-xs">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                                <span>Remaining to Roll</span>
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded px-1 normal-case">(Plan − Prod)</span>
                              </div>
                              <div className="flex items-baseline gap-1 flex-wrap mt-0.5">
                                <span className="font-extrabold text-emerald-950 font-mono text-base">
                                  {fmt(availPcs)}
                                </span>
                                <span className="text-xs font-bold text-emerald-700">PCS</span>
                                <span className="text-emerald-400">/</span>
                                <span className="font-bold text-emerald-900 font-mono text-sm">
                                  {fmt(availMtr, " MTR")}
                                </span>
                                <span className="text-emerald-400">/</span>
                                <span className="font-semibold text-emerald-700 font-mono text-xs">
                                  {fmt(availMt, " MT")}
                                </span>
                              </div>
                            </div>

                            {/* Plan Issued Reference */}
                            {r.is_master && (r.campaign_total_mtr || 0) > 0 && (
                              <div className="text-[11px] text-indigo-950 bg-indigo-50/90 border border-indigo-200 rounded px-2 py-1 font-medium">
                                <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                                  <Crown size={11} className="text-indigo-600" />
                                  <span>Plan Issued ({r.child_work_orders?.length ? `Master + ${r.child_work_orders.length} Child` : "Master Plan"})</span>
                                </div>
                                <div className="font-mono font-bold text-indigo-900 mt-0.5">
                                  {fmt(r.campaign_total_pcs || 0)} PCS · {fmt(r.campaign_total_mtr, " MTR")}
                                </div>
                              </div>
                            )}

                            {/* Capping (110% Remaining Ceiling) */}
                            <div className="flex items-baseline justify-between text-[11px] font-mono text-amber-900 bg-amber-50/70 border border-amber-200/70 rounded px-2 py-0.5">
                              <span className="font-bold text-[10px] uppercase">
                                Capping (110%):
                              </span>
                              <span className="font-bold text-slate-800">{fmt(maxAllowedPcs)} PCS / {fmt(maxAllowed, " MTR")}</span>
                            </div>
                          </div>
                        ) : stage === "FINISHING" ? (
                          <div className="space-y-1.5 min-w-[220px]">
                            {/* 1. Total Order */}
                            <div className="bg-slate-50 border border-slate-200/90 rounded px-2 py-1 text-xs">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                                <span>Total Order</span>
                                <span className="text-[10px] font-medium text-slate-400">Target</span>
                              </div>
                              <div className="flex items-baseline gap-1 flex-wrap mt-0.5 font-mono">
                                <span className="font-bold text-slate-800">{fmt(r.total_order_pcs || 0)}</span>
                                <span className="text-[10px] font-semibold text-slate-500">PCS</span>
                                <span className="text-slate-300">/</span>
                                <span className="font-bold text-slate-800">{fmt(r.total_order_mtr || 0, " MTR")}</span>
                                <span className="text-slate-300">/</span>
                                <span className="font-semibold text-blue-700 text-[11px]">
                                  {fmt(r.total_order_mt || 0, " MT")}
                                </span>
                              </div>
                            </div>

                            {/* 2. Balance to Make */}
                            <div className="bg-indigo-50/60 border border-indigo-100 rounded px-2 py-1 text-xs">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center justify-between">
                                <span>Balance to Make</span>
                                <span className="text-[10px] font-medium text-indigo-500">Order Bal</span>
                              </div>
                              <div className="flex items-baseline gap-1 flex-wrap mt-0.5 font-mono">
                                <span className="font-bold text-indigo-900">
                                  {fmt(r.balance_to_make_order_pcs ?? r.balance_to_make_pcs ?? 0)}
                                </span>
                                <span className="text-[10px] font-semibold text-indigo-500">PCS</span>
                                <span className="text-indigo-200">/</span>
                                <span className="font-bold text-indigo-900">
                                  {fmt(r.balance_to_make_order_mtr ?? r.balance_to_make_mtr ?? 0, " MTR")}
                                </span>
                                <span className="text-indigo-200">/</span>
                                <span className="font-semibold text-indigo-700 text-[11px]">
                                  {fmt(r.balance_to_make_order_mt ?? r.balance_to_make_mt ?? 0, " MT")}
                                </span>
                              </div>
                            </div>

                            {/* 3. Available WIP from Preceding Stage */}
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded px-2 py-1 text-xs">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                                <span>{stage === "FINISHING" ? "Available WIP (VDI OK)" : "Available WIP (HT)"}</span>
                                <span className="text-[10px] font-medium text-emerald-600">Stock</span>
                              </div>
                              <div className="flex items-baseline gap-1 flex-wrap mt-0.5 font-mono">
                                <span className="font-bold text-emerald-950">{fmt(availPcs)}</span>
                                <span className="text-[10px] font-semibold text-emerald-600">PCS</span>
                                <span className="text-emerald-300">/</span>
                                <span className="font-bold text-emerald-950">{fmt(availMtr, " MTR")}</span>
                                <span className="text-emerald-300">/</span>
                                <span className="font-semibold text-emerald-700 text-[11px]">
                                  {fmt(availMt, " MT")}
                                </span>
                              </div>
                            </div>

                            {/* 4. Capping (110% of Total Order Qty) */}
                            <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-amber-900 bg-amber-50/90 border border-amber-200/80 rounded px-2 py-0.5">
                              <span className="font-bold uppercase tracking-wider">Capping (110%):</span>
                              <span className="font-bold">
                                {fmt(r.order_capping_pcs || Math.round(((r.total_order_mtr || 0) * 1.1) / (effAvg || 6)))} PCS /{" "}
                                {fmt(r.order_capping_mtr || ((r.total_order_mtr || 0) * 1.1), " MTR")}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1 flex-wrap">
                            <span className="font-bold text-slate-900 font-mono text-sm">
                              {fmt(maxAllowedPcs)}
                            </span>
                            <span className="text-xs font-bold text-slate-500">PCS</span>
                            <span className="text-slate-400">/</span>
                            <span className="font-semibold text-slate-700 font-mono text-sm">
                              {fmt(maxAllowed, " MTR")}
                            </span>
                            <span className="text-slate-400">/</span>
                            <span className="font-semibold text-blue-700 font-mono text-sm">
                              {fmt(
                                mtFromMtr(
                                  maxAllowed,
                                  r.od || 0,
                                  r.wl || 0
                                ),
                                " MT"
                              )}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Production Inputs (PCS & MTR) */}
                      <td className="py-3 px-3 align-top bg-blue-50/20">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="PCS"
                              disabled={!isAllowed}
                              value={r.pcs}
                              onChange={(e) => updateRow(key, "pcs", e.target.value)}
                              className="w-24 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-right font-mono text-base font-bold text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] text-center font-semibold text-slate-400 mt-0.5">PCS</span>
                          </div>
                          <span className="text-slate-400 font-bold mb-3">=</span>
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="MTR"
                              disabled={!isAllowed}
                              value={r.mtr}
                              onChange={(e) => updateRow(key, "mtr", e.target.value)}
                              className="w-28 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-right font-mono text-base font-bold text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] text-center font-semibold text-slate-400 mt-0.5">
                              {d.mt > 0 ? fmt(d.mt, " MT") : "MTR"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Rejection Inputs (PCS & MTR) */}
                      <td className="py-3 px-3 align-top bg-rose-50/20">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="PCS"
                              disabled={!isAllowed}
                              value={r.rejection_pcs}
                              onChange={(e) => updateRow(key, "rejection_pcs", e.target.value)}
                              className="w-24 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-right font-mono text-base font-semibold text-rose-700 shadow-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] text-center font-semibold text-slate-400 mt-0.5">PCS</span>
                          </div>
                          <span className="text-slate-400 font-bold mb-3">=</span>
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="MTR"
                              disabled={!isAllowed}
                              value={r.rejection_mtr}
                              onChange={(e) => updateRow(key, "rejection_mtr", e.target.value)}
                              className="w-28 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-right font-mono text-base font-semibold text-rose-700 shadow-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] text-center font-semibold text-slate-400 mt-0.5">
                              {d.rejectionMt > 0 ? fmt(d.rejectionMt, " MT") : "MTR"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* HTC OK Inputs (Rolling Stage only) */}
                      {stage === "ROLLING" && (
                        <td className="py-3 px-3 align-top bg-emerald-50/20">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="flex flex-col">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="PCS"
                                disabled={!isAllowed}
                                value={r.htc_ok_pcs}
                                onChange={(e) => updateRow(key, "htc_ok_pcs", e.target.value)}
                                className="w-24 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-right font-mono text-base font-bold text-emerald-700 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                              />
                              <span className="text-[11px] text-center font-semibold text-slate-400 mt-0.5">PCS</span>
                            </div>
                            <span className="text-slate-400 font-bold mb-3">=</span>
                            <div className="flex flex-col">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="MTR"
                                disabled={!isAllowed}
                                value={r.htc_ok_mtr}
                                onChange={(e) => updateRow(key, "htc_ok_mtr", e.target.value)}
                                className="w-28 rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-right font-mono text-base font-bold text-emerald-700 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                              />
                              <span className="text-[11px] text-center font-semibold text-slate-400 mt-0.5">
                                {d.htcMt > 0 ? fmt(d.htcMt, " MT") : "MTR"}
                              </span>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Heat Lot No. (Heat Treatment only) */}
                      {(stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT") && (
                        <td className="py-3 px-3 align-top">
                          <input
                            type="text"
                            placeholder="e.g. HT-8842"
                            disabled={!isAllowed}
                            value={r.heat_lot_no}
                            onChange={(e) => updateRow(key, "heat_lot_no", e.target.value)}
                            className="w-28 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          />
                        </td>
                      )}

                      {/* Remarks */}
                      <td className="py-3 px-3 align-top">
                        <input
                          type="text"
                          placeholder="Shift notes..."
                          disabled={!isAllowed}
                          value={r.remarks}
                          onChange={(e) => updateRow(key, "remarks", e.target.value)}
                          className="w-36 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Expandable Work Center WIP Breakdown Pipeline for expanded rows */}
        {rows.some((r) => expandedRows[`${r.work_order_id}|${r.route_id}`]) && (
          <div className="border-t border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Work Center WIP Breakdown Across Full Process Route
              </h3>
            </div>

            {rows
              .filter((r) => expandedRows[`${r.work_order_id}|${r.route_id}`])
              .map((r) => {
                const key = `${r.work_order_id}|${r.route_id}`;
                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{r.work_order_no}</span>
                        <span className="text-sm text-slate-500 font-mono">({r.customer_name || "Direct"})</span>
                        <span className="rounded bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-700">
                          Route: {r.route_code}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRowExpansion(key)}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-900"
                      >
                        Close Breakdown
                      </button>
                    </div>

                    {/* Flow steps */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {r.work_centers_wip?.map((w, idx) => {
                        const isCurrent = w.stage_code === stage;
                        const isRoll = w.stage_code === "ROLLING";
                        const stageOd = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
                        const stageWt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);

                        const availMt = w.available_mt ?? mtFromMtr(w.available_mtr, stageOd, stageWt);
                        const grossMt = w.gross_output_mt ?? mtFromMtr(w.gross_output_mtr, stageOd, stageWt);
                        const rejMt = w.rejection_mt ?? mtFromMtr(w.rejection_mtr, stageOd, stageWt);
                        const netMt = w.net_output_mt ?? mtFromMtr(w.net_output_mtr, stageOd, stageWt);
                        const htcMt = w.htc_ok_mt ?? mtFromMtr(w.htc_ok_mtr || 0, stageOd, stageWt);

                        return (
                          <div
                            key={w.stage_code}
                            className={`rounded-lg border p-3 space-y-2 relative transition-all ${
                              isCurrent
                                ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 shadow-sm"
                                : "border-slate-200 bg-slate-50/30"
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                              <span className="text-sm font-bold text-slate-800">
                                {idx + 1}. {w.stage_name}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-blue-600 px-2 py-0.2 text-[11px] font-bold text-white">
                                  Current
                                </span>
                              )}
                            </div>

                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between items-baseline">
                                <span className="text-slate-500 text-sm">Available WIP:</span>
                                <span className="font-bold font-mono text-slate-900 text-sm">
                                  {fmt(w.available_pcs)} PCS ({fmt(w.available_mtr, "m")} · <span className="text-blue-700">{fmt(availMt, " MT")}</span>)
                                </span>
                              </div>
                              <div className="flex justify-between items-baseline">
                                <span className="text-slate-500 text-sm">Gross Output:</span>
                                <span className="font-semibold font-mono text-slate-800 text-sm">
                                  {fmt(w.gross_output_pcs)} PCS ({fmt(w.gross_output_mtr, "m")} · <span className="text-slate-600">{fmt(grossMt, " MT")}</span>)
                                </span>
                              </div>
                              <div className="flex justify-between items-baseline">
                                <span className="text-slate-500 text-sm">Rejection:</span>
                                <span className="font-semibold font-mono text-rose-600 text-sm">
                                  {fmt(w.rejection_pcs)} PCS ({fmt(w.rejection_mtr, "m")} · <span className="text-rose-600">{fmt(rejMt, " MT")}</span>)
                                </span>
                              </div>
                              <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                                <span className="text-slate-700 font-semibold text-sm">Net Output:</span>
                                <span className="font-bold font-mono text-emerald-700 text-sm">
                                  {fmt(w.net_output_pcs)} PCS ({fmt(w.net_output_mtr, "m")} · <span className="text-emerald-700">{fmt(netMt, " MT")}</span>)
                                </span>
                              </div>
                              {w.stage_code === "ROLLING" && (
                                <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                                  <span className="text-indigo-700 font-semibold text-sm">HTC OK:</span>
                                  <span className="font-bold font-mono text-indigo-700 text-sm">
                                    {fmt(w.htc_ok_pcs)} PCS ({fmt(w.htc_ok_mtr, "m")} · <span className="text-indigo-700">{fmt(htcMt, " MT")}</span>)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Batch Save Action Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/70 p-3 sm:p-4">
          <div className="text-sm text-slate-600">
            {(!isStageAllowed(stage) || user?.role === 'auditor') && (
              <span className="inline-flex items-center gap-1.5 text-amber-800 font-medium bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 text-xs">
                <Lock size={12} />
                Entry disabled: Active role ({roleTitle}) does not have write permissions for {STAGES.find(s => s.code === stage)?.label}.
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={saving || queueLoading || user?.role === 'auditor' || !isStageAllowed(stage)}
            onClick={save}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>Saving Entries...</span>
              </>
            ) : (
              <span>Save Production Entries</span>
            )}
          </button>
        </div>
      </div>

      {/* Production History Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4 bg-slate-50/70">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={15} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900">Production History</h2>
            </div>
            <span className="text-sm font-semibold text-slate-500 font-mono">
              {entries.length} Logged Record{entries.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-5 text-sm">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WO, customer, grade..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={entryStage}
              onChange={(e) => setEntryStage(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Stages</option>
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={entryRoute}
              onChange={(e) => setEntryRoute(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Routes</option>
              {routes.map((route) => (
                <option key={route} value={route}>
                  {route}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {historyLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading production history...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No production entries match the criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-100/70 text-slate-700">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Order</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Route & Stage</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Production (PCS & MTR)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Rejection (PCS & MTR)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">HTC OK</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Heat Lot</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Remarks</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const isMhStage = entry.stage_code === "ROLLING" || entry.stage_code === "HOLLOW_HEAT_TREATMENT";
                  const rowMatch = rows.find((r) => r.work_order_no === entry.work_order_no);
                  const mhLen = Number(entry.mh_avg_length || entry.mh_l1 || rowMatch?.mh_avg_length || rowMatch?.mh_l1 || 0);
                  const woLen = Number(
                    entry.avg_length ||
                    rowMatch?.avg_length ||
                    (Number(rowMatch?.total_order_mtr || 0) > 0 && Number(rowMatch?.total_order_pcs || 0) > 0
                      ? Number(rowMatch?.total_order_mtr) / Number(rowMatch?.total_order_pcs)
                      : 6.0)
                  );
                  const effectiveLen = (isMhStage && mhLen > 0) ? mhLen : (woLen > 0 ? woLen : 6.0);

                  const dispOutPcs = Math.round(
                    isMhStage && mhLen > 0
                      ? (Number(entry.output_mtr || 0) / mhLen)
                      : (Number(entry.output_pcs || 0) > 0
                          ? Number(entry.output_pcs)
                          : (effectiveLen > 0 && Number(entry.output_mtr || 0) > 0 ? Number(entry.output_mtr) / effectiveLen : 0))
                  );

                  const dispRejPcs = Math.round(
                    isMhStage && mhLen > 0
                      ? (Number(entry.rejection_mtr || 0) / mhLen)
                      : (Number(entry.rejection_pcs || 0) > 0
                          ? Number(entry.rejection_pcs)
                          : (effectiveLen > 0 && Number(entry.rejection_mtr || 0) > 0 ? Number(entry.rejection_mtr) / effectiveLen : 0))
                  );

                  const dispHtcOkPcs = Math.round(
                    isMhStage && mhLen > 0
                      ? (Number(entry.htc_ok_mtr || 0) / mhLen)
                      : (Number(entry.htc_ok_pcs || 0) > 0
                          ? Number(entry.htc_ok_pcs)
                          : (effectiveLen > 0 && Number(entry.htc_ok_mtr || 0) > 0 ? Number(entry.htc_ok_mtr) / effectiveLen : 0))
                  );

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-700">{entry.process_date}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {entry.work_order_no}
                        <div className="text-xs font-normal text-slate-500 truncate max-w-[130px]">
                          {entry.customer_name || "—"}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded bg-slate-100 border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-800">
                          {entry.route_code}
                        </span>
                        <div className="text-sm text-slate-600 font-medium mt-0.5">
                          {STAGES.find((s) => s.code === entry.stage_code)?.label || entry.stage_code}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900">{fmt(dispOutPcs)} PCS</div>
                        <div className="text-xs text-slate-500">{fmt(entry.output_mtr, " MTR")}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-rose-600">{fmt(dispRejPcs)} PCS</div>
                        <div className="text-xs text-slate-500">{fmt(entry.rejection_mtr, " MTR")}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {entry.htc_ok_mtr > 0 || dispHtcOkPcs > 0 ? (
                          <>
                            <div className="font-bold">{fmt(dispHtcOkPcs)} PCS</div>
                            <div className="text-xs text-slate-500">{fmt(entry.htc_ok_mtr, " MTR")}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">{entry.heat_lot_no || "—"}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate">{entry.remarks || "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {(() => {
                          const editCheck = canEditForStage(entry.stage_code);
                          const delCheck = canDeleteForStage(entry.stage_code);

                          return (
                            <>
                              <button
                                type="button"
                                disabled={!entry.can_modify || !editCheck.allowed}
                                onClick={() => openEdit(entry)}
                                title={
                                  !editCheck.allowed
                                    ? editCheck.reason || "Unauthorized to edit"
                                    : entry.can_modify
                                    ? `Edit Entry (${entry.stage_code})`
                                    : "Locked: subsequent production logs exist for this order"
                                }
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {!editCheck.allowed ? <Lock size={11} className="text-slate-400" /> : <Edit2 size={12} />}
                                Edit
                              </button>
                              
                              {delCheck.allowed ? (
                                <button
                                  type="button"
                                  disabled={!entry.can_modify}
                                  onClick={() => setDeleteId(entry.id)}
                                  title={
                                    entry.can_modify
                                      ? `Delete Entry (${isAdmin ? "Admin Authority" : isSuperUser ? "Super User Authority" : "Assigned Work Center Authorized"})`
                                      : "Locked: subsequent production logs exist for this order"
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={true}
                                  title={delCheck.reason || "Deletion restricted"}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100/70 px-2.5 py-1.5 text-sm font-medium text-slate-400 cursor-not-allowed opacity-60"
                                >
                                  <Lock size={11} /> Delete
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Entry Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Production Record</h2>
                <p className="text-sm text-slate-500">
                  {editing.work_order_no} · {editing.route_code} ·{" "}
                  {STAGES.find((s) => s.code === editing.stage_code)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Process Date *</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Production (PCS & MTR) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="PCS"
                    value={editPcs}
                    onChange={(e) => changeEditPcs(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="MTR"
                    value={editMtr}
                    onChange={(e) => changeEditMtr(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rejection (PCS & MTR)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="PCS"
                    value={editRejectionPcs}
                    onChange={(e) => changeEditRejectionPcs(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-rose-700"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="MTR"
                    value={editRejectionMtr}
                    onChange={(e) => changeEditRejectionMtr(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-rose-700"
                  />
                </div>
              </div>

              {editing.stage_code === "ROLLING" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTC OK (PCS & MTR)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="PCS"
                      value={editHtcPcs}
                      onChange={(e) => changeEditHtcPcs(e.target.value)}
                      className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-emerald-700 font-bold"
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="MTR"
                      value={editHtcMtr}
                      onChange={(e) => changeEditHtcMtr(e.target.value)}
                      className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-emerald-700 font-bold"
                    />
                  </div>
                </div>
              )}

              {(editing.stage_code === "HEAT_TREATMENT" || editing.stage_code === "HOLLOW_HEAT_TREATMENT") && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Heat Lot No.</label>
                  <input
                    type="text"
                    placeholder="Optional (e.g. HT-8842)"
                    value={editHeatLot}
                    onChange={(e) => setEditHeatLot(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={editSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateEntry}
                disabled={editSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Update Production Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (() => {
        const targetEntry = entries.find((e) => e.id === deleteId);
        const delCheck = targetEntry ? canDeleteForStage(targetEntry.stage_code) : { allowed: false, reason: "Entry not found" };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2.5 ${delCheck.allowed ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}>
                  {delCheck.allowed ? <Trash2 size={20} /> : <ShieldAlert size={20} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {delCheck.allowed ? "Delete Production Entry" : "Permission Restricted"}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {delCheck.allowed
                      ? `Are you sure you want to delete this ${targetEntry?.stage_code} entry (${targetEntry?.work_order_no})? WIP balances will be recalculated immediately.`
                      : delCheck.reason || "Unauthorized to delete this record."}
                  </p>
                </div>
              </div>

              {targetEntry && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Work Order:</span>
                    <span className="font-mono font-bold text-slate-900">{targetEntry.work_order_no}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Work Center / Stage:</span>
                    <span className="font-semibold text-slate-800">{targetEntry.stage_code}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Output Qty:</span>
                    <span className="font-mono font-bold text-slate-900">{targetEntry.output_mtr} MTR ({targetEntry.output_pcs} PCS)</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Authorization:</span>
                    <span className="font-semibold text-emerald-700">
                      {isAdmin ? "Admin Group (Global Deletion)" : isSuperUser ? "Super User Group (Global Deletion)" : `User Group (${workCenter} Assigned)`}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {delCheck.allowed ? "Cancel" : "Close"}
                </button>
                {delCheck.allowed && (
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={deleteEntry}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50"
                  >
                    {deleteBusy ? "Deleting..." : "Confirm Delete"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Campaign Multi-Work Order Bundling Modal (Rule 2) */}
      {bundlingCampaign && (() => {
        const totalEnteredMtr = Object.values(bundleEntries).reduce(
          (sum, v) => sum + n(v.mtr),
          0
        );
        const totalEnteredPcs = Object.values(bundleEntries).reduce(
          (sum, v) => sum + n(v.pcs),
          0
        );
        const maxAvailMtr =
          n(bundlingCampaign.max_allowed_mtr) > 0
            ? n(bundlingCampaign.max_allowed_mtr)
            : n(bundlingCampaign.balance_to_make_mtr);
        const maxAvailPcs =
          n(bundlingCampaign.max_allowed_pcs) > 0
            ? n(bundlingCampaign.max_allowed_pcs)
            : calc(bundlingCampaign).avg > 0
            ? maxAvailMtr / calc(bundlingCampaign).avg
            : 0;
        const exceeds = totalEnteredMtr > maxAvailMtr + 0.05;

        // Combine master order and child orders for the dialog
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
            finished_mtr: bundlingCampaign.finished_output_mtr || 0,
            capping_mtr: bundlingCampaign.order_capping_mtr || Number(((bundlingCampaign.total_order_mtr || 0) * 1.1).toFixed(3)),
          },
          ...(bundlingCampaign.child_work_orders || []).map((c: any) => {
            const childTotalMtr = Number(c.total_order_mtr || c.planned_mtr || 0);
            const childAvg = (c.l1 && c.l2 ? (c.l1 + c.l2) / 2 : c.l1) || masterCalc.avg || 6.0;
            const childTotalPcs = Number(c.total_order_pcs || c.planned_pcs || 0) || (childAvg > 0 ? Math.round(childTotalMtr / childAvg) : 0);
            const childOd = Number(c.size_od || bundlingCampaign.od || 0);
            const childWt = Number(c.size_wt || bundlingCampaign.wl || 0);
            const childTotalMt = Number(c.total_order_mt || c.planned_mt || 0) || mtFromMtr(childTotalMtr, childOd, childWt);
            const childFinishedMtr = Number(c.finished_output_mtr || 0);
            const childBalMtr = Number(c.balance_to_make_mtr ?? Math.max(0, childTotalMtr - childFinishedMtr));
            const childBalPcs = childAvg > 0 ? Math.round(childBalMtr / childAvg) : 0;
            const childBalMt = mtFromMtr(childBalMtr, childOd, childWt);
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
              finished_mtr: childFinishedMtr,
              capping_mtr: childCapMtr,
            };
          }),
        ];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-teal-100 p-2.5 text-teal-700">
                    <Package size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        Finishing Campaign Bundler (Rule 2)
                      </h3>
                      <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-xs font-bold">
                        Master: {bundlingCampaign.work_order_no}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Allocate and bundle finished tubes across Master and Child work orders from the same rolling campaign.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setBundlingCampaign(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Campaign WIP Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-teal-50/50 border-b border-teal-100 px-6 py-3 text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-slate-600">
                    Available WIP from VDI QC (OK):{" "}
                    <b className="font-mono text-slate-900 text-sm">{fmt(maxAvailMtr)} MTR</b> (
                    <span className="font-mono">{fmt(maxAvailPcs)} PCS</span>)
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-600">
                    Linked Child Orders: <b>{bundlingCampaign.child_work_orders?.length || 0}</b>
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono font-bold">
                  <span className={exceeds ? "text-rose-600" : "text-teal-900"}>
                    Total Bundled: {fmt(totalEnteredMtr)} MTR ({fmt(totalEnteredPcs)} PCS)
                  </span>
                  <span className="text-slate-500">
                    Remaining: {fmt(Math.max(0, maxAvailMtr - totalEnteredMtr))} MTR
                  </span>
                </div>
              </div>

              {/* Work Orders Bundling Table */}
              <div className="overflow-y-auto p-6 flex-1">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-bold">Role</th>
                      <th className="px-3 py-2 font-bold">Work Order</th>
                      <th className="px-3 py-2 font-bold">Customer & Specs</th>
                      <th className="px-3 py-2 font-bold bg-slate-200/60 text-slate-800">Total Order</th>
                      <th className="px-3 py-2 font-bold bg-indigo-100/60 text-indigo-900">Balance to Make</th>
                      <th className="px-3 py-2 font-bold bg-amber-100/60 text-amber-900">110% Cap</th>
                      <th className="px-3 py-2 font-bold text-center w-24 bg-blue-50">Bundle PCS</th>
                      <th className="px-3 py-2 font-bold text-center w-24 bg-blue-50">Bundle MTR</th>
                      <th className="px-3 py-2 font-bold">Bundle / Lot No.</th>
                      <th className="px-3 py-2 font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ordersList.map((wo) => {
                      const entry = bundleEntries[wo.id] || {
                        pcs: "",
                        mtr: "",
                        bundleNo: "",
                        remarks: "",
                      };
                      const rowMtr = n(entry.mtr);
                      const maxCap = wo.capping_mtr || (wo.total_order_mtr > 0 ? wo.total_order_mtr * 1.1 : 0);
                      const rowExceeds110 = maxCap > 0 && rowMtr + (wo.finished_mtr || 0) > maxCap + 0.05;

                      return (
                        <tr
                          key={wo.id}
                          className={
                            wo.isMaster ? "bg-indigo-50/30 font-medium" : "hover:bg-slate-50"
                          }
                        >
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {wo.isMaster ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[11px] font-bold">
                                <Crown size={11} /> Master
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-[11px] font-semibold">
                                <Link2 size={11} /> Child
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                            {wo.work_order_no}
                          </td>

                          <td className="px-3 py-2.5 max-w-[130px] truncate text-slate-600">
                            <div>{wo.customer_name || "—"}</div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {wo.size_od} × {wo.size_wt} mm ({fmt(wo.avg, "m")})
                            </div>
                          </td>

                          {/* Total Order */}
                          <td className="px-3 py-2.5 whitespace-nowrap bg-slate-50/60 font-mono text-[11px]">
                            <div className="font-bold text-slate-800">{fmt(wo.total_order_pcs)} PCS</div>
                            <div className="text-slate-600">
                              {fmt(wo.total_order_mtr, " MTR")} · <span className="text-blue-700 font-semibold">{fmt(wo.total_order_mt, " MT")}</span>
                            </div>
                          </td>

                          {/* Balance to Make */}
                          <td className="px-3 py-2.5 whitespace-nowrap bg-indigo-50/30 font-mono text-[11px]">
                            <div className="font-bold text-indigo-900">{fmt(wo.balance_to_make_pcs)} PCS</div>
                            <div className="text-indigo-700">
                              {fmt(wo.balance_to_make_mtr, " MTR")} · <span className="font-semibold">{fmt(wo.balance_to_make_mt, " MT")}</span>
                            </div>
                          </td>

                          {/* 110% Capping */}
                          <td className="px-3 py-2.5 whitespace-nowrap bg-amber-50/30 font-mono text-[11px]">
                            <div className="font-bold text-amber-900">{fmt(wo.capping_mtr, " MTR")}</div>
                            <div className="text-[10px] text-amber-700 font-sans">110% Max Limit</div>
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={entry.pcs}
                              onChange={(e) =>
                                updateBundleEntry(wo.id, "pcs", e.target.value, wo.avg)
                              }
                              className={`w-20 rounded-lg border px-2 py-1 text-center font-mono font-bold ${
                                rowExceeds110
                                  ? "border-rose-500 bg-rose-50/60 text-rose-700 ring-1 ring-rose-500"
                                  : "border-slate-300 bg-white text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                              }`}
                            />
                          </td>

                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0.00"
                              value={entry.mtr}
                              onChange={(e) =>
                                updateBundleEntry(wo.id, "mtr", e.target.value, wo.avg)
                              }
                              className={`w-20 rounded-lg border px-2 py-1 text-center font-mono font-bold ${
                                rowExceeds110
                                  ? "border-rose-500 bg-rose-50/60 text-rose-700 ring-1 ring-rose-500"
                                  : "border-slate-300 bg-white text-teal-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                              }`}
                            />
                            {rowExceeds110 && (
                              <div className="text-[10px] text-rose-600 font-semibold mt-0.5 whitespace-nowrap">
                                Exceeds 110%!
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2.5">
                            <input
                              type="text"
                              placeholder="e.g. BDL-101"
                              value={entry.bundleNo}
                              onChange={(e) =>
                                updateBundleEntry(wo.id, "bundleNo", e.target.value, wo.avg)
                              }
                              className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-teal-500"
                            />
                          </td>

                          <td className="px-3 py-2.5">
                            <input
                              type="text"
                              placeholder="Notes..."
                              value={entry.remarks}
                              onChange={(e) =>
                                updateBundleEntry(wo.id, "remarks", e.target.value, wo.avg)
                              }
                              className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-teal-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {exceeds && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                    <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                    <span>
                      Total bundled quantity ({fmt(totalEnteredMtr)} MTR) exceeds the available WIP balance ({fmt(maxAvailMtr)} MTR) for this campaign. Please adjust quantities.
                    </span>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setBundlingCampaign(null)}
                  disabled={bundlingSaving}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCampaignBundling}
                  disabled={bundlingSaving || totalEnteredMtr <= 0 || exceeds}
                  className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2 text-sm shadow cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {bundlingSaving ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      Saving Bundles...
                    </>
                  ) : (
                    <>
                      <Package size={15} />
                      Record All Bundles ({fmt(totalEnteredMtr)} MTR)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
