import DepartmentTrainingManualClient from "@/components/reports/DepartmentTrainingManualClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Department Training Manual & SOP Guide | WIP Tracking",
  description: "Comprehensive step-by-step training manual and Standard Operating Procedures (SOP) with real factory examples for all plant departments.",
};

export default function TrainingReportPage() {
  return <DepartmentTrainingManualClient />;
}
