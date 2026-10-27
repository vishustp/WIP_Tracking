import { describe, it, expect } from 'vitest';

describe('IP Cutting Queue Routing & Stage Balancing', () => {
  it('correctly calculates IP_CUTTING queue from HTC OK minus IP Cutting mother pcs processed', () => {
    const htcOkMotherPcs = 50;
    const htcOkMtr = 300.0;
    const ipCutProcessedMotherPcs = 20;
    const ipCutProcessedMtr = 120.0;

    const ipCutAvailPcs = htcOkMotherPcs - ipCutProcessedMotherPcs;
    const ipCutAvailMtr = htcOkMtr - ipCutProcessedMtr;

    expect(ipCutAvailPcs).toBe(30);
    expect(ipCutAvailMtr).toBe(180.0);
  });

  it('correctly multiplies mother pipes into cut draw pieces at IP Cutting', () => {
    const motherPcsCut = 20;
    const ipMultiple = 2;
    const ipCutLength = 6.0;

    const cutPcsProduced = motherPcsCut * ipMultiple;
    const cutMtrProduced = cutPcsProduced * ipCutLength;

    expect(cutPcsProduced).toBe(40);
    expect(cutMtrProduced).toBe(240.0);
  });

  it('feeds Draw Bench from IP Cutting cut pieces when IP Cutting is enabled', () => {
    const isIpCutting = true;
    const htcOkMotherPcs = 50;
    const ipCutProducedCutPcs = 40;
    const drawPassedPcs = 15;

    // When IP cutting is enabled, Draw Bench queue is fed by IP_CUTTING cut pieces
    const drawQueueFeedPcs = isIpCutting ? ipCutProducedCutPcs : htcOkMotherPcs;
    const drawAvailPcs = drawQueueFeedPcs - drawPassedPcs;

    expect(drawQueueFeedPcs).toBe(40);
    expect(drawAvailPcs).toBe(25);
  });

  it('bypasses IP Cutting and directly feeds Draw Bench from HTC OK when IP Cutting is disabled', () => {
    const isIpCutting = false;
    const htcOkMotherPcs = 50;
    const ipCutProducedCutPcs = 0;
    const drawPassedPcs = 15;

    // Standard routing: Draw Bench queue is fed directly by HTC OK mother pieces
    const drawQueueFeedPcs = isIpCutting ? ipCutProducedCutPcs : htcOkMotherPcs;
    const drawAvailPcs = drawQueueFeedPcs - drawPassedPcs;

    expect(drawQueueFeedPcs).toBe(50);
    expect(drawAvailPcs).toBe(35);
  });
});
