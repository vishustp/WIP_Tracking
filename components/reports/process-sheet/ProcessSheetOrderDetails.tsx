// components/reports/process-sheet/ProcessSheetOrderDetails.tsx
'use client';

import React from 'react';
import { FileText, Building2, Package, Layers } from 'lucide-react';
import { FormSectionCard, FormInput } from './FormCommon';
import type { ProcessSheetFormData, ProcessSheetFormActions } from './types';

export default function ProcessSheetOrderDetails({
  data,
  actions,
}: {
  data: ProcessSheetFormData;
  actions: ProcessSheetFormActions;
}) {
  return (
    <div className="space-y-5">
      {/* 1. Header & Document Details */}
      <FormSectionCard title="1. Document & Work Order Header" icon={FileText} headerBg="bg-blue-800">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <FormInput
            label="Sheet No."
            value={data.sheetNo}
            onChange={(val) => actions.updateField('sheetNo', val)}
            placeholder="e.g. 26DWO-101"
            highlight
          />
          <FormInput
            label="Revision"
            value={data.revNo}
            onChange={(val) => actions.updateField('revNo', val)}
            placeholder="REV 01"
          />
          <FormInput
            label="Order Type"
            value={data.orderType}
            onChange={(val) => actions.updateField('orderType', val)}
            placeholder="HFS / CDS"
          />
          <FormInput
            label="Route Type"
            value={data.routeType}
            onChange={(val) => actions.updateField('routeType', val)}
            placeholder="HFS / CDS"
          />
          <FormInput
            label="Issue Date"
            value={data.sheetDate}
            onChange={(val) => actions.updateField('sheetDate', val)}
            placeholder="DD-MM-YYYY"
          />
          <FormInput
            label="Inspection"
            value={data.inspection}
            onChange={(val) => actions.updateField('inspection', val)}
            placeholder="IBR / NON-IBR"
            highlight
          />
        </div>
      </FormSectionCard>

      {/* 2. Customer & Commercial Information */}
      <FormSectionCard title="2. Customer & Purchase Order" icon={Building2} headerBg="bg-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <FormInput
              label="Customer Name"
              value={data.customer}
              onChange={(val) => actions.updateField('customer', val)}
              placeholder="Customer Name"
              highlight
            />
          </div>
          <div className="lg:col-span-2">
            <FormInput
              label="Destination / Delivery Location"
              value={data.destination}
              onChange={(val) => actions.updateField('destination', val)}
              placeholder="e.g. Mumbai Refinery, Gujarat Site"
            />
          </div>
          <FormInput
            label="PO Number"
            value={data.poNo}
            onChange={(val) => actions.updateField('poNo', val)}
            placeholder="Purchase Order No."
          />
          <FormInput
            label="PO Date"
            value={data.poDate}
            onChange={(val) => actions.updateField('poDate', val)}
            placeholder="DD-MM-YYYY"
          />
          <FormInput
            label="Work Order No."
            value={data.woNo}
            onChange={(val) => actions.updateField('woNo', val)}
            placeholder="WO Number"
            highlight
          />
          <FormInput
            label="WO Date"
            value={data.woDate}
            onChange={(val) => actions.updateField('woDate', val)}
            placeholder="DD-MM-YYYY"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100">
          <FormInput
            label="Material Code"
            value={data.materialCode}
            onChange={(val) => actions.updateField('materialCode', val)}
            placeholder="Item / Material Code"
          />
          <FormInput
            label="Steel Grade"
            value={data.steelGrade}
            onChange={(val) => actions.updateField('steelGrade', val)}
            placeholder="Grade"
            highlight
          />
          <FormInput
            label="Specification"
            value={data.materialSpec}
            onChange={(val) => actions.updateField('materialSpec', val)}
            placeholder="e.g. ASTM A106 Gr B"
            highlight
          />
          <FormInput
            label="Heat Number"
            value={data.heatNo}
            onChange={(val) => actions.updateField('heatNo', val)}
            placeholder="Heat No."
          />
        </div>
      </FormSectionCard>

      {/* 3. Planning & Delivery Quantities */}
      <FormSectionCard title="3. Planning & Order Balance Quantities" icon={Package} headerBg="bg-indigo-900">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <FormInput
            label="Ordered Qty"
            value={data.orderQty}
            onChange={(val) => actions.updateField('orderQty', val)}
            placeholder="e.g. 500 MTR"
          />
          <FormInput
            label="Target Delivery"
            value={data.deliveryDate}
            onChange={(val) => actions.updateField('deliveryDate', val)}
            placeholder="DD-MM-YYYY"
          />
          <FormInput
            label="Multiple (Cuts)"
            value={data.multiple}
            onChange={(val) => actions.updateField('multiple', val)}
            unit="X"
            placeholder="1"
          />
          <FormInput
            label="Planned Meters"
            value={data.planQtyMtrs}
            onChange={(val) => actions.updateField('planQtyMtrs', val)}
            unit="MTR"
            highlight
          />
          <FormInput
            label="Planned Pieces"
            value={data.planQtyNos}
            onChange={(val) => actions.updateField('planQtyNos', val)}
            unit="PCS"
            highlight
          />
        </div>
      </FormSectionCard>
    </div>
  );
}
