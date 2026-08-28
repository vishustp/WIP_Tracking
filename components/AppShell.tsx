'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart3, ClipboardList, Factory, FileSpreadsheet, Gauge,
  LayoutDashboard, LogOut, Menu, Settings, Shuffle, X, CalendarClock
} from 'lucide-react';

const groups = [
  {
    label: 'PPC',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/work-orders', label: 'Work Orders', icon: ClipboardList },
      { href: '/excel-import', label: 'Excel Import', icon: FileSpreadsheet },
      { href: '/rolling-plans', label: 'Rolling Planning', icon: CalendarClock },
      { href: '/diversions', label: 'Diversion Planning', icon: Shuffle },
    ],
  },
  {
    label: 'Production',
    items: [{ href: '/production', label: 'Production Entry', icon: Factory }],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports/pending-orders', label: 'Pending Orders', icon: BarChart3 },
      { href: '/reports/wip', label: 'WIP', icon: Gauge },
      { href: '/reports/production', label: 'Production', icon: Factory },
      { href: '/reports/rolling-plans', label: 'Rolling Plans', icon: CalendarClock },
      { href: '/reports/diversions', label: 'Diversions', icon: Shuffle },
    ],
  },
  {
    label: 'System',
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (pathname === '/login') return <>{children}</>;

  const signOut = async () => {
    document.cookie = 'demo_user=; path=/; max-age=0';
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 border-r bg-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="font-semibold tracking-tight">Seamless WIP</div>
          <button className="lg:hidden rounded-md p-1.5 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav className="h-[calc(100vh-3.5rem)] overflow-y-auto p-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                  return (
                    <button
                      key={item.href}
                      onClick={() => { router.push(item.href); setOpen(false); }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={signOut} className="mt-2 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </nav>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-white/95 px-4 backdrop-blur lg:px-5">
          <button className="mr-2 rounded-md p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="text-sm font-semibold">{pathname === '/dashboard' ? 'Dashboard' : pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g, ' ')}</div>
        </header>
        <main className="mx-auto w-full max-w-[1800px] p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}
