'use client';

import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Row, BandSawCutItem, BandSawCutCategory } from '@/types';
import {
  n,
  fmt,
  mtFromMtr,
  mtrFromPcs,
  attachBandSawCutsToRemarks,
  extractBandSawCutsFromRemarks,
  classifyPipeCutLength,
} from '@/lib/productionUtils';
import {
  Scissors,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowRight,
  TrendingUp,
  Percent,
  Sparkles,
  SlidersHorizontal,
  Split,
  Calculator,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export interface BandSawCuttingModalProps {
  row: Row;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  processDate?: string;
}

export function BandSawCuttingModal({
  row,
  isOpen,
  onClose,
  onSuccess,
  processDate: initialDate,
}: BandSawCuttingModalProps) {
  // Mother hollow / pipe dimensions
  const pipeOd = Number(row.od || 0);
  const pipeWt = Number(row.wl || 0);

  // Available mother pipes from queue
  const availMotherPcs = Math.max(0, Math.round(Number(row.balance_to_make_pcs || 0)));
  const availMotherMtr = Math.max(0, Number(row.balance_to_make_mtr || 0));
  const availMotherMt = mtFromMtr(availMotherMtr, pipeOd, pipeWt);

  // Order Length specifications from Work Order
  const l1 = Number(row.l1 || 0);
  const l2 = Number(row.l2 || 0);
  const orderLengthStr = (() => {
    if (l1 > 0 && l2 > 0) {
      if (l1 === l2) return `${l1.toFixed(2)} MTR`;
      return `${l1.toFixed(2)} - ${l2.toFixed(2)} MTR`;
    }
    if (l1 > 0) return `${l1.toFixed(2)} MTR`;
    if (row.avg_length) return `${Number(row.avg_length).toFixed(2)} MTR`;
    return 'Standard Length';
  })();
  const lengthTypeStr = row.len_type ? `(${row.len_type})` : '';

  // Child Work Orders (if Master Campaign or linked child orders)
  const childOrders = row.child_work_orders || [];
  const hasChildOrders = Array.isArray(childOrders) && childOrders.length > 0;

  // Default initial mother pipe average length
  const defaultMotherLen = (() => {
    if (l1 > 0 && l2 > 0) return (l1 + l2) / 2;
    if (l1 > 0) return l1;
    if (availMotherPcs > 0 && availMotherMtr > 0) return Number((availMotherMtr / availMotherPcs).toFixed(2));
    return Number(row.avg_length || 6.0);
  })();

  const [date, setDate] = useState(() => {
    if (initialDate) return initialDate;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });

  // Mother pipes input state
  const [motherPcsInput, setMotherPcsInput] = useState<string>(
    availMotherPcs > 0 ? String(availMotherPcs) : '1'
  );
  const [motherAvgLenInput, setMotherAvgLenInput] = useState<string>(
    String(defaultMotherLen > 0 ? defaultMotherLen : 6.0)
  );

  // Multi-length cut items list - Hybrid Pre-fill from Rolling Plan
  const [cutItems, setCutItems] = useState<BandSawCutItem[]>(() => {
    const planMultiple = Math.max(1, Math.round(Number(row.multiple || 1)));
    const targetOrderLen = Number(row.l1 || row.avg_length || 0);

    let cutLen = defaultMotherLen > 0 ? defaultMotherLen : 6.0;
    if (targetOrderLen > 0 && targetOrderLen < defaultMotherLen) {
      cutLen = targetOrderLen;
    } else if (planMultiple > 1 && defaultMotherLen > 0) {
      cutLen = Number((defaultMotherLen / planMultiple).toFixed(2));
    }

    const mPcs = availMotherPcs > 0 ? availMotherPcs : 1;
    const primePcs = planMultiple > 1 ? mPcs * planMultiple : mPcs;
    const totalMtr = Number((cutLen * primePcs).toFixed(2));

    const initialCategory = classifyPipeCutLength(cutLen, targetOrderLen);
    const mappedCategory: BandSawCutCategory = initialCategory === 'PRIME' ? 'PRIME' : 'OFFCUT';

    const items: BandSawCutItem[] = [
      {
        id: 'cut-1',
        length_mtr: Number(cutLen.toFixed(2)),
        cut_pcs: primePcs,
        cut_category: mappedCategory,
        total_mtr: totalMtr,
        total_mt: mtFromMtr(totalMtr, pipeOd, pipeWt),
      },
    ];

    // Check for remainder per pipe >= 3.0m (Rule 5C)
    const totalIncomingMtr = mPcs * (defaultMotherLen > 0 ? defaultMotherLen : 6.0);
    const remMtr = totalIncomingMtr - totalMtr;
    const remPerPipe = mPcs > 0 ? remMtr / mPcs : 0;
    if (remPerPipe >= 3.0) {
      items.push({
        id: 'cut-remnant',
        length_mtr: Number(remPerPipe.toFixed(2)),
        cut_pcs: mPcs,
        cut_category: 'OFFCUT',
        total_mtr: Number(remMtr.toFixed(2)),
        total_mt: mtFromMtr(remMtr, pipeOd, pipeWt),
      });
    }

    return items;
  });

  // Batch Splitter Modal & Preset States
  const [showBatchSplitTool, setShowBatchSplitTool] = useState(false);
  const [showCustomTargetInput, setShowCustomTargetInput] = useState(false);
  const [customTargetLen, setCustomTargetLen] = useState<string>(
    row.l1 ? String(row.l1) : '5.50'
  );

  // Combination cut inputs (e.g. 6.00m + 5.54m from 11.75m pipe)
  const [showCombinationInput, setShowCombinationInput] = useState(false);
  const [combCut1, setCombCut1] = useState<string>(row.l1 ? String(row.l1) : '6.00');
  const [combCut2, setCombCut2] = useState<string>('5.54');

  // Batch Splitter parameters
  const [batchGroupA_Pcs, setBatchGroupA_Pcs] = useState(String(Math.floor(availMotherPcs / 2) || 1));
  const [batchGroupA_CutLen, setBatchGroupA_CutLen] = useState(row.l1 ? String(row.l1) : '5.50');
  const [batchGroupA_Multiplier, setBatchGroupA_Multiplier] = useState('2');

  const [batchGroupB_Pcs, setBatchGroupB_Pcs] = useState(String(Math.ceil(availMotherPcs / 2) || 1));
  const [batchGroupB_CutLen, setBatchGroupB_CutLen] = useState('11.00');
  const [batchGroupB_Multiplier, setBatchGroupB_Multiplier] = useState('1');

  // Rejection / Defect cut pieces
  const [rejCutPcs, setRejCutPcs] = useState<string>('0');
  const [rejCutMtr, setRejCutMtr] = useState<string>('0');
  const [heatLotNo, setHeatLotNo] = useState<string>(row.heat_lot_no || '');
  const [remarks, setRemarks] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Mother input computations
  const motherPcsNum = Math.max(0, parseInt(motherPcsInput, 10) || 0);
  const motherAvgLenNum = Math.max(0, parseFloat(motherAvgLenInput) || 0);
  const totalMotherMtr = Number((motherPcsNum * motherAvgLenNum).toFixed(2));
  const totalMotherMt = mtFromMtr(totalMotherMtr, pipeOd, pipeWt);

  // Live mother balance remaining
  const remainingMotherPcs = availMotherPcs - motherPcsNum;
  const remainingMotherMtr = Number((availMotherMtr - totalMotherMtr).toFixed(2));
  const remainingMotherMt = mtFromMtr(remainingMotherMtr > 0 ? remainingMotherMtr : 0, pipeOd, pipeWt);

  // Rejections
  const nRejPcs = Math.max(0, parseInt(rejCutPcs, 10) || 0);
  const nRejMtr = Math.max(
    0,
    parseFloat(rejCutMtr) || (nRejPcs > 0 && motherAvgLenNum > 0 ? nRejPcs * motherAvgLenNum : 0)
  );
  const nRejMt = mtFromMtr(nRejMtr, pipeOd, pipeWt);

  // Total cuts & Scrap calculation breakdown
  const {
    totalPrimeCutPcs,
    totalPrimeCutMtr,
    totalPrimeCutMt,
    totalAllCutMtr,
    usableOffcutMtr,
    usableOffcutMt,
    trimNotReqMtr,
    trimNotReqMt,
    kerfLossMtr,
    kerfLossMt,
    totalScrapMtr,
    totalScrapMt,
    scrapPct,
    netVdiFeedPcs,
    netVdiFeedMtr,
    netVdiFeedMt,
    yieldPct,
  } = useMemo(() => {
    let primePcs = 0;
    let primeM = 0;
    let allM = 0;
    let offcutM = 0;
    let notReqTrimM = 0;

    cutItems.forEach((c) => {
      const len = Number(c.length_mtr || 0);
      const pcs = Number(c.cut_pcs || 0);
      const mtr = Number((len * pcs).toFixed(2));
      allM += mtr;

      if (c.cut_category === 'PRIME' || c.cut_category === 'SECONDARY') {
        primePcs += pcs;
        primeM += mtr;
      } else if (c.cut_category === 'OFFCUT') {
        offcutM += mtr;
      } else {
        // SCRAP_TRIM or SCRAP_NOT_REQUIRED (not required in order)
        notReqTrimM += mtr;
      }
    });

    const primeMt = mtFromMtr(primeM, pipeOd, pipeWt);
    const offcutMt = mtFromMtr(offcutM, pipeOd, pipeWt);
    const trimMt = mtFromMtr(notReqTrimM, pipeOd, pipeWt);

    // Saw Kerf / Unaccounted drop loss
    const totalCutWithRej = allM + nRejMtr;
    const kerfM = Math.max(0, Number((totalMotherMtr - totalCutWithRej).toFixed(2)));
    const kerfMt = mtFromMtr(kerfM, pipeOd, pipeWt);

    // Total Scrap = Not Required/Trims + Kerf Loss + Defect Rejections (All non-order required)
    const scrapM = Number((notReqTrimM + kerfM + nRejMtr).toFixed(2));
    const scrapMt = mtFromMtr(scrapM, pipeOd, pipeWt);
    const scrapPctVal = totalMotherMt > 0 ? Number(((scrapMt / totalMotherMt) * 100).toFixed(1)) : 0;

    // Net good cuts feeding VDI QC
    const netPcs = Math.max(0, primePcs - nRejPcs);
    const netMtr = Math.max(0, Number((primeM - nRejMtr).toFixed(2)));
    const netMt = mtFromMtr(netMtr, pipeOd, pipeWt);

    // Net Cutting Yield
    const yPct = totalMotherMt > 0 ? Math.min(100, Math.max(0, Number(((netMt / totalMotherMt) * 100).toFixed(1)))) : 100;

    return {
      totalPrimeCutPcs: primePcs,
      totalPrimeCutMtr: Number(primeM.toFixed(2)),
      totalPrimeCutMt: primeMt,
      totalAllCutMtr: Number(allM.toFixed(2)),
      usableOffcutMtr: Number(offcutM.toFixed(2)),
      usableOffcutMt: offcutMt,
      trimNotReqMtr: Number(notReqTrimM.toFixed(2)),
      trimNotReqMt: trimMt,
      kerfLossMtr: kerfM,
      kerfLossMt: kerfMt,
      totalScrapMtr: scrapM,
      totalScrapMt: scrapMt,
      scrapPct: scrapPctVal,
      netVdiFeedPcs: netPcs,
      netVdiFeedMtr: netMtr,
      netVdiFeedMt: netMt,
      yieldPct: yPct,
    };
  }, [cutItems, pipeOd, pipeWt, nRejMtr, nRejPcs, totalMotherMtr, totalMotherMt]);

  // Visual Single Pipe Utilization Slice
  const singlePipeUtilization = useMemo(() => {
    if (motherAvgLenNum <= 0) return { cutsTotal: 0, trimScrap: 0, pct: 0, isOver: false };
    const avgCutsPerPipe = motherPcsNum > 0 ? totalAllCutMtr / motherPcsNum : totalAllCutMtr;
    const trimScrapPerPipe = Math.max(0, Number((motherAvgLenNum - avgCutsPerPipe).toFixed(2)));
    const pct = Math.min(100, (avgCutsPerPipe / motherAvgLenNum) * 100);
    const isOver = avgCutsPerPipe > motherAvgLenNum * 1.01;
    return {
      cutsTotal: Number(avgCutsPerPipe.toFixed(2)),
      trimScrap: trimScrapPerPipe,
      pct: Number(pct.toFixed(1)),
      isOver,
    };
  }, [motherAvgLenNum, motherPcsNum, totalAllCutMtr]);

  // Handlers for Cut Items
  const handleAddCutItem = () => {
    const defaultLen = Number((defaultMotherLen > 0 ? defaultMotherLen : 6.0).toFixed(2));
    const newItem: BandSawCutItem = {
      id: `cut-${Date.now()}`,
      length_mtr: defaultLen,
      cut_pcs: 1,
      cut_category: 'PRIME',
      total_mtr: defaultLen,
      total_mt: mtFromMtr(defaultLen, pipeOd, pipeWt),
    };
    setCutItems((prev) => [...prev, newItem]);
  };

  const handleUpdateCutItem = (
    id: string,
    field: keyof BandSawCutItem,
    val: string | number | BandSawCutCategory
  ) => {
    setCutItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        const len = Number(updated.length_mtr || 0);
        const pcs = Number(updated.cut_pcs || 0);
        updated.total_mtr = Number((len * pcs).toFixed(2));
        updated.total_mt = mtFromMtr(updated.total_mtr, pipeOd, pipeWt);
        return updated;
      })
    );
  };

  const handleRemoveCutItem = (id: string) => {
    if (cutItems.length === 1) {
      toast.info('At least one cut length row is required.');
      return;
    }
    setCutItems((prev) => prev.filter((item) => item.id !== id));
  };

  // --- Preset Handlers ---
  const applyEqualMultiples = (multiple: number) => {
    if (motherAvgLenNum <= 0) return;
    const cutLen = Number((motherAvgLenNum / multiple).toFixed(2));
    const totalPcs = motherPcsNum > 0 ? motherPcsNum * multiple : multiple;
    const totalMtr = Number((cutLen * totalPcs).toFixed(2));
    const newItems: BandSawCutItem[] = [
      {
        id: `cut-preset-${Date.now()}`,
        length_mtr: cutLen,
        cut_pcs: totalPcs,
        cut_category: 'PRIME',
        total_mtr: totalMtr,
        total_mt: mtFromMtr(totalMtr, pipeOd, pipeWt),
      },
    ];
    setCutItems(newItems);
    toast.success(`Applied ${multiple}-Multiple cut: ${multiple} cuts @ ${cutLen}m per mother pipe.`);
  };

  const applyTargetAndRemainder = (targetLen: number) => {
    if (motherAvgLenNum <= 0 || targetLen <= 0) {
      toast.error('Target cut length must be positive.');
      return;
    }
    if (targetLen > motherAvgLenNum) {
      toast.error(`Target length (${targetLen}m) exceeds available mother length (${motherAvgLenNum}m).`);
      return;
    }
    const multiple = Math.floor(motherAvgLenNum / targetLen);
    const remainder = Number((motherAvgLenNum - multiple * targetLen).toFixed(2));
    const totalTargetPcs = motherPcsNum > 0 ? motherPcsNum * multiple : multiple;
    const targetTotalMtr = Number((targetLen * totalTargetPcs).toFixed(2));

    const newItems: BandSawCutItem[] = [
      {
        id: `cut-target-${Date.now()}`,
        length_mtr: targetLen,
        cut_pcs: totalTargetPcs,
        cut_category: 'PRIME',
        total_mtr: targetTotalMtr,
        total_mt: mtFromMtr(targetTotalMtr, pipeOd, pipeWt),
      },
    ];

    if (remainder >= 0.05) {
      const remPcs = motherPcsNum > 0 ? motherPcsNum : 1;
      const remTotalMtr = Number((remainder * remPcs).toFixed(2));
      newItems.push({
        id: `cut-rem-${Date.now() + 1}`,
        length_mtr: remainder,
        cut_pcs: remPcs,
        cut_category: remainder >= 4.0 ? 'OFFCUT' : 'SCRAP_TRIM',
        total_mtr: remTotalMtr,
        total_mt: mtFromMtr(remTotalMtr, pipeOd, pipeWt),
      });
    }

    setCutItems(newItems);
    setShowCustomTargetInput(false);
    toast.success(
      `Applied target cut: ${multiple} × ${targetLen}m ${
        remainder > 0 ? `+ ${remainder}m (${remainder >= 4.0 ? 'Usable Offcut' : 'Trim Scrap'})` : ''
      } per pipe.`
    );
  };

  const applyOrderTargetCut = () => {
    const target = l1 > 0 ? l1 : Number(row.avg_length || 6.0);
    if (target <= 0) {
      toast.info('No specific order length found on this Work Order.');
      return;
    }
    applyTargetAndRemainder(target);
  };

  const applyTwoCombinationCut = (cut1Len: number, cut2Len: number) => {
    if (motherAvgLenNum <= 0 || cut1Len <= 0 || cut2Len <= 0) return;
    const sumLen = cut1Len + cut2Len;
    if (sumLen > motherAvgLenNum * 1.02) {
      toast.error(`Combined length (${sumLen}m) exceeds mother pipe length (${motherAvgLenNum}m).`);
      return;
    }
    const remainder = Number((motherAvgLenNum - sumLen).toFixed(2));
    const pcs = motherPcsNum > 0 ? motherPcsNum : 1;

    const newItems: BandSawCutItem[] = [
      {
        id: `cut-comb-1-${Date.now()}`,
        length_mtr: cut1Len,
        cut_pcs: pcs,
        cut_category: 'PRIME',
        total_mtr: Number((cut1Len * pcs).toFixed(2)),
        total_mt: mtFromMtr(cut1Len * pcs, pipeOd, pipeWt),
      },
      {
        id: `cut-comb-2-${Date.now() + 1}`,
        length_mtr: cut2Len,
        cut_pcs: pcs,
        cut_category: 'SECONDARY',
        total_mtr: Number((cut2Len * pcs).toFixed(2)),
        total_mt: mtFromMtr(cut2Len * pcs, pipeOd, pipeWt),
      },
    ];

    if (remainder >= 0.05) {
      newItems.push({
        id: `cut-comb-rem-${Date.now() + 2}`,
        length_mtr: remainder,
        cut_pcs: pcs,
        cut_category: remainder >= 4.0 ? 'OFFCUT' : 'SCRAP_TRIM',
        total_mtr: Number((remainder * pcs).toFixed(2)),
        total_mt: mtFromMtr(remainder * pcs, pipeOd, pipeWt),
      });
    }

    setCutItems(newItems);
    setShowCombinationInput(false);
    toast.success(
      `Applied Combination: 1 pc @ ${cut1Len}m + 1 pc @ ${cut2Len}m ${
        remainder > 0 ? `+ ${remainder}m (${remainder >= 4.0 ? 'Offcut' : 'Trim Scrap'})` : ''
      } per pipe.`
    );
  };

  const autoFillFromChildOrders = () => {
    if (!hasChildOrders) return;
    const c1 = childOrders[0];
    const c2 = childOrders[1] || childOrders[0];

    const c1Len = Number(c1?.l1 || 5.50);
    const c2Len = Number(c2?.l1 || (motherAvgLenNum - c1Len > 0 ? Number((motherAvgLenNum - c1Len).toFixed(2)) : 6.00));

    const totalAvail = availMotherPcs > 0 ? availMotherPcs : 10;
    const c1Pcs = c1?.planned_pcs ? Math.min(totalAvail, Math.ceil(c1.planned_pcs / 2)) : Math.floor(totalAvail / 2) || 1;
    const c2Pcs = Math.max(1, totalAvail - c1Pcs);

    setBatchGroupA_CutLen(String(c1Len));
    setBatchGroupA_Pcs(String(c1Pcs));
    setBatchGroupA_Multiplier('2');

    setBatchGroupB_CutLen(String(c2Len));
    setBatchGroupB_Pcs(String(c2Pcs));
    setBatchGroupB_Multiplier('1');

    setShowBatchSplitTool(true);
    toast.success(`Loaded Child WOs: Group A -> WO #${c1.work_order_no} (${c1Len}m), Group B -> WO #${c2.work_order_no} (${c2Len}m)`);
  };

  const handleApplyBatchSplit = () => {
    const gA_mPcs = parseInt(batchGroupA_Pcs, 10) || 0;
    const gA_len = parseFloat(batchGroupA_CutLen) || 0;
    const gA_mult = parseInt(batchGroupA_Multiplier, 10) || 1;

    const gB_mPcs = parseInt(batchGroupB_Pcs, 10) || 0;
    const gB_len = parseFloat(batchGroupB_CutLen) || 0;
    const gB_mult = parseInt(batchGroupB_Multiplier, 10) || 1;

    const totalProcMotherPcs = gA_mPcs + gB_mPcs;
    if (totalProcMotherPcs <= 0) {
      toast.error('Please enter valid mother pipe quantities for batch split.');
      return;
    }

    setMotherPcsInput(String(totalProcMotherPcs));

    const newItems: BandSawCutItem[] = [];

    if (gA_mPcs > 0 && gA_len > 0) {
      const totalGA_Pcs = gA_mPcs * gA_mult;
      const totalGA_Mtr = Number((gA_len * totalGA_Pcs).toFixed(2));
      newItems.push({
        id: `cut-batch-a-${Date.now()}`,
        length_mtr: gA_len,
        cut_pcs: totalGA_Pcs,
        cut_category: 'PRIME',
        total_mtr: totalGA_Mtr,
        total_mt: mtFromMtr(totalGA_Mtr, pipeOd, pipeWt),
      });

      const remA = Number((motherAvgLenNum - gA_len * gA_mult).toFixed(2));
      if (remA >= 0.05) {
        const remA_Mtr = Number((remA * gA_mPcs).toFixed(2));
        newItems.push({
          id: `cut-batch-a-rem-${Date.now()}`,
          length_mtr: remA,
          cut_pcs: gA_mPcs,
          cut_category: remA >= 4.0 ? 'OFFCUT' : 'SCRAP_TRIM',
          total_mtr: remA_Mtr,
          total_mt: mtFromMtr(remA_Mtr, pipeOd, pipeWt),
        });
      }
    }

    if (gB_mPcs > 0 && gB_len > 0) {
      const totalGB_Pcs = gB_mPcs * gB_mult;
      const totalGB_Mtr = Number((gB_len * totalGB_Pcs).toFixed(2));
      newItems.push({
        id: `cut-batch-b-${Date.now() + 1}`,
        length_mtr: gB_len,
        cut_pcs: totalGB_Pcs,
        cut_category: gA_mPcs > 0 ? 'SECONDARY' : 'PRIME',
        total_mtr: totalGB_Mtr,
        total_mt: mtFromMtr(totalGB_Mtr, pipeOd, pipeWt),
      });

      const remB = Number((motherAvgLenNum - gB_len * gB_mult).toFixed(2));
      if (remB >= 0.05) {
        const remB_Mtr = Number((remB * gB_mPcs).toFixed(2));
        newItems.push({
          id: `cut-batch-b-rem-${Date.now() + 1}`,
          length_mtr: remB,
          cut_pcs: gB_mPcs,
          cut_category: remB >= 4.0 ? 'OFFCUT' : 'SCRAP_TRIM',
          total_mtr: remB_Mtr,
          total_mt: mtFromMtr(remB_Mtr, pipeOd, pipeWt),
        });
      }
    }

    setCutItems(newItems);
    setShowBatchSplitTool(false);
    toast.success(`Batch split applied: ${gA_mPcs} pipes @ ${gA_len}m + ${gB_mPcs} pipes @ ${gB_len}m.`);
  };

  // Submit Cutting Log
  const handleSubmit = async () => {
    setError(null);
    if (motherPcsNum <= 0) {
      setError('Please enter valid Mother Pipes Processed (≥ 1).');
      return;
    }
    if (totalPrimeCutPcs <= 0 && totalPrimeCutMtr <= 0) {
      setError('Please specify at least one cut length item with positive pieces.');
      return;
    }
    if (totalAllCutMtr > totalMotherMtr * 1.15) {
      setError(
        `Total cut length (${totalAllCutMtr}m) significantly exceeds mother pipe length (${totalMotherMtr}m). Please verify cut pieces.`
      );
      return;
    }

    setSaving(true);
    try {
      // Serialize multi-cut JSON with scrap metrics into remarks
      const finalRemarks = attachBandSawCutsToRemarks(
        remarks,
        cutItems,
        motherPcsNum,
        yieldPct,
        usableOffcutMtr,
        totalScrapMtr,
        totalScrapMt,
        scrapPct,
        row.l1,
        row.l2
      );

      let sessionUserId: string | null = null;
      let sessionToken: string | null = null;
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        sessionUserId = authData?.user?.id || null;
        const { data: sessionData } = await supabase.auth.getSession();
        sessionToken = sessionData?.session?.access_token || null;
      } catch {}

      const payload = {
        entries: [
          {
            work_order_id: row.work_order_id,
            route_id: row.route_id,
            rolling_plan_id: row.plan_id || null,
            stage_code: 'BAND_SAW',
            input_qty: totalMotherMtr,
            output_qty: totalPrimeCutMtr,
            rejection_qty: nRejMtr,
            output_pcs: totalPrimeCutPcs,
            rejection_pcs: nRejPcs,
            heat_lot_no: heatLotNo || null,
            remarks: finalRemarks,
            input_l1: row.l1 ? String(row.l1) : null,
            input_l2: row.l2 ? String(row.l2) : null,
            created_by: sessionUserId,
          },
        ],
        p_process_date: date,
        operator_id: sessionUserId,
        created_by: sessionUserId,
      };

      const res = await fetch('/api/production/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to record Band Saw cutting log.');
      }

      toast.success(
        `Band Saw cut recorded: ${netVdiFeedPcs} prime cut pieces (${netVdiFeedMtr}m / ${fmt(netVdiFeedMt, 3)} MT) sent to VDI QC queue! Scrap: ${fmt(totalScrapMt, 3)} MT (${scrapPct}%).`,
        { duration: 4000 }
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to record band saw cutting:', err);
      setError(err?.message || 'Failed to record Band Saw cutting.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal onClose={onClose} maxWidth="4xl" title="Band Saw Pipe Cutting & Multi-Length Station">
      <div className="space-y-6">
        {/* Work Order Information Banner */}
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-slate-50 p-4.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
                  <Scissors size={13} className="rotate-90" />
                  Band Saw Cutting Station
                </span>
                <span className="font-mono text-base font-bold text-slate-900">
                  WO #{row.work_order_no}
                </span>
                {row.route_code && (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {row.route_code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                {row.customer_name ? (
                  <span className="font-medium text-slate-800">{row.customer_name}</span>
                ) : (
                  'Standard Order'
                )}{' '}
                • Grade: <span className="font-semibold text-slate-800">{row.specification || 'SAE-1018'}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-right">
              {/* Target Order Length Spec */}
              <div className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-1.5 shadow-2xs text-left">
                <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                  <span>Order Length</span>
                  {lengthTypeStr && <span className="text-amber-700 font-normal">{lengthTypeStr}</span>}
                </div>
                <div className="font-mono text-xs font-extrabold text-amber-950">
                  {orderLengthStr}
                </div>
                {(l1 > 0 || l2 > 0) && (
                  <div className="text-[9.5px] font-mono text-amber-700/90">
                    L1: {l1 > 0 ? `${l1}m` : '-'} {l2 > 0 ? `| L2: ${l2}m` : ''}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-2xs text-left">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Pipe Size (OD × WT)</div>
                <div className="font-mono text-xs font-bold text-slate-800">
                  {pipeOd} mm × {pipeWt} mm
                </div>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 shadow-2xs text-left">
                <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  Available to Cut
                </div>
                <div className="font-mono text-xs font-extrabold text-indigo-950">
                  {availMotherPcs} PCS <span className="font-normal text-indigo-700">({fmt(availMotherMtr)} m)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Child Work Orders Strip if Master Campaign */}
        {hasChildOrders && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-2xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                  Master Rolling Campaign
                </span>
                <span className="text-xs font-bold text-blue-950">
                  Linked Child Work Orders ({childOrders.length})
                </span>
              </div>
              <span className="text-[10px] text-blue-700 font-medium">
                Click any child to cut or load into presets
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {childOrders.map((child, idx) => {
                const cL1 = Number(child.l1 || 0);
                const cL2 = Number(child.l2 || 0);
                const cLenStr = cL1 > 0 && cL2 > 0 ? (cL1 === cL2 ? `${cL1}m` : `${cL1}-${cL2}m`) : cL1 > 0 ? `${cL1}m` : '6.0m';
                const cPcs = child.planned_pcs || child.total_order_pcs || 0;

                return (
                  <div
                    key={child.work_order_id || child.id || idx}
                    className="flex items-center justify-between rounded-lg border border-blue-200/80 bg-white p-2.5 shadow-2xs hover:border-blue-400 hover:shadow-xs transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900">
                        <span>WO #{child.work_order_no}</span>
                      </div>
                      <div className="text-[10.5px] text-slate-600 truncate">
                        {child.customer_name || 'Standard'}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                        Target: <span className="font-mono text-amber-700 font-bold">{cLenStr}</span>
                        {cPcs > 0 && <span> • {cPcs} PCS</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => applyTargetAndRemainder(cL1 > 0 ? cL1 : 6.0)}
                      className="h-7 text-[10.5px] font-bold border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 shrink-0 gap-1 px-2"
                      title={`Cut into Child WO #${child.work_order_no} length (${cLenStr})`}
                    >
                      <Scissors size={11} className="rotate-90" />
                      Cut {cLenStr}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 1: Mother Pipe Processing & Live Balance Tracker */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Layers size={14} className="text-indigo-600" />
              1. Mother Pipes Input &amp; Live Balance Tracker
            </h4>
            <span className="text-[11px] font-medium text-slate-500">
              Feeder:{' '}
              <strong className="text-slate-700">
                {row.feeder_source_label || 'Heat Treatment Net Output'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Mother Pipes Processed (Pcs) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min="1"
                max={availMotherPcs > 0 ? availMotherPcs * 2 : 9999}
                value={motherPcsInput}
                onChange={(e) => setMotherPcsInput(e.target.value)}
                className="h-9 font-mono text-xs font-semibold focus:border-indigo-500 focus:ring-indigo-500 bg-white"
                placeholder="e.g. 10"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Mother Pipe Avg Length (Mtr) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.5"
                value={motherAvgLenInput}
                onChange={(e) => setMotherAvgLenInput(e.target.value)}
                className="h-9 font-mono text-xs font-semibold focus:border-indigo-500 focus:ring-indigo-500 bg-white"
                placeholder="e.g. 12.00"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Total Mother Input Length
              </label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 font-mono text-xs font-bold text-slate-800 shadow-2xs">
                {fmt(totalMotherMtr)} MTR
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Total Mother Input Weight
              </label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 font-mono text-xs font-bold text-slate-800 shadow-2xs">
                {fmt(totalMotherMt, 3)} MT
              </div>
            </div>
          </div>

          {/* Live Mother Pipe Balance Card */}
          <div className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Mother Pipe Live Balance Status:
                </span>
                {remainingMotherPcs > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <CheckCircle2 size={11} />
                    Partial Processing ({remainingMotherPcs} PCS Remaining in Queue)
                  </span>
                ) : remainingMotherPcs === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    <CheckCircle2 size={11} />
                    100% Mother Pipes Processed in Batch
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <AlertCircle size={11} />
                    Processing {Math.abs(remainingMotherPcs)} Pcs &gt; Available Queue
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Available: <strong className="text-slate-800">{availMotherPcs} PCS</strong> ({fmt(availMotherMtr)}m / {fmt(availMotherMt, 3)} MT)
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-md bg-slate-50 p-2 border border-slate-100">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Total Queue Available</div>
                <div className="font-mono font-bold text-slate-800 text-sm mt-0.5">
                  {availMotherPcs} PCS <span className="text-xs text-slate-500 font-normal">({fmt(availMotherMt, 3)} MT)</span>
                </div>
              </div>

              <div className="rounded-md bg-indigo-50/60 p-2 border border-indigo-100">
                <div className="text-[10px] text-indigo-700 font-semibold uppercase">Processed This Batch</div>
                <div className="font-mono font-bold text-indigo-950 text-sm mt-0.5">
                  {motherPcsNum} PCS <span className="text-xs text-indigo-700 font-normal">({fmt(totalMotherMt, 3)} MT)</span>
                </div>
              </div>

              <div className={`rounded-md p-2 border ${
                remainingMotherPcs >= 0 ? 'bg-emerald-50/60 border-emerald-100' : 'bg-rose-50 border-rose-100'
              }`}>
                <div className={`text-[10px] font-semibold uppercase ${
                  remainingMotherPcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  Remaining Mother Balance
                </div>
                <div className={`font-mono font-bold text-sm mt-0.5 ${
                  remainingMotherPcs >= 0 ? 'text-emerald-950' : 'text-rose-700'
                }`}>
                  {remainingMotherPcs} PCS <span className="text-xs font-normal">({fmt(remainingMotherMt, 3)} MT)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Multi-Length Cutting Schedule & Smart Pattern Builder */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden space-y-0">
          {/* Header & Quick Action Presets */}
          <div className="border-b border-slate-100 bg-slate-50/90 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                  <Scissors size={14} className="text-indigo-600" />
                  2. Multi-Length Cut Schedule &amp; Smart Pattern Builder
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                  <span>
                    Incoming Mother Length: <strong className="font-mono text-slate-800">{motherAvgLenNum}m</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Order Spec Length: <strong className="font-mono text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10.5px]">{orderLengthStr} {lengthTypeStr}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBatchSplitTool((prev) => !prev)}
                  className={`h-8 gap-1.5 text-xs font-semibold shadow-2xs transition-all ${
                    showBatchSplitTool
                      ? 'border-purple-300 bg-purple-100 text-purple-800'
                      : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                  }`}
                >
                  <Split size={13} />
                  Batch Split Tool
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCutItem}
                  className="h-8 gap-1.5 border-indigo-200 bg-indigo-50/50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  <Plus size={14} />
                  Add Cut Row
                </Button>
              </div>
            </div>

            {/* Quick Multiples & Nesting Presets Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={12} className="text-amber-500" />
                Quick Presets:
              </span>

              {(l1 > 0 || row.avg_length) && (
                <button
                  type="button"
                  onClick={applyOrderTargetCut}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 font-bold text-amber-900 hover:border-amber-400 hover:bg-amber-100 transition-all text-xs shadow-2xs"
                  title={`Directly cut mother pipes into order target length of ${l1 > 0 ? `${l1}m` : `${row.avg_length}m`}`}
                >
                  <Sparkles size={12} className="text-amber-600" />
                  <span>🎯 Cut to Order Spec ({l1 > 0 ? `${l1}m` : `${row.avg_length}m`})</span>
                </button>
              )}

              {/* Child Work Order Presets */}
              {hasChildOrders &&
                childOrders.map((child, idx) => {
                  const cL1 = Number(child.l1 || 0);
                  const cLenStr = cL1 > 0 ? `${cL1}m` : '6.0m';
                  return (
                    <button
                      key={child.work_order_id || child.id || idx}
                      type="button"
                      onClick={() => applyTargetAndRemainder(cL1 > 0 ? cL1 : 6.0)}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 font-bold text-blue-900 hover:border-blue-400 hover:bg-blue-100 transition-all text-xs shadow-2xs"
                      title={`Cut into Child WO #${child.work_order_no} target length (${cLenStr})`}
                    >
                      <span>🎯 Child #{child.work_order_no} ({cLenStr})</span>
                    </button>
                  );
                })}

              <button
                type="button"
                onClick={() => applyEqualMultiples(2)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-all text-xs"
                title="Cut each mother pipe into 2 equal parts"
              >
                <span>⚡ 2-Multiple (Half Cut)</span>
                <span className="text-[10px] font-mono text-slate-400">
                  (~{Number((motherAvgLenNum / 2).toFixed(2))}m)
                </span>
              </button>

              <button
                type="button"
                onClick={() => applyEqualMultiples(3)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 transition-all text-xs"
                title="Cut each mother pipe into 3 equal parts"
              >
                <span>⚡ 3-Multiple (Thirds)</span>
                <span className="text-[10px] font-mono text-slate-400">
                  (~{Number((motherAvgLenNum / 3).toFixed(2))}m)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowCustomTargetInput((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold text-xs transition-all ${
                  showCustomTargetInput
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60'
                }`}
              >
                <span>⚡ Target Cut + Remainder</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCombinationInput((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold text-xs transition-all ${
                  showCombinationInput
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/60'
                }`}
              >
                <span>⚡ 2-Length Combination (e.g. 6.00m + 5.54m)</span>
              </button>
            </div>

            {/* Inline Custom Target Cut Input */}
            {showCustomTargetInput && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 animate-fadeIn">
                <span className="text-xs font-semibold text-indigo-900">Enter Target Required Length:</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max={motherAvgLenNum}
                    value={customTargetLen}
                    onChange={(e) => setCustomTargetLen(e.target.value)}
                    className="h-8 w-28 bg-white font-mono text-xs font-bold"
                    placeholder="e.g. 5.50"
                  />
                  <span className="text-xs text-slate-600 font-medium">Mtr</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => applyTargetAndRemainder(parseFloat(customTargetLen) || 0)}
                  className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Apply to {motherPcsNum} Mother Pipes
                </Button>
                <button
                  type="button"
                  onClick={() => setShowCustomTargetInput(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Inline 2-Length Combination Input */}
            {showCombinationInput && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 animate-fadeIn">
                <span className="text-xs font-semibold text-indigo-900">Combination Cuts per Mother Pipe:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600">Cut 1:</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={combCut1}
                    onChange={(e) => setCombCut1(e.target.value)}
                    className="h-8 w-24 bg-white font-mono text-xs font-bold"
                    placeholder="6.00"
                  />
                  <span className="text-xs text-slate-500">m +</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600">Cut 2:</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={combCut2}
                    onChange={(e) => setCombCut2(e.target.value)}
                    className="h-8 w-24 bg-white font-mono text-xs font-bold"
                    placeholder="5.54"
                  />
                  <span className="text-xs text-slate-500">m</span>
                </div>
                <div className="text-xs font-mono text-indigo-900">
                  = {(parseFloat(combCut1) || 0) + (parseFloat(combCut2) || 0)}m{' '}
                  <span className="text-slate-500">
                    (Trim: {Math.max(0, Number((motherAvgLenNum - (parseFloat(combCut1) || 0) - (parseFloat(combCut2) || 0)).toFixed(2)))}m)
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    applyTwoCombinationCut(parseFloat(combCut1) || 0, parseFloat(combCut2) || 0)
                  }
                  className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Apply Combination
                </Button>
                <button
                  type="button"
                  onClick={() => setShowCombinationInput(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Batch Splitter Tool Panel */}
            {showBatchSplitTool && (
              <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50/90 via-indigo-50/70 to-slate-50 p-3.5 space-y-3 animate-fadeIn">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/70 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Split size={14} className="text-purple-700" />
                    <span className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                      Batch Splitter ({availMotherPcs} Mother Pipes @ {motherAvgLenNum}m)
                    </span>
                    <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      Order Target: {orderLengthStr}
                    </span>
                    {hasChildOrders && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={autoFillFromChildOrders}
                        className="h-6 px-2 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1 rounded shadow-2xs"
                      >
                        ⚡ Auto-Fill from Child WOs ({childOrders.length})
                      </Button>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-purple-700">
                    Total Processed: {(parseInt(batchGroupA_Pcs, 10) || 0) + (parseInt(batchGroupB_Pcs, 10) || 0)} / {availMotherPcs} Pcs
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Group A */}
                  <div className="rounded-lg border border-purple-200 bg-white p-3 space-y-2">
                    <div className="font-bold text-purple-900 text-[11px] uppercase">
                      Sub-Batch A (e.g. 5.50m 2-Multiple Cut)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold">Mother Pipes</label>
                        <Input
                          type="number"
                          min="1"
                          value={batchGroupA_Pcs}
                          onChange={(e) => setBatchGroupA_Pcs(e.target.value)}
                          className="h-8 font-mono text-xs font-bold"
                          placeholder="e.g. 50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold">Cut Length (m)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={batchGroupA_CutLen}
                          onChange={(e) => setBatchGroupA_CutLen(e.target.value)}
                          className="h-8 font-mono text-xs font-bold"
                          placeholder="5.50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold">Cuts / Pipe</label>
                        <Input
                          type="number"
                          min="1"
                          value={batchGroupA_Multiplier}
                          onChange={(e) => setBatchGroupA_Multiplier(e.target.value)}
                          className="h-8 font-mono text-xs font-bold"
                          placeholder="2"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      Output: {(parseInt(batchGroupA_Pcs, 10) || 0) * (parseInt(batchGroupA_Multiplier, 10) || 1)} pcs @ {batchGroupA_CutLen}m
                    </div>
                  </div>

                  {/* Group B */}
                  <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-2">
                    <div className="font-bold text-indigo-900 text-[11px] uppercase">
                      Sub-Batch B (e.g. 11.00m Long Cut)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold">Mother Pipes</label>
                        <Input
                          type="number"
                          min="0"
                          value={batchGroupB_Pcs}
                          onChange={(e) => setBatchGroupB_Pcs(e.target.value)}
                          className="h-8 font-mono text-xs font-bold"
                          placeholder="e.g. 50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold">Cut Length (m)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={batchGroupB_CutLen}
                          onChange={(e) => setBatchGroupB_CutLen(e.target.value)}
                          className="h-8 font-mono text-xs font-bold"
                          placeholder="11.00"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold">Cuts / Pipe</label>
                        <Input
                          type="number"
                          min="1"
                          value={batchGroupB_Multiplier}
                          onChange={(e) => setBatchGroupB_Multiplier(e.target.value)}
                          className="h-8 font-mono text-xs font-bold"
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      Output: {(parseInt(batchGroupB_Pcs, 10) || 0) * (parseInt(batchGroupB_Multiplier, 10) || 1)} pcs @ {batchGroupB_CutLen}m
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchSplitTool(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyBatchSplit}
                    className="h-7 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold gap-1"
                  >
                    <CheckCircle2 size={13} />
                    Apply Batch Split to Schedule
                  </Button>
                </div>
              </div>
            )}

            {/* Visual Single-Pipe Slicing Representation */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Layers size={13} className="text-indigo-600" />
                  <span>Single Mother Pipe Utilization Visualizer ({motherAvgLenNum}m Pipe):</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="font-bold text-slate-800">
                    Cuts per Pipe: {singlePipeUtilization.cutsTotal}m / {motherAvgLenNum}m ({singlePipeUtilization.pct}%)
                  </span>
                  <span className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
                    Trim Scrap: {singlePipeUtilization.trimScrap}m
                  </span>
                </div>
              </div>

              {/* Progress Bar of Single Pipe */}
              <div className="h-4 w-full rounded-full bg-slate-100 p-0.5 flex overflow-hidden border border-slate-200">
                {cutItems.map((c, i) => {
                  const cutPcsPerPipe = motherPcsNum > 0 ? Number(c.cut_pcs || 0) / motherPcsNum : 1;
                  const itemMtrPerPipe = Number(c.length_mtr || 0) * cutPcsPerPipe;
                  const itemPct = motherAvgLenNum > 0 ? (itemMtrPerPipe / motherAvgLenNum) * 100 : 0;
                  const isPrime = c.cut_category === 'PRIME';
                  const isSec = c.cut_category === 'SECONDARY';
                  const isOff = c.cut_category === 'OFFCUT';

                  return (
                    <div
                      key={c.id || i}
                      style={{ width: `${Math.min(100, Math.max(2, itemPct))}%` }}
                      className={`h-full transition-all flex items-center justify-center text-[9px] font-mono font-bold text-white ${
                        isPrime
                          ? 'bg-emerald-500'
                          : isSec
                          ? 'bg-indigo-500'
                          : isOff
                          ? 'bg-blue-400'
                          : 'bg-amber-400'
                      }`}
                      title={`${c.length_mtr}m (${c.cut_category}) - ${itemPct.toFixed(1)}% of pipe`}
                    >
                      {itemPct >= 15 ? `${c.length_mtr}m` : ''}
                    </div>
                  );
                })}

                {/* Remaining Trim / Kerf Segment */}
                {singlePipeUtilization.trimScrap > 0 && (
                  <div
                    style={{
                      width: `${Math.max(
                        2,
                        (singlePipeUtilization.trimScrap / (motherAvgLenNum || 1)) * 100
                      )}%`,
                    }}
                    className="h-full bg-amber-200/80 flex items-center justify-center text-[8px] font-mono font-bold text-amber-900"
                    title={`Trim / Scrap Loss: ${singlePipeUtilization.trimScrap}m`}
                  >
                    {singlePipeUtilization.trimScrap >= 1 ? `${singlePipeUtilization.trimScrap}m` : ''}
                  </div>
                )}
              </div>

              {singlePipeUtilization.isOver && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 rounded-md p-1.5 border border-rose-200">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>Warning: Total cuts per pipe ({singlePipeUtilization.cutsTotal}m) exceed available mother pipe length ({motherAvgLenNum}m).</span>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3 min-w-[130px]">Cut Length (Mtr)</th>
                  <th className="py-2.5 px-3 min-w-[110px]">Cut Nos (Pcs)</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Category</th>
                  <th className="py-2.5 px-3 text-right">Total Meters</th>
                  <th className="py-2.5 px-3 text-right">Total Weight (MT)</th>
                  <th className="py-2.5 px-3 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {cutItems.map((item, idx) => {
                  const itemMtr = Number(((item.length_mtr || 0) * (item.cut_pcs || 0)).toFixed(2));
                  const itemMt = mtFromMtr(itemMtr, pipeOd, pipeWt);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.1"
                          value={item.length_mtr || ''}
                          onChange={(e) =>
                            handleUpdateCutItem(item.id, 'length_mtr', parseFloat(e.target.value) || 0)
                          }
                          className="h-8 font-mono text-xs font-semibold"
                          placeholder="e.g. 6.00"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min="1"
                          value={item.cut_pcs || ''}
                          onChange={(e) =>
                            handleUpdateCutItem(item.id, 'cut_pcs', parseInt(e.target.value, 10) || 0)
                          }
                          className="h-8 font-mono text-xs font-semibold"
                          placeholder="e.g. 2"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={item.cut_category}
                          onChange={(e) =>
                            handleUpdateCutItem(
                              item.id,
                              'cut_category',
                              e.target.value as BandSawCutCategory
                            )
                          }
                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                        >
                          <option value="PRIME">Prime Pipe Cut (Required in Order)</option>
                          <option value="SECONDARY">Secondary / Multi Cut (Required in Order)</option>
                          <option value="OFFCUT">Usable Off-Cut (≥4m)</option>
                          <option value="SCRAP_TRIM">End Trim / Saw Scrap (&lt;4m)</option>
                          <option value="SCRAP_NOT_REQUIRED">Scrap (Not Required in Order)</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        {fmt(itemMtr)} m
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {fmt(itemMt, 3)} MT
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveCutItem(item.id)}
                          aria-label="Remove cut row"
                          title="Remove cut row"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 transition-colors shadow-2xs focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/90 px-4 py-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-500 font-medium">Order Required Cuts: </span>
                <span className="font-mono font-bold text-indigo-700 text-sm">
                  {totalPrimeCutPcs} PCS
                </span>
                <span className="font-mono text-slate-600 text-xs ml-1">
                  ({fmt(totalPrimeCutMtr)} m / {fmt(totalPrimeCutMt, 3)} MT)
                </span>
              </div>
            </div>

            {/* Yield & Efficiency Gauge */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-slate-600">Cutting Yield:</span>
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 shadow-2xs">
                <div
                  className={`h-2 w-2 rounded-full ${
                    yieldPct >= 92 ? 'bg-emerald-500' : yieldPct >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
                <span
                  className={`font-mono text-xs font-bold ${
                    yieldPct >= 92
                      ? 'text-emerald-700'
                      : yieldPct >= 80
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {yieldPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Rejections, Operator Inputs & Scrap Material Balance Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Panel: Defect Rejections & Operator Info */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-600" />
              Rejection Cuts &amp; Process Details
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Rejection Pieces (Nos)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={rejCutPcs}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRejCutPcs(val);
                    const nVal = parseInt(val, 10) || 0;
                    if (nVal > 0 && motherAvgLenNum > 0) {
                      setRejCutMtr(String(Number((nVal * motherAvgLenNum).toFixed(2))));
                    } else if (nVal === 0) {
                      setRejCutMtr('0');
                    }
                  }}
                  className="h-8 font-mono text-xs font-semibold"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Rejection Meters (Mtr)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rejCutMtr}
                  onChange={(e) => setRejCutMtr(e.target.value)}
                  className="h-8 font-mono text-xs font-semibold"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Process Date
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 text-xs font-medium"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Heat / Lot No.
                </label>
                <Input
                  type="text"
                  value={heatLotNo}
                  onChange={(e) => setHeatLotNo(e.target.value)}
                  className="h-8 text-xs font-medium"
                  placeholder="e.g. HT-9821"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Operator Remarks
              </label>
              <Input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="h-8 text-xs font-medium"
                placeholder="e.g. Clean cuts, square ends checked"
              />
            </div>

            {error && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <AlertCircle size={14} className="mt-0.5 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right Panel: Comprehensive Scrap & Material Balance Breakdown (in MT) */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-4 shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  <ArrowRight size={12} />
                  Material Recovery &amp; Scrap Balance
                </span>
                <span className="text-[11px] font-bold text-indigo-950">
                  Total Mother Input: {fmt(totalMotherMt, 3)} MT
                </span>
              </div>

              {/* Material Balance Rows */}
              <div className="space-y-1.5 text-xs">
                {/* 1. Prime / Secondary Good Cuts */}
                <div className="flex items-center justify-between rounded-md bg-emerald-50/80 px-2.5 py-1.5 border border-emerald-100 text-emerald-950">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>Prime Net Cuts (To VDI QC):</span>
                  </div>
                  <div className="font-mono font-bold">
                    {netVdiFeedPcs} PCS • {fmt(netVdiFeedMtr)}m • <span className="text-emerald-700">{fmt(netVdiFeedMt, 3)} MT</span>
                  </div>
                </div>

                {/* 2. Usable Offcuts (>=4m) */}
                {usableOffcutMtr > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-blue-50/60 px-2.5 py-1.5 border border-blue-100 text-blue-950">
                    <span className="font-medium text-blue-800">Usable Off-Cuts (≥4m):</span>
                    <span className="font-mono font-semibold text-blue-900">
                      {fmt(usableOffcutMtr)}m • {fmt(usableOffcutMt, 3)} MT
                    </span>
                  </div>
                )}

                {/* 3. Scrap Breakdown Items */}
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-2.5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-1">
                    Scrap Generation Breakdown
                  </div>
                  
                  {trimNotReqMtr > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-amber-950">
                      <span>• End Trims &amp; Cuts Not in Order:</span>
                      <span className="font-mono font-medium">{fmt(trimNotReqMtr)}m ({fmt(trimNotReqMt, 3)} MT)</span>
                    </div>
                  )}

                  {kerfLossMtr > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-amber-950">
                      <span>• Saw Blade Kerf / Drop Loss:</span>
                      <span className="font-mono font-medium">{fmt(kerfLossMtr)}m ({fmt(kerfLossMt, 3)} MT)</span>
                    </div>
                  )}

                  {nRejMtr > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-rose-800">
                      <span>• Defect Cut Rejections ({nRejPcs} pcs):</span>
                      <span className="font-mono font-medium">{fmt(nRejMtr)}m ({fmt(nRejMt, 3)} MT)</span>
                    </div>
                  )}

                  {/* Total Scrap Highlight Card */}
                  <div className="mt-2 flex items-center justify-between rounded-md bg-white border border-amber-300 p-2 shadow-2xs">
                    <span className="font-bold text-amber-950 text-xs flex items-center gap-1">
                      <TrendingUp size={13} className="text-amber-600" />
                      TOTAL SCRAP GENERATED:
                    </span>
                    <div className="text-right">
                      <span className="font-mono text-sm font-black text-amber-900">
                        {fmt(totalScrapMt, 3)} MT
                      </span>
                      <span className="text-[11px] font-mono text-amber-700 ml-1.5">
                        ({fmt(totalScrapMtr)}m • {scrapPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feed to VDI Notice */}
              <div className="text-[11px] text-slate-600 bg-white rounded-md p-2 border border-slate-200">
                <p>
                  ✓ <strong>{netVdiFeedPcs} Prime Cuts ({fmt(netVdiFeedMt, 3)} MT)</strong> feed into{' '}
                  <strong className="text-indigo-800">VDI QC Inspection</strong>. Balance scrap of{' '}
                  <strong className="text-amber-800">{fmt(totalScrapMt, 3)} MT</strong> logged to material ledger.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="outline"
            size="md"
            className="min-h-[40px] px-4 text-xs font-semibold"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="md"
            onClick={handleSubmit}
            disabled={saving || totalPrimeCutPcs <= 0}
            className="min-h-[40px] gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs font-bold text-xs px-5"
          >
            {saving ? (
              'Recording Cutting...'
            ) : (
              <>
                <Scissors size={14} className="rotate-90" />
                Save &amp; Send to VDI QC ({netVdiFeedPcs} Cut Pcs)
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default BandSawCuttingModal;
