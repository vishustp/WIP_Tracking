'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mockStore, MockUserProfile } from '@/lib/supabase/mock-store';
import {
  BarChart3, ClipboardList, Factory, FileSpreadsheet, Gauge,
  LayoutDashboard, LogOut, Menu, Settings, Shuffle, X, CalendarClock,
  User, ShieldCheck, ChevronDown, Check, Sparkles
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
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<MockUserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<MockUserProfile[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadUserData = () => {
    mockStore.loadFromStorage();
    setCurrentUser(mockStore.getCurrentUser());
    setAllUsers([...mockStore.users]);
  };

  useEffect(() => {
    loadUserData();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pathname]);

  if (pathname === '/login') return <>{children}</>;

  const switchUser = (email: string) => {
    mockStore.setCurrentUser(email);
    setCurrentUser(mockStore.getCurrentUser());
    setUserDropdownOpen(false);
    toast.success(`Switched active profile to ${email}`);
    router.refresh();
  };

  const signOut = async () => {
    document.cookie = 'demo_user=; path=/; max-age=0';
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const pageTitle =
    pathname === '/dashboard'
      ? 'Dashboard'
      : pathname === '/profile'
      ? 'User Profile'
      : pathname === '/admin'
      ? 'Admin Control Panel'
      : pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g, ' ');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 border-r bg-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              SW
            </div>
            <div className="font-semibold tracking-tight text-sm">Seamless WIP</div>
          </div>
          <button className="lg:hidden rounded-md p-1.5 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav className="h-[calc(100vh-7.5rem)] overflow-y-auto p-2">
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
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition cursor-pointer ${
                        active ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon size={16} />
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
          <div className="absolute bottom-0 left-0 right-0 border-t bg-slate-50/70 p-2.5">
            <div
              onClick={() => { router.push('/profile'); setOpen(false); }}
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer group"
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${currentUser.avatar_color || 'bg-blue-600 text-white'}`}>
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600">{currentUser.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{currentUser.role_title}</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/95 px-4 backdrop-blur lg:px-5">
          <div className="flex items-center">
            <button className="mr-2 rounded-md p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
            <div className="text-sm font-semibold capitalize">{pageTitle}</div>
          </div>

          {/* Header Right User Widget */}
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1.5 pr-2.5 text-xs font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${currentUser.avatar_color || 'bg-blue-600 text-white'}`}>
                    {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline-block font-semibold text-slate-800">{currentUser.name.split(' ')[0]}</span>
                  <span className="hidden md:inline-block text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-mono">
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
                        {currentUser.role_title}
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

                      <button
                        type="button"
                        onClick={() => { router.push('/admin'); setUserDropdownOpen(false); }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        <ShieldCheck className="h-4 w-4 text-slate-700" />
                        <span>Admin Control Panel</span>
                      </button>
                    </div>

                    <div className="pt-1.5 border-t border-slate-100">
                      <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Switch Active Role
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {allUsers.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => switchUser(u.email)}
                            className={`flex w-full items-center justify-between px-2 py-1 rounded-md text-[11px] transition cursor-pointer ${
                              u.email.toLowerCase() === currentUser.email.toLowerCase()
                                ? 'bg-slate-100 font-semibold text-slate-900'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className={`h-2 w-2 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                              <span className="truncate">{u.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                              {u.role_title.split(' ')[0]}
                            </span>
                          </button>
                        ))}
                      </div>
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
        </header>

        <main className="mx-auto w-full max-w-[1800px] p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}

