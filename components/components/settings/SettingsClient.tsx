'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import { Settings as SettingsIcon, GitBranch, Layers, ShieldCheck, RefreshCw } from 'lucide-react';

interface ProcessRoute {
  id: string;
  route_code: string;
  route_name: string;
  material_category: string;
  active: boolean;
}

interface ProcessStage {
  id: string;
  stage_code: string;
  stage_name: string;
  active: boolean;
}

export default function SettingsClient() {
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const s = createClient();
      const [{ data: routesData }, { data: stagesData }] = await Promise.all([
        s.from('process_routes').select('id,route_code,route_name,material_category,active').order('route_code'),
        s.from('process_stages').select('id,stage_code,stage_name,active').order('stage_code'),
      ]);
      setRoutes((routesData ?? []) as ProcessRoute[]);
      setStages((stagesData ?? []) as ProcessStage[]);
      setLoading(false);
    }
    loadData();
  }, []);

  return (
    <RouteAccessGuard allowedGroups={['admin']} formTitle="System Settings & Process Routes">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Plant Settings & Routing</h1>
          <p className="text-sm text-slate-500 mt-0.5">Database-driven route, stage sequence, and factory master configurations.</p>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="border-b border-slate-100 p-4 font-semibold text-sm text-slate-900 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-blue-600" />
                <span>Process Routes</span>
              </div>
              <div className="divide-y divide-slate-100">
                {routes.map((r) => (
                  <div className="flex items-center justify-between p-4 text-sm" key={r.id}>
                    <div>
                      <div className="font-semibold text-slate-900">{r.route_code}</div>
                      <div className="text-slate-500">{r.route_name} · {r.material_category}</div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      r.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="border-b border-slate-100 p-4 font-semibold text-sm text-slate-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" />
                <span>Process Stages</span>
              </div>
              <div className="divide-y divide-slate-100">
                {stages.map((r) => (
                  <div className="flex items-center justify-between p-4 text-sm" key={r.id}>
                    <div>
                      <div className="font-semibold text-slate-900">{r.stage_name}</div>
                      <div className="text-slate-500 font-mono">{r.stage_code}</div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      r.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </RouteAccessGuard>
  );
}
