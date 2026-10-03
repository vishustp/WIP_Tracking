// components/reports/process-sheet/ProcessSheetPrintDocument.tsx
'use client';

import React from 'react';
import type { ProcessSheetFormData } from './types';

export default function ProcessSheetPrintDocument({
  data,
}: {
  data: ProcessSheetFormData;
}) {
  const revDisplay = data.revNo?.toUpperCase().includes('REV')
    ? data.revNo
    : `REV ${data.revNo || '0'}`;

  return (
    <div className="bg-white text-black p-4 max-w-[1100px] mx-auto border border-black shadow-lg print:shadow-none print:border-none print:p-0 print:max-w-none text-[9.5px] font-sans antialiased">
      {/* 1. Official Header */}
      <div className="border border-black">
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black">
          {/* Logo */}
          <div className="col-span-3 p-2 flex flex-col justify-center items-center bg-slate-50 print:bg-transparent">
            <span className="text-red-600 font-black text-xl tracking-wider leading-none">RASHMI</span>
            <span className="text-black text-[9px] font-bold tracking-widest leading-none mt-0.5">GROUP</span>
            <span className="text-[7.5px] font-semibold text-slate-700 mt-1 uppercase text-center">
              Seamless Pipe Division
            </span>
          </div>

          {/* Title */}
          <div className="col-span-6 p-2 text-center flex flex-col justify-center items-center">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-black uppercase">
              RASHMI METALIKS LIMITED
            </h1>
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900 mt-0.5">
              PROCESS SHEET FOR SEAMLESS PIPE
            </h2>
            <div className="text-[9px] font-bold text-slate-700 uppercase mt-0.5">
              FORMAT NO: F-PROD-11
            </div>
          </div>

          {/* Doc Metadata */}
          <div className="col-span-3 text-[8.5px] divide-y divide-black font-mono">
            <div className="p-1 flex justify-between">
              <span className="font-bold text-slate-600">SHEET NO:</span>
              <span className="font-black text-black">{data.sheetNo || '—'}</span>
            </div>
            <div className="p-1 flex justify-between">
              <span className="font-bold text-slate-600">REV NO:</span>
              <span className="font-black text-black">{revDisplay}</span>
            </div>
            <div className="p-1 flex justify-between">
              <span className="font-bold text-slate-600">DATE:</span>
              <span className="font-bold text-black">{data.sheetDate || '—'}</span>
            </div>
            <div className="p-1 flex justify-between">
              <span className="font-bold text-slate-600">INSPECTION:</span>
              <span className="font-black text-black">{data.inspection || 'IBR'}</span>
            </div>
          </div>
        </div>

        {/* 2. Customer & Work Order Summary */}
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">CUSTOMER:</div>
          <div className="col-span-4 p-1 font-black truncate">{data.customer || '—'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">DESTINATION:</div>
          <div className="col-span-4 p-1 font-semibold truncate">{data.destination || '—'}</div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">WORK ORDER NO:</div>
          <div className="col-span-2 p-1 font-black text-blue-900 print:text-black">{data.woNo || '—'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">PO NO & DATE:</div>
          <div className="col-span-3 p-1 font-semibold truncate">
            {data.poNo ? `${data.poNo} (${data.poDate || '—'})` : '—'}
          </div>
          <div className="col-span-1 font-bold p-1 bg-slate-100 print:bg-transparent">DELIVERY:</div>
          <div className="col-span-2 p-1 font-bold">{data.deliveryDate || '—'}</div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">STEEL GRADE:</div>
          <div className="col-span-2 p-1 font-black">{data.steelGrade || '—'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">SPECIFICATION:</div>
          <div className="col-span-3 p-1 font-black">{data.materialSpec || '—'}</div>
          <div className="col-span-1 font-bold p-1 bg-slate-100 print:bg-transparent">ORDER QTY:</div>
          <div className="col-span-2 p-1 font-bold">{data.orderQty || '—'}</div>
        </div>

        {/* 3. Raw Billet & Furnaces (Hot Mill Input) */}
        <div className="bg-slate-200 print:bg-slate-100 border-b border-black font-black text-[9.5px] py-0.5 px-2 uppercase tracking-wide">
          RAW MATERIAL BILLET & HEATING PARAMETERS
        </div>
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">BILLET DIA (MM):</div>
          <div className="col-span-2 p-1 font-black text-center">{data.billetDia || '—'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">BILLET WT (KG/M):</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.billetSectWt || '—'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">LENGTH (MM):</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.billetLength || '—'}</div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">WHF HEATING TEMP:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.whfTemp || '1220°C (±40°C)'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">INDUCTION TEMP:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.inductionTemp || '850°C - 880°C'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">SIZING OUTLET:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.sizingOutletTemp || '880°C - 900°C'}</div>
        </div>

        {/* 4. Hot Piercing & Sizing Mill (Hot Mill Dimensions) */}
        <div className="bg-slate-200 print:bg-slate-100 border-b border-black font-black text-[9.5px] py-0.5 px-2 uppercase tracking-wide">
          HOT PIERCING & SIZING MILL (HOT MILL DIMENSIONS)
        </div>
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">PIERCER SHELL:</div>
          <div className="col-span-10 grid grid-cols-4 divide-x divide-black text-center font-bold">
            <div className="p-1">OD: {data.piercerOd || '—'} MM</div>
            <div className="p-1">WT: {data.piercerWt || '—'} MM</div>
            <div className="p-1">LENGTH: {data.piercerShellLen || '—'} M</div>
            <div className="p-1">SHELL WT: {data.shellWeight || '—'} KG/M</div>
          </div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">MOTHER HOLLOW:</div>
          <div className="col-span-10 grid grid-cols-4 divide-x divide-black text-center font-bold">
            <div className="p-1">OD: {data.motherHollowOd || '—'} MM</div>
            <div className="p-1">WT: {data.motherHollowWt || '—'} MM</div>
            <div className="p-1">SM LEN: {data.smLength || '—'} M</div>
            <div className="p-1">HFS LEN: {data.hfsFinalLength || '—'} M</div>
          </div>
        </div>

        {/* 5. Target Pipe Dimensions & Tolerances (Printed after Hot Mill Dimensions) */}
        <div className="bg-slate-200 print:bg-slate-100 border-b border-black font-black text-[9.5px] py-0.5 px-2 uppercase tracking-wide flex justify-between">
          <span>TARGET FINISHED PIPE DIMENSIONS & TOLERANCES ({data.orderType})</span>
          <span>{data.isMinWall ? 'MINIMUM WALL (+20% / -0%)' : 'NOMINAL WALL (+15% / -12.5%)'}</span>
        </div>
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">FINISHED OD:</div>
          <div className="col-span-2 p-1 font-black text-center">{data.custOd} MM</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">FINISHED WT:</div>
          <div className="col-span-2 p-1 font-black text-center">{data.custWt} MM</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">PROCESS WT:</div>
          <div className="col-span-2 p-1 font-black text-center text-blue-900 print:text-black">
            {data.processWt} MM
          </div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">OD TOLERANCE:</div>
          <div className="col-span-2 p-1 text-center font-bold">
            {data.finalTolOdMin} — {data.finalTolOdMax} MM
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">WT TOLERANCE:</div>
          <div className="col-span-2 p-1 text-center font-bold">
            {data.finalTolWtMin} — {data.finalTolWtMax} MM
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">PIPE WEIGHT:</div>
          <div className="col-span-2 p-1 text-center font-bold">{data.finalPipeWeight} KG/M</div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">LENGTH RANGE:</div>
          <div className="col-span-4 p-1 font-bold text-center">
            {data.finalOrderLen1} — {data.finalOrderLen2} M (Avg: {data.finalLength} M {data.finalLenTol})
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">PLAN QUANTITIES:</div>
          <div className="col-span-4 p-1 font-bold text-center">
            {data.planQtyNos} PCS · {data.planQtyMtrs} MTR · {data.planQtyMt} MT
          </div>
        </div>

        {/* 6. Mechanical & Testing Specifications (Chemical Compositions removed) */}
        <div className="bg-slate-200 print:bg-slate-100 border-b border-black font-black text-[9.5px] py-0.5 px-2 uppercase tracking-wide">
          MECHANICAL PROPERTIES, HEAT TREATMENT & QUALITY CONTROL
        </div>
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">YST MIN:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.ystMin} MPA</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">UTS MIN:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.utsMin} MPA</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">ELONGATION:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.elongationMin} %</div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">HARDNESS:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.hardness || '85 HRB MAX'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">HYDRO TEST:</div>
          <div className="col-span-2 p-1 font-black text-center text-blue-900 print:text-black">
            {data.hydroPressurePsi ? `${data.hydroPressurePsi} PSI` : '—'}
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">NDT TESTING:</div>
          <div className="col-span-2 p-1 font-bold text-center">{data.ndt || 'UT'}</div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">HT CONDITION:</div>
          <div className="col-span-4 p-1 font-bold">{data.htCondition || 'AS ROLLED / HFS'}</div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">HT CYCLE & TIME:</div>
          <div className="col-span-4 p-1 font-bold">
            {data.htCycle} (Hold: {data.holdingTime || '5 SEC'})
          </div>
        </div>

        {/* 7. Finishing, Single Marking Stencil & Packaging */}
        <div className="bg-slate-200 print:bg-slate-100 border-b border-black font-black text-[9.5px] py-0.5 px-2 uppercase tracking-wide">
          FINISHING, MARKING STENCIL & DISPATCH PACKAGING
        </div>
        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">
            MARKING STENCIL:
          </div>
          <div className="col-span-10 p-1 font-mono text-[8.5px] font-bold leading-relaxed break-words">
            {data.markingText || '—'}
          </div>
        </div>

        <div className="grid grid-cols-12 divide-x divide-black border-b border-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">COATING / ENDS:</div>
          <div className="col-span-4 p-1 font-bold">
            {data.coating || 'BLACK VARNISH'} · {data.endCondition || 'BEVEL END'}
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-100 print:bg-transparent">BUNDLING:</div>
          <div className="col-span-4 p-1 font-bold">
            {data.bundling || 'HEXAGONAL'} ({data.bundleQtyPcs || '—'} PCS · {data.bundleWeightMt || '2 MT'}) · {data.pipeColorCode || 'WHITE'}
          </div>
        </div>

        {/* 8. Special Instructions / Customer Requirements */}
        <div className="bg-slate-200 print:bg-slate-100 border-b border-black font-black text-[9.5px] py-0.5 px-2 uppercase tracking-wide">
          SPECIAL INSTRUCTIONS & TECHNICAL DELIVERY CONDITIONS
        </div>
        <div className="p-2 border-b border-black text-[9px] min-h-[36px] bg-white">
          <p className="font-semibold text-slate-900 leading-normal">
            {data.specialInstructions ? data.specialInstructions : 'NIL / AS PER APPLICABLE SPECIFICATION'}
          </p>
        </div>

        {/* 9. Signatures Footer */}
        <div className="grid grid-cols-3 divide-x divide-black text-[9px]">
          <div className="p-3 text-center">
            <div className="h-6"></div>
            <div className="border-t border-black pt-1 font-black uppercase text-slate-800">
              PREPARED BY (PPC IN-CHARGE)
            </div>
          </div>
          <div className="p-3 text-center">
            <div className="h-6"></div>
            <div className="border-t border-black pt-1 font-black uppercase text-slate-800">
              CHECKED BY (QUALITY / QA HEAD)
            </div>
          </div>
          <div className="p-3 text-center">
            <div className="h-6"></div>
            <div className="border-t border-black pt-1 font-black uppercase text-slate-800">
              APPROVED BY (PLANT HEAD / GM)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
