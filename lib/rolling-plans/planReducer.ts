export interface ChildOrderEntry {
  id: string;
  wo: any;
  plannedPcs: string;
  availableMtr: number;
}

export interface WorkOrderGroup {
  id: string;
  wo: any;
  plannedPcs: string;
  availableMtr: number;
  children: ChildOrderEntry[];

  // Process Route & Setup Specifications & Factory Tolerances
  routeId: string;
  catg: string; // 'CDS' | 'HFS'
  spec: string;
  grade: string;
  ibrStatus: string; // 'IBR' | 'NIBR'
  rmOd: string;
  rmLenMin: string;
  rmLenMax: string;
  pmOd: string;
  pmWt: string;
  pmLen: string;
  custOd: string;
  custWt: string;
  rollingWt: string;
  smLen: string;
  feLen: string;
  beLen: string;
  effLen: string;
  reqLenEr: string;
  reqLenMin: string;
  reqLenMax: string;
  multipleStr: string;
  tolOdMin: string;
  tolOdMax: string;
  tolWtMin: string;
  tolWtMax: string;
  processYieldPct: string;
  isIpCutting?: boolean;
  ipCutLength?: string;
  ipMultiple?: string;

  isSpecsExpanded?: boolean;
}

export type PlanAction =
  | { type: 'SET_GROUPS'; payload: WorkOrderGroup[] }
  | { type: 'ADD_GROUP'; payload: WorkOrderGroup }
  | { type: 'BATCH_ADD_GROUPS'; payload: WorkOrderGroup[] }
  | { type: 'REMOVE_GROUP'; payload: { groupId: string } }
  | { type: 'ADD_CHILD'; payload: { groupId: string; child: ChildOrderEntry } }
  | { type: 'REMOVE_CHILD'; payload: { groupId: string; childId: string } }
  | { type: 'UPDATE_GROUP_FIELD'; payload: { groupId: string; field: keyof WorkOrderGroup; value: any; routes?: any[] } }
  | { type: 'UPDATE_CHILD_PCS'; payload: { groupId: string; childId: string; pcs: string } }
  | { type: 'TOGGLE_SPECS'; payload: { groupId: string } }
  | { type: 'RESET_GROUPS' };

export function planGroupsReducer(state: WorkOrderGroup[], action: PlanAction): WorkOrderGroup[] {
  switch (action.type) {
    case 'SET_GROUPS':
      return action.payload;

    case 'ADD_GROUP':
      return [...state, action.payload];

    case 'BATCH_ADD_GROUPS':
      return [...state, ...action.payload];

    case 'REMOVE_GROUP':
      return state.filter((g) => g.id !== action.payload.groupId);

    case 'ADD_CHILD':
      return state.map((g) => {
        if (g.id !== action.payload.groupId) return g;
        return {
          ...g,
          children: [...g.children, action.payload.child],
        };
      });

    case 'REMOVE_CHILD':
      return state.map((g) => {
        if (g.id !== action.payload.groupId) return g;
        return {
          ...g,
          children: g.children.filter((c) => c.id !== action.payload.childId),
        };
      });

    case 'UPDATE_GROUP_FIELD': {
      const { groupId, field, value, routes } = action.payload;
      return state.map((g) => {
        if (g.id !== groupId) return g;
        const updated = { ...g, [field]: value };
        if (field === 'routeId' && Array.isArray(routes)) {
          const matchedRoute = routes.find((r) => r.id === value);
          if (matchedRoute?.material_category) {
            updated.catg = matchedRoute.material_category;
          }
        } else if (field === 'custOd') {
          const od = Number(value);
          if (od > 0) {
            updated.tolOdMin = String((od - 0.4).toFixed(2));
            updated.tolOdMax = String((od + 0.4).toFixed(2));
          }
        } else if (field === 'custWt') {
          updated.rollingWt = value;
          const wt = Number(value);
          if (wt > 0) {
            updated.tolWtMin = String((wt * 0.92).toFixed(2));
            updated.tolWtMax = String((wt * 1.1).toFixed(2));
          }
        } else if (field === 'reqLenMin' || field === 'reqLenMax') {
          const min = field === 'reqLenMin' ? Number(value) : Number(g.reqLenMin);
          const max = field === 'reqLenMax' ? Number(value) : Number(g.reqLenMax);
          updated.reqLenEr = min > 0 && min === max ? 'EL' : 'RL';
        }
        return updated;
      });
    }

    case 'UPDATE_CHILD_PCS':
      return state.map((g) => {
        if (g.id !== action.payload.groupId) return g;
        return {
          ...g,
          children: g.children.map((c) =>
            c.id === action.payload.childId ? { ...c, plannedPcs: action.payload.pcs } : c
          ),
        };
      });

    case 'TOGGLE_SPECS':
      return state.map((g) =>
        g.id === action.payload.groupId ? { ...g, isSpecsExpanded: !g.isSpecsExpanded } : g
      );

    case 'RESET_GROUPS':
      return [];

    default:
      return state;
  }
}
