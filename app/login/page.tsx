'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { mapAppUser } from '@/lib/users/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Factory, User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, CheckCircle2,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [loadingText, setLoadingText] = useState('Signing in...');

  // 1. If user already has an active session, automatically transition to dashboard
  useEffect(() => {
    let isMounted = true;
    async function checkExistingSession() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user && isMounted) {
          setLoading(true);
          setLoadingText('Loading Dashboard...');
          window.location.assign('/dashboard');
        }
      } catch {
        // Stay on login page
      }
    }
    void checkExistingSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent double submission
    setErrorMessage(null);

    const inputEmail = email.trim().toLowerCase();
    if (!inputEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    setLoadingText('Authenticating credentials...');
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Invalid email or password.');
      }

      setLoadingText('Loading user profile...');
      let { data: appUser, error: profileError } = await supabase
        .from('app_users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);
      if (!appUser && authData.user.email) {
        // Fallback: match by email and link auth_user_id
        const { data: byEmail } = await supabase
          .from('app_users')
          .select('*')
          .eq('email', authData.user.email.toLowerCase())
          .maybeSingle();
        if (byEmail) {
          appUser = byEmail;
          await supabase.from('app_users').update({ auth_user_id: authData.user.id }).eq('id', byEmail.id);
        }
      }

      if (!appUser) {
        await supabase.auth.signOut();
        throw new Error('Your account is authenticated but has no application profile. Contact an administrator.');
      }
      if (appUser.active === false) {
        await supabase.auth.signOut();
        throw new Error('This account has been deactivated. Please contact your system administrator.');
      }

      const profile = mapAppUser(appUser);

      // Best effort audit logging (non-blocking)
      try {
        void supabase.from('audit_log').insert({
          user_id: authData.user.id,
          action: 'AUTH_LOGIN',
          entity: 'User Session',
          record_id: authData.user.id,
          new_value: {
            email: profile.email,
            name: profile.name,
            role: profile.role,
            group: profile.group,
          },
        });
      } catch {
        // Ignore audit log error
      }

      setLoginSuccess(true);
      setLoadingText('Authenticated • Opening Dashboard...');
      toast.success(`Welcome back, ${profile.name}!`);

      // Brief delay so operator sees the crisp confirmation state before redirect
      setTimeout(() => {
        window.location.assign('/dashboard');
      }, 400);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Please check your credentials.');
      toast.error(err?.message || 'Authentication error');
      setLoading(false);
      setLoginSuccess(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070b12] relative overflow-hidden flex flex-col justify-center items-center px-4 py-12 antialiased selection:bg-sky-500/30 selection:text-sky-200">
      {/* Precision CAD Blueprint Grid & Ambient Induction Aura */}
      <div className="absolute inset-0 bg-canvas-pattern opacity-35 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_35%,rgba(14,165,233,0.1),transparent_70%)] pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-44 bg-gradient-to-t from-blue-950/25 to-transparent pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-login-card">
        {/* Brand Header with Stagger Entrance */}
        <div className="text-center space-y-2.5 animate-login-item-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-blue-600/20 to-sky-500/10 border border-sky-400/30 text-sky-400 shadow-[0_0_20px_-3px_rgba(14,165,233,0.3)] mb-1 animate-pulse-glow transition-transform duration-300 hover:scale-105">
            <Factory className="w-7 h-7" />
          </div>
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase leading-snug">
            RASHMI GREEN HYDROGEN STEEL PVT. LTD.
          </h1>
          <p className="text-xs font-semibold text-sky-400 tracking-wider uppercase flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping opacity-75" />
            Seamless Pipe Division · WIP Tracking System
          </p>
        </div>

        {/* Login Card with Induction Scan Line & Focus Depth */}
        <div className={`relative bg-slate-950/85 border ${loginSuccess ? 'border-emerald-500/60 shadow-[0_0_35px_-5px_rgba(16,185,129,0.3)]' : 'border-slate-800/90 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)]'} rounded-2xl p-7 sm:p-8 backdrop-blur-md space-y-6 overflow-hidden transition-all duration-400`}>
          {/* Active Induction Beam Scan during Loading */}
          {loading && (
            <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-slate-800/60 overflow-hidden z-20">
              <div
                className={`h-full w-1/2 ${
                  loginSuccess
                    ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-sky-400 to-transparent'
                } animate-induction-beam`}
              />
            </div>
          )}

          {/* Card Header */}
          <div className="border-b border-slate-800/80 pb-4 animate-login-item-2">
            <h2 className="text-base font-semibold text-white">Sign in to your account</h2>
            <p className="text-sm text-slate-400 mt-0.5">Use the email and password assigned in Supabase Auth.</p>
          </div>

          {/* Error Message with Kinetic Shake */}
          {errorMessage && (
            <div className="animate-error-shake flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4.5">
            {/* Email Input */}
            <div className="space-y-1.5 animate-login-item-3">
              <label className="text-sm font-semibold text-slate-300 block">Email</label>
              <div className="relative group">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-400 pointer-events-none z-10 transition-colors duration-200" />
                <input
                  id="email-input"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  disabled={loading}
                  onChange={(e) => { setEmail(e.target.value); if (errorMessage) setErrorMessage(null); }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white font-medium placeholder:text-slate-500 text-sm h-11 focus:border-sky-500 focus:bg-slate-900 focus:text-white focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5 animate-login-item-4">
              <label className="text-sm font-semibold text-slate-300 block">Password</label>
              <div className="relative group">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-400 pointer-events-none z-10 transition-colors duration-200" />
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  disabled={loading}
                  onChange={(e) => { setPassword(e.target.value); if (errorMessage) setErrorMessage(null); }}
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white font-medium placeholder:text-slate-500 text-sm h-11 focus:border-sky-500 focus:bg-slate-900 focus:text-white focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-all z-10 disabled:opacity-50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Interactive Sign In Button with Step Animations */}
            <div className="pt-2 animate-login-item-5">
              <Button
                type="submit"
                disabled={loading}
                className={`w-full ${
                  loginSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_-3px_rgba(16,185,129,0.5)]'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30'
                } disabled:opacity-85 disabled:cursor-not-allowed text-sm font-semibold h-11 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]`}
              >
                {loginSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-100 animate-pulse" />
                    <span key="success" className="animate-status-step font-bold">
                      {loadingText}
                    </span>
                  </>
                ) : loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-200" />
                    <span key={loadingText} className="animate-status-step">
                      {loadingText}
                    </span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Security & Access Guard Footnote */}
        <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 animate-login-item-5">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>Supabase Auth & role-based access control enabled</span>
        </div>
      </div>
    </main>
  );
}

