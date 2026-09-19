/**
 * Dynamic Step-by-Step Lifecycle Simulation
 * Demonstrates:
 * 1. Standard HFS Route (Rolling -> Band Saw -> VDI -> Finishing)
 * 2. Standard CDS Route (Rolling -> Draw Bench -> Heat Treatment -> Band Saw -> VDI -> Finishing)
 */

function simulateHfsLifecycle() {
  console.log('='.repeat(80));
  console.log('SIMULATION 1: STANDARD HFS WORK ORDER (WO #6400-HFS)');
  console.log('Specification: OD 168.3 mm x WT 7.11 mm | Unit Weight = 28.26 kg/m (0.02826 MT/m)');
  console.log('Mother Tube Length = 12.00 m | Cut Tube Length = 6.00 m (2 cuts per mother tube)');
  console.log('='.repeat(80));

  let plantWipPcs = 0;
  let plantWipMt = 0;

  // Step 0: Rolling
  console.log('\n>>> STEP 0: HOT ROLLING MILL');
  const rolledPcs = 100; // 100 mother tubes
  const rolledMtr = rolledPcs * 12.0; // 1200 m
  const chargedBilletMt = (rolledMtr * 0.02826) * 1.05; // 35.6 MT billet charged (5% scale/burning loss)
  const rolledMt = rolledMtr * 0.02826; // 33.91 MT rolled
  console.log(`- Charged Billet: ${chargedBilletMt.toFixed(2)} MT`);
  console.log(`- Rolling Produced: ${rolledPcs} Mother Tubes (${rolledMtr.toFixed(1)} MTR | ${rolledMt.toFixed(2)} MT)`);
  console.log(`- Plant WIP Impact: 0.00 MT (Rolling is strictly raw supply feeder, excluded from WIP)`);

  // Step 1: Arrives at Band Saw Cutting
  console.log('\n>>> STEP 1: BAND SAW CUTTING QUEUE & PRODUCTION');
  let bsQueuePcs = rolledPcs; // 100 mother tubes
  let bsQueueMtr = bsQueuePcs * 12.0;
  let bsQueueMt = bsQueueMtr * 0.02826;
  console.log(`- Initial Band Saw Queue: ${bsQueuePcs} Mother Tubes (${bsQueueMtr.toFixed(1)} MTR | ${bsQueueMt.toFixed(2)} MT)`);

  // Operator cuts 60 mother tubes into 2 cuts each = 120 cut pieces.
  // 1 mother tube had pipe defect and was scrapped (1 mother tube scrap = 12 m = 0.34 MT)
  // End cuts / kerf scrap = 0.08 MT
  const cutMotherPcs = 60;
  const scrapMotherPcs = 1;
  const cutsPerTube = 2;
  const cutPcsProduced = cutMotherPcs * cutsPerTube; // 120 pcs
  const cutLength = 6.0; // meters

  bsQueuePcs = bsQueuePcs - cutMotherPcs - scrapMotherPcs; // 100 - 60 - 1 = 39 mother tubes remaining
  bsQueueMtr = bsQueuePcs * 12.0;
  bsQueueMt = bsQueueMtr * 0.02826;

  console.log(`- Band Saw Activity: Cut ${cutMotherPcs} mother tubes (made ${cutsPerTube} cuts/tube -> produced ${cutPcsProduced} cut tubes @ 6.0m)`);
  console.log(`- Band Saw Scrap: ${scrapMotherPcs} mother tube defect scrap + cut end pieces`);
  console.log(`- Remaining in Band Saw Queue: ${bsQueuePcs} Mother Tubes (${bsQueueMtr.toFixed(1)} MTR | ${bsQueueMt.toFixed(2)} MT)`);

  // Step 2: VDI Inspection
  console.log('\n>>> STEP 2: VDI (VISUAL & DIMENSIONAL INSPECTION)');
  let vdiQueuePcs = cutPcsProduced; // 120 cut tubes received from Band Saw
  let vdiQueueMtr = vdiQueuePcs * cutLength;
  let vdiQueueMt = vdiQueueMtr * 0.02826;
  console.log(`- Initial VDI Queue: ${vdiQueuePcs} Cut Tubes (${vdiQueueMtr.toFixed(1)} MTR | ${vdiQueueMt.toFixed(2)} MT)`);

  // Inspector inspects 80 cut tubes: 78 OK, 2 Scrapped for wall thickness variation
  const vdiInspectedPcs = 80;
  const vdiOkPcs = 78;
  const vdiScrapPcs = 2;

  vdiQueuePcs = vdiQueuePcs - vdiInspectedPcs; // 120 - 80 = 40 cut tubes remaining in VDI queue
  vdiQueueMtr = vdiQueuePcs * cutLength;
  vdiQueueMt = vdiQueueMtr * 0.02826;

  console.log(`- VDI Activity: Inspected ${vdiInspectedPcs} tubes -> ${vdiOkPcs} Passed, ${vdiScrapPcs} Scrapped`);
  console.log(`- Remaining in VDI Queue: ${vdiQueuePcs} Cut Tubes (${vdiQueueMtr.toFixed(1)} MTR | ${vdiQueueMt.toFixed(2)} MT)`);

  // Step 3: Finishing & Packing
  console.log('\n>>> STEP 3: FINISHING (STRAIGHTENING, BEVELING, COATING, PACKING)');
  let finQueuePcs = vdiOkPcs; // 78 tubes received from VDI
  let finQueueMtr = finQueuePcs * cutLength;
  let finQueueMt = finQueueMtr * 0.02826;
  console.log(`- Initial Finishing Queue: ${finQueuePcs} Tubes (${finQueueMtr.toFixed(1)} MTR | ${finQueueMt.toFixed(2)} MT)`);

  // Finishing completes 50 tubes into finished dispatch bundles
  const finProcessedPcs = 50;
  const finishedDispatchPcs = 50;
  const finishedDispatchMtr = finishedDispatchPcs * cutLength;
  const finishedDispatchMt = finishedDispatchMtr * 0.02826;

  finQueuePcs = finQueuePcs - finProcessedPcs; // 78 - 50 = 28 tubes remaining in finishing queue
  finQueueMtr = finQueuePcs * cutLength;
  finQueueMt = finQueueMtr * 0.02826;

  console.log(`- Finishing Activity: Bundled & Packed ${finishedDispatchPcs} Finished Pipes (${finishedDispatchMtr.toFixed(1)} MTR | ${finishedDispatchMt.toFixed(2)} MT)`);
  console.log(`- Remaining in Finishing Queue: ${finQueuePcs} Tubes (${finQueueMtr.toFixed(1)} MTR | ${finQueueMt.toFixed(2)} MT)`);

  // Step 4: Total Reconciliation
  console.log('\n' + '-'.repeat(80));
  console.log('SUMMARY RECONCILIATION FOR WO #6400-HFS');
  console.log('-'.repeat(80));
  const activeWipMt = bsQueueMt + vdiQueueMt + finQueueMt;
  const totalScrapMt = (scrapMotherPcs * 12.0 * 0.02826) + (vdiScrapPcs * 6.0 * 0.02826);
  const accountedMt = activeWipMt + finishedDispatchMt + totalScrapMt;

  console.log(`1. Active Band Saw Queue:   ${bsQueuePcs.toString().padStart(4)} Mother Tubes | ${bsQueueMtr.toFixed(1).padStart(7)} MTR | ${bsQueueMt.toFixed(2)} MT`);
  console.log(`2. Active VDI Queue:        ${vdiQueuePcs.toString().padStart(4)} Cut Tubes    | ${vdiQueueMtr.toFixed(1).padStart(7)} MTR | ${vdiQueueMt.toFixed(2)} MT`);
  console.log(`3. Active Finishing Queue:  ${finQueuePcs.toString().padStart(4)} Cut Tubes    | ${finQueueMtr.toFixed(1).padStart(7)} MTR | ${finQueueMt.toFixed(2)} MT`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`TOTAL ACTIVE PLANT WIP:     ${(bsQueuePcs + vdiQueuePcs + finQueuePcs).toString().padStart(4)} PCS         | ${(bsQueueMtr + vdiQueueMtr + finQueueMtr).toFixed(1).padStart(7)} MTR | ${activeWipMt.toFixed(2)} MT`);
  console.log(`FINISHED DISPATCH READY:    ${finishedDispatchPcs.toString().padStart(4)} PCS         | ${finishedDispatchMtr.toFixed(1).padStart(7)} MTR | ${finishedDispatchMt.toFixed(2)} MT`);
  console.log(`TOTAL SCRAP GENERATED:         3 PCS         |    24.0 MTR |  ${totalScrapMt.toFixed(2)} MT`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`TOTAL STEEL ACCOUNTED FOR:  ${accountedMt.toFixed(2)} MT out of ${rolledMt.toFixed(2)} MT rolled (100% Conserved)`);
  console.log('='.repeat(80) + '\n');
}

function simulateCdsLifecycle() {
  console.log('='.repeat(80));
  console.log('SIMULATION 2: STANDARD CDS WORK ORDER (WO #6500-CDS)');
  console.log('Specification: Mother Hollow 50.8 x 4.0 mm -> Finish Pipe 38.1 x 3.2 mm (2.75 kg/m)');
  console.log('Mother Tube Length = 6.0 m | Drawn Length = 8.5 m | Cut Tube Length = 6.0 m');
  console.log('='.repeat(80));

  console.log('\n>>> STEP 0: HOT ROLLING MILL');
  const rolledPcs = 500;
  const rolledMtr = rolledPcs * 6.0;
  const rolledMt = rolledMtr * 0.00461; // 4.61 kg/m mother hollow
  console.log(`- Rolling Produced: ${rolledPcs} Mother Hollows (${rolledMtr.toFixed(1)} MTR | ${rolledMt.toFixed(2)} MT)`);
  console.log(`- Plant WIP Impact: 0.00 MT (Feeder only)`);

  console.log('\n>>> STEP 1: DRAW BENCH (COLD DRAWING)');
  let drawQueuePcs = rolledPcs; // 500 mother tubes
  console.log(`- Initial Draw Queue: ${drawQueuePcs} Mother Tubes (${rolledMt.toFixed(2)} MT)`);
  const drawnMotherPcs = 300;
  drawQueuePcs -= drawnMotherPcs; // 200 remaining in draw queue
  const drawnPcsProduced = drawnMotherPcs; // 300 drawn pipes produced
  const drawnMtrProduced = drawnPcsProduced * 8.5; // drawn length is 8.5m
  const drawnMtProduced = drawnMtrProduced * 0.00275; // 7.01 MT
  const remainingDrawMt = (drawQueuePcs * 6.0) * 0.00461; // 5.53 MT
  console.log(`- Draw Bench Activity: Drawn ${drawnMotherPcs} mother hollows -> Produced ${drawnPcsProduced} elongated pipes (${drawnMtrProduced.toFixed(1)} MTR | ${drawnMtProduced.toFixed(2)} MT)`);
  console.log(`- Remaining in Draw Queue: ${drawQueuePcs} Mother Hollows (${remainingDrawMt.toFixed(2)} MT)`);

  console.log('\n>>> STEP 2: FINAL HEAT TREATMENT');
  let htQueuePcs = drawnPcsProduced; // 300 drawn tubes
  console.log(`- Initial Final HT Queue: ${htQueuePcs} Drawn Tubes (${drawnMtProduced.toFixed(2)} MT)`);
  const htProcessedPcs = 200;
  htQueuePcs -= htProcessedPcs; // 100 remaining in HT queue
  const remainingHtMt = (htQueuePcs * 8.5) * 0.00275;
  console.log(`- Heat Treatment Activity: Annealed/Normalized ${htProcessedPcs} tubes`);
  console.log(`- Remaining in HT Queue: ${htQueuePcs} Drawn Tubes (${remainingHtMt.toFixed(2)} MT)`);

  console.log('\n>>> STEP 3: BAND SAW CUTTING & CROP');
  let bsQueuePcs = htProcessedPcs; // 200 heat treated tubes
  console.log(`- Initial Band Saw Queue: ${bsQueuePcs} Heat-Treated Pipes`);
  const cutPcs = 150; // operator cuts and crops 150 tubes
  const scrapCropPcs = 2; // defect / damaged end crop
  bsQueuePcs -= (cutPcs + scrapCropPcs); // 48 remaining in Band Saw queue
  const cutPcsProduced = cutPcs; // 150 finished length pieces
  const remainingBsMt = (bsQueuePcs * 8.5) * 0.00275;
  console.log(`- Band Saw Activity: Cropped & cut ${cutPcs} pipes to 6.0m -> Produced ${cutPcsProduced} pieces`);
  console.log(`- Remaining in Band Saw Queue: ${bsQueuePcs} Pipes (${remainingBsMt.toFixed(2)} MT)`);

  console.log('\n>>> STEP 4: VDI & FINISHING');
  let finQueuePcs = cutPcsProduced; // 150 pieces
  const packedFinishedPcs = 100;
  finQueuePcs -= packedFinishedPcs; // 50 in finishing queue
  const packedMt = (packedFinishedPcs * 6.0) * 0.00275;
  const finWipMt = (finQueuePcs * 6.0) * 0.00275;
  console.log(`- Finishing Activity: Straightened, beveled and bundled ${packedFinishedPcs} pipes (${packedMt.toFixed(2)} MT)`);
  console.log(`- Remaining in Finishing Queue: ${finQueuePcs} Pipes (${finWipMt.toFixed(2)} MT)`);

  console.log('\n' + '-'.repeat(80));
  console.log('SUMMARY RECONCILIATION FOR WO #6500-CDS');
  console.log('-'.repeat(80));
  const totalCdsWipMt = remainingDrawMt + remainingHtMt + remainingBsMt + finWipMt;
  console.log(`1. Active Draw Queue:       ${drawQueuePcs.toString().padStart(4)} Mother Hollows | ${remainingDrawMt.toFixed(2)} MT`);
  console.log(`2. Active Final HT Queue:   ${htQueuePcs.toString().padStart(4)} Drawn Pipes    | ${remainingHtMt.toFixed(2)} MT`);
  console.log(`3. Active Band Saw Queue:   ${bsQueuePcs.toString().padStart(4)} Drawn Pipes    | ${remainingBsMt.toFixed(2)} MT`);
  console.log(`4. Active Finishing Queue:  ${finQueuePcs.toString().padStart(4)} Cut Pipes      | ${finWipMt.toFixed(2)} MT`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`TOTAL ACTIVE PLANT WIP:     ${drawQueuePcs + htQueuePcs + bsQueuePcs + finQueuePcs} PCS | ${totalCdsWipMt.toFixed(2)} MT`);
  console.log(`FINISHED DISPATCH READY:    ${packedFinishedPcs} PCS | ${packedMt.toFixed(2)} MT`);
  console.log(`TOTAL STEEL CONSERVED:      ${(totalCdsWipMt + packedMt + (scrapCropPcs * 8.5 * 0.00275)).toFixed(2)} MT (Within ${rolledMt.toFixed(2)} MT rolled)`);
  console.log('='.repeat(80) + '\n');
}

simulateHfsLifecycle();
simulateCdsLifecycle();
