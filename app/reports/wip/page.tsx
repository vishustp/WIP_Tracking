import SizeGradeWipReportClient from '@/components/reports/SizeGradeWipReportClient';

export const metadata = {
  title: 'OD & WT Grade-Wise Station-Wise WIP Status | Seamless WIP Planning Suite',
  description: 'Plant-wide physical inventory matrix cross-tabulated across manufacturing work centers by pipe size and specification.',
};

export default function WipPage() {
  return <SizeGradeWipReportClient />;
}
