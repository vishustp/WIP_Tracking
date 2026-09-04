'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { mapAppUser } from '@/lib/users/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Factory, User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Invalid email or password.');
      }

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

      await supabase.from('audit_log').insert({
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

      toast.success(`Welcome back, ${profile.name}!`);
      router.replace('/dashboard');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Please check your credentials.');
      toast.error(err?.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-12 antialiased">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 shadow-xs mb-1">
            <Factory className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Seamless WIP</h1>
          <p className="text-sm text-slate-400">PPC Planning, Pipe Diversion & Production WIP Tracking</p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-7 shadow-2xl backdrop-blur-sm space-y-6">
          <div className="border-b border-slate-800/80 pb-4">
            <h2 className="text-base font-semibold text-white">Sign in to your account</h2>
            <p className="text-sm text-slate-400 mt-0.5">Use the email and password assigned in Supabase Auth.</p>
          </div>

                   {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-300 block">Email</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <Input
                  id="email-input"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errorMessage) setErrorMessage(null); }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                  className="pl-10 bg-slate-900 border-slate-700/80 text-white placeholder:text-slate-500 text-sm h-10.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-300 block">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <Input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errorMessage) setErrorMessage(null); }}
                  autoComplete="current-password"
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold h-11 rounded-lg transition-all shadow-md mt-2 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <span>Signing in...</span> : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>
        </div>

        <div className="text-center text-sm text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Supabase Auth & role-based access control enabled</span>
        </div>
      </div>
    </main>
  );
}
