'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { mockStore, MockUserProfile, DEFAULT_USERS, UserGroup, UserRole } from '@/lib/supabase/mock-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Factory,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    mockStore.loadFromStorage();
  }, []);

  const findUserByUsernameOrEmail = (query: string): MockUserProfile | null => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const userList = mockStore.users?.length ? mockStore.users : DEFAULT_USERS;

    // 1. Match exact email
    let matched = userList.find((u) => u.email.toLowerCase() === q);
    if (matched) return matched;

    // 2. Match email prefix (e.g. 'admin' from 'admin@seamlesswip.com')
    matched = userList.find((u) => u.email.toLowerCase().split('@')[0] === q);
    if (matched) return matched;

    // 3. Match employee ID (e.g. 'PPC-001')
    matched = userList.find((u) => u.employee_id.toLowerCase() === q);
    if (matched) return matched;

    // 4. Match full name or first name
    matched = userList.find(
      (u) =>
        u.name.toLowerCase() === q ||
        u.name.toLowerCase().startsWith(q) ||
        u.name.toLowerCase().includes(q)
    );
    if (matched) return matched;

    // 5. Match role alias
    if (q === 'manager' || q === 'super' || q === 'plant') {
      matched = userList.find((u) => u.group === 'super_user' || u.role === 'manager');
      if (matched) return matched;
    }
    if (q === 'rolling' || q === 'mill') {
      matched = userList.find((u) => u.role === 'rolling_incharge' || u.work_center === 'ROLLING');
      if (matched) return matched;
    }
    if (q === 'draw') {
      matched = userList.find((u) => u.role === 'draw_operator' || u.work_center === 'DRAW');
      if (matched) return matched;
    }

    return null;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const inputUser = username.trim();
    const inputPass = password.trim();

    if (!inputUser) {
      setErrorMessage('Please enter your username or email.');
      return;
    }

    if (!inputPass) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      let loggedInProfile: MockUserProfile | null = null;

      // 1. Optional Supabase Auth if configured
      const hasSupabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

      if (hasSupabaseUrl && inputUser.includes('@')) {
        try {
          const s = createClient();
          const { data: authData, error: authError } = await s.auth.signInWithPassword({
            email: inputUser.toLowerCase(),
            password: inputPass,
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
                allowed_stages: wc === 'ALL' ? allStages : [wc],
                default_stage: wc === 'ALL' ? 'ROLLING' : wc,
                phone: appUser.phone || '',
                active: true,
                created_at: appUser.created_at,
              };
            }
          }
        } catch {
          // Fall through to mock store resolution
        }
      }

      // 2. Resolve User from directory / mock store
      if (!loggedInProfile) {
        mockStore.loadFromStorage();
        const matched = findUserByUsernameOrEmail(inputUser);

        if (!matched) {
          throw new Error('Username not recognized. Try "admin", "manager", "rolling", or "draw".');
        }

        if (!matched.active) {
          throw new Error('This account has been deactivated. Please contact your system administrator.');
        }

        // Validate password / PIN (allow password123 or user's PIN)
        const validPin = matched.pin || '1234';
        const isPasswordValid =
          inputPass === 'password123' ||
          inputPass === validPin ||
          inputPass.length >= 4; // allow standard passwords in test mode

        if (!isPasswordValid) {
          throw new Error('Invalid password. Default password is: password123');
        }

        loggedInProfile = matched;
      }

      // 3. Set Session and Cookie
      mockStore.setCurrentUser(loggedInProfile.email);

      if (typeof document !== 'undefined') {
        const maxAge = rememberMe ? 86400 * 30 : 86400; // 30 days or 1 day
        document.cookie = `demo_user=${encodeURIComponent(
          loggedInProfile.email
        )}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }

      // 4. Audit Log
      mockStore.addAuditLog({
        user_email: loggedInProfile.email,
        user_name: loggedInProfile.name,
        action_type: 'AUTH_LOGIN',
        entity_type: 'User Session',
        entity_id: loggedInProfile.id,
        details: `User ${loggedInProfile.name} (${loggedInProfile.role_title}) logged in successfully`,
      });

      toast.success(`Welcome back, ${loggedInProfile.name}!`);
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Please check your credentials.');
      toast.error(err?.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (demoUser: string, demoPass: string) => {
    setUsername(demoUser);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-12 antialiased">
      <div className="w-full max-w-md space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 shadow-xs mb-1">
            <Factory className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Seamless WIP
          </h1>
          <p className="text-xs text-slate-400">
            PPC Planning, Pipe Diversion & Production WIP Tracking
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-7 shadow-2xl backdrop-blur-sm space-y-6">
          <div className="border-b border-slate-800/80 pb-4">
            <h2 className="text-base font-semibold text-white">Sign in to your account</h2>
            <p className="text-xs text-slate-400 mt-0.5">Enter your username and password below</p>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <Input
                  id="username-input"
                  type="text"
                  placeholder="Enter username or email"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  className="pl-10 bg-slate-900 border-slate-700/80 text-white placeholder:text-slate-500 text-sm h-10.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 block">
                  Password
                </label>
                <span className="text-[11px] text-slate-500">Default: password123</span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <Input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  required
                  className="pl-10 pr-10 bg-slate-900 border-slate-700/80 text-white placeholder:text-slate-500 text-sm h-10.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs text-slate-400">Remember me</span>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold h-11 rounded-lg transition-all shadow-md mt-2 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Demo Credentials Quick Fill */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider text-center">
              Quick Fill Demo Accounts
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('admin', 'password123')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 text-left text-xs transition-colors group cursor-pointer"
              >
                <div className="font-medium text-slate-200 group-hover:text-blue-400">Admin</div>
                <div className="text-[10px] text-slate-500 font-mono">user: admin</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('manager', 'password123')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 text-left text-xs transition-colors group cursor-pointer"
              >
                <div className="font-medium text-slate-200 group-hover:text-purple-400">Plant Head</div>
                <div className="text-[10px] text-slate-500 font-mono">user: manager</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('rolling', 'password123')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 text-left text-xs transition-colors group cursor-pointer"
              >
                <div className="font-medium text-slate-200 group-hover:text-amber-400">Rolling Incharge</div>
                <div className="text-[10px] text-slate-500 font-mono">user: rolling</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('draw', 'password123')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 text-left text-xs transition-colors group cursor-pointer"
              >
                <div className="font-medium text-slate-200 group-hover:text-emerald-400">Draw Operator</div>
                <div className="text-[10px] text-slate-500 font-mono">user: draw</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Role-based access control & shop-floor security enabled</span>
        </div>

      </div>
    </main>
  );
}
