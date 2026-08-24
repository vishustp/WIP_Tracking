'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart3, ClipboardList, Factory, FileSpreadsheet, Gauge,
  LayoutDashboard, LogOut, Menu, PackageCheck, Settings,
  Shuffle, X, CalendarClock
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
    items: [
      { href: '/production/rolling', label: 'Rolling', icon: Factory },
      { href: '/production/hollow-ht', label: 'Hollow Heat Treatment', icon: Factory },
      { href: '/production/draw', label: 'Draw', icon: Factory },
      { href: '/production/heat-treatment', label: 'Heat Treatment', icon: Factory },
      { href: '/production/finishing', label: 'Finishing', icon: PackageCheck },
    ],
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
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (pathname === '/login') return <>{children}</>;

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r bg-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b px-5">
          <div>
            <div className="font-bold text-slate-900">Seamless WIP</div>
            <div className="text-xs text-slate-500">PPC & Production Control</div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20}/></button>
        </div>
        <nav className="h-[calc(100vh-4rem)] overflow-y-auto p-3">
          {groups.map(group => (
            <div key={group.label} className="mb-5">
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</div>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                  return (
                    <button
                      key={item.href}
                      onClick={() => { router.push(item.href); setOpen(false); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                    >
                      <Icon size={18} /> <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={signOut} className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50">
            <LogOut size={18}/> Sign out
          </button>
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-white/95 px-4 backdrop-blur lg:px-6">
          <button className="mr-3 rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22}/></button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800">Seamless Steel Pipe WIP & Production Planning</div>
            <div className="text-xs text-slate-500">Route-aware manufacturing control</div>
          </div>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
