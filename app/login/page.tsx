'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowRight, ShieldCheck, Factory, HardHat, LayoutDashboard } from 'lucide-react';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@seamlesswip.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);

  const performLogin = async (targetEmail: string, roleTitle: string) => {
    setLoading(true);
    try {
      if (typeof document !== 'undefined') {
        document.cookie = `demo_user=${encodeURIComponent(targetEmail)}; path=/; max-age=864000; SameSite=None; Secure`;
      }
      
      const s = createClient();
      try {
        await s.auth.signInWithPassword({ email: targetEmail, password: password || 'password123' });
      } catch (err) {
        console.warn('Backend Supabase auth bypassed for demo mode', err);
      }
      
      toast.success(`Entering as ${roleTitle}`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, 'User');
  };

  return (
    <main className="grid min-h-screen place-items-center p-6 bg-slate-900 text-slate-100 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Factory className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Seamless WIP</h1>
          <p className="text-xs text-slate-400">Tube Mill Production Planning & Stage Tracking Portal</p>
        </div>

        {/* Direct Access Link */}
        <div>
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500"
          >
            <LayoutDashboard className="h-4 w-4" />
            Enter Dashboard Directly
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* 1-Click Demo Login Personas */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
            Or choose a role profile
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => performLogin('admin@seamlesswip.com', 'PPC Administrator')}
              className="flex items-center justify-between rounded-xl border border-blue-500/40 bg-blue-950/30 px-3.5 py-2.5 text-left text-xs transition hover:bg-blue-900/40 hover:border-blue-400 group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <div>
                  <div className="font-semibold text-white">PPC Administrator</div>
                  <div className="text-[10px] text-slate-400">Full access: Orders, Planning, WIP, Diversions</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => performLogin('rolling@seamlesswip.com', 'Rolling In-charge')}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-left text-xs transition hover:bg-slate-800/80 hover:border-slate-700 group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <HardHat className="h-4 w-4 text-amber-400" />
                <div>
                  <div className="font-semibold text-white">Rolling & Mill In-charge</div>
                  <div className="text-[10px] text-slate-400">Production entry, scrap rejection & HTC logging</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        </div>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-slate-950 px-2 text-slate-500 font-medium">Or custom sign in</span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-medium text-slate-300">Email Address</label>
            <Input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="font-medium text-slate-300">Password</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            {loading ? 'Entering Portal...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}


