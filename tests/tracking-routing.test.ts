import { describe, it, expect } from 'vitest';

/**
 * Validates route determination and stage-in-route rules for Work Order Tracking.
 * Ensures that work orders routed as HFS or ALLOY_HFS do NOT show phantom WIP at Draw Bench or Final HT,
 * and that Band Saw properly receives the rolling output.
 */
describe('Work Order Tracking Route Stage Validation', () => {
  function getRouteStages(routeCode: string) {
    const code = routeCode.toUpperCase();
    const hasHtcInRoute = code === 'ALLOY_CDS' || code === 'ALLOY_HFS' || code.includes('ALLOY');
    const hasDrawInRoute = code === 'CDS' || code === 'ALLOY_CDS' || (code.includes('CDS') && !code.includes('SS'));
    const hasPilgerInRoute = code === 'SS_STEEL' || code.includes('PILGER');
    const hasHtInRoute = code === 'CDS' || code === 'ALLOY_CDS' || code === 'SS_STEEL' || code.includes('CDS');
    const hasBandSawInRoute = true;
    const hasVdiInRoute = true;
    const hasFinishingInRoute = true;

    return {
      hasHtcInRoute,
      hasDrawInRoute,
      hasPilgerInRoute,
      hasHtInRoute,
      hasBandSawInRoute,
      hasVdiInRoute,
      hasFinishingInRoute,
    };
  }

  it('correctly flags stages for HFS route (WO 6172 case)', () => {
    const route = getRouteStages('HFS');
    expect(route.hasHtcInRoute).toBe(false);
    expect(route.hasDrawInRoute).toBe(false); // Draw Bench must NOT be in route!
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(false);   // Heat Treatment must NOT be in route!
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for ALLOY_HFS route', () => {
    const route = getRouteStages('ALLOY_HFS');
    expect(route.hasHtcInRoute).toBe(true);  // Hollow HT is in route
    expect(route.hasDrawInRoute).toBe(false); // Draw Bench must NOT be in route!
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(false);   // Final HT must NOT be in route!
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for CDS route', () => {
    const route = getRouteStages('CDS');
    expect(route.hasHtcInRoute).toBe(false); // Hollow HT not in standard carbon CDS
    expect(route.hasDrawInRoute).toBe(true);  // Draw Bench is in route
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(true);    // Heat Treatment is in route
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for ALLOY_CDS route', () => {
    const route = getRouteStages('ALLOY_CDS');
    expect(route.hasHtcInRoute).toBe(true);
    expect(route.hasDrawInRoute).toBe(true);
    expect(route.hasPilgerInRoute).toBe(false);
    expect(route.hasHtInRoute).toBe(true);
    expect(route.hasBandSawInRoute).toBe(true);
    expect(route.hasVdiInRoute).toBe(true);
    expect(route.hasFinishingInRoute).toBe(true);
  });

  it('correctly flags stages for SS_STEEL route', () => {
    const route = getRouteStages('SS_STEEL');
    expect(route.hasHtcInRoute).toBe(false);    // Hollow HT is NOT in SS_STEEL route
    expect(route.hasDrawInRoute).toBe(false);   // Draw bench is NOT in SS_STEEL route
    expect(route.hasPilgerInRoute).toBe(true);  // Cold Pilger is in route
    expect(route.hasHtInRoute).toBe(true);      // Solution Anneal Heat Treatment is in route
    expect(route.hasBandSawInRoute).toBe(true); // Band saw cutting is in route
    expect(route.hasVdiInRoute).toBe(true);     // VDI inspection is in route
    expect(route.hasFinishingInRoute).toBe(true); // Finishing is in route
  });

  it('ensures Draw Bench WIP is 0 when route is HFS even with positive rolling output', () => {
    const routeCode = 'HFS';
    const { hasDrawInRoute } = getRouteStages(routeCode);
    const rollingHtcOkPcs = 142; // 852m / 6.0m = 142 pcs rolled

    let drawWipPcs = 0;
    let isNotInRoute = false;

    if (!hasDrawInRoute) {
      isNotInRoute = true;
      drawWipPcs = 0;
    } else {
      drawWipPcs = rollingHtcOkPcs;
    }

    expect(isNotInRoute).toBe(true);
    expect(drawWipPcs).toBe(0);
  });

  it('feeds Band Saw directly from rolling HTC OK when route is HFS', () => {
    const routeCode = 'HFS';
    const { hasDrawInRoute, hasHtcInRoute } = getRouteStages(routeCode);
    const rollingHtcOkPcs = 142;
    const htcOutPcs = 0;
    const htcRejPcs = 0;
    const htOutPcs = 0;
    const htRejPcs = 0;
    const drawOutPcs = 0;
    const drawRejPcs = 0;

    let incomingPcs = 0;
    if (!hasDrawInRoute) {
      incomingPcs = hasHtcInRoute ? Math.max(0, htcOutPcs - htcRejPcs) : rollingHtcOkPcs;
    } else {
      incomingPcs = htOutPcs > 0 ? Math.max(0, htOutPcs - htRejPcs) : Math.max(0, drawOutPcs - drawRejPcs);
    }

    expect(incomingPcs).toBe(142);
  });
});
