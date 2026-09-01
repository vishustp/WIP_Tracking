import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="rounded-lg border border-slate-300 bg-white p-6 shadow-sm max-w-md">
        <h2 className="text-xl font-bold text-slate-900 mb-2">404 - Page Not Found</h2>
        <p className="text-sm text-slate-600 mb-4">
          The requested page or resource could not be found.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded bg-[#0078d4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#106ebe]"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
