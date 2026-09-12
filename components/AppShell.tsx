'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AppUserProfile, UserGroup } from '@/lib/users/types';
import { getCurrentAppUser } from '@/lib/users/client';
import { isRouteVisibleForGroup } from '@/lib/permissions';
import {
  BarChart3, ClipboardList, Factory, FileSpreadsheet, Gauge,
  LayoutDashboard, LogOut, Menu, Settings, Shuffle, X, CalendarClock,
  User, ShieldCheck, ChevronDown, Check, Sparkles, Lock, Activity, Clock,
  ClipboardCheck, BookOpen, FileText, Beaker, Search, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import AgingNotificationBell from '@/components/common/AgingNotificationBell';
import GlobalKeyboardNavigation from '@/components/common/GlobalKeyboardNavigation';

const groups = [
  {
    label: 'NAVIGATOR',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/work-orders', label: 'Work Orders', icon: ClipboardList },
      { href: '/excel-import', label: 'Excel Import', icon: FileSpreadsheet },
      { href: '/rolling-plans', label: 'Rolling Planning', icon: CalendarClock },
      { href: '/diversions', label: 'Diversion Planning', icon: Shuffle },
    ],
  },
  {
    label: 'QUALITY',
    items: [
      { href: '/qc/vdi', label: 'VDI Entries', icon: ClipboardCheck },
    ],
  },
  {
    label: 'PRODUCTION',
    items: [{ href: '/production', label: 'Production Entry', icon: Factory }],
  },
  {
    label: 'REPORTS',
    items: [
      { href: '/reports/production', label: 'Production Report', icon: Factory },
      { href: '/reports/wip', label: 'WIP Report', icon: Layers },
      { href: '/reports/aging', label: 'WIP Aging', icon: Clock },
      { href: '/reports/tracking', label: 'WO Tracking', icon: Activity },
      { href: '/reports/process-sheet', label: 'Process Sheets', icon: FileText },
      { href: '/reports/rolling-plans', label: 'Rolling Plans Report', icon: CalendarClock },
      { href: '/reports/diversions', label: 'Diversion Report', icon: Shuffle },
      { href: '/reports/pending-orders', label: 'Pending Orders', icon: ClipboardList },
    ],
  },
  {
    label: 'SYSTEM & ADMIN',
    items: [
      { href: '/profile', label: 'User Profile', icon: User },
      { href: '/admin', label: 'Admin Control Panel', icon: ShieldCheck },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const rawPathname = usePathname();
  const pathname = rawPathname || '';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadUserData = async (force = false) => {
    try {
      const u = await getCurrentAppUser(force);
      setCurrentUser(u);
    } catch {
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    void loadUserData();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (pathname === '/login') return <>{children}</>;

  const signOut = async () => {
    try {
      await createClient().auth.signOut();
    } catch {}
    toast.info('Signed out successfully');
    router.replace('/login');
    router.refresh();
  };

  const userGroup = (currentUser?.group || (currentUser?.role === 'admin' ? 'admin' : currentUser?.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
  const isAdmin = userGroup === 'admin';

  // Filter groups according to current user group visibility rules
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRouteVisibleForGroup(userGroup, item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <GlobalKeyboardNavigation />
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:translate-x-0 print:hidden ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        {/* Brand Block */}
        <div className="flex h-14 shrink-0 items-center justify-between bg-[#004f84] px-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-white text-[#004f84] flex items-center justify-center font-extrabold text-xs shadow-xs">
              SW
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold tracking-tight text-sm text-white">Seamless WIP</span>
              <span className="text-[8px] font-semibold tracking-wider text-sky-200 uppercase">Supply Chain Execution</span>
            </div>
          </div>
          <button className="lg:hidden rounded-lg p-1.5 text-sky-200 hover:bg-sky-800" onClick={() => setOpen(false)} aria-label="Close menu"><X size={16} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                  return (
                    <button
                      key={item.href}
                      onClick={() => { router.push(item.href); setOpen(false); }}
                      className={`group relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-sky-50 text-sky-700 border-l-4 border-sky-600 rounded-l-none'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer User Card */}
        {currentUser && (
          <div className="shrink-0 border-t border-slate-200 p-2.5">
            <div
              onClick={() => { router.push('/profile'); setOpen(false); }}
              className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-slate-100 transition cursor-pointer group"
            >
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${currentUser.avatar_color || 'bg-[#004f84] text-white'}`}>
                {String(currentUser.name || currentUser.email || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate group-hover:text-sky-600">{currentUser.name || currentUser.email || 'User'}</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {currentUser.role_title || 'Operator'}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="lg:pl-60 print:pl-0">
        {/* Top Header Bar matching Design Variation 5 */}
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white px-4 sm:px-6 print:hidden">
          <div className="flex flex-1 items-center justify-between gap-4">
            {/* Left Mobile Menu Toggle & Global Search */}
            <div className="flex items-center gap-3 flex-1 max-w-lg">
              <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                <Menu size={20} />
              </button>
              <div className="relative w-full">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search orders, customers, items..."
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* Header Right */}
            <div className="flex items-center gap-3">
              {/* Design Tab Pill */}
              <div className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-sky-500/90 hover:bg-sky-500 px-3 py-1 text-xs font-semibold text-white shadow-2xs transition">
                <Layers size={13} className="text-white" />
                <span>Design: Variation 5</span>
                <button type="button" className="ml-1 text-white/80 hover:text-white cursor-pointer">
                  <X size={12} />
                </button>
              </div>

              <div className="text-slate-500 hover:text-slate-800 transition cursor-pointer p-1">
                <AgingNotificationBell currentUser={currentUser} />
              </div>

              <button type="button" className="p-1 text-slate-500 hover:text-slate-800 transition cursor-pointer" title="Layers" aria-label="Layers">
                <Layers size={17} />
              </button>

              {/* User Avatar Circle 'V' */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="h-8 w-8 rounded-full bg-[#004f84] text-white flex items-center justify-center text-xs font-extrabold shadow-xs hover:opacity-90 transition cursor-pointer"
                >
                  {currentUser?.name?.[0]?.toUpperCase() || 'V'}
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 text-xs">
                    <div className="px-2.5 py-2 border-b border-slate-100">
                      <div className="font-bold text-slate-900">{currentUser?.name || currentUser?.email || 'User'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{currentUser?.email}</div>
                      <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-100">
                        {currentUser?.role_title || 'Operator'} ({userGroup.toUpperCase()})
                      </div>
                    </div>

                    <div className="py-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => { router.push('/profile'); setUserDropdownOpen(false); }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        <User className="h-4 w-4 text-sky-600" />
                        <span>User Profile & Security</span>
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => { router.push('/admin'); setUserDropdownOpen(false); }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        >
                          <ShieldCheck className="h-4 w-4 text-slate-700" />
                          <span>Admin Control Panel</span>
                        </button>
                      )}
                    </div>

                    <div className="pt-1.5 mt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={signOut}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer font-medium"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 print:p-0 print:m-0 print:max-w-none">{children}</main>
      </div>
    </div>
  );
}
