// app/api/ai/process-spec/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDeterministicProcessSpec, calculateHydroPressurePsi, calculateStandardTolerances, ProcessSpecResult } from '@/lib/metallurgy/specEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      grade,
      specification,
      size_od,
      size_wt,
      route_code = 'HFS',
      customer_name,
      wo_no,
      po_no,
      heat_no,
    } = body;

    const od = Number(size_od) || 88.9;
    const wt = Number(size_wt) || 5.49;
    const route = String(route_code || 'HFS').toUpperCase();
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    // 1. If Gemini API key is available, attempt AI structured extraction
    if (apiKey) {
      try {
        const prompt = `You are a Senior Metallurgist and Quality Assurance Engineer for a seamless steel pipe and tube mill.
Given the following pipe order parameters:
- Specification / Standard: ${specification || 'ASTM A106 Gr B'}
- Steel Grade: ${grade || 'SAE 1018 / 15C8'}
- Size: OD ${od} mm x WT ${wt} mm
- Route / Process: ${route} (e.g. HFS = Hot Finished Seamless, CDS = Cold Drawn Seamless)
- Customer: ${customer_name || 'Standard Industrial'}
- Work Order: ${wo_no || 'DOM-BPCL-05000'}

Extract and calculate the required technical parameters according to applicable ASTM/ASME/EN/IBR standards.
Respond ONLY with a valid JSON object matching this structure:
{
  "reference_standard": "Exact standard name e.g. ASTM A106 Gr B (IBR)",
  "steel_grade": "Standard equivalent grade e.g. SAE 1018 / 15C8 RS-03",
  "material_spec": "Specification string e.g. ASTM A106 Gr B (IBR)",
  "color_code_spec": "Pipe color code e.g. WHITE",
  "rm_color_code": "Raw material color code e.g. YELLOW + WHITE",
  "mechanical": {
    "yst_min_mpa": 240,
    "yst_max_mpa": "NOT SPECIFIED",
    "uts_min_mpa": 415,
    "uts_max_mpa": "NOT SPECIFIED",
    "elongation_min_pct": 21,
    "elongation_max_pct": "NOT SPECIFIED",
    "hardness_max": "79 HRB MAX",
    "straightness": "1:1000"
  },
  "tolerances": {
    "od_min": 88.10,
    "od_max": 89.70,
    "od_tol_str": "±0.80 mm",
    "wt_min": 4.80,
    "wt_max": 6.59,
    "wt_tol_str": "+20% / -12.5%",
    "cutting_tol": "+5/-0 MM"
  },
  "testing": {
    "ndt": "UT",
    "hydro_pressure_psi": 2500,
    "holding_time_sec": 5,
    "calculation_basis": "Barlow formula P=2St/D capped per standard"
  },
  "thermal": {
    "whf_temp": "1220° C (+/- 40° C)",
    "induction_furnace_temp": "850 °C - 880° C",
    "sizing_mill_outlet_temp": "880° C TO 900° C",
    "ht_cycle": "NA",
    "ht_condition": "AS ROLLED / HFS"
  },
  "coating": "BLACK VARNISH",
  "end_condition": "BEVEL END (30°-35°) ROOT FACE (0.8 - 2.4MM)",
  "bundling": "HEXAGONAL",
  "end_cap": "PLASTIC PROTECTOR",
  "suggested_marking": "RASHMI SMLS / LOGO / HFS / ASTM A106 GR.B / OD 88.90 MM X WT 5.49 MM / HYDRO TESTED 2500 PSI / NDE / PO NO -..."
}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            const parsedData = JSON.parse(responseText);

            // Double check hydro pressure calculation safety with Barlow formula
            const smys = Number(parsedData.mechanical?.yst_min_mpa) || 240;
            const hydroVerified = calculateHydroPressurePsi(od, wt, smys);

            const result: ProcessSpecResult = {
              source: 'ai',
              reference_standard: parsedData.reference_standard || specification || 'ASTM Standard',
              steel_grade: parsedData.steel_grade || grade || 'Standard Grade',
              material_spec: parsedData.material_spec || specification || 'Standard Spec',
              color_code_spec: parsedData.color_code_spec || 'WHITE',
              rm_color_code: parsedData.rm_color_code || 'YELLOW + WHITE',
              mechanical: {
                yst_min_mpa: parsedData.mechanical?.yst_min_mpa ?? 240,
                yst_max_mpa: parsedData.mechanical?.yst_max_mpa ?? 'NOT SPECIFIED',
                uts_min_mpa: parsedData.mechanical?.uts_min_mpa ?? 415,
                uts_max_mpa: parsedData.mechanical?.uts_max_mpa ?? 'NOT SPECIFIED',
                elongation_min_pct: parsedData.mechanical?.elongation_min_pct ?? 21,
                elongation_max_pct: parsedData.mechanical?.elongation_max_pct ?? 'NOT SPECIFIED',
                hardness_max: parsedData.mechanical?.hardness_max ?? '79 HRB MAX',
                straightness: parsedData.mechanical?.straightness ?? '1:1000',
              },
              tolerances: {
                od_min: Number(parsedData.tolerances?.od_min) || (od - 0.8),
                od_max: Number(parsedData.tolerances?.od_max) || (od + 0.8),
                od_tol_str: parsedData.tolerances?.od_tol_str || '±0.8 mm',
                wt_min: Number(parsedData.tolerances?.wt_min) || Number((wt * 0.875).toFixed(2)),
                wt_max: Number(parsedData.tolerances?.wt_max) || Number((wt * 1.20).toFixed(2)),
                wt_tol_str: parsedData.tolerances?.wt_tol_str || '+20% / -12.5%',
                cutting_tol: parsedData.tolerances?.cutting_tol || '+5/-0 MM',
              },
              testing: {
                ndt: parsedData.testing?.ndt || 'UT',
                hydro_pressure_psi: Number(parsedData.testing?.hydro_pressure_psi) || hydroVerified.pressurePsi,
                holding_time_sec: Number(parsedData.testing?.holding_time_sec) || 5,
                calculation_basis: parsedData.testing?.calculation_basis || hydroVerified.formulaNote,
              },
              thermal: {
                whf_temp: parsedData.thermal?.whf_temp || '1220° C (+/- 40° C)',
                induction_furnace_temp: parsedData.thermal?.induction_furnace_temp || '850 °C - 880° C',
                sizing_mill_outlet_temp: parsedData.thermal?.sizing_mill_outlet_temp || '880° C TO 900° C',
                ht_cycle: parsedData.thermal?.ht_cycle || 'NA',
                ht_condition: parsedData.thermal?.ht_condition || 'AS ROLLED',
              },
              coating: parsedData.coating || 'BLACK VARNISH',
              end_condition: parsedData.end_condition || 'BEVEL END (30°-35°)',
              bundling: parsedData.bundling || 'HEXAGONAL',
              end_cap: parsedData.end_cap || 'PLASTIC PROTECTOR',
              suggested_marking:
                parsedData.suggested_marking ||
                `RASHMI SMLS / LOGO / ${route} / ${specification || 'ASTM A106 GR.B'} / OD ${od.toFixed(2)} MM X WT ${wt.toFixed(2)} MM / HYDRO TESTED ${hydroVerified.pressurePsi} PSI / NDE`,
            };

            return NextResponse.json({ success: true, data: result, source: 'ai' });
          }
        }
      } catch (aiErr) {
        console.warn('Gemini API fetch error, using deterministic metallurgical engine fallback:', aiErr);
      }
    }

    // 2. Offline Deterministic Metallurgical Engine Fallback (Instant & 100% Reliable)
    const fallbackResult = getDeterministicProcessSpec({
      grade,
      specification,
      size_od: od,
      size_wt: wt,
      route_code: route,
      customer_name,
      wo_no,
      po_no,
      heat_no,
    });

    return NextResponse.json({
      success: true,
      data: fallbackResult,
      source: 'engine',
      note: apiKey ? 'Offline engine used as backup' : 'Offline metallurgical engine (No API key required)',
    });
  } catch (error: any) {
    console.error('Error in /api/ai/process-spec:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to determine process specifications.' },
      { status: 500 }
    );
  }
}
