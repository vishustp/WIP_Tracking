'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { mockStore, MockUserProfile, DEFAULT_USERS } from '@/lib/supabase/mock-store';
import { ROLE_CONFIGS, getRoleConfig } from '@/lib/permissions';
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
  Check
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<MockUserProfile[]>(DEFAULT_USERS);
  const [activeUser, setActiveUser] = useState<MockUserProfile | null>(null);
  const [selectedRoleEmail, setSelectedRoleEmail] = useState<string>('admin@seamlesswip.com');
  const [inputEmail, setInputEmail] = useState('admin@seamlesswip.com');
  const [inputPin, setInputPin] = useState('1234');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'personas' | 'custom'>('personas');

  useEffect(() => {
    mockStore.loadFromStorage();
    setUsers([...mockStore.users]);
    const current = mockStore.getCurrentUser();
    setActiveUser(current);
  }, []);

  const executeLogin = async (targetEmail: string, pinProvided?: string) => {
    setLoading(true);
    try {
      mockStore.loadFromStorage();
      const matchedUser = mockStore.users.find(
        (u) => u.email.toLowerCase() === targetEmail.toLowerCase()
      );

      if (!matchedUser) {
        toast.error(`No user profile found for email: ${targetEmail}`);
        setLoading(false);
        return;
      }

      if (!matchedUser.active) {
        toast.error('This user account has been disabled by the PPC Administrator.');
        setLoading(false);
        return;
      }

      // Check PIN if provided from custom form
      if (pinProvided && matchedUser.pin && matchedUser.pin !== pinProvided && pinProvided !== '1234') {
        toast.error(`Invalid Security PIN for ${matchedUser.name}. Try default PIN.`);
        setLoading(false);
        return;
      }

      // 1. Set cookie for SSR & middleware compatibility
      if (typeof document !== 'undefined') {
        document.cookie = `demo_user=${encodeURIComponent(matchedUser.email)}; path=/; max-age=864000; SameSite=Lax`;
      }

      // 2. Set active user in mockStore and localStorage
      mockStore.setCurrentUser(matchedUser.email);
      setActiveUser(matchedUser);

      // 3. Optional Supabase client signIn attempt if backend is connected
      try {
        const s = createClient();
        await s.auth.signInWithPassword({
          email: matchedUser.email,
          password: 'password123',
        });
      } catch {
        // demo fallback
      }

      toast.success(`Logged in as ${matchedUser.name} (${matchedUser.role_title})`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Login encountered an issue');
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
    setInputPin(userItem.pin || '1234');
    executeLogin(userItem.email);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-900/20">
            <Factory className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Seamless WIP Portal
          </h1>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Tube Mill Production Planning, Stage WIP Tracking & Role-Based Access Control
          </p>
        </div>

        {/* Active Session Card (If logged in) */}
        {activeUser && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-950/40 p-4 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3 text-left">
              <div className="h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
                {activeUser.name.charAt(0)}
              </div>
              <div>
                <div className="text-xs text-blue-300 font-medium">Currently active session:</div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {activeUser.name}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 font-medium">
                    {activeUser.role_title}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{activeUser.department}</div>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500 transition-all cursor-pointer whitespace-nowrap"
            >
              <LayoutDashboard className="h-4 w-4" />
              Continue to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center justify-center gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('personas')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'personas'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Role Profiles & 1-Click Login (6 Personas)
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
        {activeTab === 'personas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Select a Persona to test Role-Based Permissions:
              </span>
              <span className="text-[11px] text-slate-500">
                Click any profile to instantly authenticate
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {users.map((userItem) => {
                const config = getRoleConfig(userItem.role);
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
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-500/40">
                            <Check className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span
                            className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                              config.badgeClass
                            }`}
                          >
                            {userItem.role}
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

                      {/* Deletion Permission Indicator */}
                      <div className="my-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800/80 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Delete Entries:</span>
                          {config.canDeleteProductionEntry ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Allowed (Admin)
                            </span>
                          ) : (
                            <span className="text-rose-400 font-semibold flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Restricted
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Create Plans:</span>
                          <span
                            className={
                              config.canCreateRollingPlan
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-400'
                            }
                          >
                            {config.canCreateRollingPlan ? 'Yes' : 'View Only'}
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
                Enter your registered corporate email and 4-digit security PIN
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
                <label className="font-semibold text-slate-300">Security PIN / Password</label>
                <Input
                  type="password"
                  placeholder="1234"
                  maxLength={10}
                  value={inputPin}
                  onChange={(e) => setInputPin(e.target.value)}
                  className="mt-1.5 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500 font-mono tracking-wider"
                  required
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Default demo PIN: 1234</span>
                  <span>(Admin: 1234, Manager: 5566)</span>
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
