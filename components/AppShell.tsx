'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AppUserProfile, UserGroup } from '@/lib/users/types';
import { isRouteVisible, isRouteVisibleForGroup } from '@/lib/permissions';
import { useUserSession } from '@/contexts/UserSessionContext';
import {
  BarChart3, ClipboardList, Factory, FileSpreadsheet,
  LayoutDashboard, LogOut, Menu, Settings, Shuffle, X, CalendarClock,
  User, ShieldCheck, ChevronDown, Activity, Clock,
  ClipboardCheck, FileText, Beaker, Layers, Scissors, History,
  Search, Calendar, Bell, Users, SlidersHorizontal, AlertTriangle, ScrollText,
  Palette, Check, Loader2, ChevronRight, Lock, ArrowUpDown, Recycle, AlertOctagon,
  CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import AgingNotificationBell from '@/components/common/AgingNotificationBell';
import GlobalKeyboardNavigation from '@/components/common/GlobalKeyboardNavigation';

export type AppTheme =
  | 'light'
  | 'cobalt'
  | 'sandstone'
  | 'mint-sage'
  | 'nordic-slate'
  | 'royal-executive'
  | 'foundry-dark'
  | 'ocean'
  | 'titanium'
  | 'high-contrast';

const THEMES: {
  id: AppTheme;
  name: string;
  badge: string;
  desc: string;
  category: 'Light' | 'Dark';
  headerSwatch: string;
  sidebarSwatch: string;
}[] = [
  // --- LIGHT THEMES ---
  {
    id: 'light',
    name: 'Clean Executive Light',
    badge: 'Standard',
    desc: 'Crisp all-white topbar & sidebar for daytime clarity',
    category: 'Light',
    headerSwatch: 'bg-white border border-slate-300',
    sidebarSwatch: 'bg-white border border-slate-300',
  },
  {
    id: 'cobalt',
    name: 'Steel-Blue Hybrid',
    badge: 'Classic Mill',
    desc: 'Polished steel-blue topbar with high-contrast white sidebar',
    category: 'Light',
    headerSwatch: 'bg-[#16325c] border border-blue-900',
    sidebarSwatch: 'bg-white border border-slate-300',
  },
  {
    id: 'sandstone',
    name: 'Warm Sandstone / Ivory',
    badge: 'Warm Light',
    desc: 'Soft ivory topbar with warm linen canvas; reduces eye strain',
    category: 'Light',
    headerSwatch: 'bg-[#faf8f5] border border-[#d6cfc5]',
    sidebarSwatch: 'bg-[#fcfbfa] border border-[#e7e2db]',
  },
  {
    id: 'mint-sage',
    name: 'Rashmi Green Steel',
    badge: 'Eco Mill',
    desc: 'Deep forest emerald topbar with crisp white sidebar & fresh mint canvas',
    category: 'Light',
    headerSwatch: 'bg-[#0f3e2e] border border-[#064e3b]',
    sidebarSwatch: 'bg-white border border-[#cbdad0]',
  },
  {
    id: 'nordic-slate',
    name: 'Industrial Silver / Nordic',
    badge: 'Cool Light',
    desc: 'Anodized silver topbar with cool mist sidebar & technical indigo accents',
    category: 'Light',
    headerSwatch: 'bg-[#e2e8f0] border border-[#cbd5e1]',
    sidebarSwatch: 'bg-[#f8fafc] border border-[#cbd5e1]',
  },
  {
    id: 'royal-executive',
    name: 'Royal Sapphire',
    badge: 'Prestige',
    desc: 'Imperial sapphire blue topbar with crisp white sidebar for executive reports',
    category: 'Light',
    headerSwatch: 'bg-[#1e3a8a] border border-[#172554]',
    sidebarSwatch: 'bg-white border border-slate-300',
  },
  // --- DARK THEMES ---
  {
    id: 'foundry-dark',
    name: 'Foundry Night (Dark)',
    badge: 'Popular',
    desc: 'Deep charcoal #0f172a with glowing cyan accents for night shifts',
    category: 'Dark',
    headerSwatch: 'bg-[#0f172a] border border-slate-700',
    sidebarSwatch: 'bg-[#1e293b] border border-slate-700',
  },
  {
    id: 'ocean',
    name: 'Deep Ocean / Steel Navy',
    badge: 'Console',
    desc: 'Midnight ocean #0a192f with cobalt & icy cyan indicators',
    category: 'Dark',
    headerSwatch: 'bg-[#0a192f] border border-blue-900',
    sidebarSwatch: 'bg-[#0d1b2a] border border-blue-900',
  },
  {
    id: 'titanium',
    name: 'Titanium / Obsidian',
    badge: 'Modern',
    desc: 'Ultra-modern matte zinc #18181b with emerald accents',
    category: 'Dark',
    headerSwatch: 'bg-[#18181b] border border-zinc-700',
    sidebarSwatch: 'bg-[#202024] border border-zinc-700',
  },
  {
    id: 'high-contrast',
    name: 'High-Contrast Operator',
    badge: 'Shop Floor',
    desc: 'Jet black with vivid safety yellow & white high-visibility borders',
    category: 'Dark',
    headerSwatch: 'bg-black border border-white/60',
    sidebarSwatch: 'bg-[#0a0a0a] border border-white/60',
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
      { href: '/band-saw', label: 'Band Saw Cutting', icon: Scissors },
      { href: '/qc/vdi', label: 'VDI Entries', icon: ClipboardList },
      { href: '/rejections', label: 'Second Declaration', icon: AlertOctagon },
    ],
  },
  {
    label: 'PLANNING',
    items: [
      { href: '/work-orders', label: 'Work Orders', icon: FileText },
      { href: '/order-priority', label: 'Order Priority Sheet', icon: ArrowUpDown },
      { href: '/daily-plans', label: 'Unified Daily Planning', icon: CalendarDays },
      { href: '/rolling-plans', label: 'Rolling Plan', icon: CalendarClock },
      { href: '/diversions', label: 'Diversion', icon: Shuffle },
      { href: '/hollow-bank', label: 'Hollow Bank', icon: Layers },
      { href: '/excel-import', label: 'Excel Import', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { href: '/reports/daily-plan', label: 'Daily Planning Report', icon: CalendarDays },
      { href: '/reports/process-sheet', label: 'Process Sheets', icon: ScrollText },
      { href: '/reports/pending-orders', label: 'Pending Orders', icon: ClipboardList },
      { href: '/reports/rolling-plans', label: 'Rolling Plan Schedule', icon: CalendarClock },
      { href: '/reports/wip', label: 'WIP Matrix', icon: Layers },
      { href: '/reports/tracking', label: 'Work Order Tracking', icon: Activity },
      { href: '/reports/production', label: 'Production Report', icon: Factory },
      { href: '/reports/aging', label: 'Aging Report', icon: Clock },
      { href: '/reports/diversions', label: 'Material Diversion Report', icon: Shuffle },
      { href: '/reports/rejections', label: 'Second Declaration Report', icon: AlertOctagon },
      { href: '/reports/mill-rejections', label: 'Mill Rejection & Salvage', icon: AlertTriangle },
      { href: '/reports/scrap', label: 'Scrap Generation Report', icon: Recycle },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/admin', label: 'Users', icon: Users },
      { href: '/admin/spec-master', label: 'Masters', icon: SlidersHorizontal },
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
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      try {
        let saved = localStorage.getItem('app_theme') as string;
        if (saved === 'navy') saved = 'ocean';
        if (saved && THEMES.some(t => t.id === saved)) {
          return saved as AppTheme;
        }
      } catch {
        // Ignore
      }
    }
    return 'light';
  });
  const { profile: currentUser, signOut } = useUserSession();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {

    // Load saved theme preference
    try {
      let savedTheme = localStorage.getItem('app_theme') as string;
      if (savedTheme === 'navy') savedTheme = 'ocean';
      if (savedTheme && THEMES.some(t => t.id === savedTheme)) {
        setTheme(savedTheme as AppTheme);
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

    const isBenignError = (msg?: string, filename?: string) => {
      if (!msg) return true;
      if (
        msg.includes('ResizeObserver') ||
        msg.includes('NEXT_REDIRECT') ||
        msg.includes('parentNode') ||
        msg.includes('Loading chunk') ||
        msg.includes('Script error.')
      ) {
        return true;
      }
      if (
        filename &&
        (filename.startsWith('moz-extension:') ||
          filename.startsWith('chrome-extension:') ||
          filename.startsWith('safari-extension:'))
      ) {
        return true;
      }
      return false;
    };

    const handleGlobalError = (event: ErrorEvent) => {
      if (!isBenignError(event.message, event.filename)) {
        toast.error(event.message);
      }
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
      if (!isBenignError(msg)) {
        toast.error(msg || 'An unexpected error occurred');
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

  // Synchronize documentElement with theme and dark class for tailwind darkMode & native tokens
  useEffect(() => {
    const isDarkTheme = theme === 'foundry-dark' || theme === 'ocean' || theme === 'titanium' || theme === 'high-contrast';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', isDarkTheme);
  }, [theme]);

  if (pathname === '/login') return <>{children}</>;

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
      items: section.items.filter((item) => isRouteVisible(currentUser, item.href)),
    }))
    .filter((section) => section.items.length > 0);

  // Formatted real-time date widget
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedDay = now.toLocaleDateString('en-GB', { weekday: 'long' });

  const currentThemeConfig = THEMES.find((t) => t.id === theme) || THEMES[0];
  const isDark = theme === 'foundry-dark' || theme === 'ocean' || theme === 'titanium' || theme === 'high-contrast';
  const isLight = !isDark;
  const hasDarkHeader = isDark || theme === 'cobalt' || theme === 'mint-sage' || theme === 'royal-executive';

  const getHeaderClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'bg-[#0f172a] border-b border-slate-800 text-slate-100 shadow-md';
      case 'ocean':
        return 'bg-[#0a192f] border-b border-[#142845] text-white shadow-md';
      case 'titanium':
        return 'bg-[#18181b] border-b border-zinc-800 text-zinc-100 shadow-md';
      case 'high-contrast':
        return 'bg-black border-b border-neutral-700 text-white shadow-md';
      case 'cobalt':
        return 'bg-[#16325c] border-b border-[#0f2444] text-white shadow-md';
      case 'sandstone':
        return 'bg-[#faf8f5] border-b border-[#e7e2db] text-stone-800 shadow-2xs';
      case 'mint-sage':
        return 'bg-[#0f3e2e] border-b border-[#064e3b] text-white shadow-md';
      case 'nordic-slate':
        return 'bg-[#e2e8f0] border-b border-[#cbd5e1] text-slate-800 shadow-2xs';
      case 'royal-executive':
        return 'bg-[#1e3a8a] border-b border-[#172554] text-white shadow-md';
      case 'light':
      default:
        return 'bg-white border-b border-slate-200/90 text-slate-800 shadow-2xs';
    }
  };

  const getSearchInputClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'bg-slate-800/90 hover:bg-slate-800 text-white placeholder:text-slate-400 border-slate-700 focus:bg-slate-900 focus:ring-sky-400 focus:border-sky-400';
      case 'ocean':
        return 'bg-[#0e213d]/90 hover:bg-[#0e213d] text-white placeholder:text-blue-200/70 border-[#1c3a64] focus:bg-[#081527] focus:ring-cyan-400 focus:border-cyan-400';
      case 'titanium':
        return 'bg-zinc-800/90 hover:bg-zinc-800 text-white placeholder:text-zinc-400 border-zinc-700 focus:bg-zinc-900 focus:ring-emerald-400 focus:border-emerald-400';
      case 'high-contrast':
        return 'bg-neutral-900 text-white placeholder:text-neutral-400 border-neutral-600 focus:bg-black focus:ring-amber-400 focus:border-amber-400';
      case 'cobalt':
        return 'bg-[#0f2444]/90 hover:bg-[#0f2444] text-white placeholder:text-blue-200/80 border-blue-900/60 focus:bg-[#0a182e] focus:ring-blue-400 focus:border-blue-400';
      case 'sandstone':
        return 'bg-[#f2eee6] hover:bg-[#ede8df] text-stone-900 placeholder:text-stone-400 border-[#e0dad0] focus:bg-white focus:ring-amber-600 focus:border-amber-600';
      case 'mint-sage':
        return 'bg-[#1b4d3c] hover:bg-[#205744] text-white placeholder:text-emerald-200/70 border-[#0a3324] focus:bg-[#0c3023] focus:ring-emerald-400 focus:border-emerald-400';
      case 'nordic-slate':
        return 'bg-[#f1f5f9] hover:bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500';
      case 'royal-executive':
        return 'bg-[#2546a3] hover:bg-[#2c52bd] text-white placeholder:text-blue-200/70 border-blue-900/60 focus:bg-[#193278] focus:ring-amber-400 focus:border-amber-400';
      case 'light':
      default:
        return 'bg-slate-100/90 hover:bg-slate-100 text-slate-900 placeholder:text-slate-400 border-slate-200 focus:bg-white focus:ring-blue-500 focus:border-blue-500';
    }
  };

  const getThemeButtonClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'border-slate-700 bg-slate-800/90 hover:bg-slate-800 text-slate-100 shadow-2xs';
      case 'ocean':
        return 'border-blue-900 bg-[#0e213d] hover:bg-[#122a4c] text-white shadow-2xs';
      case 'titanium':
        return 'border-zinc-700 bg-zinc-800/90 hover:bg-zinc-800 text-zinc-100 shadow-2xs';
      case 'high-contrast':
        return 'border-neutral-500 bg-neutral-900 hover:bg-black text-white ring-1 ring-neutral-400 shadow-2xs';
      case 'cobalt':
        return 'border-blue-700/60 bg-[#0f2444]/90 hover:bg-[#0f2444] text-white shadow-2xs';
      case 'sandstone':
        return 'border-[#e7e2db] bg-[#faf8f5] hover:bg-[#f2eee6] text-stone-800 shadow-2xs';
      case 'mint-sage':
        return 'border-[#064e3b] bg-[#164937] hover:bg-[#1b5541] text-white shadow-2xs';
      case 'nordic-slate':
        return 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800 shadow-2xs';
      case 'royal-executive':
        return 'border-blue-700/60 bg-[#2546a3] hover:bg-[#2c52bd] text-white shadow-2xs';
      case 'light':
      default:
        return 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs';
    }
  };

  const getThemeBadgeClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'bg-slate-700 text-sky-300 border border-slate-600';
      case 'ocean':
        return 'bg-blue-900/80 text-cyan-200 border border-blue-700';
      case 'titanium':
        return 'bg-zinc-800 text-emerald-300 border border-zinc-700';
      case 'high-contrast':
        return 'bg-amber-400 text-black border border-amber-300 font-black';
      case 'cobalt':
        return 'bg-blue-900/60 text-blue-200 border border-blue-700/50';
      case 'sandstone':
        return 'bg-amber-100 text-amber-800 border border-amber-300';
      case 'mint-sage':
        return 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/60';
      case 'nordic-slate':
        return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
      case 'royal-executive':
        return 'bg-amber-400 text-slate-950 font-bold border border-amber-300';
      case 'light':
      default:
        return 'bg-blue-50 text-blue-700 border border-blue-200';
    }
  };

  const getSidebarClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'bg-[#111827] border-r border-slate-800 text-slate-200';
      case 'ocean':
        return 'bg-[#0d1b2a] border-r border-[#142845] text-slate-200';
      case 'titanium':
        return 'bg-[#141416] border-r border-zinc-800 text-zinc-200';
      case 'high-contrast':
        return 'bg-black border-r border-neutral-700 text-white';
      case 'sandstone':
        return 'bg-[#fcfbfa] border-r border-[#ede9e3] text-stone-800';
      case 'nordic-slate':
        return 'bg-[#f8fafc] border-r border-[#cbd5e1] text-slate-800';
      case 'mint-sage':
        return 'bg-white border-r border-[#e2ebe5] text-slate-800';
      case 'royal-executive':
      case 'cobalt':
      case 'light':
      default:
        return 'bg-white border-r border-slate-200/90 text-slate-800';
    }
  };

  const getNavItemClasses = (active: boolean) => {
    if (active) {
      switch (theme) {
        case 'foundry-dark':
          return 'bg-sky-600 text-white shadow-xs font-semibold';
        case 'ocean':
          return 'bg-blue-600 text-white shadow-xs font-semibold';
        case 'titanium':
          return 'bg-emerald-600 text-white shadow-xs font-semibold';
        case 'high-contrast':
          return 'bg-amber-400 text-black shadow-xs font-black ring-1 ring-white';
        case 'sandstone':
          return 'bg-amber-700 text-white shadow-xs font-semibold';
        case 'mint-sage':
          return 'bg-emerald-700 text-white shadow-xs font-semibold';
        case 'nordic-slate':
          return 'bg-indigo-600 text-white shadow-xs font-semibold';
        case 'royal-executive':
          return 'bg-blue-700 text-white shadow-xs font-semibold';
        case 'cobalt':
        case 'light':
        default:
          return 'bg-blue-600 text-white shadow-xs font-semibold';
      }
    }
    switch (theme) {
      case 'foundry-dark':
        return 'text-slate-300 hover:bg-slate-800/80 hover:text-white';
      case 'ocean':
        return 'text-blue-100/90 hover:bg-[#132a4a] hover:text-white';
      case 'titanium':
        return 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white';
      case 'high-contrast':
        return 'text-white hover:bg-neutral-800 hover:text-amber-300';
      case 'sandstone':
        return 'text-stone-700 hover:bg-[#f2eee6] hover:text-stone-900';
      case 'mint-sage':
        return 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-900';
      case 'nordic-slate':
        return 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900';
      case 'royal-executive':
        return 'text-slate-700 hover:bg-blue-50 hover:text-blue-900';
      case 'cobalt':
      case 'light':
      default:
        return 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';
    }
  };

  const getSidebarHeaderClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'border-slate-800 bg-[#0b101d] text-slate-300';
      case 'ocean':
        return 'border-[#142845] bg-[#08121f] text-blue-200';
      case 'titanium':
        return 'border-zinc-800 bg-[#0e0e10] text-zinc-300';
      case 'high-contrast':
        return 'border-neutral-700 bg-neutral-900 text-white';
      case 'sandstone':
        return 'border-[#ede9e3] bg-[#f7f4ee]/80 text-stone-700';
      case 'mint-sage':
        return 'border-[#e2ebe5] bg-[#f2f8f5]/80 text-slate-700';
      case 'nordic-slate':
        return 'border-[#cbd5e1] bg-[#e2e8f0]/60 text-slate-700';
      case 'royal-executive':
      case 'cobalt':
      case 'light':
      default:
        return 'border-slate-200 bg-slate-50/70 text-slate-700';
    }
  };

  const getSidebarFooterClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'border-slate-800 bg-[#0b101d] text-slate-400';
      case 'ocean':
        return 'border-[#142845] bg-[#08121f] text-slate-400';
      case 'titanium':
        return 'border-zinc-800 bg-[#0e0e10] text-zinc-400';
      case 'high-contrast':
        return 'border-neutral-700 bg-black text-neutral-300';
      case 'sandstone':
        return 'border-[#ede9e3] bg-[#f7f4ee]/80 text-stone-600';
      case 'mint-sage':
        return 'border-[#e2ebe5] bg-[#f2f8f5]/80 text-slate-600';
      case 'nordic-slate':
        return 'border-[#cbd5e1] bg-[#e2e8f0]/60 text-slate-600';
      case 'royal-executive':
      case 'cobalt':
      case 'light':
      default:
        return 'border-slate-200 bg-slate-50/80 text-slate-600';
    }
  };

  const getContentBgClass = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'bg-[#090d16] text-slate-100';
      case 'ocean':
        return 'bg-[#060d17] text-slate-100';
      case 'titanium':
        return 'bg-[#121214] text-zinc-100';
      case 'high-contrast':
        return 'bg-black text-white';
      case 'sandstone':
        return 'bg-[#f7f4ee] text-stone-900';
      case 'mint-sage':
        return 'bg-[#f2f8f5] text-slate-900';
      case 'nordic-slate':
        return 'bg-[#f1f5f9] text-slate-900';
      case 'royal-executive':
        return 'bg-[#f0f4f8] text-slate-900';
      case 'cobalt':
        return 'bg-[#f4f6fa] text-slate-900';
      case 'light':
      default:
        return 'bg-[#f8fafc] text-slate-900';
    }
  };


  const getDropdownClasses = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'bg-[#0f172a] border border-slate-700 text-slate-100 shadow-2xl';
      case 'ocean':
        return 'bg-[#0e213d] border border-[#1c3a64] text-white shadow-2xl';
      case 'titanium':
        return 'bg-[#1e1e22] border border-zinc-700 text-zinc-100 shadow-2xl';
      case 'high-contrast':
        return 'bg-black border-2 border-white text-white shadow-2xl';
      case 'sandstone':
        return 'bg-[#faf8f5] border border-[#d6cfc5] text-stone-900 shadow-2xl';
      case 'mint-sage':
        return 'bg-white border border-[#cbdad0] text-slate-900 shadow-2xl';
      case 'nordic-slate':
        return 'bg-white border border-slate-300 text-slate-900 shadow-2xl';
      case 'royal-executive':
        return 'bg-white border border-blue-200 text-slate-900 shadow-2xl';
      case 'cobalt':
      case 'light':
      default:
        return 'bg-white border border-slate-200 text-slate-800 shadow-2xl';
    }
  };

  const getDropdownItemHoverClass = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'hover:bg-slate-800 hover:text-white text-slate-200';
      case 'ocean':
        return 'hover:bg-[#142845] hover:text-white text-blue-100';
      case 'titanium':
        return 'hover:bg-zinc-800 hover:text-white text-zinc-200';
      case 'high-contrast':
        return 'hover:bg-neutral-800 hover:text-amber-300 text-white';
      case 'sandstone':
        return 'hover:bg-[#f2ede4] hover:text-stone-900 text-stone-700';
      case 'cobalt':
      case 'light':
      default:
        return 'hover:bg-slate-100 hover:text-slate-900 text-slate-700';
    }
  };

  const getDropdownDividerClass = () => {
    switch (theme) {
      case 'foundry-dark':
        return 'border-slate-800';
      case 'ocean':
        return 'border-[#142845]';
      case 'titanium':
        return 'border-zinc-800';
      case 'high-contrast':
        return 'border-neutral-700';
      case 'sandstone':
        return 'border-[#ede7dc]';
      case 'cobalt':
      case 'light':
      default:
        return 'border-slate-100';
    }
  };

  return (
    <div data-theme={theme} className={`min-h-screen ${getContentBgClass()} font-sans flex flex-col antialiased`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        Skip to main content
      </a>
      <GlobalKeyboardNavigation />

      {/* Top Header Bar (Banner) */}
      <header
        role="banner"
        className={`sticky top-0 z-50 flex h-16 w-full items-center justify-between px-4 sm:px-6 shrink-0 print:hidden transition-colors duration-150 relative ${getHeaderClasses()}`}
      >
        {/* Animated Precision Ambient Laser Beam along bottom border */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden pointer-events-none z-10">
          <div className="header-banner-beam" aria-hidden="true" />
        </div>

        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <button
            type="button"
            className={`lg:hidden rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center p-2 transition cursor-pointer ${
              hasDarkHeader
                ? 'text-white/80 hover:bg-white/10 hover:text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* RASHMI GROUP Logo with Authored Molten Ring & Metallic Shimmer */}
          <div
            className="flex items-center gap-2.5 shrink-0 cursor-pointer select-none group"
            onClick={() => router.push('/dashboard')}
            title="Rashmi Green Hydrogen Steel — Return to Dashboard"
          >
            {/* Precision Seamless Pipe & Induction Core Emblem */}
            <div className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 via-rose-600 to-amber-600 p-[1.5px] shadow-sm group-hover:shadow-red-500/30 transition-all duration-300 group-hover:scale-105 overflow-hidden">
              <div className={`h-full w-full rounded-[10px] flex items-center justify-center transition-colors ${
                hasDarkHeader ? 'bg-slate-950/85' : 'bg-white'
              }`}>
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 animate-molten-ring text-red-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {/* Concentric pipe wall geometry */}
                  <circle cx="12" cy="12" r="9" className="opacity-40" stroke="currentColor" />
                  {/* Inner pierced hollow core */}
                  <circle cx="12" cy="12" r="4.5" stroke="#ef4444" fill="#dc2626" fillOpacity="0.25" />
                  {/* Mandrel precision guides */}
                  <path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="#f59e0b" strokeWidth="2" />
                </svg>
              </div>
              {/* Metallic Sheen Sweep */}
              <div className="logo-shimmer-sweep" aria-hidden="true" />
            </div>

            {/* Typography */}
            <div className="flex flex-col items-start leading-none">
              <span className="logo-text-shimmer font-black text-xl tracking-wider leading-none transition-transform duration-200 group-hover:scale-[1.02]">
                RASHMI
              </span>
              <span
                className={`text-[9.5px] font-bold tracking-[0.22em] pl-0.5 mt-0.5 transition-colors ${
                  hasDarkHeader ? 'text-white/90' : 'text-slate-800'
                }`}
              >
                GROUP
              </span>
            </div>
          </div>

          <div
            className={`h-8 w-[1.5px] mx-1.5 hidden sm:block shrink-0 transition-colors ${
              !hasDarkHeader
                ? 'bg-slate-200'
                : theme === 'cobalt'
                ? 'bg-blue-800/60'
                : theme === 'mint-sage'
                ? 'bg-emerald-800/60'
                : theme === 'royal-executive'
                ? 'bg-blue-900/60'
                : theme === 'titanium'
                ? 'bg-zinc-800'
                : 'bg-white/15'
            }`}
          />

          {/* Title & Division Banner Block */}
          <div className="hidden sm:flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`font-bold text-base tracking-tight leading-tight truncate transition-colors ${
                  hasDarkHeader ? 'text-white' : 'text-slate-900'
                }`}
              >
                Seamless WIP Tracking
              </span>
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                LIVE
              </span>
            </div>
            <span
              className={`text-xs font-normal leading-tight truncate transition-colors ${
                !hasDarkHeader
                  ? theme === 'sandstone'
                    ? 'text-stone-500'
                    : 'text-slate-500'
                  : theme === 'cobalt' || theme === 'royal-executive'
                  ? 'text-blue-200'
                  : theme === 'mint-sage'
                  ? 'text-emerald-200'
                  : theme === 'titanium'
                  ? 'text-zinc-400'
                  : theme === 'high-contrast'
                  ? 'text-neutral-300'
                  : 'text-slate-400'
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
                !hasDarkHeader
                  ? theme === 'sandstone'
                    ? 'text-stone-400'
                    : 'text-slate-400'
                  : theme === 'cobalt' || theme === 'royal-executive'
                  ? 'text-blue-300'
                  : theme === 'mint-sage'
                  ? 'text-emerald-300'
                  : theme === 'titanium'
                  ? 'text-zinc-400'
                  : 'text-slate-400'
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
              className={`w-full text-sm rounded-lg pl-9 pr-14 py-2 border transition font-normal focus:outline-none focus:ring-2 ${getSearchInputClasses()}`}
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
                    isLight ? 'text-slate-400 hover:text-slate-600' : 'text-blue-200 hover:text-white'
                  }`}
                  aria-label="Clear search query"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                className={`p-0.5 rounded cursor-pointer ${
                  isLight ? 'text-slate-400 hover:text-slate-700' : 'text-blue-200 hover:text-white'
                }`}
                aria-label="Submit search"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            {/* Live Autocomplete Dropdown */}
            {searchOpen && (
              <div className={`absolute left-0 right-0 top-full mt-1.5 rounded-xl p-2 z-50 animate-in fade-in zoom-in-95 text-xs ${getDropdownClasses()}`}>
                {searchLoading ? (
                  <div className="flex items-center justify-center py-3 text-slate-400 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-xs">Searching work orders...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Matching Work Orders</span>
                      <span className="font-mono text-[10px] text-blue-500 font-bold">{searchResults.length} found</span>
                    </div>
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(item.work_order_no)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition cursor-pointer text-left group ${getDropdownItemHoverClass()}`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-500 group-hover:text-blue-400 text-xs">
                              {item.work_order_no}
                            </span>
                            {item.status && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                isDark
                                  ? 'bg-slate-800 text-slate-300 border-slate-700'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                {item.status}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] opacity-75 truncate mt-0.5">
                            {item.customer_name ? `${item.customer_name} • ` : ''}
                            {item.grade ? `${item.grade} • ` : ''}
                            {item.size_od && item.size_wt ? `${item.size_od} × ${item.size_wt} mm` : ''}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:text-blue-500 shrink-0" />
                      </button>
                    ))}
                    <div className={`pt-1.5 mt-1 border-t ${getDropdownDividerClass()} flex items-center justify-between px-2 text-[11px] opacity-80`}>
                      <span>Press <strong>Enter</strong> to open Tracking Report</span>
                      <button
                        type="button"
                        onClick={handleSearchSubmit}
                        className="text-blue-500 hover:text-blue-400 font-semibold cursor-pointer"
                      >
                        View in Report &rarr;
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center text-slate-400">
                    <p className="font-medium text-xs">No work orders matching &ldquo;{searchQuery}&rdquo;</p>
                    <button
                      type="button"
                      onClick={handleSearchSubmit}
                      className="mt-1 text-xs text-blue-500 hover:underline font-semibold cursor-pointer"
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
            className={`md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg transition cursor-pointer ${
              hasDarkHeader
                ? 'text-white/80 hover:bg-white/10'
                : 'text-slate-600 hover:bg-slate-100'
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
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[38px] text-xs font-semibold border transition cursor-pointer ${getThemeButtonClasses()}`}
            >
              <Palette className={`h-4 w-4 shrink-0 ${
                hasDarkHeader
                  ? theme === 'titanium'
                    ? 'text-emerald-400'
                    : theme === 'high-contrast'
                    ? 'text-amber-400'
                    : theme === 'mint-sage'
                    ? 'text-emerald-300'
                    : 'text-cyan-300'
                  : theme === 'sandstone'
                  ? 'text-amber-700'
                  : 'text-blue-600'
              }`} />
              <span className="hidden sm:inline font-medium">Theme</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${getThemeBadgeClasses()}`}>
                {currentThemeConfig.name.split(' ')[0]}
              </span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {/* Theme Dropdown Menu */}
            {themeDropdownOpen && (
              <div className={`absolute right-0 mt-2 w-80 sm:w-[360px] max-h-[82vh] overflow-y-auto rounded-xl p-3 z-[100] animate-in fade-in zoom-in-95 text-xs shadow-2xl ${getDropdownClasses()}`}>
                <div className={`px-2 py-1.5 border-b ${getDropdownDividerClass()} mb-2 flex items-center justify-between`}>
                  <div className="font-bold flex items-center gap-1.5 text-xs">
                    <Palette className="h-3.5 w-3.5 text-blue-500" />
                    <span>Interface Themes</span>
                  </div>
                  <span className="text-[10px] opacity-75 font-mono">10 Themes (6 Light, 4 Dark)</span>
                </div>

                {/* Section 1: Light Themes (Daytime Shift) */}
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span>☀️ Light Themes (Daytime Shift)</span>
                  </div>
                  <div className="space-y-1">
                    {THEMES.filter(t => t.category === 'Light').map((t) => {
                      const isSelected = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTheme(t.id)}
                          className={`flex w-full items-start gap-2.5 p-2 rounded-lg text-left transition cursor-pointer border ${
                            isSelected
                              ? isDark
                                ? 'bg-blue-950/70 border-blue-600 text-white ring-1 ring-blue-500/40'
                                : 'bg-blue-50 border-blue-300 text-slate-900 ring-1 ring-blue-500/20 shadow-2xs'
                              : `border-transparent ${getDropdownItemHoverClass()}`
                          }`}
                        >
                          {/* Preview swatch representing Topbar + Sidebar */}
                          <div data-swatch="true" className={`flex flex-col gap-0.5 shrink-0 mt-0.5 p-1 rounded shadow-2xs border ${
                            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                          }`}>
                            <div data-swatch="true" className={`h-2.5 w-6 rounded-xs ${t.headerSwatch}`} />
                            <div data-swatch="true" className={`h-3.5 w-6 rounded-xs ${t.sidebarSwatch}`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`font-bold text-xs truncate ${
                                isSelected
                                  ? isDark ? 'text-white' : 'text-blue-950 font-black'
                                  : isDark ? 'text-slate-100' : 'text-slate-900'
                              }`}>
                                {t.name}
                              </span>
                              {t.badge && (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${
                                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}>
                                  {t.badge}
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] leading-snug mt-0.5 line-clamp-2 ${
                              isDark ? 'text-slate-400' : 'text-slate-600'
                            }`}>
                              {t.desc}
                            </p>
                          </div>

                          {isSelected && (
                            <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Dark Themes (Night Shift) */}
                <div className={`pt-2 border-t ${getDropdownDividerClass()}`}>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                    <span>🌙 Dark Themes (Night Shift)</span>
                  </div>
                  <div className="space-y-1">
                    {THEMES.filter(t => t.category === 'Dark').map((t) => {
                      const isSelected = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTheme(t.id)}
                          className={`flex w-full items-start gap-2.5 p-2 rounded-lg text-left transition cursor-pointer border ${
                            isSelected
                              ? isDark
                                ? 'bg-blue-950/70 border-blue-600 text-white ring-1 ring-blue-500/40'
                                : 'bg-blue-50 border-blue-300 text-slate-900 ring-1 ring-blue-500/20 shadow-2xs'
                              : `border-transparent ${getDropdownItemHoverClass()}`
                          }`}
                        >
                          {/* Preview swatch representing Topbar + Sidebar */}
                          <div data-swatch="true" className={`flex flex-col gap-0.5 shrink-0 mt-0.5 p-1 rounded shadow-2xs border ${
                            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                          }`}>
                            <div data-swatch="true" className={`h-2.5 w-6 rounded-xs ${t.headerSwatch}`} />
                            <div data-swatch="true" className={`h-3.5 w-6 rounded-xs ${t.sidebarSwatch}`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`font-bold text-xs truncate ${
                                isSelected
                                  ? isDark ? 'text-white' : 'text-blue-950 font-black'
                                  : isDark ? 'text-slate-100' : 'text-slate-900'
                              }`}>
                                {t.name}
                              </span>
                              {t.badge && (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${
                                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}>
                                  {t.badge}
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] leading-snug mt-0.5 line-clamp-2 ${
                              isDark ? 'text-slate-400' : 'text-slate-600'
                            }`}>
                              {t.desc}
                            </p>
                          </div>

                          {isSelected && (
                            <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Calendar Widget */}
          <div className="hidden lg:flex items-center gap-2.5 text-right">
            <Calendar
              className={`h-4 w-4 shrink-0 ${
                hasDarkHeader
                  ? theme === 'titanium'
                    ? 'text-emerald-400'
                    : theme === 'high-contrast'
                    ? 'text-amber-400'
                    : theme === 'mint-sage'
                    ? 'text-emerald-300'
                    : 'text-cyan-300'
                  : theme === 'sandstone'
                  ? 'text-amber-700'
                  : 'text-blue-600'
              }`}
            />
            <div className="flex flex-col leading-tight">
              <span
                className={`text-xs font-bold tracking-tight ${
                  hasDarkHeader ? 'text-white' : 'text-slate-800'
                }`}
              >
                {formattedDate}
              </span>
              <span
                className={`text-xs font-medium ${
                  hasDarkHeader
                    ? theme === 'cobalt' || theme === 'royal-executive'
                      ? 'text-blue-200'
                      : theme === 'mint-sage'
                      ? 'text-emerald-200'
                      : theme === 'titanium'
                      ? 'text-zinc-400'
                      : theme === 'high-contrast'
                      ? 'text-neutral-300'
                      : 'text-slate-400'
                    : theme === 'sandstone'
                    ? 'text-stone-500'
                    : 'text-slate-500'
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
                hasDarkHeader
                  ? 'hover:bg-white/10 text-white'
                  : 'hover:bg-slate-100 text-slate-900'
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
                    hasDarkHeader ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {currentUser?.name || 'Finishing'}
                </span>
                <span
                  className={`text-xs font-medium leading-tight ${
                    hasDarkHeader
                      ? theme === 'cobalt' || theme === 'royal-executive'
                        ? 'text-blue-200'
                        : theme === 'mint-sage'
                        ? 'text-emerald-200'
                        : 'text-slate-400'
                      : 'text-slate-500'
                  }`}
                >
                  {currentUser?.role_title || 'Production'}
                </span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 hidden xl:block ${
                  hasDarkHeader
                    ? theme === 'cobalt' || theme === 'royal-executive'
                      ? 'text-blue-200'
                      : 'text-slate-300'
                    : 'text-slate-400'
                }`}
              />
            </button>

            {/* User Dropdown */}
            {userDropdownOpen && (
              <div className={`absolute right-0 mt-2 w-64 rounded-xl p-2 z-50 animate-in fade-in zoom-in-95 text-xs ${getDropdownClasses()}`}>
                <div className={`px-2.5 py-2 border-b ${getDropdownDividerClass()}`}>
                  <div className="font-bold text-sm">
                    {currentUser?.name || currentUser?.email || 'Finishing Operator'}
                  </div>
                  <div className="text-xs opacity-75 font-mono mt-0.5">
                    {currentUser?.email || 'finishing@rashmigroup.com'}
                  </div>
                  <div className={`mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                    isDark
                      ? 'bg-blue-950/70 text-blue-300 border-blue-800'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
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
                    className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-lg transition cursor-pointer text-xs ${getDropdownItemHoverClass()}`}
                  >
                    <User className="h-4 w-4 text-blue-500" />
                    <span>User Profile & Security</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        router.push('/admin');
                        setUserDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-lg transition cursor-pointer text-xs ${getDropdownItemHoverClass()}`}
                    >
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      <span>Admin Control Panel</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      router.push('/admin/spec-master');
                      setUserDropdownOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-lg transition cursor-pointer text-xs ${getDropdownItemHoverClass()}`}
                  >
                    <Beaker className="h-4 w-4 text-amber-500" />
                    <span>Material Spec Master</span>
                  </button>
                </div>

                <div className={`pt-1.5 mt-1 border-t ${getDropdownDividerClass()}`}>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-2.5 py-2 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer font-semibold text-xs"
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
        <div className={`md:hidden px-4 py-2.5 border-b shadow-sm ${
          isLight ? 'bg-white border-slate-200' :
          theme === 'foundry-dark' ? 'bg-[#0f172a] border-slate-800' :
          theme === 'ocean' ? 'bg-[#0a192f] border-[#142845]' :
          theme === 'titanium' ? 'bg-[#18181b] border-zinc-800' :
          theme === 'high-contrast' ? 'bg-black border-neutral-700' :
          'bg-[#16325c] border-blue-900'
        }`}>
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 pointer-events-none ${isLight ? 'text-slate-400' : 'text-slate-300'}`} />
            <input
              type="text"
              placeholder="Search Work Order / Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full text-sm rounded-lg pl-9 pr-12 py-2.5 border focus:outline-none focus:ring-2 ${getSearchInputClasses()}`}
              autoFocus
            />
            <button
              type="submit"
              className="absolute right-2 top-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-blue-500 hover:text-blue-400 cursor-pointer"
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
          className={`fixed top-16 bottom-0 left-0 z-40 flex w-64 flex-col transition-transform duration-200 ease-out lg:translate-x-0 print:hidden ${getSidebarClasses()} ${
            open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          <div className={`flex items-center justify-between px-4 py-3 border-b lg:hidden ${getSidebarHeaderClasses()}`}>
            <span className="text-xs font-bold uppercase tracking-wider">
              Navigation Menu
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:opacity-80"
              aria-label="Close navigation menu"
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
                      theme === 'high-contrast' ? 'text-amber-400 font-black' : 'text-slate-400'
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
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150 cursor-pointer ${getNavItemClasses(active)}`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform ${
                            active
                              ? theme === 'high-contrast'
                                ? 'text-black'
                                : 'text-white'
                              : isDark
                              ? 'text-slate-400 group-hover:text-cyan-400'
                              : 'text-slate-500 group-hover:text-slate-800'
                          }`}
                        />
                        <span className="truncate font-medium">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className={`p-3.5 border-t text-xs font-mono flex items-center justify-between ${getSidebarFooterClasses()}`}>
            <span className="font-semibold">
              RASHMI STEEL MILL
            </span>
            <span className="text-emerald-500 font-bold flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </span>
          </div>
        </aside>

        {/* Content Area */}
        <div className={`flex-1 lg:pl-64 print:pl-0 print:m-0 min-w-0 flex flex-col ${getContentBgClass()}`}>
          <main id="main-content" className="flex-1 w-full p-4 sm:p-5 lg:p-6 print:p-0 print:m-0 print:bg-white">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
