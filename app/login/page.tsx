'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { mockStore, MockUserProfile, DEFAULT_USERS, UserGroup, UserRole, WorkCenterCode } from '@/lib/supabase/mock-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Factory,
  ArrowRight,
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  LayoutDashboard,
  CheckCircle2,
  Users,
  ChevronRight,
  User,
  Sparkles
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<MockUserProfile[]>(DEFAULT_USERS);
  const [activeUser, setActiveUser] = useState<MockUserProfile | null>(null);
  const [inputEmail, setInputEmail] = useState('admin@seamlesswip.com');
  const [inputPassword, setInputPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [showQuickSelect, setShowQuickSelect] = useState(true);

  useEffect(() => {
    mockStore.loadFromStorage();
    const storedUsers = mockStore.users.length ? mockStore.users : DEFAULT_USERS;
    setUsers(storedUsers);
    const current = mockStore.getCurrentUser();
    setActiveUser(current);
  }, []);

  const executeLogin = async (targetEmail: string, passwordProvided?: string) => {
    setLoading(true);
    try {
      const email = targetEmail.trim().toLowerCase();
      const password = passwordProvided || 'password123';
      let loggedInProfile: MockUserProfile | null = null;

      // 1. Try Supabase Auth if environment is configured
      const hasSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');
      
      if (hasSupabaseUrl) {
        try {
          const s = createClient();
          const { data: authData, error: authError } = await s.auth.signInWithPassword({
            email,
            password,
          });

          if (!authError && authData?.user) {
            const { data: appUser } = await s
              .from('app_users')
              .select('*')
              .eq('auth_user_id', authData.user.id)
              .single();

            if (appUser && appUser.active) {
              const roleMap: Record<string, { role: UserRole; group: UserGroup; roleTitle: string }> = {
                Admin: { role: 'admin', group: 'admin', roleTitle: 'PPC Administrator' },
                PPC: { role: 'manager', group: 'super_user', roleTitle: 'Plant Operations Head' },
                Production: { role: 'rolling_incharge', group: 'user', roleTitle: 'Production Operator' },
                QA: { role: 'qa_inspector', group: 'user', roleTitle: 'Quality & NDT Inspector' },
                Viewer: { role: 'auditor', group: 'user', roleTitle: 'Viewer' },
              };
              const mapped = roleMap[appUser.role] || roleMap.Viewer;
              const wc = String(appUser.work_center || 'ALL');
              const allStages = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'];
              const allowedStages = wc === 'ALL' ? allStages : [wc];

              loggedInProfile = {
                id: appUser.auth_user_id,
                email: appUser.email,
                name: appUser.employee_name,
                employee_id: appUser.employee_code,
                group: mapped.group,
                role: mapped.role,
                role_title: mapped.roleTitle,
                department: appUser.department || '',
                shift: '',
                work_center: wc,
                allowed_stages: allowedStages,
                default_stage: wc === 'ALL' ? 'ROLLING' : wc,
                phone: appUser.phone || '',
                active: true,
                created_at: appUser.created_at,
              };
            }
          }
        } catch {
          // Fall through to mock store
        }
      }

      // 2. Fallback to in-app user directory / mock store
      if (!loggedInProfile) {
        mockStore.loadFromStorage();
        const found = mockStore.users.find((u) => u.email.toLowerCase() === email) ||
                      DEFAULT_USERS.find((u) => u.email.toLowerCase() === email);

        if (!found) {
          throw new Error('User not found. Please check your email or select a preset user.');
        }

        if (!found.active) {
          throw new Error('This user account has been disabled.');
        }

        if (passwordProvided && passwordProvided !== 'password123') {
          const expectedPin = found.pin || '1234';
          if (passwordProvided !== expectedPin && passwordProvided !== 'password123') {
            throw new Error(`Invalid password or PIN for ${found.name}.`);
          }
        }

        loggedInProfile = found;
      }

      // Update state and cookies
      mockStore.setCurrentUser(loggedInProfile.email);
      setActiveUser(loggedInProfile);

      if (typeof document !== 'undefined') {
        document.cookie = `demo_user=${encodeURIComponent(loggedInProfile.email)}; path=/; max-age=864000; SameSite=Lax`;
      }

      toast.success(`Welcome, ${loggedInProfile.name}`);
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(inputEmail, inputPassword);
  };

  const handleQuickSelect = (userItem: MockUserProfile) => {
    setInputEmail(userItem.email);
    setInputPassword(userItem.pin || 'password123');
    executeLogin(userItem.email, userItem.pin || 'password123');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 antialiased">
      <div className="w-full max-w-md space-y-6">
        
        {/* Minimal Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 text-blue-400 shadow-sm mb-1">
            <Factory className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Seamless WIP
          </h1>
          <p className="text-xs text-slate-400">
            Sign in to access your work center and production tracking
          </p>
        </div>

        {/* Active Session Notice if logged in */}
        {activeUser && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-semibold shrink-0">
                {activeUser.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate">{activeUser.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{activeUser.role_title}</div>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shrink-0"
            >
              Dashboard
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Main Clean Card */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-7 shadow-xl backdrop-blur-sm space-y-5">
          
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Email address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  className="pl-9 bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-600 text-xs h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Password / PIN</label>
                <span className="text-[11px] text-slate-500">Default: password123</span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  className="pl-9 bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-600 text-xs h-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium h-10 rounded-xl transition-colors cursor-pointer shadow-sm mt-1"
            >
              {loading ? 'Authenticating...' : 'Sign in'}
            </Button>
          </form>

          {/* Minimal Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-medium absolute">
              Quick Select Profile
            </span>
          </div>

          {/* Quick Select Grid */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 gap-2">
              {users.slice(0, 5).map((u) => {
                const isCurrent = activeUser?.email === u.email;
                const isPpcOrAdmin = u.group === 'admin' || u.group === 'super_user';

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickSelect(u)}
                    disabled={loading}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer group ${
                      isCurrent
                        ? 'border-blue-500/50 bg-blue-950/20 text-white'
                        : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        u.group === 'admin'
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : u.group === 'super_user'
                          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {u.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate group-hover:text-blue-300 transition-colors">
                          {u.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {u.role_title} • {u.work_center || 'ALL'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                        u.group === 'admin'
                          ? 'bg-blue-950/50 text-blue-300 border-blue-800/50'
                          : u.group === 'super_user'
                          ? 'bg-purple-950/50 text-purple-300 border-purple-800/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}>
                        {u.group === 'admin' ? 'Admin' : u.group === 'super_user' ? 'Super' : 'User'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Subtle Footer */}
        <div className="text-center text-[11px] text-slate-600">
          Seamless WIP Tracking & Production Control System
        </div>

      </div>
    </main>
  );
}


