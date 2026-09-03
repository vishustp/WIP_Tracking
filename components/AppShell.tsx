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
  User, ShieldCheck, ChevronDown, Check, Sparkles, Lock
} from 'lucide-react';
import { toast } from 'sonner';

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
    label: 'System & Admin',
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

  const loadUserData = async () => {
    try {
      setCurrentUser(await getCurrentAppUser());
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
  }, [pathname]);

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

  const pageTitle =
    pathname === '/dashboard'
      ? 'Dashboard'
      : pathname === '/profile'
      ? 'User Profile'
      : pathname === '/admin'
      ? 'Admin Control Panel'
      : pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g, ' ');

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:translate-x-0 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-blue-600/30">
              SW
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold tracking-tight text-[15px]">Seamless WIP</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Planning Suite</span>
            </div>
          </div>
          <button className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                  return (
                    <button
                      key={item.href}
                      onClick={() => { router.push(item.href); setOpen(false); }}
                      className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-600" aria-hidden="true" />}
                      <Icon size={18} className={active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'} />
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
          <div className="shrink-0 border-t border-slate-200 p-3">
            <div
              onClick={() => { router.push('/profile'); setOpen(false); }}
              className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-100 transition cursor-pointer group"
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold ${currentUser.avatar_color || 'bg-blue-600 text-white'}`}>
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 truncate group-hover:text-blue-600">{currentUser.name}</div>
                <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                  <span>{currentUser.role_title}</span>
                  {isAdmin && <span className="text-[9px] font-bold text-blue-600">[Admin]</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
            <div className="text-[15px] font-semibold capitalize tracking-tight text-slate-900">{pageTitle}</div>
          </div>

          {/* Header Right User Widget */}
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${currentUser.avatar_color || 'bg-blue-600 text-white'}`}>
                    {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline-block font-semibold text-slate-800">{currentUser.name.split(' ')[0]}</span>
                  <span className="hidden md:inline-block text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 font-mono">
                    {currentUser.role_title.split(' ')[0]}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 text-xs">
                    <div className="px-2.5 py-2 border-b border-slate-100">
                      <div className="font-bold text-slate-900">{currentUser.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{currentUser.email}</div>
                      <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {currentUser.role_title} ({userGroup.toUpperCase()})
                      </div>
                    </div>

                    <div className="py-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => { router.push('/profile'); setUserDropdownOpen(false); }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        <User className="h-4 w-4 text-blue-600" />
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
            )}
          </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

