"use client";

import { useState } from "react";
import {
  BookOpen,
  Printer,
  Factory,
  Flame,
  Wrench,
  Search,
  Package,
  ShieldCheck,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Layers,
  Sparkles,
  Crown,
  Link2,
  ArrowRight,
  Info,
  HelpCircle,
  Clock,
  Lock,
} from "lucide-react";

type DepartmentKey =
  | "ALL"
  | "PPC"
  | "ROLLING"
  | "HEAT_TREATMENT"
  | "DRAW"
  | "QC"
  | "FINISHING"
  | "ADMIN";

interface DeptTab {
  id: DepartmentKey;
  label: string;
  badge: string;
  icon: any;
  color: string;
}

const DEPARTMENTS: DeptTab[] = [
  { id: "ALL", label: "Complete Plant Manual", badge: "All Departments", icon: BookOpen, color: "blue" },
  { id: "PPC", label: "PPC & Planning", badge: "Planning & ERP", icon: CalendarClock, color: "indigo" },
  { id: "ROLLING", label: "Hot Rolling Mill", badge: "Work Center #1", icon: Factory, color: "amber" },
  { id: "HEAT_TREATMENT", label: "Heat Treatment & Furnaces", badge: "Work Center #2 & #4", icon: Flame, color: "orange" },
  { id: "DRAW", label: "Cold Draw Bench", badge: "Work Center #3", icon: Wrench, color: "cyan" },
  { id: "QC", label: "Quality Control (VDI)", badge: "Quality Gatekeeper", icon: Search, color: "emerald" },
  { id: "FINISHING", label: "Finishing & Dispatch", badge: "Work Center #5", icon: Package, color: "teal" },
  { id: "ADMIN", label: "Plant Admin & Supervisors", badge: "System & Governance", icon: ShieldCheck, color: "purple" },
];

export default function DepartmentTrainingManualClient() {
  const [activeDept, setActiveDept] = useState<DepartmentKey>("ALL");

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Toolbar (Hidden on Print) */}
      <div className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Department Standard Operating Procedure (SOP) & Training Manual
              </h1>
              <p className="text-xs text-slate-500">
                Steel Tube Seamless & Welded WIP Tracking System · Revision 2026.09
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold shadow-sm transition-colors cursor-pointer"
              title="Print active manual or save as PDF"
            >
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* Department Filter Navigation (Hidden on Print) */}
        <div className="mx-auto max-w-7xl mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {DEPARTMENTS.map((dept) => {
            const Icon = dept.icon;
            const isActive = activeDept === dept.id;
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => setActiveDept(dept.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-blue-400" : "text-slate-500"}`} />
                {dept.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Document Content */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 print:p-0 print:max-w-none">
        {/* Printable Cover / Header */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-none print:shadow-none print:p-0 print:mb-6">
          <div className="border-b-2 border-slate-900 pb-4 mb-4 flex items-start justify-between">
            <div>
              <div className="text-xs font-black tracking-widest uppercase text-blue-700">
                Precision Seamless Steel Tube Plant · Quality & Operations Manual
              </div>
              <h1 className="text-2xl font-black text-slate-900 mt-1">
                WIP TRACKING & MANUFACTURING EXECUTION SYSTEM (MES)
              </h1>
              <p className="text-sm font-semibold text-slate-600 mt-0.5">
                Standard Operating Procedures (SOP) & Operator Training Manual with Worked Examples
              </p>
            </div>
            <div className="text-right text-xs font-mono text-slate-500 space-y-0.5">
              <div>DOC ID: <span className="font-bold text-slate-800">SOP-WIP-TRG-01</span></div>
              <div>REV: <span className="font-bold text-purple-700">02 / Sep-2026</span></div>
              <div>APPROVED: <span className="font-bold text-slate-800">QA / Plant Head</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-white print:border-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Document Scope</span>
              <span className="font-bold text-slate-800">
                {activeDept === "ALL" ? "All Plant Departments" : DEPARTMENTS.find(d => d.id === activeDept)?.label}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Applicable Stages</span>
              <span className="font-bold text-slate-800">Rolling · Heat Treat · Draw · QC · Finishing</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Execution Engine</span>
              <span className="font-bold text-slate-800">Live Browser & Mobile Tablet</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Standard Form</span>
              <span className="font-bold text-slate-800">F-PROD-01A / Form 35-Col</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DEPARTMENT 1: PPC & PLANNING                                              */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "PPC") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">Module 01</span>
                  <h2 className="text-lg font-black text-slate-900">PPC (Production Planning & Control) Department</h2>
                </div>
              </div>
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                Authorized: PPC Admin / Super User
              </span>
            </div>

            {/* Role & Objective */}
            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5">
              <h3 className="font-bold text-indigo-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-indigo-600" /> Department Role & Objectives
              </h3>
              PPC acts as the master brain of factory scheduling. The department is responsible for registering customer sales contracts into Work Orders, planning Mother Hollow & Billet sizes, grouping related orders into Multi-Work Order Campaigns (Form F-PROD-01A), officially issuing plans to the Hot Rolling Mill, managing revisions, and executing partial plan short-closing.
            </div>

            {/* Step-by-Step SOP */}
            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Operating Procedure (SOP)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">1</span>
                    Work Order Registration
                  </div>
                  <p className="text-slate-600 mt-1">
                    Enter Work Orders individually or via <strong>Excel Import</strong>. Ensure correct Customer OD, WT, Min Length (L1), Max Length (L2), Grade (e.g. ASTM A213 T11), Process Route (e.g. CDS), and Ordered Quantity (MTR / PCS / MT).
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">2</span>
                    Mother Hollow & Billet Sizing
                  </div>
                  <p className="text-slate-600 mt-1">
                    Select <strong>Billet OD</strong> (e.g. 63mm) and <strong>Billet Length</strong> (e.g. 6.25m). System calculates Billet Weight (WHF 97%). In Setup Specifications (Setup #1), verify and edit <strong>PM OD</strong> and <strong>PM WT</strong> if needed.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">3</span>
                    Campaign Grouping (Multi-WO)
                  </div>
                  <p className="text-slate-600 mt-1">
                    Group work orders sharing identical mother hollow sizes into a single Campaign Plan. Select Parent WO as Master Order and click <em>&ldquo;Link Child Work Order&rdquo;</em> for companion orders.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">4</span>
                    Plan Issue, Revision & Short-Close
                  </div>
                  <p className="text-slate-600 mt-1">
                    New plans are saved in <strong>DRAFT</strong>. Click <strong>&ldquo;Issue&rdquo;</strong> to officially release to Hot Rolling. If parameters change, click <strong>&ldquo;Revise&rdquo;</strong> (creates Rev.01/02). To terminate early, click <strong>&ldquo;Close (Partial)&rdquo;</strong>.
                  </p>
                </div>
              </div>

              {/* Concrete Worked Example */}
              <div className="mt-4 border border-indigo-200 rounded-xl p-4 bg-indigo-50/20">
                <div className="font-bold text-indigo-950 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" /> Worked Example: Multi-WO Campaign Plan 02
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border border-slate-300">
                    <thead className="bg-indigo-100/70 text-indigo-950 font-bold">
                      <tr>
                        <th className="border border-slate-300 p-1.5 text-left">Role</th>
                        <th className="border border-slate-300 p-1.5 text-left">WO No</th>
                        <th className="border border-slate-300 p-1.5 text-left">Grade & Spec</th>
                        <th className="border border-slate-300 p-1.5 text-left">Customer Size</th>
                        <th className="border border-slate-300 p-1.5 text-left">Pierced MH Size</th>
                        <th className="border border-slate-300 p-1.5 text-right">Planned MTR</th>
                        <th className="border border-slate-300 p-1.5 text-right">Planned PCS</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr>
                        <td className="border border-slate-300 p-1.5 font-bold text-indigo-700 flex items-center gap-1">
                          <Crown className="h-3 w-3" /> Parent Master
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">6277</td>
                        <td className="border border-slate-300 p-1.5">ASTM A213 T11</td>
                        <td className="border border-slate-300 p-1.5 font-mono">48.3 × 3.68 mm</td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">66.0 × 6.00 mm</td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right font-bold">715.00 m</td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right">115 PCS</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1.5 font-semibold text-teal-700 flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> Linked Child
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">6234</td>
                        <td className="border border-slate-300 p-1.5">ASTM A213 T11</td>
                        <td className="border border-slate-300 p-1.5 font-mono">48.3 × 3.68 mm</td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">66.0 × 6.00 mm</td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right font-bold">420.00 m</td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right">68 PCS</td>
                      </tr>
                      <tr className="bg-indigo-50/80 font-bold">
                        <td colSpan={5} className="border border-slate-300 p-1.5 text-right text-indigo-950">
                          Total Combined Rolling Campaign Qty:
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right text-indigo-950 font-black">
                          1,135.00 m
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right text-indigo-950 font-black">
                          183 PCS
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-slate-600 mt-2">
                  <strong>Lifecycle Action:</strong> PPC saves Plan `02` as Draft, reviews Billet length (6.25m) and MH wt (6.00mm), then clicks <strong>&ldquo;Issue&rdquo;</strong>. Status switches to <code>ISSUED</code> and triggers appearance on the Rolling Mill operator screen.
                </div>
              </div>

              {/* Critical Guardrails & Rules */}
              <div className="border-l-4 border-amber-500 bg-amber-50/60 p-3 rounded-r-lg text-amber-900">
                <div className="font-bold flex items-center gap-1 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Critical PPC Rules:
                </div>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                  <li>Plans remain completely <strong>invisible</strong> in the Rolling Mill queue until clicked <strong>&ldquo;Issue&rdquo;</strong>.</li>
                  <li>Revisions increment revision counter (Rev.01, Rev.02) and print with revision notes on Form F-PROD-01A.</li>
                  <li>Closing a plan for partial quantity releases unrolled balance back to the work order balance.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DEPARTMENT 2: HOT ROLLING MILL                                            */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "ROLLING") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white font-bold">
                  <Factory className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Module 02</span>
                  <h2 className="text-lg font-black text-slate-900">Hot Rolling Mill Department (Stage: ROLLING)</h2>
                </div>
              </div>
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Authorized: Rolling Operators & Floor Supervisors
              </span>
            </div>

            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-amber-50/40 border border-amber-100 rounded-xl p-3.5">
              <h3 className="font-bold text-amber-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-amber-600" /> Department Role & Objectives
              </h3>
              The Hot Rolling Mill is Stage #1 of physical production. Operators pierce heated solid round billets into seamless Mother Hollow tubes according to the officially issued Rolling Plan schedule. <strong>HTC OK (Hot Tube Cutting OK)</strong> recorded here is the absolute foundation of all downstream WIP stock.
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Operating Procedure (SOP)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px]">1</span>
                    Open Production Entry & Verify Plan
                  </div>
                  <p className="text-slate-600 mt-1">
                    Navigate to <code>/production</code>. Active Stage defaults to <strong>Rolling Mill</strong>. Confirm the row displays an <strong>&ldquo;Issued&rdquo;</strong> badge and your <strong>Plan No</strong> (e.g. Plan 02). Draft plans will not appear.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px]">2</span>
                    Input Shift Production (MTR or PCS)
                  </div>
                  <p className="text-slate-600 mt-1">
                    Type either <strong>MTR</strong> or <strong>PCS</strong>. The system automatically calculates the counterpart using Mother Hollow average length (<code>mh_avg_length</code>). Check MT weight equivalent.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px]">3</span>
                    Record Rejections (Crop Ends / Scraps)
                  </div>
                  <p className="text-slate-600 mt-1">
                    Enter front/back crop ends or mill cobbles in the <strong>Rejection</strong> column. <em>Net Production = Production − Rejection</em>.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px]">4</span>
                    CRITICAL: Record HTC OK (Good Tubes)
                  </div>
                  <p className="text-slate-600 mt-1">
                    Fill in the green <strong>HTC OK</strong> column. This represents accepted Mother Hollows passed through Hot Tube Cutting. Downstream stages (Hollow HT and Draw) can ONLY receive stock from HTC OK!
                  </p>
                </div>
              </div>

              {/* Real Numerical Example */}
              <div className="mt-4 border border-amber-200 rounded-xl p-4 bg-amber-50/20">
                <div className="font-bold text-amber-950 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Sparkles className="h-4 w-4 text-amber-600" /> Worked Shift Example: Rolling Shift A
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">Total Gross Rolled</span>
                    <span className="text-blue-700 font-black text-sm">715.00 MTR</span>
                    <span className="text-slate-500 block text-[10px]">(115 PCS)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">Mill Rejection</span>
                    <span className="text-rose-600 font-black text-sm">15.00 MTR</span>
                    <span className="text-slate-500 block text-[10px]">(2 PCS cobbles)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">Net Rolled Output</span>
                    <span className="text-slate-800 font-black text-sm">700.00 MTR</span>
                    <span className="text-slate-500 block text-[10px]">(113 PCS net)</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-300 p-1.5 rounded">
                    <span className="text-emerald-800 block text-[10px] uppercase font-sans font-bold">HTC OK Accepted</span>
                    <span className="text-emerald-900 font-black text-sm">700.00 MTR</span>
                    <span className="text-emerald-700 block text-[10px]">(113 PCS to floor)</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-600 mt-2">
                  <strong>Result:</strong> Available WIP for the Rolling Mill drops to 420m (the remaining child balance), while 700m HTC OK stock immediately flows forward into Hollow Heat Treatment (for Alloy grades) or Cold Draw Bench.
                </div>
              </div>

              <div className="border-l-4 border-rose-500 bg-rose-50/60 p-3 rounded-r-lg text-rose-900">
                <div className="font-bold flex items-center gap-1 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> Rolling Guardrails:
                </div>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                  <li><strong>110% Over-Rolling Capping:</strong> Rolling output cannot exceed 110% of total planned campaign meters.</li>
                  <li><strong>HTC OK Limit:</strong> HTC OK cannot exceed Net Output (<code>Production − Rejection</code>).</li>
                  <li>Entering 0 for HTC OK means zero stock will be available for downstream draw benches!</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DEPARTMENT 3: HEAT TREATMENT & FURNACES                                   */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "HEAT_TREATMENT") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white font-bold">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-700">Module 03</span>
                  <h2 className="text-lg font-black text-slate-900">Heat Treatment Department (Furnaces #1 & #2)</h2>
                </div>
              </div>
              <span className="rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                Authorized: Furnace Operators
              </span>
            </div>

            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-orange-50/40 border border-orange-100 rounded-xl p-3.5">
              <h3 className="font-bold text-orange-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-orange-600" /> Department Role & Objectives
              </h3>
              The Heat Treatment Department operates annealing and normalizing furnaces across two distinct process stages:
              <strong>1. Hollow Heat Treatment (HOLLOW_HEAT_TREATMENT):</strong> Anneals hard alloy mother hollows prior to cold drawing.
              <strong>2. Final Heat Treatment (HEAT_TREATMENT):</strong> Solution anneals, normalizes, or bright anneals cold drawn tubes to meet mechanical properties (Tensile, Hardness, Elongation).
              <br />
              <strong>Cross-Authorization Rule:</strong> Furnace operators assigned to either furnace stage have cross-permissions to operate and record entries on <em>both</em> furnace work centers.
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Operating Procedure (SOP)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white text-[10px]">1</span>
                    Select Target Furnace Stage
                  </div>
                  <p className="text-slate-600 mt-1">
                    On <code>/production</code>, switch between <strong>Hollow Heat Treatment</strong> (alloy mother hollows) and <strong>Heat Treatment</strong> (drawn tubes). The queue displays available WIP.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white text-[10px]">2</span>
                    Input Furnace Charge & Output
                  </div>
                  <p className="text-slate-600 mt-1">
                    Enter shift output in meters or pieces. Input cannot exceed upstream available stock (Rolling HTC OK for Hollow HT, Draw Output for Final HT).
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white text-[10px]">3</span>
                    MANDATORY: Heat Lot Number
                  </div>
                  <p className="text-slate-600 mt-1">
                    Enter the metallurgical <strong>Heat Lot No.</strong> (e.g. <code>HT-9842</code>). This establishes heat traceability required for EN 10204 3.1 Mill Test Certificates.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white text-[10px]">4</span>
                    Log Furnace Rejection & Remarks
                  </div>
                  <p className="text-slate-600 mt-1">
                    Record bent tubes or scale loss under Rejection. In Remarks, note furnace temperatures (e.g. <em>&ldquo;Annealed at 930°C for 45 min&rdquo;</em>).
                  </p>
                </div>
              </div>

              {/* Example */}
              <div className="mt-4 border border-orange-200 rounded-xl p-4 bg-orange-50/20">
                <div className="font-bold text-orange-950 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Sparkles className="h-4 w-4 text-orange-600" /> Worked Furnace Charge Example
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                  <div><strong>Work Order:</strong> WO 6277 (Parent) · <strong>Route:</strong> ALLOY_CDS · <strong>Grade:</strong> ASTM A213 T11</div>
                  <div><strong>Incoming Stock:</strong> 700.00 MTR (113 PCS mother hollows from Rolling HTC OK)</div>
                  <div><strong>Furnace Batch Run:</strong> Heat Lot No: <code className="bg-orange-100 px-1 rounded font-bold text-orange-800">HT-9842</code></div>
                  <div><strong>Logged Output:</strong> 695.00 MTR (112 PCS) · <strong>Rejection:</strong> 5.00 MTR (1 bent piece)</div>
                  <div><strong>Released to Draw:</strong> 690.00 Net MTR immediately available at Draw Bench queue.</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DEPARTMENT 4: COLD DRAW BENCH                                             */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "DRAW") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-cyan-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-600 text-white font-bold">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-700">Module 04</span>
                  <h2 className="text-lg font-black text-slate-900">Cold Draw Bench & Pilgering (Stage: DRAW)</h2>
                </div>
              </div>
              <span className="rounded-full bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 text-xs font-bold text-cyan-800">
                Authorized: Draw Bench Operators
              </span>
            </div>

            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-cyan-50/40 border border-cyan-100 rounded-xl p-3.5">
              <h3 className="font-bold text-cyan-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-cyan-600" /> Department Role & Objectives
              </h3>
              Cold drawing pulls pointed and pickled mother hollows through precision tungsten carbide dies and plugs. This elongates the pipe, reducing the outer diameter (OD) and wall thickness (WT) to the exact finished dimensions specified by the customer contract. Only the Master Work Order is displayed at pre-finishing draw bench.
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Operating Procedure (SOP)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white text-[10px]">1</span>
                    Review Incoming Stock & Size Reduction
                  </div>
                  <p className="text-slate-600 mt-1">
                    Incoming stock equals Hollow HT Net Output (for alloy) or Rolling HTC OK (for carbon). Check the reduction from Mother Hollow size to final customer size (OD × WT).
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white text-[10px]">2</span>
                    Log Drawn Meters & Pieces
                  </div>
                  <p className="text-slate-600 mt-1">
                    Enter the total drawn meters. The system applies the draw length multiple (e.g. Multiple ×2 or ×3) when converting pieces to finished cut lengths.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white text-[10px]">3</span>
                    Record Tag End / Pointing Scrap
                  </div>
                  <p className="text-slate-600 mt-1">
                    Log point cuts and back-end crop losses under <strong>Rejection</strong>. Keep draw bench yield above 92%.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white text-[10px]">4</span>
                    Pass to Final HT & QC Inspection
                  </div>
                  <p className="text-slate-600 mt-1">
                    Once recorded, drawn tubes advance to Final Heat Treatment (for CDS route) and then directly into <strong>QC Visual & Dimensional Inspection</strong>.
                  </p>
                </div>
              </div>

              {/* Example */}
              <div className="mt-4 border border-cyan-200 rounded-xl p-4 bg-cyan-50/20">
                <div className="font-bold text-cyan-950 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Sparkles className="h-4 w-4 text-cyan-600" /> Worked Draw Bench Example
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                  <div><strong>Size Reduction:</strong> 66.0 × 6.00 mm (MH) → <strong>48.3 × 3.68 mm</strong> (Finished Pipe)</div>
                  <div><strong>Incoming MH Stock:</strong> 690.00 MTR (from Hollow HT)</div>
                  <div><strong>Draw Multiple:</strong> 1 Mother Hollow tube yields ~2 finished lengths (Multiple = 2)</div>
                  <div><strong>Logged Drawn Output:</strong> 1,150.00 MTR (188 PCS) · <strong>Crop Cut Rejection:</strong> 20.00 MTR</div>
                  <div><strong>Net Drawn Output:</strong> 1,130.00 MTR passed forward to Final Annealing & QC.</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DEPARTMENT 5: QUALITY CONTROL & VDI                                       */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "QC") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold">
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">Module 05</span>
                  <h2 className="text-lg font-black text-slate-900">Quality Control (QC) & VDI Inspection Department</h2>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                Authorized: QA/QC Inspectors & Lab Technicians
              </span>
            </div>

            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-emerald-50/40 border border-emerald-100 rounded-xl p-3.5">
              <h3 className="font-bold text-emerald-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-emerald-600" /> Critical Gatekeeper Function
              </h3>
              The Quality Control (QC) Department performs 100% Visual & Dimensional Inspection (VDI), Eddy Current / NDT testing, and Hydrostatic testing on all drawn/annealed tubes.
              <br />
              <strong className="text-emerald-900 underline">THE GOLDEN RULE OF THE FACTORY:</strong>
              Finished tubes <strong>CANNOT</strong> appear in the Finishing Line queue until they have been officially inspected and certified as <strong>VDI OK</strong> in the QC inspection module.
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Operating Procedure (SOP)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">1</span>
                    Navigate to QC Inspection Form
                  </div>
                  <p className="text-slate-600 mt-1">
                    Click <strong>QC Inspection</strong> (<code>/qc</code>) in the navigation menu. Select the Work Order to inspect. Review Customer OD, WT, tolerances, and Heat Lot No.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">2</span>
                    Input Inspected Tubes (PCS / MTR)
                  </div>
                  <p className="text-slate-600 mt-1">
                    Enter the total number of pieces and meters physically presented at the inspection bench.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">3</span>
                    Sort into Three Quality Buckets
                  </div>
                  <ul className="text-slate-600 mt-1 list-disc list-inside space-y-0.5">
                    <li><strong>VDI OK:</strong> Perfect tubes meeting all tolerances.</li>
                    <li><strong>VDI Salvage:</strong> Tubes needing re-straightening, re-pickling, or end dressing.</li>
                    <li><strong>VDI Rejection:</strong> Irrecoverable scrap (scratches, cracks).</li>
                  </ul>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">4</span>
                    Sign Off & Release to Finishing
                  </div>
                  <p className="text-slate-600 mt-1">
                    Click <strong>&ldquo;Save Inspection&rdquo;</strong>. The <em>VDI OK</em> quantity instantly unlocks and populates the Finishing Line queue for bundling.
                  </p>
                </div>
              </div>

              {/* Real Example */}
              <div className="mt-4 border border-emerald-200 rounded-xl p-4 bg-emerald-50/20">
                <div className="font-bold text-emerald-950 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" /> Worked QC Inspection Example
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-sans font-bold">Total Inspected</span>
                    <span className="text-slate-900 font-black text-sm">188 PCS</span>
                    <span className="text-slate-500 block text-[10px]">(1,130.00 MTR)</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-300 p-1.5 rounded">
                    <span className="text-emerald-800 block text-[10px] uppercase font-sans font-bold">VDI OK (Accepted)</span>
                    <span className="text-emerald-900 font-black text-sm">180 PCS</span>
                    <span className="text-emerald-700 block text-[10px]">(1,080.00 MTR released)</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-300 p-1.5 rounded">
                    <span className="text-amber-800 block text-[10px] uppercase font-sans font-bold">VDI Salvage (Rework)</span>
                    <span className="text-amber-900 font-black text-sm">5 PCS</span>
                    <span className="text-amber-700 block text-[10px]">(30.00 MTR to re-straighten)</span>
                  </div>
                  <div className="bg-rose-50 border border-rose-300 p-1.5 rounded">
                    <span className="text-rose-800 block text-[10px] uppercase font-sans font-bold">VDI Rejection</span>
                    <span className="text-rose-900 font-black text-sm">3 PCS</span>
                    <span className="text-rose-700 block text-[10px]">(20.00 MTR scrap)</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DEPARTMENT 6: FINISHING, BUNDLING & DISPATCH                             */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "FINISHING") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-teal-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white font-bold">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-700">Module 06</span>
                  <h2 className="text-lg font-black text-slate-900">Finishing Line & Multi-WO Bundler (Stage: FINISHING)</h2>
                </div>
              </div>
              <span className="rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                Authorized: Finishing Operators & Packing Crew
              </span>
            </div>

            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-teal-50/40 border border-teal-100 rounded-xl p-3.5">
              <h3 className="font-bold text-teal-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-teal-600" /> Department Role & Objectives
              </h3>
              The Finishing Department handles final rotary straightening, pipe end chamfering / facing, stencil marking, anti-rust coating, and physical packing into hexagonal bundles.
              <br />
              <strong>Multi-Work Order Bundling:</strong> Because parent and companion child orders were rolled together in a shared campaign, the Finishing Department uses the <strong>Multi-WO Bundler</strong> to allocate finished bundles to specific customer contracts.
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Operating Procedure (SOP)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">1</span>
                    Select Finishing Stage in Queue
                  </div>
                  <p className="text-slate-600 mt-1">
                    On <code>/production</code>, switch stage to <strong>Finishing</strong>. Unlike pre-finishing stages, finishing displays <strong>both Master and Child Work Orders</strong> with their respective remaining balances.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">2</span>
                    Open Multi-WO Bundler Modal
                  </div>
                  <p className="text-slate-600 mt-1">
                    Click the teal <strong>&ldquo;Multi-WO Bundler&rdquo;</strong> button on the master row. The modal displays available VDI OK tubes and balance targets for all linked work orders.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">3</span>
                    Build & Assign Bundles
                  </div>
                  <p className="text-slate-600 mt-1">
                    Click <em>&ldquo;+ Add Bundle&rdquo;</em>. Assign a Bundle Number (e.g. <code>B-01</code>), select the target Work Order, and enter PCS / MTR. Repeat for other bundles.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">4</span>
                    Save Production & Print Bundle Tags
                  </div>
                  <p className="text-slate-600 mt-1">
                    Click <strong>&ldquo;Record Bundled Production&rdquo;</strong>. Each bundle is logged with its bundle ID in the production ledger and ready for warehouse dispatch.
                  </p>
                </div>
              </div>

              {/* Example */}
              <div className="mt-4 border border-teal-200 rounded-xl p-4 bg-teal-50/20">
                <div className="font-bold text-teal-950 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Sparkles className="h-4 w-4 text-teal-600" /> Worked Multi-WO Bundler Allocation Example
                </div>
                <div className="text-[11px] mb-2 text-slate-600">
                  <strong>Available VDI OK Stock to Pack:</strong> 180 PCS (1,080.00 MTR)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border border-slate-300">
                    <thead className="bg-teal-100 text-teal-950 font-bold">
                      <tr>
                        <th className="border border-slate-300 p-1.5 text-left">Bundle No</th>
                        <th className="border border-slate-300 p-1.5 text-left">Assigned Work Order</th>
                        <th className="border border-slate-300 p-1.5 text-left">Customer</th>
                        <th className="border border-slate-300 p-1.5 text-right">Bundle PCS</th>
                        <th className="border border-slate-300 p-1.5 text-right">Bundle MTR</th>
                        <th className="border border-slate-300 p-1.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr>
                        <td className="border border-slate-300 p-1.5 font-bold font-mono text-teal-800">B-01</td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">WO 6277 (Parent)</td>
                        <td className="border border-slate-300 p-1.5">Thermax Ltd</td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">60 PCS</td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">360.00 m</td>
                        <td className="border border-slate-300 p-1.5 text-emerald-700 font-bold">Packed</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1.5 font-bold font-mono text-teal-800">B-02</td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">WO 6277 (Parent)</td>
                        <td className="border border-slate-300 p-1.5">Thermax Ltd</td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">58 PCS</td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">348.00 m</td>
                        <td className="border border-slate-300 p-1.5 text-emerald-700 font-bold">WO 6277 Fulfilled!</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1.5 font-bold font-mono text-teal-800">B-03</td>
                        <td className="border border-slate-300 p-1.5 font-mono font-bold">WO 6234 (Child)</td>
                        <td className="border border-slate-300 p-1.5">L&T Energy</td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">62 PCS</td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">372.00 m</td>
                        <td className="border border-slate-300 p-1.5 text-emerald-700 font-bold">Packed</td>
                      </tr>
                      <tr className="bg-teal-50 font-bold">
                        <td colSpan={3} className="border border-slate-300 p-1.5 text-right text-teal-950">
                          Total Packed Bundles:
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right text-teal-950 font-black">
                          180 PCS
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-right text-teal-950 font-black">
                          1,080.00 m
                        </td>
                        <td className="border border-slate-300 p-1.5 text-teal-900">0 Balance Remaining</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DEPARTMENT 7: PLANT ADMIN & SUPERVISORS                                   */}
        {/* ========================================================================= */}
        {(activeDept === "ALL" || activeDept === "ADMIN") && (
          <section className="manual-section mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs print:border-slate-300 print:shadow-none print:p-4 print:page-break">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600 text-white font-bold">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-700">Module 07</span>
                  <h2 className="text-lg font-black text-slate-900">Plant Administration & Supervisors Manual</h2>
                </div>
              </div>
              <span className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-bold text-purple-800">
                Authorized: Plant Managers & System Admins
              </span>
            </div>

            <div className="mb-4 text-xs leading-relaxed text-slate-700 bg-purple-50/40 border border-purple-100 rounded-xl p-3.5">
              <h3 className="font-bold text-purple-950 text-sm mb-1 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-purple-600" /> Administrative Governance & Master Control
              </h3>
              Plant Administrators and Super Users govern user access, enforce strict work center isolation, approve cross-order pipe diversions, investigate entry corrections, and generate plant-wide reconciliation reports.
            </div>

            <div className="space-y-4 text-xs">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Master Administrative Controls
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <Lock className="h-4 w-4 text-purple-600" /> User & PIN Governance
                  </div>
                  <p className="text-slate-600 mt-1">
                    Assign users to specific <strong>Work Centers</strong> (e.g. <code>ROLLING</code>, <code>DRAW</code>). Standard operators cannot record or edit entries outside their assigned work center. Set 4-digit security PINs.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <Layers className="h-4 w-4 text-purple-600" /> Pipe Diversions
                  </div>
                  <p className="text-slate-600 mt-1">
                    When excess tubes exist on an order, use <code>/diversions</code> to divert physical stock from Source WO to Target WO at any work center. Diversions automatically recalculate upstream and downstream available WIP.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <Clock className="h-4 w-4 text-purple-600" /> Aging & Bottlenecks
                  </div>
                  <p className="text-slate-600 mt-1">
                    Review <code>/reports/aging</code> to detect stagnant WIP staying &gt;7 or &gt;14 days in any work center. Real-time bell notifications alert managers to priority orders.
                  </p>
                </div>
              </div>

              {/* Master Access Matrix Table */}
              <div className="mt-4 border border-slate-300 rounded-xl overflow-hidden">
                <div className="bg-slate-100 p-2 font-bold text-slate-800 text-xs uppercase tracking-wider border-b border-slate-300">
                  Department Access & Permissions Matrix
                </div>
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 text-left">Department / Group</th>
                      <th className="p-2 text-center">Rolling Plans</th>
                      <th className="p-2 text-center">Rolling Entry</th>
                      <th className="p-2 text-center">Furnaces</th>
                      <th className="p-2 text-center">Draw Bench</th>
                      <th className="p-2 text-center">QC / VDI</th>
                      <th className="p-2 text-center">Finishing</th>
                      <th className="p-2 text-center">Admin/Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    <tr>
                      <td className="p-2 font-bold text-indigo-700">PPC Department</td>
                      <td className="p-2 text-center font-bold text-emerald-600">Full (Issue/Revise)</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-amber-700">Hot Rolling Mill</td>
                      <td className="p-2 text-center text-slate-400">Issued Only</td>
                      <td className="p-2 text-center font-bold text-emerald-600">Full Record</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-orange-700">Heat Treatment</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center font-bold text-emerald-600">Both Furnaces</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-cyan-700">Draw Bench</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center font-bold text-emerald-600">Full Record</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-emerald-700">Quality Control (QC)</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center font-bold text-emerald-600">Full VDI Sign-off</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold text-teal-700">Finishing & Packing</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                      <td className="p-2 text-center text-slate-400">Read</td>
                      <td className="p-2 text-center font-bold text-emerald-600">Bundler + Packing</td>
                      <td className="p-2 text-center text-slate-300">—</td>
                    </tr>
                    <tr className="bg-purple-50/70 font-bold">
                      <td className="p-2 text-purple-900">Admin / Super User</td>
                      <td className="p-2 text-center text-emerald-700">Full</td>
                      <td className="p-2 text-center text-emerald-700">Full</td>
                      <td className="p-2 text-center text-emerald-700">Full</td>
                      <td className="p-2 text-center text-emerald-700">Full</td>
                      <td className="p-2 text-center text-emerald-700">Full</td>
                      <td className="p-2 text-center text-emerald-700">Full</td>
                      <td className="p-2 text-center text-purple-900 font-black">Global Master</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* PRINT FOOTER / SIGNATURE BLOCK                                            */}
        {/* ========================================================================= */}
        <div className="mt-8 border-t-2 border-slate-300 pt-4 text-xs text-slate-600 print:mt-12">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="h-12 border-b border-slate-400 mb-1"></div>
              <span className="font-bold text-slate-900 block">Department Head Signature</span>
              <span className="text-[10px] text-slate-500">Operations & Quality Approved</span>
            </div>
            <div>
              <div className="h-12 border-b border-slate-400 mb-1"></div>
              <span className="font-bold text-slate-900 block">PPC & Planning Head</span>
              <span className="text-[10px] text-slate-500">Scheduling Verification</span>
            </div>
            <div>
              <div className="h-12 border-b border-slate-400 mb-1"></div>
              <span className="font-bold text-slate-900 block">Plant Director / GM</span>
              <span className="text-[10px] text-slate-500">Standard Operating Policy Authorized</span>
            </div>
          </div>
          <div className="mt-4 text-center text-[10px] text-slate-400">
            Form Doc: SOP-WIP-TRG-01 · Generated from WIP Tracking System · Printed on {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
      </main>

      {/* Print Specific CSS */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 11px !important;
          }
          .no-print {
            display: none !important;
          }
          .manual-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 24px !important;
            border-bottom: 1px solid #cbd5e1 !important;
          }
          .print\\:page-break {
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
}
