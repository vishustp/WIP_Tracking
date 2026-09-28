'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AppUserProfile, UserGroup } from '@/lib/users/types';
import { getCurrentAppUser } from '@/lib/users/client';
import { isRouteVisibleForGroup } from '@/lib/permissions';
import {
  BarChart3, ClipboardList, Factory, FileSpreadsheet,
  LayoutDashboard, LogOut, Menu, Settings, Shuffle, X, CalendarClock,
  User, ShieldCheck, ChevronDown, Activity, Clock,
  ClipboardCheck, FileText, Beaker, Layers, Scissors, History,
  Search, Calendar, Bell, Users, SlidersHorizontal, AlertTriangle, ScrollText
} from 'lucide-react';
import { toast } from 'sonner';
import AgingNotificationBell from '@/components/common/AgingNotificationBell';
import GlobalKeyboardNavigation from '@/components/common/GlobalKeyboardNavigation';

const navSections = [
  {
    label: '',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { href: '/production', label: 'Production Entry', icon: ClipboardCheck },
      { href: '/reports/wip', label: 'WIP', icon: Layers },
      { href: '/reports/production', label: 'Production History', icon: History },
      { href: '/band-saw', label: 'Band Saw Cutting', icon: Scissors },
      { href: '/qc/vdi', label: 'VDI Entries', icon: ClipboardList },
    ],
  },
  {
    label: 'PLANNING',
    items: [
      { href: '/work-orders', label: 'Work Orders', icon: FileText },
      { href: '/rolling-plans', label: 'Rolling Plan', icon: CalendarClock },
      { href: '/diversions', label: 'Diversion', icon: Shuffle },
      { href: '/excel-import', label: 'Excel Import', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { href: '/reports/wip', label: 'WIP Matrix', icon: BarChart3 },
      { href: '/reports/tracking', label: 'Work Order Tracking', icon: Activity },
      { href: '/reports/aging', label: 'Aging Report', icon: Clock },
      { href: '/reports/production', label: 'Production Report', icon: Factory },
      { href: '/reports/diversions', label: 'Rejection Report', icon: AlertTriangle },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/admin', label: 'Users', icon: Users },
      { href: '/admin/spec-master', label: 'Masters', icon: SlidersHorizontal },
      { href: '/settings', label: 'Audit Log', icon: ScrollText },
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
  const [searchQuery, setSearchQuery] = useState('');
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
    const handleGlobalError = (event: ErrorEvent) => {
      if (event.message && !event.message.includes('ResizeObserver')) {
        toast.error(event.message);
      }
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'An unexpected error occurred';
      if (msg && !msg.includes('NEXT_REDIRECT') && !msg.includes('ResizeObserver')) {
        toast.error(msg);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  if (pathname === '/login') return <>{children}</>;

  const signOut = async () => {
    try {
      await createClient().auth.signOut();
      toast.info('Signed out successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sign out');
    }
    router.replace('/login');
    router.refresh();
  };

  const userGroup = (currentUser?.group || (currentUser?.role === 'admin' ? 'admin' : currentUser?.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
  const isAdmin = userGroup === 'admin';

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isRouteVisibleForGroup(userGroup, item.href)),
    }))
    .filter((section) => section.items.length > 0);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/reports/tracking?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  // Formatted real-time date widget
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedDay = now.toLocaleDateString('en-GB', { weekday: 'long' });

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-900 font-sans flex flex-col antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        Skip to main content
      </a>
      <GlobalKeyboardNavigation />

      {/* Top Header Bar: Sleek Steel-Blue Theme */}
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between bg-[#16325C] px-4 sm:px-6 border-b border-[#204377] text-white shrink-0 shadow-xs print:hidden">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            className="lg:hidden rounded-lg p-1.5 text-blue-100 hover:bg-white/10 hover:text-white transition"
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* RASHMI GROUP Logo */}
          <div className="flex flex-col items-start leading-none shrink-0 cursor-pointer select-none" onClick={() => router.push('/dashboard')}>
            <span className="text-red-500 font-black text-xl tracking-wider leading-none">RASHMI</span>
            <span className="text-white text-[10px] font-bold tracking-widest pl-0.5 mt-0.5">GROUP</span>
          </div>

          <div className="h-8 w-[1px] bg-blue-300/30 mx-2 hidden sm:block shrink-0" />

          {/* Title & Division */}
          <div className="hidden sm:flex flex-col min-w-0">
            <span className="font-bold text-base text-white tracking-tight leading-tight truncate">
              Seamless WIP Tracking
            </span>
            <span className="text-xs text-blue-100 font-normal leading-tight truncate">
              Rashmi Green Hydrogen Steel Pvt. Ltd.
            </span>
          </div>
        </div>

        {/* Center: Global Search Input Pill */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center justify-center flex-1 max-w-md mx-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-blue-200 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Work Order / Grade / Size / Heat / Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0F2444]/70 text-white placeholder:text-blue-200/80 text-sm rounded-lg pl-9 pr-8 py-2 border border-blue-400/30 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition font-normal"
            />
            <button
              type="submit"
              className="absolute right-2.5 top-2.5 text-blue-200 hover:text-white"
              aria-label="Submit search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Right: Date Widget + Notification Bell + User Profile */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Calendar Widget */}
          <div className="hidden lg:flex items-center gap-2.5 text-right">
            <Calendar className="h-4 w-4 text-sky-300 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-bold text-white tracking-tight">{formattedDate}</span>
              <span className="text-xs text-blue-100 font-medium">{formattedDay}</span>
            </div>
          </div>

          {/* Notification Bell with Badge */}
          <div className="relative">
            <AgingNotificationBell currentUser={currentUser} />
          </div>

          {/* User Profile Pill */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-white/10 transition cursor-pointer text-left"
              aria-expanded={userDropdownOpen}
              aria-label="User account menu"
            >
              <div className="h-8 w-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs ring-2 ring-white/20">
                {currentUser?.name?.[0]?.toUpperCase() || 'F'}
              </div>
              <div className="hidden xl:flex flex-col leading-tight">
                <span className="text-xs font-bold text-white leading-tight">
                  {currentUser?.name || 'Finishing'}
                </span>
                <span className="text-xs text-blue-100 font-medium leading-tight">
                  {currentUser?.role_title || 'Production'}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-blue-200 hidden xl:block" />
            </button>

            {/* User Dropdown */}
            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 text-xs text-slate-800">
                <div className="px-2.5 py-2 border-b border-slate-100">
                  <div className="font-bold text-slate-900 text-sm">{currentUser?.name || currentUser?.email || 'Finishing Operator'}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{currentUser?.email || 'finishing@rashmigroup.com'}</div>
                  <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {currentUser?.role_title || 'Production'} ({userGroup.toUpperCase()})
                  </div>
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => { router.push('/profile'); setUserDropdownOpen(false); }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer text-xs"
                  >
                    <User className="h-4 w-4 text-blue-600" />
                    <span>User Profile & Security</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { router.push('/admin'); setUserDropdownOpen(false); }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer text-xs"
                    >
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <span>Admin Control Panel</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { router.push('/admin/spec-master'); setUserDropdownOpen(false); }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer text-xs"
                  >
                    <Beaker className="h-4 w-4 text-amber-600" />
                    <span>Material Spec Master</span>
                  </button>
                </div>

                <div className="pt-1.5 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer font-semibold text-xs"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Wrapper with Sidebar and Content */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile backdrop */}
        {open && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar: Crisp White Theme with Royal Blue Active Highlights */}
        <aside
          className={`fixed top-16 bottom-0 left-0 z-40 flex w-64 flex-col bg-white border-r border-slate-200/90 text-slate-800 transition-transform duration-200 ease-out lg:translate-x-0 print:hidden ${
            open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/70 lg:hidden">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Navigation Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-4 text-sm font-medium">
            {visibleSections.map((section, sIdx) => (
              <div key={section.label || `sec-${sIdx}`} className="space-y-1">
                {section.label && (
                  <div className="px-3 pt-2.5 pb-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
                    {section.label}
                  </div>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.href}
                        onClick={() => { router.push(item.href); setOpen(false); }}
                        aria-current={active ? 'page' : undefined}
                        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150 cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white shadow-xs font-semibold'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 transition-transform ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-800'}`} />
                        <span className="truncate font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3.5 border-t border-slate-200 bg-slate-50/80 text-xs text-slate-600 font-mono flex items-center justify-between">
            <span className="font-semibold text-slate-700">RASHMI STEEL MILL</span>
            <span className="text-emerald-600 font-bold flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </span>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 lg:pl-64 min-w-0 flex flex-col bg-[#f4f6fa]">
          <main id="main-content" className="flex-1 w-full p-4 sm:p-5 lg:p-6 print:p-0 print:m-0 print:bg-white">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}


