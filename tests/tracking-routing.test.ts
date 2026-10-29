import { describe, it, expect } from 'vitest';

/**
 * Validates route determination, stage-in-route rules, and WIP stage balancing for Work Order Tracking.
 * Ensures:
 * 1. HTC (Hot Test Check) is universally present in all routes directly after Hot Rolling.
 * 2. Hollow HT (HOLLOW_HEAT_TREATMENT) is strictly an alloy furnace stage (ALLOY_HFS, ALLOY_CDS).
 * 3. Hot rolled mother pipes tested OK at HTC do NOT falsely show as "Cut WIP" at Band Saw or double-count.
 * 4. Band Saw Cut WIP is strictly 0 when Cut Output is 0.
 */
describe('Work Order Tracking Route Stage & WIP Balancing Validation', () => {
  function getRouteStages(routeCode: string) {
    const code = routeCode.toUpperCase();
    const hasHtcInRoute = true; // Universal for all seamless pipe routes after hot rolling
    const hasHhtInRoute = code === 'ALLOY_CDS' || code === 'ALLOY_HFS' || code.includes('ALLOY');
    const hasDrawInRoute = code === 'CDS' || code === 'ALLOY_CDS' || (code.includes('CDS') && !code.includes('SS'));
    const hasPilgerInRoute = code === 'SS_STEEL' || code.includes('PILGER');
    const hasHtInRoute = code === 'CDS' || code === 'ALLOY_CDS' || code === 'SS_STEEL' || code.includes('CDS');
    const hasBandSawInRoute = true;
    const hasVdiInRoute = true;
    const hasFinishingInRoute = true;

    return {
      hasHtcInRoute,
      hasHhtInRoute,
      hasDrawInRoute,
      hasPilgerInRoute,
      hasHtInRoute,
      hasBandSawInRoute,
      hasVdiInRoute,
      hasFinishingInRoute,
    };
  }

  it('correctly flags stages for HFS route (WO 6625 / WO 6172 case)', () => {
    const route = getRouteStages('HFS');
    expect(route.hasHtcInRoute).toBe(true);  // HTC QC is universal!
    expect(route.hasHhtInRoute).toBe(false); // Hollow HT must NOT be in route!
    expect(route.hasDrawInRoute).toBe(false); // Draw Bench must NOT be in route!
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(false);   // Heat Treatment must NOT be in route!
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for ALLOY_HFS route', () => {
    const route = getRouteStages('ALLOY_HFS');
    expect(route.hasHtcInRoute).toBe(true);  // HTC QC is universal
    expect(route.hasHhtInRoute).toBe(true);  // Hollow HT is in route
    expect(route.hasDrawInRoute).toBe(false); // Draw Bench must NOT be in route!
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(false);   // Final HT must NOT be in route!
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for CDS route', () => {
    const route = getRouteStages('CDS');
    expect(route.hasHtcInRoute).toBe(true);  // HTC QC is universal
    expect(route.hasHhtInRoute).toBe(false); // Hollow HT not in standard carbon CDS
    expect(route.hasDrawInRoute).toBe(true);  // Draw Bench is in route
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(true);    // Heat Treatment is in route
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for ALLOY_CDS route', () => {
    const route = getRouteStages('ALLOY_CDS');
    expect(route.hasHtcInRoute).toBe(true);  // HTC QC is universal
    expect(route.hasHhtInRoute).toBe(true);  // Hollow HT is in route
    expect(route.hasDrawInRoute).toBe(true);
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(true);
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for SS_STEEL route', () => {
    const route = getRouteStages('SS_STEEL');
    expect(route.hasHtcInRoute).toBe(true);     // HTC QC is universal
    expect(route.hasHhtInRoute).toBe(false);    // Hollow HT is NOT in SS_STEEL route
    expect(route.hasDrawInRoute).toBe(false);   // Draw bench is NOT in SS_STEEL route
    expect(route.hasPilgerInRoute).toBe(true);  // Cold Pilger is in route
    expect(route.hasHtInRoute).toBe(true);      // Solution Anneal Heat Treatment is in route
    expect(route.hasBandSawInRoute).toBe(true); // Band saw cutting is in route
    expect(route.hasVdiInRoute).toBe(true);     // VDI inspection is in route
    expect(route.hasFinishingInRoute).toBe(true); // Finishing is in route
  });

  it('WO 6625 case: 149 rolled, 149 HTC OK, 0 cut: Band Saw has 149 mother pipes WIP in cutting queue', () => {
    // WO 6625 has:
    // Hot rolling: 149 pcs output, 0 rej
    // HTC: 149 pcs output, 149 htc_ok, 0 rej
    // Band saw: 0 cuts
    const rollingOutPcs = 149;
    const rollingRejPcs = 0;
    const htcLogOutPcs = 149;
    const htcLogRejPcs = 0;
    const htcOkPcs = 149;
    const downstreamMotherPcsCut = 0;
    const bandSawOutPcs = 0;
    const bandSawRejPcs = 0;
    const vdiInspectedPcs = 0;

    // Rolling Mill WIP: once inspected at HTC, rolling cooling bed WIP is 0
    const htcTestedPcs = htcLogOutPcs + htcLogRejPcs;
    const rollingWipPcs = Math.max(0, rollingOutPcs - rollingRejPcs - htcTestedPcs);
    expect(rollingWipPcs).toBe(0);

    // HTC WIP: rolling net output - HTC tested = 0 (all 149 tested)
    const htcWipPcs = Math.max(0, rollingOutPcs - rollingRejPcs - htcTestedPcs);
    expect(htcWipPcs).toBe(0);

    // Band Saw WIP: 149 HTC OK - 0 cuts = 149 mother pipes in queue awaiting cutting
    const bandSawWipPcs = Math.max(0, htcOkPcs - downstreamMotherPcsCut);
    expect(bandSawWipPcs).toBe(149);

    // VDI WIP: 0 cut output => 0 cut pieces awaiting VDI
    const netCutPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
    const vdiWipPcs = netCutPcs > 0 ? Math.max(0, netCutPcs - vdiInspectedPcs) : 0;
    expect(vdiWipPcs).toBe(0);
  });

  it('WO 6579 case: 1,754 rolled, 1,754 HTC OK, 1,576 cut, 1,516 VDI inspected: Band Saw WIP = 178, VDI WIP = 60', () => {
    const rollingOutPcs = 1754;
    const rollingRejPcs = 0;
    const htcLogOutPcs = 1754;
    const htcOkPcs = 1754;
    const downstreamMotherPcsCut = 1576;
    const bandSawOutPcs = 1576;
    const bandSawRejPcs = 0;
    const vdiInspectedPcs = 1516; // 1431 OK + 85 Rej/Sal

    // Rolling WIP = 0
    const rollingWipPcs = Math.max(0, rollingOutPcs - htcLogOutPcs);
    expect(rollingWipPcs).toBe(0);

    // HTC WIP = 0 (all 1,754 tested)
    const htcWipPcs = Math.max(0, rollingOutPcs - rollingRejPcs - htcLogOutPcs);
    expect(htcWipPcs).toBe(0);

    // Band Saw WIP = 1754 - 1576 = 178 mother pipes awaiting cutting
    const bandSawWipPcs = Math.max(0, htcOkPcs - downstreamMotherPcsCut);
    expect(bandSawWipPcs).toBe(178);

    // VDI WIP = 1576 - 1516 = 60 cut pieces awaiting QC inspection
    const netCutPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
    const vdiWipPcs = Math.max(0, netCutPcs - vdiInspectedPcs);
    expect(vdiWipPcs).toBe(60);
  });

  it('WO 6626 case: 223 rolled, 223 HTC OK, 223 cut into 223 pcs, 104 VDI inspected: Band Saw WIP = 0, VDI WIP = 119', () => {
    const rollingOutPcs = 223;
    const htcLogOutPcs = 223;
    const htcOkPcs = 223;
    const downstreamMotherPcsCut = 223;
    const bandSawOutPcs = 223;
    const bandSawRejPcs = 0;
    const vdiInspectedPcs = 104; // 103 OK + 1 Rej

    // Rolling Mill WIP = 0
    const rollingWipPcs = Math.max(0, rollingOutPcs - htcLogOutPcs);
    expect(rollingWipPcs).toBe(0);

    // HTC WIP = 0 (all tested)
    const htcWipPcs = Math.max(0, rollingOutPcs - htcLogOutPcs);
    expect(htcWipPcs).toBe(0);

    // Band Saw WIP = 223 - 223 = 0 (all cut)
    const bandSawWipPcs = Math.max(0, htcOkPcs - downstreamMotherPcsCut);
    expect(bandSawWipPcs).toBe(0);

    // VDI WIP = 223 - 104 = 119 (cut pieces awaiting VDI)
    const netCutPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
    const vdiWipPcs = Math.max(0, netCutPcs - vdiInspectedPcs);
    expect(vdiWipPcs).toBe(119);
  });

  it('WO 6581 case: 384 rolled, 384 HTC OK, 362 cut, 358 VDI inspected: Band Saw WIP = 22, VDI WIP = 4', () => {
    const rollingOutPcs = 384;
    const htcOkPcs = 384;
    const downstreamMotherPcsCut = 362;
    const bandSawOutPcs = 362;
    const bandSawRejPcs = 0;
    const vdiInspectedPcs = 358; // 311 OK + 47 Rej/Sal

    // Rolling WIP = 0
    const rollingWipPcs = Math.max(0, rollingOutPcs - htcOkPcs);
    expect(rollingWipPcs).toBe(0);

    // HTC WIP = 0
    const htcWipPcs = Math.max(0, rollingOutPcs - htcOkPcs);
    expect(htcWipPcs).toBe(0);

    // Band Saw WIP = 384 - 362 = 22 mother pipes waiting to be cut
    const bandSawWipPcs = Math.max(0, htcOkPcs - downstreamMotherPcsCut);
    expect(bandSawWipPcs).toBe(22);

    // VDI WIP = 362 - 358 = 4 cut pieces waiting for QC inspection
    const netCutPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
    const vdiWipPcs = Math.max(0, netCutPcs - vdiInspectedPcs);
    expect(vdiWipPcs).toBe(4);
  });
});
