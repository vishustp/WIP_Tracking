'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { mockStore, MockUserProfile, DEFAULT_USERS, UserGroup, WorkCenterCode } from '@/lib/supabase/mock-store';
import { GROUP_CONFIGS, getGroupConfig } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  ArrowRight,
  ShieldCheck,
  Factory,
  HardHat,
  LayoutDashboard,
  KeyRound,
  UserCheck,
  CheckCircle2,
  Lock,
  Layers,
  AlertCircle,
  Building,
  Sparkles,
  Search,
  Check,
  Crown,
  Zap,
  Users,
  ShieldAlert,
  Flame,
  Settings
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<MockUserProfile[]>(DEFAULT_USERS);
  const [activeUser, setActiveUser] = useState<MockUserProfile | null>(null);
  const [selectedRoleEmail, setSelectedRoleEmail] = useState<string>('admin@seamlesswip.com');
  const [inputEmail, setInputEmail] = useState('admin@seamlesswip.com');
  const [inputPin, setInputPin] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'groups' | 'custom'>('groups');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<'ALL' | UserGroup>('ALL');

  useEffect(() => {
    mockStore.loadFromStorage();
    setUsers([...mockStore.users]);
    const current = mockStore.getCurrentUser();
    setActiveUser(current);
  }, []);

  const executeLogin = async (targetEmail: string, passwordProvided?: string) => {
    setLoading(true);
    try {
      const email = targetEmail.trim().toLowerCase();
      const password = passwordProvided || 'password123';
      const s = createClient();

      // Real Supabase authentication is the source of truth.
      const { data: authData, error: authError } = await s.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Invalid email or password');
      }

      // Load the application directory record after authentication.
      const { data: appUser, error: userError } = await s
        .from('app_users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (userError || !appUser) {
        await s.auth.signOut();
        throw new Error('Your account is authenticated but is not registered in the WIP user directory. Ask an Administrator to activate your account.');
      }

      if (!appUser.active) {
        await s.auth.signOut();
        throw new Error('This user account has been disabled by the Administrator.');
      }

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

      const profile: MockUserProfile = {
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

      // Keep the existing client-side permission hooks compatible while
      // Supabase Auth remains the real authentication authority.
      mockStore.setCurrentUser(profile.email);
      setActiveUser(profile);

      if (typeof document !== 'undefined') {
        document.cookie = 'demo_user=; path=/; max-age=0; SameSite=Lax';
      }

      toast.success(`Logged in as ${profile.name} (${profile.role_title})`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(inputEmail, inputPin);
  };

  const handleCardSelect = (userItem: MockUserProfile) => {
    setSelectedRoleEmail(userItem.email);
    setInputEmail(userItem.email);
    setInputPin('password123');
    executeLogin(userItem.email, 'password123');
  };

  const filteredUsers = users.filter(u => {
    if (selectedGroupFilter === 'ALL') return true;
    const uGroup = u.group || (u.role === 'admin' ? 'admin' : u.role === 'manager' ? 'super_user' : 'user');
    return uGroup === selectedGroupFilter;
  });

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-900/20">
            <Factory className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Seamless WIP Portal
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Industrial Pipe Mill WIP Tracking with Role & Group Authorization Hierarchy
          </p>
        </div>

        {/* Group Hierarchy Explaination Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-3.5 text-xs space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 font-bold text-blue-300">
              <Crown className="h-4 w-4 text-blue-400" />
              <span>Admin Group</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Global deletion authority, user management (add/edit/remove), system configuration & full admin panel.
            </p>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-purple-950/40 p-3.5 text-xs space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 font-bold text-purple-300">
              <Zap className="h-4 w-4 text-purple-400" />
              <span>Super User Group</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Can delete production records from <strong>ANY</strong> work center plant-wide. Cannot modify user accounts or admin settings.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3.5 text-xs space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-300">
              <Users className="h-4 w-4 text-amber-400" />
              <span>User Group</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Strictly restricted: can <strong>ONLY</strong> edit and delete data from their assigned work center (e.g. Rolling Mill or Draw Bench).
            </p>
          </div>
        </div>

        {/* Active Session Card (If logged in) */}
        {activeUser && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3 text-left">
              <div className="h-10 w-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
                {activeUser.name.charAt(0)}
              </div>
              <div>
                <div className="text-xs text-emerald-300 font-medium">Currently active session:</div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {activeUser.name}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 font-semibold uppercase">
                    {activeUser.group || activeUser.role}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                    WC: {activeUser.work_center || 'ALL'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{activeUser.department}</div>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 transition-all cursor-pointer whitespace-nowrap"
            >
              <LayoutDashboard className="h-4 w-4" />
              Enter Work Center Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center justify-center gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'groups'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Group Profiles & 1-Click Login
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Email / Security PIN Login
          </button>
        </div>

        {/* Role Cards Grid Tab */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium">Filter by Group:</span>
                {(['ALL', 'admin', 'super_user', 'user'] as const).map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroupFilter(grp)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      selectedGroupFilter === grp
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {grp === 'ALL' ? 'All Accounts' : grp === 'admin' ? 'Admin Group' : grp === 'super_user' ? 'Super User Group' : 'User Group'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">
                Click any profile card to authenticate instantly
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredUsers.map((userItem) => {
                const uGroup = (userItem.group || (userItem.role === 'admin' ? 'admin' : userItem.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
                const grpConfig = GROUP_CONFIGS[uGroup] || GROUP_CONFIGS.user;
                const userWorkCenter = userItem.work_center || (uGroup === 'admin' || uGroup === 'super_user' ? 'ALL' : 'ROLLING');
                const isCurrent = activeUser?.email === userItem.email;

                return (
                  <div
                    key={userItem.id}
                    onClick={() => handleCardSelect(userItem)}
                    className={`relative rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer group flex flex-col justify-between ${
                      isCurrent
                        ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500 shadow-lg shadow-blue-950/50'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900/90'
                    }`}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-9 w-9 rounded-xl font-bold flex items-center justify-center text-xs shadow ${
                              userItem.avatar_color || 'bg-blue-600 text-white'
                            }`}
                          >
                            {userItem.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white group-hover:text-blue-300 transition-colors">
                              {userItem.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {userItem.employee_id} • PIN: {userItem.pin || '1234'}
                            </div>
                          </div>
                        </div>

                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                            <Check className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                              grpConfig.badgeClass
                            }`}
                          >
                            {grpConfig.name}
                          </span>
                        )}
                      </div>

                      {/* Role Title & Department */}
                      <div className="mb-2">
                        <div className="text-xs font-semibold text-slate-200">
                          {userItem.role_title}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">
                          {userItem.department}
                        </div>
                      </div>

                      {/* Deletion & Authority Scope Box */}
                      <div className="my-2.5 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Assigned WC:</span>
                          <span className="font-mono text-slate-200 font-semibold">
                            {userWorkCenter === 'ALL' ? 'Plant-Wide (ALL)' : userWorkCenter}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Delete Authority:</span>
                          {uGroup === 'admin' ? (
                            <span className="text-blue-400 font-semibold flex items-center gap-1">
                              <Crown className="h-3 w-3" /> All Work Centers
                            </span>
                          ) : uGroup === 'super_user' ? (
                            <span className="text-purple-400 font-semibold flex items-center gap-1">
                              <Zap className="h-3 w-3" /> Any Work Center
                            </span>
                          ) : (
                            <span className="text-amber-400 font-semibold flex items-center gap-1">
                              <Lock className="h-3 w-3" /> {userWorkCenter} Only
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Admin Settings:</span>
                          <span
                            className={
                              uGroup === 'admin'
                                ? 'text-blue-400 font-semibold'
                                : 'text-slate-500'
                            }
                          >
                            {uGroup === 'admin' ? 'Full Control' : 'Locked'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Button Action */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-blue-400 group-hover:text-blue-300">
                      <span>Log In as {userItem.name.split(' ')[0]}</span>
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Login Form Tab */}
        {activeTab === 'custom' && (
          <div className="max-w-md mx-auto rounded-2xl border border-slate-800 bg-slate-950/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-white">Manual Sign In</h2>
              <p className="text-xs text-slate-400">
                Enter your registered corporate email and password
              </p>
            </div>

            <form onSubmit={handleCustomSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-300">Email Address</label>
                <Input
                  type="email"
                  placeholder="admin@seamlesswip.com"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  className="mt-1.5 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300">Password</label>
                <Input
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={inputPin}
                  onChange={(e) => setInputPin(e.target.value)}
                  className="mt-1.5 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500 font-mono tracking-wider"
                  required
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Use the password assigned by your Administrator.</span>
                  <span>Minimum 8 characters</span>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 font-semibold text-white transition-colors py-2.5 text-xs rounded-xl"
              >
                {loading ? 'Validating credentials...' : 'Enter System'}
              </Button>
            </form>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => executeLogin('admin@seamlesswip.com')}
                className="text-xs text-blue-400 hover:underline cursor-pointer"
              >
                Quick bypass: Enter directly as PPC Administrator
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

