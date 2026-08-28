import { mockStore } from './mock-store';

export function createMockClient() {
  return {
    auth: {
      async getUser() {
        return {
          data: {
            user: {
              id: 'mock-user-1',
              email: 'admin@seamlesswip.com',
              user_metadata: { role: 'Admin', full_name: 'PPC Administrator' },
            },
          },
          error: null,
        };
      },
      async getSession() {
        return {
          data: {
            session: {
              user: {
                id: 'mock-user-1',
                email: 'admin@seamlesswip.com',
              },
            },
          },
          error: null,
        };
      },
      async signInWithPassword(_credentials: { email?: string; password?: string }) {
        return {
          data: {
            user: { id: 'mock-user-1', email: 'admin@seamlesswip.com' },
            session: { access_token: 'mock-token' },
          },
          error: null,
        };
      },
      async signOut() {
        return { error: null };
      },
    },

    from(table: string) {
      let data: any[] = [];
      if (table === 'vw_dashboard_kpis') {
        data = [mockStore.getDashboardKPIs()];
      } else if (table === 'vw_route_stage_wip') {
        data = mockStore.getRouteStageWIP();
      } else if (table === 'vw_work_order_summary') {
        data = mockStore.getWorkOrderSummary();
      } else if (table === 'work_orders') {
        data = [...mockStore.workOrders];
      } else if (table === 'process_routes') {
        data = [...mockStore.routes];
      } else if (table === 'process_stages') {
        data = [...mockStore.stages];
      } else if (table === 'rolling_plans') {
        data = [...mockStore.rollingPlans];
      } else if (table === 'diversion_plans') {
        data = [...mockStore.diversions];
      } else if (table === 'production_logs') {
        data = [...mockStore.productionLogs];
      }

      const filters: ((item: any) => boolean)[] = [];
      let sortFn: ((a: any, b: any) => number) | null = null;
      let limitCount: number | null = null;

      const builder = {
        select(_cols?: string) {
          return builder;
        },
        eq(field: string, val: any) {
          filters.push(item => item[field] === val);
          return builder;
        },
        gt(field: string, val: any) {
          filters.push(item => (Number(item[field]) || 0) > Number(val));
          return builder;
        },
        gte(field: string, val: any) {
          filters.push(item => (Number(item[field]) || 0) >= Number(val));
          return builder;
        },
        lt(field: string, val: any) {
          filters.push(item => (Number(item[field]) || 0) < Number(val));
          return builder;
        },
        lte(field: string, val: any) {
          filters.push(item => (Number(item[field]) || 0) <= Number(val));
          return builder;
        },
        order(field: string, options?: { ascending?: boolean }) {
          const asc = options?.ascending !== false;
          sortFn = (a: any, b: any) => {
            if (a[field] < b[field]) return asc ? -1 : 1;
            if (a[field] > b[field]) return asc ? 1 : -1;
            return 0;
          };
          return builder;
        },
        limit(n: number) {
          limitCount = n;
          return builder;
        },
        async maybeSingle() {
          let result = [...data];
          for (const f of filters) result = result.filter(f);
          if (sortFn) result.sort(sortFn);
          return { data: result[0] ?? null, error: null };
        },
        async single() {
          let result = [...data];
          for (const f of filters) result = result.filter(f);
          if (sortFn) result.sort(sortFn);
          return { data: result[0] ?? null, error: null };
        },
        async insert(payload: any) {
          const items = Array.isArray(payload) ? payload : [payload];
          for (const item of items) {
            const newItem = {
              id: item.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              ...item,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (table === 'work_orders') {
              mockStore.workOrders.push(newItem);
            } else if (table === 'rolling_plans') {
              mockStore.rollingPlans.push(newItem);
            } else if (table === 'diversion_plans') {
              mockStore.diversions.push(newItem);
            } else if (table === 'production_logs') {
              mockStore.productionLogs.push(newItem);
            }
          }
          mockStore.saveToStorage();
          return { data: items, error: null };
        },
        async update(payload: any) {
          if (table === 'work_orders') {
            for (const wo of mockStore.workOrders) {
              if (filters.every(f => f(wo))) {
                Object.assign(wo, payload, { updated_at: new Date().toISOString() });
              }
            }
          }
          mockStore.saveToStorage();
          return { error: null };
        },
        async delete() {
          if (table === 'rolling_plans') {
            mockStore.rollingPlans = mockStore.rollingPlans.filter(p => !filters.every(f => f(p)));
          } else if (table === 'production_logs') {
            mockStore.productionLogs = mockStore.productionLogs.filter(p => !filters.every(f => f(p)));
          }
          mockStore.saveToStorage();
          return { error: null };
        },
        then(resolve: (val: { data: any[]; error: null }) => void) {
          let result = [...data];
          for (const f of filters) result = result.filter(f);
          if (sortFn) result.sort(sortFn);
          if (limitCount !== null) result = result.slice(0, limitCount);
          resolve({ data: result, error: null });
        },
      };

      return builder;
    },

    async rpc(funcName: string, args: Record<string, any> = {}) {
      switch (funcName) {
        case 'get_unplanned_qty': {
          const val = mockStore.getUnplannedQty(args.p_work_order_id);
          return { data: val, error: null };
        }
        case 'get_production_entry_queue': {
          const list = mockStore.getProductionEntryQueue(args.p_stage_code);
          return { data: list, error: null };
        }
        case 'get_production_entries': {
          const list = mockStore.getProductionEntries({
            search: args.p_search,
            stage_code: args.p_stage_code,
            route_code: args.p_route_code,
            from_date: args.p_from_date,
            to_date: args.p_to_date,
            limit: args.p_limit,
            offset: args.p_offset,
          });
          return { data: list, error: null };
        }
        case 'get_rolling_plans': {
          const list = mockStore.getRollingPlans({
            search: args.p_search,
            route_code: args.p_route_code,
            from_date: args.p_from_date,
            to_date: args.p_to_date,
            limit: args.p_limit,
            offset: args.p_offset,
          });
          return { data: list, error: null };
        }
        case 'create_rolling_plan': {
          const wo = mockStore.workOrders.find(w => w.id === args.p_work_order_id);
          if (!wo) return { data: null, error: new Error('Work Order not found') };
          const avail = mockStore.getUnplannedQty(args.p_work_order_id);
          if (args.p_planned_qty > avail) {
            return { data: null, error: new Error(`Planned MTR ${args.p_planned_qty} exceeds unplanned MTR ${avail}`) };
          }
          const planNo = `RP-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
          mockStore.rollingPlans.push({
            id: `rp-${Date.now()}`,
            plan_no: planNo,
            work_order_id: args.p_work_order_id,
            planned_rolling_date: args.p_rolling_date,
            planned_qty: Number(args.p_planned_qty),
            process_route_id: args.p_route_id,
            target_mother_size: args.p_target_mother_size || null,
            multiple: Number(args.p_multiple || 1),
            status: 'Scheduled',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (wo.status === 'Pending Plan') {
            wo.status = 'Scheduled';
          }
          mockStore.saveToStorage();
          return { data: planNo, error: null };
        }
        case 'update_rolling_plan': {
          const plan = mockStore.rollingPlans.find(p => p.id === args.p_plan_id);
          if (!plan) return { error: new Error('Plan not found') };
          plan.planned_qty = Number(args.p_planned_qty);
          plan.planned_rolling_date = args.p_rolling_date;
          plan.process_route_id = args.p_route_id;
          plan.target_mother_size = args.p_target_mother_size || null;
          plan.multiple = Number(args.p_multiple || 1);
          plan.updated_at = new Date().toISOString();
          mockStore.saveToStorage();
          return { error: null };
        }
        case 'delete_rolling_plan': {
          mockStore.rollingPlans = mockStore.rollingPlans.filter(p => p.id !== args.p_plan_id);
          mockStore.saveToStorage();
          return { error: null };
        }
        case 'create_diversion': {
          if (args.p_source === args.p_target) {
            return { error: new Error('Source and target WO cannot be same') };
          }
          const avail = mockStore.getUnplannedQty(args.p_source);
          if (Number(args.p_qty) > avail) {
            return { error: new Error('Diversion exceeds available source quantity') };
          }
          const id = `div-${Date.now()}`;
          mockStore.diversions.push({
            id,
            source_wo_id: args.p_source,
            target_wo_id: args.p_target,
            diverted_qty: Number(args.p_qty),
            process_route_id: args.p_route,
            multiple: Number(args.p_multiple || 1),
            reason: args.p_reason || '',
            diversion_date: args.p_date || new Date().toISOString().slice(0, 10),
            created_at: new Date().toISOString(),
          });
          mockStore.saveToStorage();
          return { data: id, error: null };
        }
        case 'record_production': {
          const stage = mockStore.stages.find(s => s.stage_code === args.p_stage_code);
          const stageId = stage?.id || 'stage-1';
          const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          mockStore.productionLogs.push({
            id,
            work_order_id: args.p_work_order_id,
            stage_id: stageId,
            process_route_id: args.p_route_id,
            process_date: args.p_process_date,
            input_qty: Number(args.p_input_qty),
            output_qty: Number(args.p_output_qty),
            rejection_qty: Number(args.p_rejection_qty || 0),
            htc_ok: Number(args.p_htc_ok || 0),
            heat_lot_no: args.p_heat_lot_no || null,
            remarks: args.p_remarks || null,
            created_at: new Date().toISOString(),
          });
          const wo = mockStore.workOrders.find(w => w.id === args.p_work_order_id);
          if (wo && wo.status !== 'Completed') {
            wo.status = 'In Progress';
          }
          mockStore.saveToStorage();
          return { data: id, error: null };
        }
        case 'update_production_entry': {
          const entry = mockStore.productionLogs.find(p => p.id === args.p_production_id);
          if (!entry) return { error: new Error('Production entry not found') };
          entry.process_date = args.p_process_date;
          entry.output_qty = Number(args.p_output_qty);
          entry.rejection_qty = Number(args.p_rejection_qty || 0);
          entry.htc_ok = Number(args.p_htc_ok || 0);
          entry.heat_lot_no = args.p_heat_lot_no || null;
          entry.remarks = args.p_remarks || null;
          mockStore.saveToStorage();
          return { error: null };
        }
        case 'delete_production_entry': {
          mockStore.productionLogs = mockStore.productionLogs.filter(p => p.id !== args.p_production_id);
          mockStore.saveToStorage();
          return { error: null };
        }
        case 'import_work_order': {
          const wo: any = {
            id: `wo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            work_order_no: args.p_work_order_no,
            customer_name: args.p_customer_name || null,
            specification: args.p_specification || null,
            grade: args.p_specification || null,
            size_od: args.p_od,
            size_wt: args.p_wl,
            od: args.p_od,
            wt: args.p_wl,
            wl: args.p_wl,
            l1: args.p_l1,
            l2: args.p_l2,
            ordered_qty: args.p_ordered_qty_mtr || args.p_ordered_qty_pcs || 100,
            ordered_qty_pcs: args.p_ordered_qty_pcs || 0,
            ordered_qty_mtr: args.p_ordered_qty_mtr || 0,
            ordered_qty_mt: args.p_ordered_qty_mt || 0,
            balance_qty_pcs: args.p_balance_qty_pcs || 0,
            balance_qty_mtr: args.p_balance_qty_mtr || 0,
            balance_qty_mt: args.p_balance_qty_mt || 0,
            uom: 'Mtrs',
            target_date: null,
            status: 'Pending Plan',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          mockStore.workOrders.push(wo);
          mockStore.saveToStorage();
          return { data: wo.id, error: null };
        }
        default:
          return { data: null, error: null };
      }
    },
  };
}
