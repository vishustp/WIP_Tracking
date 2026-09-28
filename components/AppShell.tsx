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
  Search, Calendar, Bell, Users, SlidersHorizontal, AlertTriangle, ScrollText,
  Palette, Check, Loader2, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import AgingNotificationBell from '@/components/common/AgingNotificationBell';
import GlobalKeyboardNavigation from '@/components/common/GlobalKeyboardNavigation';

export type AppTheme = 'light' | 'cobalt' | 'navy';

export const THEMES: {
  id: AppTheme;
  name: string;
  badge: string;
  desc: string;
  headerSwatch: string;
  sidebarSwatch: string;
}[] = [
  {
    id: 'light',
    name: 'Clean Executive Light',
    badge: 'Recommended',
    desc: 'Crisp all-white topbar & sidebar for maximum daytime clarity',
    headerSwatch: 'bg-white border border-slate-300',
    sidebarSwatch: 'bg-white border border-slate-300',
  },
  {
    id: 'cobalt',
    name: 'Steel-Blue Hybrid',
    badge: 'Popular',
    desc: 'Polished steel-blue topbar with high-contrast white sidebar',
    headerSwatch: 'bg-[#16325c] border border-blue-900',
    sidebarSwatch: 'bg-white border border-slate-300',
  },
  {
    id: 'navy',
    name: 'Industrial Dark Navy',
    badge: 'Console',
    desc: 'Midnight dark navy console for night shifts & low glare',
    headerSwatch: 'bg-[#0b132b] border border-slate-800',
    sidebarSwatch: 'bg-[#0d1733] border border-slate-800',
  },
];

interface SearchResultItem {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification: string | null;
  size_od: number | null;
  size_wt: number | null;
  status: string | null;
}

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
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>('light');
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLFormElement>(null);

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

    // Load saved theme preference
    try {
      const savedTheme = localStorage.getItem('app_theme') as AppTheme;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'cobalt' || savedTheme === 'navy')) {
        setTheme(savedTheme);
      }
    } catch {
      // Ignore localStorage read errors in SSR/sandboxed mode
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setUserDropdownOpen(false);
      }
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(target)) {
        setThemeDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setSearchOpen(false);
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

  // Debounced live search autocomplete
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('work_orders')
          .select('id, work_order_no, customer_name, grade, specification, size_od, size_wt, status')
          .or(`work_order_no.ilike.%${q}%,customer_name.ilike.%${q}%,grade.ilike.%${q}%`)
          .limit(6);

        if (!error && data) {
          setSearchResults(data as SearchResultItem[]);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const handleSelectTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('app_theme', newTheme);
    } catch {
      // Ignore
    }
    setThemeDropdownOpen(false);
    toast.success(`Theme updated to ${THEMES.find(t => t.id === newTheme)?.name}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchOpen(false);
    setMobileSearchOpen(false);
    router.push(`/reports/tracking?search=${encodeURIComponent(q)}`);
  };

  const handleSelectSearchResult = (woNo: string) => {
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
    router.push(`/reports/tracking?search=${encodeURIComponent(woNo)}`);
  };

  const userGroup = (currentUser?.group || (currentUser?.role === 'admin' ? 'admin' : currentUser?.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
  const isAdmin = userGroup === 'admin';

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isRouteVisibleForGroup(userGroup, item.href)),
    }))
    .filter((section) => section.items.length > 0);

  // Formatted real-time date widget
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedDay = now.toLocaleDateString('en-GB', { weekday: 'long' });

  const currentThemeConfig = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-900 font-sans flex flex-col antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        Skip to main content
      </a>
      <GlobalKeyboardNavigation />

      {/* Top Header Bar */}
      <header
        className={`sticky top-0 z-50 flex h-16 w-full items-center justify-between px-4 sm:px-6 shrink-0 print:hidden transition-colors duration-150 ${
          theme === 'light'
            ? 'bg-white border-b border-slate-200/90 text-slate-800 shadow-2xs'
            : theme === 'cobalt'
            ? 'bg-[#16325c] border-b border-[#0f2444] text-white shadow-md'
            : 'bg-[#0b132b] border-b border-slate-800 text-white shadow-md'
        }`}
      >
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            className={`lg:hidden rounded-lg p-1.5 transition ${
              theme === 'light'
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* RASHMI GROUP Logo */}
          <div
            className="flex flex-col items-start leading-none shrink-0 cursor-pointer select-none"
            onClick={() => router.push('/dashboard')}
          >
            <span className="text-red-600 font-black text-xl tracking-wider leading-none">RASHMI</span>
            <span
              className={`text-[10px] font-bold tracking-widest pl-0.5 mt-0.5 ${
                theme === 'light' ? 'text-slate-800' : 'text-white'
              }`}
            >
              GROUP
            </span>
          </div>

          <div
            className={`h-8 w-[1px] mx-2 hidden sm:block shrink-0 ${
              theme === 'light' ? 'bg-slate-200' : theme === 'cobalt' ? 'bg-blue-800/60' : 'bg-slate-800'
            }`}
          />

          {/* Title & Division */}
          <div className="hidden sm:flex flex-col min-w-0">
            <span
              className={`font-bold text-base tracking-tight leading-tight truncate ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}
            >
              Seamless WIP Tracking
            </span>
            <span
              className={`text-xs font-normal leading-tight truncate ${
                theme === 'light' ? 'text-slate-500' : theme === 'cobalt' ? 'text-blue-200' : 'text-slate-400'
              }`}
            >
              Rashmi Green Hydrogen Steel Pvt. Ltd.
            </span>
          </div>
        </div>

        {/* Center: Global Search Input Pill (with live autocomplete dropdown) */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex items-center justify-center flex-1 max-w-md mx-6"
          ref={searchContainerRef}
        >
          <div className="relative w-full">
            <Search
              className={`absolute left-3 top-2.5 h-4 w-4 pointer-events-none ${
                theme === 'light' ? 'text-slate-400' : theme === 'cobalt' ? 'text-blue-300' : 'text-slate-400'
              }`}
            />
            <input
              type="text"
              placeholder="Search Work Order / Customer / Grade..."
              value={searchQuery}
              onFocus={() => {
                if (searchQuery.trim().length >= 2) setSearchOpen(true);
              }}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  setSearchOpen(true);
                } else {
                  setSearchOpen(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchOpen(false);
              }}
              className={`w-full text-sm rounded-lg pl-9 pr-14 py-2 border transition font-normal focus:outline-none focus:ring-2 ${
                theme === 'light'
                  ? 'bg-slate-100/90 hover:bg-slate-100 text-slate-900 placeholder:text-slate-400 border-slate-200 focus:bg-white focus:ring-blue-500 focus:border-blue-500'
                  : theme === 'cobalt'
                  ? 'bg-[#0f2444]/90 hover:bg-[#0f2444] text-white placeholder:text-blue-200/80 border-blue-900/60 focus:bg-[#0a182e] focus:ring-blue-400 focus:border-blue-400'
                  : 'bg-slate-900/90 hover:bg-slate-900 text-white placeholder:text-slate-400 border-slate-700 focus:bg-slate-950 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            <div className="absolute right-2.5 top-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  className={`p-0.5 rounded hover:bg-slate-200/40 text-xs cursor-pointer ${
                    theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-blue-200 hover:text-white'
                  }`}
                  aria-label="Clear search query"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                className={`p-0.5 rounded cursor-pointer ${
                  theme === 'light' ? 'text-slate-400 hover:text-slate-700' : 'text-blue-200 hover:text-white'
                }`}
                aria-label="Submit search"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            {/* Live Autocomplete Dropdown */}
            {searchOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 text-slate-800 text-xs">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-3 text-slate-500 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-xs">Searching work orders...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Matching Work Orders</span>
                      <span className="font-mono text-[10px] text-blue-600">{searchResults.length} found</span>
                    </div>
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(item.work_order_no)}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-blue-50/70 transition cursor-pointer text-left group"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-600 group-hover:text-blue-700 text-xs">
                              {item.work_order_no}
                            </span>
                            {item.status && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {item.status}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {item.customer_name ? `${item.customer_name} • ` : ''}
                            {item.grade ? `${item.grade} • ` : ''}
                            {item.size_od && item.size_wt ? `${item.size_od} × ${item.size_wt} mm` : ''}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                      </button>
                    ))}
                    <div className="pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between px-2 text-[11px] text-slate-500">
                      <span>Press <strong className="text-slate-700">Enter</strong> to open Tracking Report</span>
                      <button
                        type="button"
                        onClick={handleSearchSubmit}
                        className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                      >
                        View in Report &rarr;
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center text-slate-500">
                    <p className="font-medium text-xs">No work orders matching &ldquo;{searchQuery}&rdquo;</p>
                    <button
                      type="button"
                      onClick={handleSearchSubmit}
                      className="mt-1 text-xs text-blue-600 hover:underline font-semibold cursor-pointer"
                    >
                      Search tracking report anyway &rarr;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Right: Theme Selector + Calendar Widget + Bell + User Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          {/* Mobile search toggle button */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className={`md:hidden p-2 rounded-lg transition cursor-pointer ${
              theme === 'light'
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-white/80 hover:bg-white/10'
            }`}
            aria-label="Toggle search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Theme Selector Dropdown */}
          <div className="relative" ref={themeDropdownRef}>
            <button
              type="button"
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              title={`Current Theme: ${currentThemeConfig.name}`}
              aria-expanded={themeDropdownOpen}
              aria-label="Select application theme"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition cursor-pointer ${
                theme === 'light'
                  ? 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs'
                  : theme === 'cobalt'
                  ? 'border-blue-700/60 bg-[#0f2444]/90 hover:bg-[#0f2444] text-white shadow-2xs'
                  : 'border-slate-700 bg-slate-800/90 hover:bg-slate-800 text-white shadow-2xs'
              }`}
            >
              <Palette className={`h-4 w-4 shrink-0 ${theme === 'light' ? 'text-blue-600' : 'text-blue-300'}`} />
              <span className="hidden sm:inline font-medium">Theme</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  theme === 'light'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : theme === 'cobalt'
                    ? 'bg-blue-900/60 text-blue-200 border border-blue-700/50'
                    : 'bg-slate-700 text-slate-200 border border-slate-600'
                }`}
              >
                {theme}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {/* Theme Dropdown Menu */}
            {themeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 text-xs text-slate-800">
                <div className="px-2 py-1.5 border-b border-slate-100 mb-1 flex items-center justify-between">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <Palette className="h-3.5 w-3.5 text-blue-600" />
                    <span>Select Interface Theme</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">3 options</span>
                </div>

                <div className="space-y-1 py-1">
                  {THEMES.map((t) => {
                    const isSelected = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTheme(t.id)}
                        className={`flex w-full items-start gap-3 p-2 rounded-lg text-left transition cursor-pointer border ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-200 text-slate-900 ring-1 ring-blue-500/20'
                            : 'border-transparent hover:bg-slate-50 hover:border-slate-200 text-slate-700'
                        }`}
                      >
                        {/* Preview swatch representing Topbar + Sidebar */}
                        <div className="flex flex-col gap-0.5 shrink-0 mt-0.5 p-1 rounded bg-slate-100 border border-slate-200 shadow-2xs">
                          <div className={`h-2.5 w-7 rounded-xs ${t.headerSwatch}`} />
                          <div className={`h-4 w-7 rounded-xs ${t.sidebarSwatch}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs text-slate-900 truncate">{t.name}</span>
                            {t.badge && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                {t.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                            {t.desc}
                          </p>
                        </div>

                        {isSelected && (
                          <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Calendar Widget */}
          <div className="hidden lg:flex items-center gap-2.5 text-right">
            <Calendar
              className={`h-4 w-4 shrink-0 ${
                theme === 'light' ? 'text-blue-600' : theme === 'cobalt' ? 'text-blue-300' : 'text-cyan-400'
              }`}
            />
            <div className="flex flex-col leading-tight">
              <span
                className={`text-xs font-bold tracking-tight ${
                  theme === 'light' ? 'text-slate-800' : 'text-white'
                }`}
              >
                {formattedDate}
              </span>
              <span
                className={`text-xs font-medium ${
                  theme === 'light' ? 'text-slate-500' : theme === 'cobalt' ? 'text-blue-200' : 'text-slate-400'
                }`}
              >
                {formattedDay}
              </span>
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
              className={`flex items-center gap-2.5 rounded-lg p-1.5 transition cursor-pointer text-left ${
                theme === 'light'
                  ? 'hover:bg-slate-100 text-slate-900'
                  : theme === 'cobalt'
                  ? 'hover:bg-white/10 text-white'
                  : 'hover:bg-slate-800 text-white'
              }`}
              aria-expanded={userDropdownOpen}
              aria-label="User account menu"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs ring-2 ring-blue-100">
                {currentUser?.name?.[0]?.toUpperCase() || 'F'}
              </div>
              <div className="hidden xl:flex flex-col leading-tight">
                <span
                  className={`text-xs font-bold leading-tight ${
                    theme === 'light' ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {currentUser?.name || 'Finishing'}
                </span>
                <span
                  className={`text-xs font-medium leading-tight ${
                    theme === 'light' ? 'text-slate-500' : theme === 'cobalt' ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {currentUser?.role_title || 'Production'}
                </span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 hidden xl:block ${
                  theme === 'light' ? 'text-slate-400' : theme === 'cobalt' ? 'text-blue-200' : 'text-slate-400'
                }`}
              />
            </button>

            {/* User Dropdown */}
            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 text-xs text-slate-800">
                <div className="px-2.5 py-2 border-b border-slate-100">
                  <div className="font-bold text-slate-900 text-sm">
                    {currentUser?.name || currentUser?.email || 'Finishing Operator'}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {currentUser?.email || 'finishing@rashmigroup.com'}
                  </div>
                  <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {currentUser?.role_title || 'Production'} ({userGroup.toUpperCase()})
                  </div>
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      router.push('/profile');
                      setUserDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer text-xs"
                  >
                    <User className="h-4 w-4 text-blue-600" />
                    <span>User Profile & Security</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        router.push('/admin');
                        setUserDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer text-xs"
                    >
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <span>Admin Control Panel</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      router.push('/admin/spec-master');
                      setUserDropdownOpen(false);
                    }}
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

      {/* Mobile Search Bar Expansion */}
      {mobileSearchOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2.5 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Work Order / Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 text-slate-900 text-sm rounded-lg pl-9 pr-9 py-2 border border-slate-200 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="absolute right-2.5 top-2.5 text-blue-600 hover:text-blue-800"
              aria-label="Submit search"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

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

        {/* Sidebar: Dynamic styling based on selected theme */}
        <aside
          className={`fixed top-16 bottom-0 left-0 z-40 flex w-64 flex-col transition-transform duration-200 ease-out lg:translate-x-0 print:hidden ${
            theme === 'navy'
              ? 'bg-[#0d1733] border-r border-slate-800 text-slate-200'
              : 'bg-white border-r border-slate-200/90 text-slate-800'
          } ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
        >
          <div
            className={`flex items-center justify-between px-4 py-3 border-b lg:hidden ${
              theme === 'navy' ? 'border-slate-800 bg-[#0a1228]' : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                theme === 'navy' ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              Navigation Menu
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`rounded p-1 ${
                theme === 'navy'
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-4 text-sm font-medium">
            {visibleSections.map((section, sIdx) => (
              <div key={section.label || `sec-${sIdx}`} className="space-y-1">
                {section.label && (
                  <div
                    className={`px-3 pt-2.5 pb-1 text-xs font-bold tracking-wider uppercase ${
                      theme === 'navy' ? 'text-slate-400' : 'text-slate-400'
                    }`}
                  >
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
                        onClick={() => {
                          router.push(item.href);
                          setOpen(false);
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150 cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white shadow-xs font-semibold'
                            : theme === 'navy'
                            ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform ${
                            active
                              ? 'text-white'
                              : theme === 'navy'
                              ? 'text-slate-400 group-hover:text-cyan-400'
                              : 'text-slate-500 group-hover:text-slate-800'
                          }`}
                        />
                        <span className="truncate font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div
            className={`p-3.5 border-t text-xs font-mono flex items-center justify-between ${
              theme === 'navy'
                ? 'border-slate-800 bg-[#091024] text-slate-400'
                : 'border-slate-200 bg-slate-50/80 text-slate-600'
            }`}
          >
            <span className={`font-semibold ${theme === 'navy' ? 'text-slate-300' : 'text-slate-700'}`}>
              RASHMI STEEL MILL
            </span>
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
