// components/reports/process-sheet/ProcessSheetPrintDocument.tsx
'use client';

import React from 'react';
import type { ProcessSheetFormData } from './types';

export default function ProcessSheetPrintDocument({
  data,
}: {
  data: ProcessSheetFormData;
}) {
  const isCds = (data.routeType || data.orderType || '').toUpperCase().includes('CDS');
  const routeDisplay = data.routeType || (isCds ? 'CDS' : 'HFS');
  const orderDisplay = data.orderType || (isCds ? 'CDS' : 'HFS');
  const revDisplay = data.revNo ? String(data.revNo).padStart(2, '0') : '00';

  // Calculate Mother Hollow ID if OD and WT are present
  const mhOd = Number(data.motherHollowOd) || 0;
  const mhWt = Number(data.motherHollowWt) || 0;
  const mhId = mhOd > 0 && mhWt > 0 && mhOd > 2 * mhWt ? (mhOd - 2 * mhWt).toFixed(2) : '';

  // Process route string representation
  const defaultRouteString = isCds
    ? 'BILLET CUTTING # WHF # PIERCER LXC 50 # SIZING # STR # CUTTING # VDI # STP # POINTING # DB # ANNEALING # STR # CUTTING # HUT # HYDRO # VDI # BLACK VARNISH # BUNDLING'
    : 'BILLET CUTTING # WHF # PIERCER LXC 50 # SIZING # STR # CUTTING # VDI # FINISHING # HYDRO # BLACK VARNISH # BUNDLING';

  return (
    <div className="bg-white text-black font-sans antialiased text-[8px] leading-tight select-none max-w-[1050px] mx-auto p-4 border border-black shadow-lg print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 6mm 6mm 6mm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Main Single Master Border Container */}
      <div className="border border-black border-collapse">
        {/* 1. Header: Logo & Company Identification */}
        <div className="grid grid-cols-12 border-b border-black">
          {/* Logo Box */}
          <div className="col-span-3 p-1.5 flex flex-col justify-center items-center border-r border-black">
            <div className="flex items-center gap-1">
              <span className="text-red-600 text-lg font-black tracking-tight leading-none">RASHMI</span>
              <span className="text-red-600 text-sm leading-none">☀️</span>
            </div>
            <div className="flex items-center gap-1 w-full justify-center mt-0.5">
              <span className="text-[6.5px] tracking-widest font-black uppercase text-black">
                —— SEAMLESS ——
              </span>
            </div>
          </div>

          {/* Plant Address & Title */}
          <div className="col-span-9 p-1 text-center flex flex-col justify-center items-center">
            <h1 className="text-[10px] font-black tracking-normal text-black uppercase">
              RASHMI GREEN HYDROGEN STEEL PVT. LTD.
            </h1>
            <p className="text-[7.5px] font-bold text-black uppercase leading-tight">
              (SEAMLESS DIVISION)
            </p>
            <p className="text-[6.5px] font-medium text-black leading-tight">
              KHATRANGA GHANGUAL, GOPINATHPUR AND JETHIA, KHARAGPUR, WEST BENGAL-721301
            </p>
            <div className="mt-0.5 border border-black px-4 py-0.5 bg-slate-50 font-black text-[9px] tracking-wider uppercase">
              PROCESS SHEET
            </div>
          </div>
        </div>

        {/* 2. ORDER DETAILS Section */}
        <div className="bg-slate-100 border-b border-black text-center font-bold text-[8px] py-0.5 uppercase tracking-wider">
          ORDER DETAILS
        </div>

        {/* Order Details Grid */}
        <table className="w-full border-collapse text-[7.5px]">
          <tbody>
            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold w-[16%]">PROCESS SHEET NO-</td>
              <td className="border-r border-black p-1 font-black w-[18%]">{data.sheetNo || ''}</td>
              <td className="border-r border-black p-1 font-bold w-[10%]">REV NO :</td>
              <td className="border-r border-black p-1 font-bold w-[6%] text-center">{revDisplay}</td>
              <td className="border-r border-black p-1 font-bold w-[8%] text-center">ORDER</td>
              <td className="border-r border-black p-1 font-black w-[8%] text-center">{orderDisplay}</td>
              <td className="border-r border-black p-1 font-bold w-[8%] text-center">ROUTE</td>
              <td className="border-r border-black p-1 font-black w-[8%] text-center">{routeDisplay}</td>
              <td className="border-r border-black p-1 font-bold w-[8%] text-center">Date :</td>
              <td className="p-1 font-bold w-[10%] text-center">{data.sheetDate || ''}</td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">CUSTOMER</td>
              <td colSpan={5} className="border-r border-black p-1 font-bold uppercase truncate">
                {data.customer || ''}
              </td>
              <td className="border-r border-black p-1 font-bold">DESTINATION:</td>
              <td colSpan={3} className="p-1 font-medium truncate">
                {data.destination || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">PURCHASE ORDER NO</td>
              <td colSpan={5} className="border-r border-black p-1 font-bold">
                {data.poNo || ''}
              </td>
              <td className="border-r border-black p-1 font-bold">WORK ORDER NO:</td>
              <td colSpan={3} className="p-1 font-black">
                {data.woNo || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">PURCHASE ORDER DATE</td>
              <td colSpan={5} className="border-r border-black p-1">
                {data.poDate || ''}
              </td>
              <td className="border-r border-black p-1 font-bold">WORK ORDER DATE</td>
              <td colSpan={3} className="p-1">
                {data.woDate || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">ORDER QTY</td>
              <td colSpan={5} className="border-r border-black p-1 font-bold">
                {data.orderQty || ''}
              </td>
              <td className="border-r border-black p-1 font-bold">DELIVERY DATE:</td>
              <td colSpan={3} className="p-1 font-bold">
                {data.deliveryDate || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">MATERIAL CODE</td>
              <td colSpan={5} className="border-r border-black p-1 font-mono font-bold">
                {data.materialCode || ''}
              </td>
              <td className="border-r border-black p-1 font-bold">PRIORITY :</td>
              <td colSpan={3} className="p-1 font-bold text-center">
                1
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">MATERIAL SPECIFICATION</td>
              <td colSpan={5} className="border-r border-black p-1 font-bold">
                {data.materialSpec || ''}
              </td>
              <td colSpan={2} className="border-r border-black p-1 font-bold text-[7px] leading-tight">
                TUBE COLOUR CODE AS PER SPECIFICATION:
              </td>
              <td colSpan={2} className="p-1 font-bold text-center">
                {data.pipeColorCode || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">STEEL GRADE</td>
              <td colSpan={2} className="border-r border-black p-1 font-bold">
                {data.steelGrade || ''}
              </td>
              <td className="border-r border-black p-1 font-bold text-center">HEAT NO :</td>
              <td colSpan={2} className="border-r border-black p-1 font-bold">
                {data.heatNo || ''}
              </td>
              <td colSpan={2} className="border-r border-black p-1 font-bold">
                RM COLOUR CODE:
              </td>
              <td colSpan={2} className="p-1 font-bold text-center">
                {data.rmColorCode || ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 3. BILLET & FURNACE PARAMETERS */}
        <table className="w-full border-collapse text-[7.5px]">
          <tbody>
            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold w-[22%]">BILLET DIA (IN MM)</td>
              <td className="border-r border-black p-1 font-bold text-center w-[16%]">
                {data.billetDia || ''}
              </td>
              <td className="border-r border-black p-1 font-bold w-[24%]">
                BILLET SECT. WEIGHT (KG/MTR)
              </td>
              <td className="border-r border-black p-1 font-bold text-center w-[14%]">
                {data.billetSectWt || ''}
              </td>
              <td className="border-r border-black p-1 font-bold w-[14%]">
                TOTAL WEIGHT IN MT (THEO.)
              </td>
              <td className="p-1 font-bold text-center w-[10%]">
                {data.totalWeightMt || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">BILLET LENGTH (IN MM)</td>
              <td className="border-r border-black p-1 font-bold text-center">
                {data.billetLength || ''}
              </td>
              <td className="border-r border-black p-1 font-bold">
                CUTTING TOLERANCE IN MM
              </td>
              <td className="border-r border-black p-1 font-bold text-center">
                +5/-0 MM
              </td>
              <td className="border-r border-black p-1 font-bold">MULTIPLE</td>
              <td className="p-1 font-bold text-center">{data.multiple || '1'}</td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">WHF (IN DEGREE)</td>
              <td className="border-r border-black p-1 font-bold text-center">
                {data.whfTemp || '1230° C (+/- 30° C)'}
              </td>
              <td className="border-r border-black p-1 font-bold">
                INDUCTION FURNACE (IN DEGREE)
              </td>
              <td className="border-r border-black p-1 font-bold text-center">
                {data.inductionTemp || '900 °C - 950° C'}
              </td>
              <td className="border-r border-black p-1 font-bold text-[7px] leading-tight">
                SIZING MILL OUTLET TEMP
              </td>
              <td className="p-1 font-bold text-center text-[7px]">
                {data.sizingOutletTemp || '850° C TO 900° C'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 4. PIERCER & ACCU MANDREL MILL TABLE */}
        <table className="w-full border-collapse text-[7.5px]">
          <thead>
            <tr className="border-b border-black bg-slate-50 text-center font-bold">
              <td rowSpan={2} className="border-r border-black p-1 w-[22%] text-left font-bold">
                PIERCER SIZE
              </td>
              <td className="border-r border-black p-0.5 w-[14%]">OD (MM) in Hot</td>
              <td className="border-r border-black p-0.5 w-[14%]">WT(MM) in Hot</td>
              <td className="border-r border-black p-0.5 w-[12%]">PIERCER SHELL</td>
              <td className="border-r border-black p-0.5 w-[12%]">SHELL WEIGHT</td>
              <td className="border-r border-black p-0.5 w-[13%]">OD (MM) AIM</td>
              <td className="p-0.5 w-[13%]">WT(MM) AIM</td>
            </tr>
            <tr className="border-b border-black text-center font-bold">
              <td className="border-r border-black p-1">{data.piercerOd || ''}</td>
              <td className="border-r border-black p-1">{data.piercerWt || ''}</td>
              <td className="border-r border-black p-1">4.36</td>
              <td className="border-r border-black p-1">{data.shellWeight || '7.94'}</td>
              <td className="border-r border-black p-1">NA</td>
              <td className="p-1">NA</td>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">ACCU MANDREL MILL HOLLOW SIZE:</td>
              <td className="border-r border-black p-0.5 text-center font-semibold">OD (MM)</td>
              <td className="border-r border-black p-0.5 text-center font-semibold">WT(MM)</td>
              <td className="border-r border-black p-0.5 text-center font-semibold text-[6.5px]">ACCU MANDREL</td>
              <td className="border-r border-black p-0.5 text-center font-semibold text-[6.5px]">ACCU MANDREL MILL HOLLOW WT</td>
              <td className="border-r border-black p-0.5 text-center font-semibold">NA</td>
              <td className="p-0.5 text-center font-semibold">NA</td>
            </tr>
            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">TOLERANCE (IN MM)</td>
              <td className="border-r border-black p-1 text-center font-semibold"></td>
              <td className="border-r border-black p-1 text-center font-semibold"></td>
              <td className="border-r border-black p-1 text-center font-semibold"></td>
              <td className="border-r border-black p-1 text-center font-semibold"></td>
              <td className="border-r border-black p-1 text-center font-semibold"></td>
              <td className="p-1 text-center font-semibold"></td>
            </tr>
          </tbody>
        </table>

        {/* 5. MOTHER HOLLOW SIZE : SIZING MILL */}
        <table className="w-full border-collapse text-[7.5px]">
          <thead>
            <tr className="border-b border-black bg-slate-50 text-center font-bold">
              <td rowSpan={2} className="border-r border-black p-1 w-[22%] text-left font-bold">
                MOTHER HOLLOW SIZE : SIZING MILL
              </td>
              <td className="border-r border-black p-0.5 w-[14%]">MOTHER HOLLOW OD (MM)</td>
              <td className="border-r border-black p-0.5 w-[14%]">MOTHER HOLLOW WT(MM)</td>
              <td className="border-r border-black p-0.5 w-[12%]">Rolling WT(MM)</td>
              <td className="border-r border-black p-0.5 w-[12%]">MOTHER HOLLOW WT Kg/Mtr</td>
              <td className="border-r border-black p-0.5 w-[10%]">ID (MM)</td>
              <td className="border-r border-black p-0.5 w-[8%]">SM LENGTH</td>
              <td className="p-0.5 w-[8%]">{isCds ? 'CDS FINAL LENGTH (MTR)' : 'HFS FINAL LENGTH (MTR)'}</td>
            </tr>
            <tr className="border-b border-black text-center font-bold">
              <td className="border-r border-black p-1 font-black">{data.motherHollowOd || ''}</td>
              <td className="border-r border-black p-1 font-black">{data.motherHollowWt || ''}</td>
              <td className="border-r border-black p-1">{data.rollingWt || data.motherHollowWt || ''}</td>
              <td className="border-r border-black p-1">{data.motherHollowKgMtr || ''}</td>
              <td className="border-r border-black p-1">{mhId}</td>
              <td className="border-r border-black p-1">{data.smLength || ''}</td>
              <td className="p-1">{data.hfsFinalLength || data.smLength || ''}</td>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">TOLERANCE (IN MM):</td>
              <td className="border-r border-black p-1 text-center font-bold">
                {mhOd > 0 ? `${(mhOd - 0.3).toFixed(2)} - ${(mhOd + 0.3).toFixed(2)}` : ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold">
                {mhWt > 0 ? `${(mhWt * 0.9).toFixed(2)} - ${(mhWt * 1.1).toFixed(2)}` : ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold">
                {mhWt > 0 ? `${(mhWt * 0.9).toFixed(2)} - ${(mhWt * 1.1).toFixed(2)}` : ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold"></td>
              <td className="border-r border-black p-1 text-center font-bold"></td>
              <td className="border-r border-black p-1 text-center font-bold">
                {data.smLength || ''}
              </td>
              <td className="p-1 text-center font-bold">
                {data.hfsFinalLength || data.smLength || ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">PLAN QTY IN NOS:</td>
              <td className="border-r border-black p-1 font-bold text-center">{data.planQtyNos || ''}</td>
              <td className="border-r border-black p-1 font-bold text-center">MTRS.</td>
              <td className="border-r border-black p-1 font-bold text-center">{data.planQtyMtrs || ''}</td>
              <td className="border-r border-black p-1 font-bold text-center">MT</td>
              <td className="border-r border-black p-1 font-bold text-center">{data.planQtyMt || ''}</td>
              <td className="border-r border-black p-1 font-bold text-center">INSPECTION</td>
              <td className="p-1 font-bold text-center">{data.inspection || 'IBR + TPI'}</td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">PROCESS ROUTE :</td>
              <td colSpan={7} className="p-1 font-bold text-[7px] tracking-tight leading-snug">
                {defaultRouteString}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 6. COLD MILL / FINAL PIPE DIMENSIONS */}
        <div className="bg-slate-100 border-b border-black text-center font-bold text-[8px] py-0.5 uppercase tracking-wider">
          {isCds ? 'COLD MILL' : 'HOT FINISHING LINE'}
        </div>

        <table className="w-full border-collapse text-[7.5px]">
          <thead>
            <tr className="border-b border-black bg-slate-50 text-center font-bold">
              <td rowSpan={2} className="border-r border-black p-1 w-[22%] text-left font-bold">
                {isCds ? 'FINAL SIZE: CDS' : 'FINAL SIZE: HFS'}
              </td>
              <td className="border-r border-black p-0.5 w-[14%]">CUSTOMER OD (MM)</td>
              <td className="border-r border-black p-0.5 w-[14%]">CUSTOMER WT(MM)</td>
              <td className="border-r border-black p-0.5 w-[14%]">PROCESS WT(MM)</td>
              <td className="border-r border-black p-0.5 w-[12%]">FINAL PIPE WEIGHT</td>
              <td className="border-r border-black p-0.5 w-[12%]">FINAL LENGTH (MTRS)</td>
              <td colSpan={2} className="p-0.5 w-[12%]">FINAL ORDER LENGTH (MTR)</td>
            </tr>
            <tr className="border-b border-black text-center font-bold">
              <td className="border-r border-black p-1 font-black">{data.custOd || ''}</td>
              <td className="border-r border-black p-1 font-black">{data.custWt || ''}</td>
              <td className="border-r border-black p-1 font-black">{data.processWt || ''}</td>
              <td className="border-r border-black p-1">{data.finalPipeWeight || ''}</td>
              <td className="border-r border-black p-1">{data.finalLength || ''}</td>
              <td className="border-r border-black p-0.5 text-[7px]">
                <div className="font-semibold text-slate-500">LENGTH 1</div>
                <div>{data.finalOrderLen1 || ''}</div>
              </td>
              <td className="p-0.5 text-[7px]">
                <div className="font-semibold text-slate-500">LENGTH 2</div>
                <div>{data.finalOrderLen2 || ''}</div>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black">
              <td className="border-r border-black p-1 font-bold">
                {isCds ? 'FINAL CDS TOLERANCE (IN MM)' : 'FINAL HFS TOLERANCE (IN MM)'}
              </td>
              <td className="border-r border-black p-1 text-center font-bold">
                {data.finalTolOdMin || ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold">
                {data.finalTolOdMax || ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold">
                {data.finalTolWtMin || ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold">
                {data.finalTolWtMax || ''}
              </td>
              <td className="border-r border-black p-1 text-center font-bold"></td>
              <td colSpan={2} className="p-1 text-center font-bold">
                {data.finalLenTol || ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 7. SPLIT SECTION: METALLURGY / TESTING (LEFT) & BUNDLE REGISTER (RIGHT) */}
        <div className="grid grid-cols-12 border-b border-black">
          {/* Left Column: Passes, Heat Treatment, Mechanical Properties, Testing & Finishing (approx 76% width) */}
          <div className="col-span-9 border-r border-black flex flex-col justify-between">
            {/* Inter Pass Table */}
            <table className="w-full border-collapse text-[7.5px]">
              <tbody>
                <tr className="border-b border-black">
                  <td rowSpan={2} className="border-r border-black p-1 font-bold w-[25%]">
                    INTER PASS
                  </td>
                  <td colSpan={2} className="border-r border-black p-0.5 text-center font-bold w-[25%] bg-slate-50">
                    1 ST PASS
                  </td>
                  <td colSpan={2} className="border-r border-black p-0.5 text-center font-bold w-[25%] bg-slate-50">
                    2 ND PASS
                  </td>
                  <td colSpan={2} className="p-0.5 text-center font-bold w-[25%] bg-slate-50">
                    3 RD PASS
                  </td>
                </tr>
                <tr className="border-b border-black text-center font-semibold">
                  <td className="border-r border-black p-0.5">OD: NA</td>
                  <td className="border-r border-black p-0.5">WT: NA</td>
                  <td className="border-r border-black p-0.5">OD: NA</td>
                  <td className="border-r border-black p-0.5">WT: NA</td>
                  <td className="border-r border-black p-0.5">OD: NA</td>
                  <td className="p-0.5">WT: NA</td>
                </tr>

                {/* Heat Treatment */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1 font-bold">HEAT TREATMENT</td>
                  <td className="border-r border-black p-1 font-bold text-center bg-slate-50">CYCLE</td>
                  <td className="border-r border-black p-1 font-bold text-center">CONDITION</td>
                  <td colSpan={4} className="p-1 font-bold text-center">HARDNESS</td>
                </tr>
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1 font-bold">ANNEALED</td>
                  <td className="border-r border-black p-1 text-center font-medium">{data.htCycle || 'ANNEALING'}</td>
                  <td className="border-r border-black p-1 text-center font-medium">{data.htCondition || 'ANNEALING'}</td>
                  <td colSpan={4} className="p-1 text-center font-bold">{data.hardness || '79 HRB MAX'}</td>
                </tr>

                {/* Mechanical Properties */}
                <tr className="border-b border-black">
                  <td rowSpan={3} className="border-r border-black p-1 font-bold">
                    MECHANICAL PROPERTIES
                  </td>
                  <td colSpan={2} className="border-r border-black p-0.5 text-center font-bold bg-slate-50">
                    YST(MPa)
                  </td>
                  <td colSpan={2} className="border-r border-black p-0.5 text-center font-bold bg-slate-50">
                    UTS(MPa)
                  </td>
                  <td colSpan={2} className="p-0.5 text-center font-bold bg-slate-50">
                    ELONGATION %(CS AREA)
                  </td>
                </tr>
                <tr className="border-b border-black text-center font-bold">
                  <td className="border-r border-black p-0.5">MIN.</td>
                  <td className="border-r border-black p-0.5">MAX.</td>
                  <td className="border-r border-black p-0.5">MIN.</td>
                  <td className="border-r border-black p-0.5">MAX.</td>
                  <td className="border-r border-black p-0.5">MIN.</td>
                  <td className="p-0.5">MAX.</td>
                </tr>
                <tr className="border-b border-black text-center font-bold">
                  <td className="border-r border-black p-1">{data.ystMin || '255'}</td>
                  <td className="border-r border-black p-1 text-slate-500 font-normal">
                    {data.ystMax || 'NOT SPECIFIED'}
                  </td>
                  <td className="border-r border-black p-1">{data.utsMin || '415'}</td>
                  <td className="border-r border-black p-1 text-slate-500 font-normal">
                    {data.utsMax || 'NOT SPECIFIED'}
                  </td>
                  <td className="border-r border-black p-1">{data.elongationMin || '30'}</td>
                  <td className="p-1 text-slate-500 font-normal">
                    NOT SPECIFIED
                  </td>
                </tr>

                {/* Testing */}
                <tr className="border-b border-black">
                  <td rowSpan={2} className="border-r border-black p-1 font-bold">
                    TESTING
                  </td>
                  <td colSpan={2} className="border-r border-black p-0.5 text-center font-bold bg-slate-50">
                    NDT
                  </td>
                  <td colSpan={2} className="border-r border-black p-0.5 text-center font-bold bg-slate-50">
                    HYDRO PRESSURE
                  </td>
                  <td colSpan={2} className="p-0.5 text-center font-bold bg-slate-50">
                    HOLDING TIME:
                  </td>
                </tr>
                <tr className="border-b border-black text-center font-bold">
                  <td colSpan={2} className="border-r border-black p-1">{data.ndt || 'UT'}</td>
                  <td colSpan={2} className="border-r border-black p-1">
                    {data.hydroPressurePsi
                      ? data.hydroPressurePsi.includes('PSI')
                        ? data.hydroPressurePsi
                        : `${data.hydroPressurePsi} PSI`
                      : '—'}
                  </td>
                  <td colSpan={2} className="p-1">{data.holdingTime || '5 SEC'}</td>
                </tr>

                {/* Coating & End Condition */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1 font-bold">COATING</td>
                  <td colSpan={2} className="border-r border-black p-1 text-center font-bold">
                    {data.coating || 'BLACK VARNISH'}
                  </td>
                  <td className="border-r border-black p-1 font-bold text-center">END CONDITION</td>
                  <td className="border-r border-black p-1 text-center font-bold">
                    {data.endCondition || 'PLAIN'}
                  </td>
                  <td colSpan={2} className="p-1 text-center font-bold">
                    {data.bundling || 'HEXAGONAL'}
                  </td>
                </tr>

                {/* Bundling & Packaging */}
                <tr>
                  <td className="border-r border-black p-1 font-bold">BUNDLE QTY. (PCS)</td>
                  <td colSpan={2} className="border-r border-black p-1 text-center font-bold">
                    {data.bundleQtyPcs || ''}
                  </td>
                  <td className="border-r border-black p-1 font-bold text-center">BUNDLE WEIGHT (MT)</td>
                  <td className="border-r border-black p-1 text-center font-bold">
                    {data.bundleWeightMt || '2 MT'}
                  </td>
                  <td className="border-r border-black p-1 font-bold text-center text-[7px]">END CAP:</td>
                  <td className="p-1 text-center font-bold text-[7px] truncate">
                    {data.endCap || 'PLASTIC PROTECTOR'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right Column: Physical Bundle Register Table (approx 24% width) */}
          <div className="col-span-3">
            <table className="w-full border-collapse text-[7px] h-full">
              <thead>
                <tr className="border-b border-black bg-slate-50 text-center font-bold">
                  <td className="border-r border-black p-0.5 w-[25%]">SL.NO.</td>
                  <td className="border-r border-black p-0.5 w-[45%]">BUNDLE NO.</td>
                  <td className="p-0.5 w-[30%]">QTY.</td>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, idx) => (
                  <tr key={idx} className="border-b border-black text-center h-[14.5px]">
                    <td className="border-r border-black p-0.5 font-bold bg-slate-50">{idx + 1}</td>
                    <td className="border-r border-black p-0.5"></td>
                    <td className="p-0.5"></td>
                  </tr>
                ))}
                <tr className="text-center font-black bg-slate-50 h-[15px]">
                  <td colSpan={2} className="border-r border-black p-0.5 text-right pr-2">
                    TOTAL
                  </td>
                  <td className="p-0.5"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 8. SPECIAL REQUIREMENTS (IF ANY) */}
        <div className="border-b border-black p-1 text-[7.5px]">
          <span className="font-bold">SPECIAL REQUIREMENTS (IF ANY): </span>
          <span className="font-semibold text-slate-800">
            {data.specialInstructions || ''}
          </span>
        </div>

        {/* 9. MARKING STENCIL SECTION */}
        <div className="bg-slate-100 border-b border-black text-center font-bold text-[8px] py-0.5 uppercase tracking-wider">
          MARKING
        </div>
        <div className="border-b border-black p-1.5 font-mono text-[7.5px] font-bold leading-normal break-words text-slate-900 bg-white min-h-[30px] flex items-center">
          {data.markingText || ''}
        </div>

        {/* 10. SIGNATURES FOOTER (5 Authorization Blocks) */}
        <div className="grid grid-cols-5 divide-x divide-black text-[7.5px] border-b border-black">
          <div className="p-1.5 text-center flex flex-col justify-between h-14">
            <div className="h-6 flex items-center justify-center font-serif italic text-slate-400 text-[9px]">
              {/* Operator Signature space */}
            </div>
            <div className="border-t border-black pt-0.5 font-black uppercase text-black text-[7px] leading-tight">
              PREPARED BY<br />DATE
            </div>
          </div>

          <div className="p-1.5 text-center flex flex-col justify-between h-14">
            <div className="h-6 flex items-center justify-center font-serif italic text-slate-400 text-[9px]">
              {/* QC Signature space */}
            </div>
            <div className="border-t border-black pt-0.5 font-black uppercase text-black text-[7px] leading-tight">
              QC IN-CHARGE<br />DATE
            </div>
          </div>

          <div className="p-1.5 text-center flex flex-col justify-between h-14">
            <div className="h-6 flex items-center justify-center font-serif italic text-slate-400 text-[9px]">
              {/* Hot Mill Signature space */}
            </div>
            <div className="border-t border-black pt-0.5 font-black uppercase text-black text-[7px] leading-tight">
              HOT MILL SEC IN-CHARGE<br />DATE
            </div>
          </div>

          <div className="p-1.5 text-center flex flex-col justify-between h-14">
            <div className="h-6 flex items-center justify-center font-serif italic text-slate-400 text-[9px]">
              {/* Cold Mill Signature space */}
            </div>
            <div className="border-t border-black pt-0.5 font-black uppercase text-black text-[7px] leading-tight">
              COLD MILL SEC IN-CHARGE<br />DATE
            </div>
          </div>

          <div className="p-1.5 text-center flex flex-col justify-between h-14">
            <div className="h-6 flex items-center justify-center font-serif italic text-slate-400 text-[9px]">
              {/* HOD QA/QC space */}
            </div>
            <div className="border-t border-black pt-0.5 font-black uppercase text-black text-[7px] leading-tight">
              HOD (QA/QC)<br />DATE
            </div>
          </div>
        </div>

        {/* 11. Document Control Metadata Footer */}
        <div className="p-1 text-[6.5px] font-mono text-slate-600 flex justify-between items-center bg-slate-50">
          <span>Format No: F-PROD-11, Eff. Date: 01.04.2023, Rev:01, Rev. Dt: 01.04.2024 / PPC</span>
          <span>Seamless Pipe Manufacturing Execution System</span>
        </div>
      </div>
    </div>
  );
}
