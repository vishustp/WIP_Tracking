'use client';

import { useState, useEffect } from 'react';
import type { AppUserProfile, AppAuditLog, UserGroup, WorkCenterCode } from '@/lib/users/types';
import { getCurrentAppUser } from '@/lib/users/client';
import { createClient } from '@/lib/supabase/client';
import { GROUP_CONFIGS } from '@/lib/permissions';
import {
  User, ShieldCheck, HardHat, Mail, Phone, Building, Clock,
  KeyRound, BellRing, History, CheckCircle2, AlertTriangle, Save,
  RefreshCw, Check, UserCheck, Sparkles, Layers, Factory, ShieldAlert, Lock
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_PERMISSIONS: Record<string, { label: string; permissions: string[]; badgeClass: string }> = {
  admin: {
    label: 'PPC Administrator',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    permissions: [
      'Full Database & Work Order Import / Modification',
      'Issue & Modify Rolling Plans and Pipe Diversions',
      'Production Entry & Scrap Rejection across All Stages',
      'System Configuration, User Management & Audit Logs',
    ],
  },
  manager: {
    label: 'Plant Operations Head',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    permissions: [
      'View All WIP Bottlenecks & KPI Dashboards',
      'Approve Pipe Diversions and Rolling Schedules',
      'Review Production History and Mill Yield Analytics',
      'Audit Compliance and Production Records Access',
    ],
  },
  rolling_incharge: {
    label: 'Rolling Mill In-charge',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    permissions: [
      'Hot Piercing & Rolling Production Entry',
      'Mother Hollow Scrap Rejection & HTC OK Quantity Logging',
      'View Active Rolling Plans & Daily Mill Schedules',
    ],
  },
  draw_operator: {
    label: 'Cold Draw Operator',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    permissions: [
      'Cold Draw Bench Production Logging (Pass Yield)',
      'Draw Stage Scrap & Tag Clearance Entry',
      'View Mother Hollow Available Queue',
    ],
  },
  qa_inspector: {
    label: 'Quality & NDT Inspector',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    permissions: [
      'Heat Treatment & QA Metallurgical Clearance',
      'Scrap Rejection Tagging & Heat Lot Traceability',
      'Inspection Clearance Sign-off',
    ],
  },
  auditor: {
    label: 'Internal Auditor',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    permissions: [
      'Read-only Access to Work Orders, Production & WIP Logs',
      'Export Production & Reconciliation Reports',
      'View System Audit Logs and History',
    ],
  },
};

export default function UserProfileClient() {
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [userLogs, setUserLogs] = useState<AppAuditLog[]>([]);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [shift, setShift] = useState('');
  const [defaultStage, setDefaultStage] = useState('ROLLING');
  const [newPassword, setNewPassword] = useState('');

  // Preferences
  const [prefBottleneck, setPrefBottleneck] = useState(true);
  const [prefRejection, setPrefRejection] = useState(true);
  const [prefTargetAlerts, setPrefTargetAlerts] = useState(true);

  const loadData = async () => {
    try {
      const cur = await getCurrentAppUser();
      setCurrentUser(cur);
      if (!cur) {
        setUserLogs([]);
        return;
      }
      setName(cur.name || '');
      setPhone(cur.phone || '');
      setDepartment(cur.department || '');
      setShift(cur.shift || 'General (09:00 - 17:30)');
      setDefaultStage(cur.default_stage || 'ROLLING');

      const supabase = createClient();
      const { data: logs } = await supabase
        .from('audit_log')
        .select('*')
        .eq('user_id', cur.auth_user_id)
        .order('created_at', { ascending: false })
        .limit(100);
      setUserLogs((logs ?? []) as AppAuditLog[]);
    } catch {
      setCurrentUser(null);
      setUserLogs([]);
      toast.error('Unable to load your Supabase profile.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (!currentUser) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading user profile...
        </div>
      </div>
    );
  }

  const userGroup = (currentUser.group || (currentUser.role === 'admin' ? 'admin' : currentUser.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
  const grpConfig = GROUP_CONFIGS[userGroup] || GROUP_CONFIGS.user;
  const isAdmin = userGroup === 'admin';
  const userWorkCenter = currentUser.work_center || (userGroup === 'admin' || userGroup === 'super_user' ? 'ALL' : 'ROLLING');

  const roleInfo = ROLE_PERMISSIONS[currentUser.role] || {
    label: currentUser.role_title || 'User',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    permissions: ['Standard Access'],
  };

  const handleSave = async () => {
    if (!currentUser) return;
    if (!isAdmin) {
      toast.error('Access Restricted: Only Administrators can modify user profiles and system settings.');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
          session = refreshData?.session || null;
        }
        if (session?.access_token) {
          authHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        if (session?.user?.email) {
          authHeaders['X-User-Email'] = session.user.email;
        } else if (currentUser?.email) {
          authHeaders['X-User-Email'] = currentUser.email;
        }
      } catch {
        if (currentUser?.email) {
          authHeaders['X-User-Email'] = currentUser.email;
        }
      }

      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          id: currentUser.id,
          employee_name: name.trim() || currentUser.name,
          phone: phone.trim(),
          department,
          shift,
          default_stage: defaultStage,
          ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.error || 'Failed to update profile');
      }

      if (newPassword.trim()) {
        setNewPassword('');
      }

      await loadData();
      toast.success('Profile details successfully updated and saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Banner / Identity Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-bold ${currentUser.avatar_color || 'bg-blue-600 text-white'} shadow-sm`}>
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{currentUser.name}</h1>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold border ${grpConfig.badgeClass}`}>
                  {grpConfig.name}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold border ${roleInfo.badgeClass}`}>
                  {roleInfo.label}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-mono font-medium bg-slate-100 text-slate-700">
                  {currentUser.employee_id}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {currentUser.email}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Factory className="h-3.5 w-3.5 text-slate-400" />
                  Work Center: <strong className="text-slate-700">{userWorkCenter === 'ALL' ? 'Plant-Wide (Global)' : userWorkCenter}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Building className="h-3.5 w-3.5" />
                  {currentUser.department}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-500">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>Admin Managed</span>
              </div>
            )}
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm bg-slate-50/80 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600 font-medium">
              <Lock className="h-4 w-4 text-slate-500" />
              <span>User Profile Management: <strong>Restricted to Admin Accounts</strong></span>
            </div>
            <span className="text-sm text-slate-500">Only Administrator can alter department assignments or credentials.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Profile Form & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal & Plant Details Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <User className="h-4 w-4 text-blue-600" />
                <span>Personal & Industrial Information</span>
              </div>
              <span className="text-sm text-slate-400">
                {isAdmin ? 'Editable by Administrator' : 'Read-Only (Managed by Admin)'}
              </span>
            </div>

            {!isAdmin && (
              <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-3 text-sm text-amber-900 flex items-start gap-2.5">
                <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-amber-900">Profile Details Locked:</span> As a member of the{' '}
                  <strong>{grpConfig.name}</strong>, your employee credentials, contact details, and department allocations cannot be edited directly. Only System Administrators have permission to modify profiles.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                    !isAdmin ? 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed' : 'border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Employee Badge / ID</label>
                <input
                  type="text"
                  disabled
                  value={currentUser.employee_id}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Official Email</label>
                <input
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Contact Phone</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                    !isAdmin ? 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed' : 'border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Department / Work Center</label>
                <select
                  disabled={!isAdmin}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                    !isAdmin ? 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300'
                  }`}
                >
                  <option value="Production Planning & Control (PPC)">Production Planning & Control (PPC)</option>
                  <option value="Hot Rolling & Piercing Mill">Hot Rolling & Piercing Mill</option>
                  <option value="Cold Draw Bench & Pilgering">Cold Draw Bench & Pilgering</option>
                  <option value="Quality Assurance & Metallurgical Lab">Quality Assurance & Metallurgical Lab</option>
                  <option value="Plant Operations & Engineering">Plant Operations & Engineering</option>
                  <option value="Management & Audit Team">Management & Audit Team</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Assigned Shift</label>
                <select
                  disabled={!isAdmin}
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                    !isAdmin ? 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300'
                  }`}
                >
                  <option value="Shift A (06:00 - 14:00)">Shift A (06:00 - 14:00)</option>
                  <option value="Shift B (14:00 - 22:00)">Shift B (14:00 - 22:00)</option>
                  <option value="Shift C (22:00 - 06:00)">Shift C (22:00 - 06:00)</option>
                  <option value="General (09:00 - 17:30)">General (09:00 - 17:30)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Default Production Entry Stage</label>
                <select
                  disabled={!isAdmin}
                  value={defaultStage}
                  onChange={(e) => setDefaultStage(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                    !isAdmin ? 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300'
                  }`}
                >
                  <option value="ROLLING">Rolling Mill (Hot Piercing & As-Rolled)</option>
                  <option value="HOLLOW_HEAT_TREATMENT">Hollow Heat Treatment</option>
                  <option value="DRAW">Cold Draw Bench (Die & Plug)</option>
                  <option value="HEAT_TREATMENT">Heat Treatment & Normalizing</option>
                  <option value="FINISHING">Finishing & Final NDT</option>
                </select>
                <p className="text-sm text-slate-400 mt-1">
                  Default stage for production terminal. Managed centrally by Admin.
                </p>
              </div>
            </div>
          </div>

          {/* Supabase Auth Security */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <Lock className="h-4 w-4 text-blue-600" />
                <span>Account Security</span>
              </div>
              <span className="text-sm text-slate-400">Supabase Auth</span>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">New Password</label>
              <input
                type="password"
                disabled={!isAdmin}
                minLength={6}
                placeholder={isAdmin ? 'Enter a new password' : 'Admin Only'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden ${
                  !isAdmin ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' : 'border-slate-300'
                }`}
              />
              <p className="text-sm text-slate-400 mt-1">Passwords are managed by Supabase Auth. No password or PIN is stored in the application database.</p>
            </div>
          </div>

          {/* Shop Floor Notification Preferences */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <BellRing className="h-4 w-4 text-indigo-600" />
                <span>Alerts & Shop Floor Notifications</span>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                <div>
                  <div className="font-semibold text-slate-800">Bottleneck Alert (WIP &gt; 500m)</div>
                  <div className="text-sm text-slate-500">Notify when any stage exceeds critical WIP capacity limit</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefBottleneck}
                  onChange={(e) => setPrefBottleneck(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                <div>
                  <div className="font-semibold text-slate-800">Scrap Rejection Spike (&gt; 5%)</div>
                  <div className="text-sm text-slate-500">Flag work orders exceeding scrap threshold in rolling or draw</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefRejection}
                  onChange={(e) => setPrefRejection(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                <div>
                  <div className="font-semibold text-slate-800">SLA Target Date Reminder</div>
                  <div className="text-sm text-slate-500">Highlight pending orders due within 7 days</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefTargetAlerts}
                  onChange={(e) => setPrefTargetAlerts(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Role Matrix & Activity */}
        <div className="space-y-6">
          {/* Group Authority & Deletion Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>Group Authority & Deletion</span>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${grpConfig.badgeClass}`}>
                {grpConfig.name.toUpperCase()}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm space-y-2">
              <div className="font-semibold text-slate-900">
                {userGroup === 'admin' && '👑 Full Administrator Access'}
                {userGroup === 'super_user' && '⚡ Super User Access'}
                {userGroup === 'user' && '🔒 Work-Center Restricted User'}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {userGroup === 'admin' && 'Can delete data across all work centers, create/edit/remove user accounts, and configure system settings.'}
                {userGroup === 'super_user' && 'Can delete data from ANY work center across the entire plant. Cannot manage system users or administrative settings.'}
                {userGroup === 'user' && `Can ONLY edit and delete production data within assigned work center (${userWorkCenter}). Deletions in other work centers are strictly blocked.`}
              </p>
            </div>
          </div>

          {/* Role & Permissions Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm border-b border-slate-100 pb-3">
              <HardHat className="h-4 w-4 text-amber-600" />
              <span>Plant Role Privileges</span>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800 mb-1">{roleInfo.label}</div>
              <p className="text-sm text-slate-500 mb-3">
                Authorized capabilities based on your active plant designation.
              </p>

              <div className="space-y-2 text-sm">
                {roleInfo.permissions.map((perm, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-sm leading-tight">{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-sm text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Account Created:</span>
                <span className="font-mono text-slate-700">{new Date(currentUser.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Active:</span>
                <span className="font-mono text-slate-700">{currentUser.last_login ? new Date(currentUser.last_login).toLocaleTimeString() : 'Active Now'}</span>
              </div>
            </div>
          </div>

          {/* User Recent Activity Log */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <History className="h-4 w-4 text-slate-600" />
                <span>My Recent Activity</span>
              </div>
              <span className="text-xs text-slate-400">{userLogs.length} events</span>
            </div>

            {userLogs.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">
                No recent actions recorded for this profile.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {userLogs.slice(0, 6).map((log) => (
                  <div key={log.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-sm">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-slate-600">{(log.action_type || 'Activity').replace(/_/g, ' ')}</span>
                      <span>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-snug">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
