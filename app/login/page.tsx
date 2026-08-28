'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const s = createClient();
    const { error } = await s.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      location.href = '/dashboard';
    }
  };

  const handleDemoSignIn = async () => {
    setLoading(true);
    const s = createClient();
    await s.auth.signInWithPassword({ email: 'admin@seamlesswip.com', password: 'password123' });
    location.href = '/dashboard';
  };

  return (
    <main className="grid min-h-screen place-items-center p-6 bg-slate-50">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Seamless WIP</h1>
          <p className="text-sm text-slate-500">Sign in to your production management portal</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-700">Email</label>
            <Input type="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Password</label>
            <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <Button className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</Button>
        </form>
        <div className="relative my-3">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-500">Or</span></div>
        </div>
        <Button type="button" className="w-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" onClick={handleDemoSignIn}>
          Continue as PPC Admin (Demo)
        </Button>
      </div>
    </main>
  );
}

