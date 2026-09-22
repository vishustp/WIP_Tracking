// app/api/specs/ai-lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { findMatchingStandard, METALLURGICAL_STANDARDS_DB, FetchedSpecData } from '@/lib/specAiService';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Specification query is required' }, { status: 400 });
    }

    const trimmedQuery = query.trim();

    // 1. First check our authoritative metallurgical standards knowledge base
    const standardMatch = findMatchingStandard(trimmedQuery);
    if (standardMatch) {
      return NextResponse.json({
        success: true,
        data: standardMatch,
        source: 'STANDARDS_KNOWLEDGE_BASE',
      });
    }

    // 2. If an AI key is available in environment, query AI for custom/obscure standard
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const aiPrompt = `You are a Senior Metallurgical Engineer specializing in seamless steel pipes and tubes.
Extract or calculate standard manufacturing specifications for the steel specification: "${trimmedQuery}".
Return strictly valid JSON with these exact keys:
{
  "spec_key": "short uppercase key without spaces e.g. A335_P22",
  "spec_full": "Full formal name e.g. ASTM A335 P22 (IBR)",
  "steel_grade": "chemical/metallurgical steel grade description",
  "smys_mpa": number (yield strength in MPa),
  "uts_mpa": number (tensile strength min in MPa),
  "elongation_pct": number (min elongation %),
  "hardness": "max hardness with scale e.g. 85 HRB MAX",
  "straightness": "deviation standard e.g. 1:1000",
  "color_spec": "color coding e.g. RED + WHITE",
  "rm_color": "raw material billet color coding",
  "whf_temp": "walking hearth furnace temperature range",
  "induction_temp": "induction furnace temp range",
  "sizing_outlet_temp": "sizing mill exit temp",
  "ht_cycle": "heat treatment cycle e.g. NORMALIZED & TEMPERED",
  "ht_condition": "soaking temp and cooling condition",
  "ndt": "NDT test method e.g. UT + ET",
  "holding_time_sec": number (hydro holding time, default 5),
  "coating": "protective coating e.g. BLACK VARNISH",
  "end_condition": "end preparation e.g. BEVEL END (30°-35°)",
  "bundling": "bundling style e.g. HEXAGONAL",
  "end_cap": "protective cap e.g. PLASTIC PROTECTOR",
  "is_min_wall": boolean,
  "cds_od_tolerance": "Cold Drawn Seamless (CDS) OD tolerance e.g. ±0.10 mm to ±0.20 mm",
  "cds_wt_tolerance": "Cold Drawn Seamless (CDS) WT tolerance e.g. ±10.0% (Nominal) / +20% -0% (Min Wall)",
  "hfs_od_tolerance": "Hot Finished Seamless (HFS) OD tolerance e.g. ±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm)",
  "hfs_wt_tolerance": "Hot Finished Seamless (HFS) WT tolerance e.g. +15.0% / -12.5% (Nominal) / +28% -0% (Min Wall)",
  "od_tolerance": "General / Combined OD tolerance summary",
  "wt_tolerance": "General / Combined WT tolerance summary",
  "hydro_pressure": "standard hydrostatic formula and stress level"
}`;

        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: aiPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          const parsedText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (parsedText) {
            const parsedData = JSON.parse(parsedText);
            return NextResponse.json({
              success: true,
              data: { ...parsedData, source: 'AI_GENERATED' },
              source: 'AI_GENERATED',
            });
          }
        }
      } catch (aiErr) {
        console.warn('AI lookup fallback error:', aiErr);
      }
    }

    // 3. Extrapolate standard defaults based on standard pipe conventions if unknown
    const defaultSpec: FetchedSpecData = {
      spec_key: trimmedQuery.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 16),
      spec_full: trimmedQuery,
      steel_grade: 'Carbon / Low-Alloy Steel',
      smys_mpa: 240,
      uts_mpa: 415,
      elongation_pct: 21,
      hardness: '82 HRB MAX',
      straightness: '1:1000',
      color_spec: 'WHITE',
      rm_color: 'YELLOW + WHITE',
      whf_temp: '1220° C (+/- 40° C)',
      induction_temp: '860° C - 900° C',
      sizing_outlet_temp: '880° C - 920° C',
      ht_cycle: 'AS ROLLED / NORMALIZED',
      ht_condition: 'AS ROLLED / HFS',
      ndt: 'UT / ET',
      holding_time_sec: 5,
      coating: 'BLACK VARNISH',
      end_condition: 'BEVEL END (30°-35°)',
      bundling: 'HEXAGONAL',
      end_cap: 'PLASTIC PROTECTOR',
      is_min_wall: false,
      cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
      cds_wt_tolerance: '±10.0% of Nominal Wall (+20% / -0% Min Wall)',
      hfs_od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm)',
      hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
      od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
      wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
      hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa)',
      source: 'STANDARDS_KNOWLEDGE_BASE',
    };

    return NextResponse.json({
      success: true,
      data: defaultSpec,
      source: 'SYNTHESIZED_DEFAULTS',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch specification' }, { status: 500 });
  }
}
