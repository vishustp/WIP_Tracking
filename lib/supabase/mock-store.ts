// In-memory / browser-persistent fallback for Supabase when external DB is not connected.

export type MockWorkOrder = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification?: string | null;
  size_od: number | null;
  size_wt: number | null;
  od?: number | null;
  wt?: number | null;
  wl?: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number;
  ordered_qty_pcs?: number;
  ordered_qty_mtr?: number;
  ordered_qty_mt?: number;
  balance_qty_pcs?: number;
  balance_qty_mtr?: number;
  balance_qty_mt?: number;
  uom: 'Pcs' | 'Mtrs';
  target_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type MockRoute = {
  id: string;
  route_code: string;
  route_name: string;
  material_category: string;
  active: boolean;
  created_at: string;
};

export type MockStage = {
  id: string;
  stage_code: string;
  stage_name: string;
  active: boolean;
  created_at: string;
};

export type MockRouteStage = {
  id: string;
  route_id: string;
  stage_id: string;
  sequence_no: number;
  is_required: boolean;
};

export type MockRollingPlan = {
  id: string;
  plan_no: string;
  work_order_id: string;
  planned_rolling_date: string;
  planned_qty: number;
  process_route_id: string;
  target_mother_size: string | null;
  multiple: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type MockDiversionPlan = {
  id: string;
  source_wo_id: string;
  target_wo_id: string;
  diverted_qty: number;
  process_route_id: string;
  multiple: number;
  reason: string;
  approved_by?: string | null;
  diversion_date: string;
  created_at: string;
};

export type MockProductionLog = {
  id: string;
  work_order_id: string;
  rolling_plan_id?: string | null;
  stage_id: string;
  process_route_id: string;
  process_date: string;
  input_qty: number;
  output_qty: number;
  rejection_qty: number;
  htc_ok: number;
  heat_lot_no: string | null;
  qa_clearance?: string | null;
  remarks: string | null;
  created_at: string;
};

const DEFAULT_ROUTES: MockRoute[] = [
  { id: 'route-1', route_code: 'HFS', route_name: 'Standard HFS', material_category: 'Standard', active: true, created_at: new Date().toISOString() },
  { id: 'route-2', route_code: 'CDS', route_name: 'Standard CDS', material_category: 'Standard', active: true, created_at: new Date().toISOString() },
  { id: 'route-3', route_code: 'ALLOY_HFS', route_name: 'Alloy HFS', material_category: 'Alloy', active: true, created_at: new Date().toISOString() },
  { id: 'route-4', route_code: 'ALLOY_CDS', route_name: 'Alloy CDS', material_category: 'Alloy', active: true, created_at: new Date().toISOString() },
];

const DEFAULT_STAGES: MockStage[] = [
  { id: 'stage-1', stage_code: 'ROLLING', stage_name: 'Rolling', active: true, created_at: new Date().toISOString() },
  { id: 'stage-2', stage_code: 'HOLLOW_HEAT_TREATMENT', stage_name: 'Hollow Heat Treatment', active: true, created_at: new Date().toISOString() },
  { id: 'stage-3', stage_code: 'DRAW', stage_name: 'Draw', active: true, created_at: new Date().toISOString() },
  { id: 'stage-4', stage_code: 'HEAT_TREATMENT', stage_name: 'Heat Treatment', active: true, created_at: new Date().toISOString() },
  { id: 'stage-5', stage_code: 'FINISHING', stage_name: 'Finishing', active: true, created_at: new Date().toISOString() },
];

const DEFAULT_ROUTE_STAGES: MockRouteStage[] = [
  // HFS: ROLLING (1) -> FINISHING (2)
  { id: 'rs-1', route_id: 'route-1', stage_id: 'stage-1', sequence_no: 1, is_required: true },
  { id: 'rs-2', route_id: 'route-1', stage_id: 'stage-5', sequence_no: 2, is_required: true },
  // CDS: ROLLING (1) -> DRAW (2) -> HEAT_TREATMENT (3) -> FINISHING (4)
  { id: 'rs-3', route_id: 'route-2', stage_id: 'stage-1', sequence_no: 1, is_required: true },
  { id: 'rs-4', route_id: 'route-2', stage_id: 'stage-3', sequence_no: 2, is_required: true },
  { id: 'rs-5', route_id: 'route-2', stage_id: 'stage-4', sequence_no: 3, is_required: true },
  { id: 'rs-6', route_id: 'route-2', stage_id: 'stage-5', sequence_no: 4, is_required: true },
  // ALLOY_HFS: ROLLING (1) -> HOLLOW_HEAT_TREATMENT (2) -> FINISHING (3)
  { id: 'rs-7', route_id: 'route-3', stage_id: 'stage-1', sequence_no: 1, is_required: true },
  { id: 'rs-8', route_id: 'route-3', stage_id: 'stage-2', sequence_no: 2, is_required: true },
  { id: 'rs-9', route_id: 'route-3', stage_id: 'stage-5', sequence_no: 3, is_required: true },
  // ALLOY_CDS: ROLLING (1) -> HOLLOW_HEAT_TREATMENT (2) -> DRAW (3) -> HEAT_TREATMENT (4) -> FINISHING (5)
  { id: 'rs-10', route_id: 'route-4', stage_id: 'stage-1', sequence_no: 1, is_required: true },
  { id: 'rs-11', route_id: 'route-4', stage_id: 'stage-2', sequence_no: 2, is_required: true },
  { id: 'rs-12', route_id: 'route-4', stage_id: 'stage-3', sequence_no: 3, is_required: true },
  { id: 'rs-13', route_id: 'route-4', stage_id: 'stage-4', sequence_no: 4, is_required: true },
  { id: 'rs-14', route_id: 'route-4', stage_id: 'stage-5', sequence_no: 5, is_required: true },
];

const DEFAULT_WORK_ORDERS: MockWorkOrder[] = [
  {
    id: 'wo-101',
    work_order_no: 'WO-2025-001',
    customer_name: 'Apex Precision Tubes',
    grade: 'ASTM A106 Gr.B',
    specification: 'Seamless Carbon Steel',
    size_od: 88.9,
    size_wt: 7.62,
    od: 88.9,
    wt: 7.62,
    wl: 7.62,
    l1: 6.0,
    l2: 6.5,
    ordered_qty: 1200,
    ordered_qty_pcs: 192,
    ordered_qty_mtr: 1200,
    ordered_qty_mt: 18.3,
    balance_qty_pcs: 192,
    balance_qty_mtr: 1200,
    balance_qty_mt: 18.3,
    uom: 'Mtrs',
    target_date: '2026-09-15',
    status: 'In Progress',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'wo-102',
    work_order_no: 'WO-2025-002',
    customer_name: 'Titanium Hydro Systems',
    grade: 'ASTM A335 P11',
    specification: 'Alloy Steel Boiler Pipe',
    size_od: 114.3,
    size_wt: 8.56,
    od: 114.3,
    wt: 8.56,
    wl: 8.56,
    l1: 5.8,
    l2: 6.2,
    ordered_qty: 850,
    ordered_qty_pcs: 142,
    ordered_qty_mtr: 850,
    ordered_qty_mt: 18.95,
    balance_qty_pcs: 142,
    balance_qty_mtr: 850,
    balance_qty_mt: 18.95,
    uom: 'Mtrs',
    target_date: '2026-09-20',
    status: 'Scheduled',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'wo-103',
    work_order_no: 'WO-2025-003',
    customer_name: 'Global Heavy Engg',
    grade: 'ASTM A213 T22',
    specification: 'Seamless Alloy Heat Exchanger',
    size_od: 60.3,
    size_wt: 5.54,
    od: 60.3,
    wt: 5.54,
    wl: 5.54,
    l1: 6.0,
    l2: 6.0,
    ordered_qty: 1500,
    ordered_qty_pcs: 250,
    ordered_qty_mtr: 1500,
    ordered_qty_mt: 11.2,
    balance_qty_pcs: 250,
    balance_qty_mtr: 1500,
    balance_qty_mt: 11.2,
    uom: 'Mtrs',
    target_date: '2026-09-28',
    status: 'Pending Plan',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'wo-104',
    work_order_no: 'WO-2025-004',
    customer_name: 'Vanguard Oilfield Tools',
    grade: 'API 5L X52',
    specification: 'Line Pipe High Yield',
    size_od: 168.3,
    size_wt: 11.0,
    od: 168.3,
    wt: 11.0,
    wl: 11.0,
    l1: 11.8,
    l2: 12.2,
    ordered_qty: 600,
    ordered_qty_pcs: 50,
    ordered_qty_mtr: 600,
    ordered_qty_mt: 25.6,
    balance_qty_pcs: 50,
    balance_qty_mtr: 600,
    balance_qty_mt: 25.6,
    uom: 'Mtrs',
    target_date: '2026-10-05',
    status: 'Pending Plan',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'wo-105',
    work_order_no: 'WO-2025-005',
    customer_name: 'Metallo Dynamics Corp',
    grade: 'ASTM A519 4130',
    specification: 'Mechanical Tubing',
    size_od: 73.0,
    size_wt: 9.5,
    od: 73.0,
    wt: 9.5,
    wl: 9.5,
    l1: 5.5,
    l2: 6.1,
    ordered_qty: 900,
    ordered_qty_pcs: 155,
    ordered_qty_mtr: 900,
    ordered_qty_mt: 13.4,
    balance_qty_pcs: 155,
    balance_qty_mtr: 900,
    balance_qty_mt: 13.4,
    uom: 'Mtrs',
    target_date: '2026-10-12',
    status: 'Pending Plan',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEFAULT_ROLLING_PLANS: MockRollingPlan[] = [
  {
    id: 'rp-1',
    plan_no: 'RP-20250801-01',
    work_order_id: 'wo-101',
    planned_rolling_date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
    planned_qty: 600,
    process_route_id: 'route-2', // CDS
    target_mother_size: '108 x 10.0',
    multiple: 1,
    status: 'Scheduled',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'rp-2',
    plan_no: 'RP-20250802-02',
    work_order_id: 'wo-102',
    planned_rolling_date: new Date().toISOString().slice(0, 10),
    planned_qty: 500,
    process_route_id: 'route-4', // ALLOY_CDS
    target_mother_size: '139.7 x 12.0',
    multiple: 1,
    status: 'Scheduled',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

const DEFAULT_PRODUCTION_LOGS: MockProductionLog[] = [
  {
    id: 'pl-1',
    work_order_id: 'wo-101',
    rolling_plan_id: 'rp-1',
    stage_id: 'stage-1', // ROLLING
    process_route_id: 'route-2',
    process_date: new Date(Date.now() - 86400000 * 1).toISOString().slice(0, 10),
    input_qty: 300,
    output_qty: 300,
    rejection_qty: 12.5,
    htc_ok: 287.5,
    heat_lot_no: 'HT-99824',
    remarks: 'Smooth rolling run',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

const DEFAULT_DIVERSIONS: MockDiversionPlan[] = [];

class MockStore {
  routes: MockRoute[] = [...DEFAULT_ROUTES];
  stages: MockStage[] = [...DEFAULT_STAGES];
  routeStages: MockRouteStage[] = [...DEFAULT_ROUTE_STAGES];
  workOrders: MockWorkOrder[] = [...DEFAULT_WORK_ORDERS];
  rollingPlans: MockRollingPlan[] = [...DEFAULT_ROLLING_PLANS];
  diversions: MockDiversionPlan[] = [...DEFAULT_DIVERSIONS];
  productionLogs: MockProductionLog[] = [...DEFAULT_PRODUCTION_LOGS];

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
    }
  }

  saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('seamless_wip_work_orders', JSON.stringify(this.workOrders));
      localStorage.setItem('seamless_wip_rolling_plans', JSON.stringify(this.rollingPlans));
      localStorage.setItem('seamless_wip_diversions', JSON.stringify(this.diversions));
      localStorage.setItem('seamless_wip_production_logs', JSON.stringify(this.productionLogs));
    } catch {}
  }

  loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const wo = localStorage.getItem('seamless_wip_work_orders');
      if (wo) this.workOrders = JSON.parse(wo);
      const rp = localStorage.getItem('seamless_wip_rolling_plans');
      if (rp) this.rollingPlans = JSON.parse(rp);
      const dp = localStorage.getItem('seamless_wip_diversions');
      if (dp) this.diversions = JSON.parse(dp);
      const pl = localStorage.getItem('seamless_wip_production_logs');
      if (pl) this.productionLogs = JSON.parse(pl);
    } catch {}
  }

  getUnplannedQty(woId: string): number {
    const wo = this.workOrders.find(w => w.id === woId);
    if (!wo) return 0;
    const baseQty = Number(wo.balance_qty_mtr ?? wo.ordered_qty_mtr ?? wo.ordered_qty ?? 0);
    const planned = this.rollingPlans
      .filter(p => p.work_order_id === woId)
      .reduce((sum, p) => sum + Number(p.planned_qty || 0), 0);
    const diverted = this.diversions
      .filter(d => d.source_wo_id === woId)
      .reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0);
    return Math.max(0, baseQty - planned - diverted);
  }

  getProductionEntryQueue(stageCode: string) {
    const stage = this.stages.find(s => s.stage_code === stageCode);
    if (!stage) return [];

    const queue: any[] = [];

    // Find all WOs associated with rolling plans or diversions
    const targets: { woId: string; routeId: string }[] = [];
    for (const rp of this.rollingPlans) {
      if (!targets.some(t => t.woId === rp.work_order_id && t.routeId === rp.process_route_id)) {
        targets.push({ woId: rp.work_order_id, routeId: rp.process_route_id });
      }
    }
    for (const dp of this.diversions) {
      if (!targets.some(t => t.woId === dp.target_wo_id && t.routeId === dp.process_route_id)) {
        targets.push({ woId: dp.target_wo_id, routeId: dp.process_route_id });
      }
    }

    for (const target of targets) {
      const wo = this.workOrders.find(w => w.id === target.woId);
      const route = this.routes.find(r => r.id === target.routeId && r.active);
      if (!wo || !route) continue;

      // Check if this stage belongs to this route
      const rs = this.routeStages.find(s => s.route_id === route.id && s.stage_id === stage.id);
      if (!rs) continue;

      // Retrieve Multiple from Rolling Plan or Diversion for this WO & Route
      const plan = this.rollingPlans.find(rp => rp.work_order_id === wo.id && rp.process_route_id === route.id);
      const diversion = this.diversions.find(dp => dp.target_wo_id === wo.id && dp.process_route_id === route.id);
      const multiple = Math.max(1, Number(plan?.multiple ?? diversion?.multiple ?? 1));

      const l1 = Number(wo.l1 || 0);
      const l2 = Number(wo.l2 || 0);
      const avgLength = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6.0;

      // Calculate balance_to_make_mtr based on stage sequence
      let balanceMtr = 0;
      let htNos = 0;

      if (stageCode === 'ROLLING') {
        const plannedRolling = this.rollingPlans
          .filter(rp => rp.work_order_id === wo.id && rp.process_route_id === route.id)
          .reduce((sum, rp) => sum + Number(rp.planned_qty || 0), 0);
        const divertedIn = this.diversions
          .filter(dp => dp.target_wo_id === wo.id && dp.process_route_id === route.id)
          .reduce((sum, dp) => sum + Number(dp.diverted_qty || 0), 0);
        const rollingInput = this.productionLogs
          .filter(pl => pl.work_order_id === wo.id && pl.process_route_id === route.id && pl.stage_id === 'stage-1')
          .reduce((sum, pl) => sum + Number(pl.input_qty || 0), 0);
        balanceMtr = Math.max(0, plannedRolling + divertedIn - rollingInput);
        const motherPieceLength = avgLength * multiple;
        htNos = motherPieceLength > 0 ? Number((balanceMtr / motherPieceLength).toFixed(2)) : 0;
      } else {
        // Look up previous stage in route
        const allStagesInRoute = this.routeStages
          .filter(s => s.route_id === route.id)
          .sort((a, b) => a.sequence_no - b.sequence_no);
        const currentIdx = allStagesInRoute.findIndex(s => s.stage_id === stage.id);
        if (currentIdx > 0) {
          const prevStageId = allStagesInRoute[currentIdx - 1].stage_id;
          const prevNetOutput = this.productionLogs
            .filter(pl => pl.work_order_id === wo.id && pl.process_route_id === route.id && pl.stage_id === prevStageId)
            .reduce((sum, pl) => sum + Math.max(0, Number(pl.output_qty || 0) - Number(pl.rejection_qty || 0)), 0);
          const thisInput = this.productionLogs
            .filter(pl => pl.work_order_id === wo.id && pl.process_route_id === route.id && pl.stage_id === stage.id)
            .reduce((sum, pl) => sum + Number(pl.input_qty || 0), 0);
          balanceMtr = Math.max(0, prevNetOutput - thisInput);

          // If stage is FINISHING, HT piece length = Finished Avg Length * Multiple
          const htPieceLength = avgLength * multiple;
          htNos = htPieceLength > 0 ? Number((balanceMtr / htPieceLength).toFixed(2)) : 0;
        }
      }

      const od = Number(wo.size_od ?? wo.od ?? 0);
      const wt = Number(wo.size_wt ?? wo.wt ?? wo.wl ?? 0);
      // Finishing pieces = Multiple * Heat Treatment Nos
      const pcs = stageCode === 'FINISHING' ? htNos * multiple : (avgLength > 0 ? balanceMtr / avgLength : 0);
      const mt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * balanceMtr;

      queue.push({
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
        customer_name: wo.customer_name,
        specification: wo.specification || wo.grade,
        od: od || null,
        wl: wt || null,
        l1: wo.l1 ?? null,
        l2: wo.l2 ?? null,
        avg_length: avgLength,
        route_id: route.id,
        route_code: route.route_code,
        route_name: route.route_name,
        stage_code: stageCode,
        balance_to_make_mtr: balanceMtr,
        balance_to_make_pcs: pcs,
        balance_to_make_mt: mt,
        multiple: multiple,
        ht_nos: htNos,
      });
    }

    return queue;
  }

  getProductionEntries(params: {
    search?: string | null;
    stage_code?: string | null;
    route_code?: string | null;
    from_date?: string | null;
    to_date?: string | null;
    limit?: number;
    offset?: number;
  }) {
    let list = this.productionLogs.map((pl, idx, arr) => {
      const wo = this.workOrders.find(w => w.id === pl.work_order_id);
      const route = this.routes.find(r => r.id === pl.process_route_id);
      const stage = this.stages.find(s => s.id === pl.stage_id);
      const od = Number(wo?.size_od ?? wo?.od ?? 0);
      const wt = Number(wo?.size_wt ?? wo?.wt ?? wo?.wl ?? 0);
      const l1 = Number(wo?.l1 || 0);
      const l2 = Number(wo?.l2 || 0);
      const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6.0;

      const inMtr = Number(pl.input_qty || 0);
      const outMtr = Number(pl.output_qty || 0);
      const rejMtr = Number(pl.rejection_qty || 0);
      const inPcs = avg > 0 ? inMtr / avg : 0;
      const outPcs = avg > 0 ? outMtr / avg : 0;
      const rejPcs = avg > 0 ? rejMtr / avg : 0;
      const inMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * inMtr;
      const outMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * outMtr;
      const rejMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * rejMtr;

      // can_modify if no subsequent production entry exists for this work order & route
      const laterEntries = arr.filter(
        other =>
          other.id !== pl.id &&
          other.work_order_id === pl.work_order_id &&
          other.process_route_id === pl.process_route_id &&
          new Date(other.created_at).getTime() > new Date(pl.created_at).getTime()
      );

      return {
        id: pl.id,
        work_order_no: wo?.work_order_no ?? 'UNKNOWN',
        customer_name: wo?.customer_name ?? null,
        route_code: route?.route_code ?? 'HFS',
        stage_code: (stage?.stage_code ?? 'ROLLING') as any,
        process_date: pl.process_date,
        od: od || null,
        wl: wt || null,
        l1: wo?.l1 ?? null,
        l2: wo?.l2 ?? null,
        avg_length: avg,
        input_mtr: inMtr,
        input_pcs: inPcs,
        input_mt: inMt,
        output_mtr: outMtr,
        output_pcs: outPcs,
        output_mt: outMt,
        rejection_mtr: rejMtr,
        rejection_pcs: rejPcs,
        rejection_mt: rejMt,
        htc_ok_mtr: Number(pl.htc_ok || 0),
        heat_lot_no: pl.heat_lot_no,
        remarks: pl.remarks,
        created_at: pl.created_at,
        can_modify: laterEntries.length === 0,
      };
    });

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(e =>
        [e.work_order_no, e.customer_name, e.route_code, e.stage_code, e.heat_lot_no]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    if (params.stage_code) {
      list = list.filter(e => e.stage_code === params.stage_code);
    }
    if (params.route_code) {
      list = list.filter(e => e.route_code === params.route_code);
    }
    if (params.from_date) {
      list = list.filter(e => e.process_date >= params.from_date!);
    }
    if (params.to_date) {
      list = list.filter(e => e.process_date <= params.to_date!);
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list.slice(params.offset || 0, (params.offset || 0) + (params.limit || 2000));
  }

  getRollingPlans(params: {
    search?: string | null;
    route_code?: string | null;
    from_date?: string | null;
    to_date?: string | null;
    limit?: number;
    offset?: number;
  }) {
    let list = this.rollingPlans.map(rp => {
      const wo = this.workOrders.find(w => w.id === rp.work_order_id);
      const route = this.routes.find(r => r.id === rp.process_route_id);
      const od = Number(wo?.size_od ?? wo?.od ?? 0);
      const wt = Number(wo?.size_wt ?? wo?.wt ?? wo?.wl ?? 0);
      const l1 = Number(wo?.l1 || 0);
      const l2 = Number(wo?.l2 || 0);
      const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6.0;

      const plannedMtr = Number(rp.planned_qty || 0);
      const plannedPcs = avg > 0 ? plannedMtr / avg : 0;
      const plannedMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * plannedMtr;

      const hasProduction = this.productionLogs.some(
        pl => pl.work_order_id === rp.work_order_id && pl.process_route_id === rp.process_route_id
      );

      return {
        id: rp.id,
        plan_no: rp.plan_no,
        work_order_id: rp.work_order_id,
        work_order_no: wo?.work_order_no ?? 'UNKNOWN',
        customer_name: wo?.customer_name ?? null,
        grade: wo?.grade ?? null,
        od: od || null,
        wt: wt || null,
        l1: wo?.l1 ?? null,
        l2: wo?.l2 ?? null,
        avg_length: avg,
        route_id: rp.process_route_id,
        route_code: route?.route_code ?? 'HFS',
        route_name: route?.route_name ?? 'Standard HFS',
        planned_rolling_date: rp.planned_rolling_date,
        planned_mtr: plannedMtr,
        planned_pcs: plannedPcs,
        planned_mt: plannedMt,
        target_mother_size: rp.target_mother_size,
        multiple: rp.multiple,
        status: rp.status,
        created_at: rp.created_at,
        updated_at: rp.updated_at,
        can_modify: !hasProduction,
      };
    });

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(p =>
        [p.plan_no, p.work_order_no, p.customer_name, p.grade, p.route_code]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    if (params.route_code) {
      list = list.filter(p => p.route_code === params.route_code);
    }
    if (params.from_date) {
      list = list.filter(p => p.planned_rolling_date >= params.from_date!);
    }
    if (params.to_date) {
      list = list.filter(p => p.planned_rolling_date <= params.to_date!);
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list.slice(params.offset || 0, (params.offset || 0) + (params.limit || 2000));
  }

  getDashboardKPIs() {
    const activeWo = this.workOrders.length;
    const pendingPlanning = this.workOrders.filter(w => w.status === 'Pending Plan').length;
    const scheduled = this.workOrders.filter(w => w.status === 'Scheduled').length;
    const inProgress = this.workOrders.filter(w => w.status === 'In Progress').length;
    const completedToday = this.workOrders.filter(w => w.status === 'Completed').length;
    const totalWip = this.productionLogs.reduce((sum, pl) => sum + Math.max(0, Number(pl.input_qty || 0) - Number(pl.output_qty || 0)), 0);
    const rejectionQty = this.productionLogs.reduce((sum, pl) => sum + Number(pl.rejection_qty || 0), 0);
    const delayedOrders = this.workOrders.filter(w => w.target_date && new Date(w.target_date) < new Date() && w.status !== 'Completed').length;

    return {
      active_work_orders: activeWo,
      pending_planning: pendingPlanning,
      scheduled_orders: scheduled,
      in_progress_orders: inProgress,
      completed_today: completedToday,
      total_wip: totalWip,
      rejection_qty: rejectionQty,
      delayed_orders: delayedOrders,
    };
  }

  getRouteStageWIP() {
    const list: any[] = [];
    for (const wo of this.workOrders) {
      for (const route of this.routes) {
        const rsList = this.routeStages
          .filter(rs => rs.route_id === route.id)
          .sort((a, b) => a.sequence_no - b.sequence_no);
        for (const rs of rsList) {
          const stage = this.stages.find(s => s.id === rs.stage_id);
          const logs = this.productionLogs.filter(
            pl => pl.work_order_id === wo.id && pl.process_route_id === route.id && pl.stage_id === rs.stage_id
          );
          const inQty = logs.reduce((sum, l) => sum + Number(l.input_qty || 0), 0);
          const outQty = logs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
          const rejQty = logs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
          const wip = Math.max(0, inQty - outQty);
          if (wip > 0 || inQty > 0) {
            list.push({
              work_order_no: wo.work_order_no,
              route_code: route.route_code,
              stage_name: stage?.stage_name ?? 'Stage',
              sequence_no: rs.sequence_no,
              input_qty: inQty,
              output_qty: outQty,
              rejection_qty: rejQty,
              current_wip: wip,
            });
          }
        }
      }
    }
    return list;
  }

  getWorkOrderSummary() {
    return this.workOrders.map(wo => {
      const rp = this.rollingPlans.find(r => r.work_order_id === wo.id);
      const route = rp ? this.routes.find(r => r.id === rp.process_route_id)?.route_code : null;
      const planned = this.rollingPlans
        .filter(r => r.work_order_id === wo.id)
        .reduce((sum, r) => sum + Number(r.planned_qty || 0), 0);
      const produced = this.productionLogs
        .filter(pl => pl.work_order_id === wo.id && pl.stage_id === 'stage-5')
        .reduce((sum, pl) => sum + Number(pl.output_qty || 0), 0);
      const totalPending = Math.max(0, Number(wo.balance_qty_mtr ?? wo.ordered_qty ?? 0) - produced);

      return {
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
        customer: wo.customer_name,
        od: wo.size_od ?? wo.od,
        wt: wo.size_wt ?? wo.wt ?? wo.wl,
        grade: wo.grade,
        ordered_qty: `${wo.ordered_qty} ${wo.uom}`,
        planned_qty: planned,
        produced_qty: produced,
        route: route || 'Unplanned',
        total_pending: totalPending,
        target_date: wo.target_date,
        status: wo.status,
      };
    });
  }
}

export const mockStore = new MockStore();
