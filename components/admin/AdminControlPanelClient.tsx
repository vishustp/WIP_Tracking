'use client';

import { useState, useEffect, useMemo } from 'react';
import type {
  AppUserProfile, AppAuditLog, AppRoute, AppStage, UserRole, UserGroup, WorkCenterCode
} from '@/lib/users/types';
import { getCurrentAppUser, getAppUsers } from '@/lib/users/client';
import { GROUP_CONFIGS, usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import {
  ShieldCheck, Users, Sliders, Activity, Database, Plus, Search,
  Edit2, Trash2, CheckCircle2, XCircle, RotateCcw, Download, Upload,
  KeyRound, Shield, AlertTriangle, RefreshCw, Layers, Check, X,
  Save, Filter, Lock, HardHat, Factory, UserCheck, ShieldAlert,
  Eye, EyeOff, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export const GROUP_OPTIONS: { value: UserGroup; label: string; description: string; badge: string; iconColor: string }[] = [
  {
    value: 'admin',
    label: 'Admin Group',
    description: 'Global authority: Delete data across all work centers, create/edit/remove users, and modify system settings.',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    iconColor: 'text-blue-600',
  },
  {
    value: 'super_user',
    label: 'Super User Group',
    description: 'Global authority: Delete data from any work center, manage plans, and perform operations plant-wide.',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    iconColor: 'text-purple-600',
  },
  {
    value: 'user',
    label: 'User Group',
    description: 'Work Center constrained: Can only edit/delete data from their specifically assigned work center.',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    iconColor: 'text-amber-600',
  },
];

export const WORK_CENTER_OPTIONS: { value: WorkCenterCode; label: string; stages: string[] }[] = [
  { value: 'ALL', label: 'All Work Centers (Global Access)', stages: ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'] },
  { value: 'ROLLING', label: 'Hot Rolling & Piercing Mill', stages: ['ROLLING'] },
  { value: 'HOLLOW_HEAT_TREATMENT', label: 'Hollow Heat Treatment (Furnace)', stages: ['HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT'] },
  { value: 'DRAW', label: 'Cold Draw Bench & Pilgering', stages: ['DRAW'] },
  { value: 'HEAT_TREATMENT', label: 'Final Heat Treatment (Furnace)', stages: ['HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT'] },
  { value: 'FINISHING', label: 'Finishing & NDT Inspection', stages: ['FINISHING'] },
  { value: 'QA', label: 'Quality Assurance & Metallurgical Lab', stages: ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'] },
  { value: 'AUDIT', label: 'Audit & Compliance (Read-only)', stages: [] },
];

const ROLE_OPTIONS: { value: UserRole; label: string; department: string; color: string; defaultGroup: UserGroup; defaultWorkCenter: WorkCenterCode }[] = [
  { value: 'admin', label: 'PPC Administrator', department: 'Production Planning & Control (PPC)', color: 'bg-blue-600 text-white', defaultGroup: 'admin', defaultWorkCenter: 'ALL' },
  { value: 'manager', label: 'Plant Operations Head', department: 'Plant Operations & Engineering', color: 'bg-purple-600 text-white', defaultGroup: 'super_user', defaultWorkCenter: 'ALL' },
  { value: 'rolling_incharge', label: 'Rolling Mill In-charge', department: 'Hot Rolling & Piercing Mill', color: 'bg-amber-600 text-white', defaultGroup: 'user', defaultWorkCenter: 'ROLLING' },
  { value: 'draw_operator', label: 'Cold Draw Operator', department: 'Cold Draw Bench & Pilgering', color: 'bg-indigo-600 text-white', defaultGroup: 'user', defaultWorkCenter: 'DRAW' },
  { value: 'qa_inspector', label: 'Quality & NDT Inspector', department: 'Quality Assurance & Metallurgical Lab', color: 'bg-emerald-600 text-white', defaultGroup: 'user', defaultWorkCenter: 'QA' },
  { value: 'finishing_operator', label: 'Finishing & NDT Operator', department: 'Finishing & NDT Inspection', color: 'bg-teal-600 text-white', defaultGroup: 'user', defaultWorkCenter: 'FINISHING' },
  { value: 'auditor', label: 'Internal Auditor', department: 'Management & Audit Team', color: 'bg-slate-600 text-white', defaultGroup: 'user', defaultWorkCenter: 'AUDIT' },
];

function mapAppUserToMockUser(row: any): AppUserProfile {
  if (!row) return {} as AppUserProfile;
  const roleMap: Record<string, { role: UserRole; group: UserGroup; title: string }> = {
    Admin: { role: 'admin', group: 'admin', title: 'PPC Administrator' },
    PPC: { role: 'manager', group: 'super_user', title: 'Plant Operations Head' },
    Production: { role: 'rolling_incharge', group: 'user', title: 'Production Operator' },
    QA: { role: 'qa_inspector', group: 'user', title: 'Quality & NDT Inspector' },
    Viewer: { role: 'auditor', group: 'user', title: 'Viewer' },
  };
  const mapped = roleMap[row.role] || roleMap.Viewer;
  const wc = String(row.work_center || 'ALL');
  const name = String(row.name || row.employee_name || row.email || 'User');
  const employeeId = String(row.employee_id || row.employee_code || '');

  return {
    id: String(row.id || ''),
    email: String(row.email || ''),
    name,
    employee_id: employeeId,
    group: (row.group || row.user_group || mapped.group) as UserGroup,
    role: (row.role && roleMap[row.role] ? roleMap[row.role].role : row.role || mapped.role) as UserRole,
    role_title: String(row.role_title || mapped.title),
    department: String(row.department || ''),
    shift: String(row.shift || ''),
    work_center: wc,
    allowed_stages: Array.isArray(row.allowed_stages)
      ? row.allowed_stages
      : (wc === 'ALL' ? ['ROLLING','HOLLOW_HEAT_TREATMENT','DRAW','HEAT_TREATMENT','FINISHING'] : [wc]),
    default_stage: String(row.default_stage || (wc === 'ALL' ? 'ROLLING' : wc)),
    phone: String(row.phone || ''),
    active: row.active !== false,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export default function AdminControlPanelClient() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'admin_panel'), [user]);
  const canAdminister = formAccess.isAllowed;

  const [activeTab, setActiveTab] = useState<'users' | 'routes' | 'guardrails' | 'audit' | 'maintenance'>('users');
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [routes, setRoutes] = useState<AppRoute[]>([]);
  const [stages, setStages] = useState<AppStage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AppAuditLog[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // User search & filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');

  // Audit search & filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('ALL');

  // User modal / drawer state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUserProfile | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    employee_id: '',
    group: 'user' as UserGroup,
    work_center: 'ROLLING' as WorkCenterCode,
    role: 'rolling_incharge' as UserRole,
    department: 'Hot Rolling & Piercing Mill',
    shift: 'Shift A (06:00 - 14:00)',
    default_stage: 'ROLLING',
    phone: '',
    pin: '',
  });

  // Guardrails state (persisted in localStorage)
  const [cappingTolerance, setCappingTolerance] = useState(100);
  const [steelDensity, setSteelDensity] = useState(7.85);
  const [rejectionThreshold, setRejectionThreshold] = useState(5.0);
  const [scrapYieldPercent, setScrapYieldPercent] = useState(5.0);
  const [allowOverRolling, setAllowOverRolling] = useState(true);

  // Reset confirmation modal
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Helper to obtain authorization headers with the Supabase access token
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const supabase = createClient();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
        session = refreshData?.session || null;
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      if (session?.user?.email) {
        headers['X-User-Email'] = session.user.email;
      } else if (currentUser?.email) {
        headers['X-User-Email'] = currentUser.email;
      }
    } catch {
      if (currentUser?.email) {
        headers['X-User-Email'] = currentUser.email;
      }
    }
    return headers;
  };

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      const [routesRes, stagesRes, auditRes, current] = await Promise.all([
        supabase.from('process_routes').select('*').order('route_code'),
        supabase.from('process_stages').select('*').order('stage_code'),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(1000),
        getCurrentAppUser(),
      ]);

      if (routesRes.data) setRoutes(routesRes.data as AppRoute[]);
      if (stagesRes.data) setStages(stagesRes.data as AppStage[]);
      if (auditRes.data) {
        setAuditLogs((auditRes.data).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          user_email: row.user_id === current?.auth_user_id ? (current?.email ?? '') : '',
          user_name: row.user_id === current?.auth_user_id ? (current?.name ?? '') : '',
          action_type: row.action,
          entity_type: row.entity,
          entity_id: row.record_id || undefined,
          details: row.new_value || row.old_value ? JSON.stringify(row.new_value || row.old_value) : '',
          created_at: row.created_at,
        })) as AppAuditLog[]);
      }
      if (current) setCurrentUser(current as AppUserProfile | null);
    } catch (error) {
      console.warn('Failed to load routes/stages/audit:', error);
    }

    try {
      let loadedUsers: AppUserProfile[] = [];
      try {
        const authHeaders = await getAuthHeaders();
        const response = await fetch('/api/admin/users', {
          headers: authHeaders,
          credentials: 'include',
          cache: 'no-store',
        });
        if (response.ok) {
          const json = await response.json();
          if (Array.isArray(json.users) && json.users.length > 0) {
            loadedUsers = json.users.map(mapAppUserToMockUser) as AppUserProfile[];
          }
        }
      } catch (e) {
        console.warn('API users fetch failed, trying direct Supabase query:', e);
      }

      if (loadedUsers.length === 0) {
        try {
          const directUsers = await getAppUsers();
          if (directUsers && directUsers.length > 0) {
            loadedUsers = directUsers;
          }
        } catch (e) {
          console.warn('Direct users query failed:', e);
        }
      }

      setUsers(loadedUsers);
    } catch (error) {
      console.error('Error in user directory loading:', error);
    } finally {
      setLoading(false);
    }

    if (typeof window !== 'undefined') {
      const savedTol = localStorage.getItem('seamless_wip_capping_tol');
      if (savedTol) setCappingTolerance(Number(savedTol));
      const savedDensity = localStorage.getItem('seamless_wip_density');
      if (savedDensity) setSteelDensity(Number(savedDensity));
      const savedRej = localStorage.getItem('seamless_wip_rej_threshold');
      if (savedRej) setRejectionThreshold(Number(savedRej));
      const savedScrapYield = localStorage.getItem('seamless_wip_scrap_yield_pct');
      if (savedScrapYield) setScrapYieldPercent(Number(savedScrapYield));
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = (userSearch ?? '').toLowerCase().trim();
    return users.filter(u => {
      if (!u) return false;
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchGroup = groupFilter === 'ALL' || (u.group || 'user') === groupFilter;
      if (!q) return matchRole && matchGroup;

      const name = String(u.name || (u as any).employee_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const empId = String(u.employee_id || (u as any).employee_code || '').toLowerCase();
      const dept = String(u.department || '').toLowerCase();
      const wc = String(u.work_center || '').toLowerCase();

      const matchSearch =
        name.includes(q) ||
        email.includes(q) ||
        empId.includes(q) ||
        dept.includes(q) ||
        wc.includes(q);
      return matchRole && matchGroup && matchSearch;
    });
  }, [users, roleFilter, groupFilter, userSearch]);

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    const qAudit = String(auditSearch ?? '').toLowerCase().trim();
    return auditLogs.filter(log => {
      if (!log) return false;
      const matchType = auditTypeFilter === 'ALL' || log.action_type === auditTypeFilter;
      if (!qAudit) return matchType;
      const matchSearch =
        String(log.user_name ?? '').toLowerCase().includes(qAudit) ||
        String(log.user_email ?? '').toLowerCase().includes(qAudit) ||
        String(log.details ?? '').toLowerCase().includes(qAudit) ||
        (Boolean(log.entity_id) && String(log.entity_id).toLowerCase().includes(qAudit));
      return matchType && matchSearch;
    });
  }, [auditLogs, auditTypeFilter, auditSearch]);

  // Handle open Add User modal
  const openAddUser = () => {
    setEditingUser(null);
    setShowPin(false);
    setFormData({
      name: '',
      email: '',
      employee_id: `EMP-${Math.floor(100 + Math.random() * 900)}`,
      group: 'user',
      work_center: 'ROLLING',
      role: 'rolling_incharge',
      department: 'Hot Rolling & Piercing Mill',
      shift: 'Shift A (06:00 - 14:00)',
      default_stage: 'ROLLING',
      phone: '+91 ',
      pin: 'TempPass123!',
    });
    setIsUserModalOpen(true);
  };

  // Handle open Edit User modal
  const openEditUser = (user: AppUserProfile) => {
    setEditingUser(user);
    setShowPin(false);
    const uName = user.name || (user as any).employee_name || '';
    const uEmpId = user.employee_id || (user as any).employee_code || '';
    setFormData({
      name: uName,
      email: user.email || '',
      employee_id: uEmpId,
      group: user.group || (user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'super_user' : 'user'),
      work_center: (user.work_center as WorkCenterCode) || (user.role === 'admin' || user.role === 'manager' ? 'ALL' : 'ROLLING'),
      role: user.role,
      department: user.department || '',
      shift: user.shift || '',
      default_stage: user.default_stage || 'ROLLING',
      phone: user.phone || '',
      pin: '',
    });
    setIsUserModalOpen(true);
  };

  // Handle save user through the real Supabase-backed Admin API.
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can create or modify users.');
      return;
    }
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Full Name and Email Address are required.');
      return;
    }

    const roleConfig = ROLE_OPTIONS.find(r => r.value === formData.role);
    const apiRole =
      formData.group === 'admin' ? 'Admin' :
      formData.group === 'super_user' ? 'PPC' :
      formData.role === 'qa_inspector' ? 'QA' :
      formData.role === 'auditor' ? 'Viewer' : 'Production';

    const payload: any = {
      employee_name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      employee_code: formData.employee_id.trim() || `EMP-${Date.now().toString().slice(-6)}`,
      role: apiRole,
      user_group: formData.group,
      role_title: roleConfig?.label || '',
      work_center: formData.work_center,
      department: formData.department,
      shift: formData.shift,
      allowed_stages: WORK_CENTER_OPTIONS.find(w => w.value === formData.work_center)?.stages || [],
      default_stage: formData.default_stage,
      phone: formData.phone.trim(),
      active: true,
    };

    if (!editingUser) {
      if (!formData.pin.trim()) {
        toast.error('Set an initial password of at least 8 characters.');
        return;
      }
      if (formData.pin.trim().length < 8) {
        toast.error('Password must be at least 8 characters long.');
        return;
      }
      payload.password = formData.pin.trim();
    } else {
      payload.id = editingUser.id;
      if (formData.pin.trim()) {
        if (formData.pin.trim().length < 8) {
          toast.error('Password must be at least 8 characters long.');
          return;
        }
        payload.password = formData.pin.trim();
      }
      payload.active = editingUser.active;
    }

    setIsSavingUser(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/admin/users', {
        method: editingUser ? 'PUT' : 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(json.error || 'Your admin session has expired. Please sign out and sign back in to continue.');
        }
        throw new Error(json.error || `Unable to save user (Status ${response.status})`);
      }

      setIsUserModalOpen(false);
      await loadData();
      toast.success(editingUser ? `User ${formData.name} updated successfully` : `User ${formData.name} created successfully`);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to save user');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Disable/enable an account without deleting historical WIP data.
  const handleToggleUser = async (userId: string) => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can enable or disable users.');
      return;
    }
    const target = users.find(u => u.id === userId);
    if (!target) return;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ id: userId, active: !target.active }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Unable to change user status');
      await loadData();
      const displayName = target.name || (target as any).employee_name || target.email || 'User';
      toast.success(`${displayName} is now ${!target.active ? 'Active' : 'Disabled'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to change user status');
    }
  };

  // Deactivate instead of deleting the Auth identity. This preserves audit/history.
  const handleDeleteUser = async (user: AppUserProfile) => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can deactivate users.');
      return;
    }
    if (user.email === 'admin@seamlesswip.com') {
      toast.error('Primary Administrator account cannot be deactivated.');
      return;
    }
    const displayName = user.name || (user as any).employee_name || user.email || 'User';
    if (!confirm(`Deactivate user ${displayName}? Historical WIP records will be preserved.`)) return;

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ id: user.id, active: false }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Unable to deactivate user');
      await loadData();
      toast.success(`User ${displayName} deactivated`);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to deactivate user');
    }
  };

  // Toggle route active
  const handleToggleRoute = async (routeId: string) => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can modify routes.');
      return;
    }
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from('process_routes').update({ active: !route.active }).eq('id', routeId);
      if (error) throw new Error(error.message);
      await supabase.from('audit_log').insert({
        user_id: currentUser?.auth_user_id,
        action: 'ROUTE_CONFIG',
        entity: 'Process Route',
        record_id: routeId,
        new_value: { route_code: route.route_code, active: !route.active },
      });
      await loadData();
      toast.success(`Route ${route.route_code} updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update route.');
    }
  };

  // Save guardrails settings
  const handleSaveGuardrails = () => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can update guardrail settings.');
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('seamless_wip_capping_tol', String(cappingTolerance));
      localStorage.setItem('seamless_wip_density', String(steelDensity));
      localStorage.setItem('seamless_wip_rej_threshold', String(rejectionThreshold));
      localStorage.setItem('seamless_wip_scrap_yield_pct', String(scrapYieldPercent));
    }
    void createClient().from('audit_log').insert({
      user_id: currentUser?.auth_user_id,
      action: 'ROUTE_CONFIG',
      entity: 'System Settings',
      new_value: { cappingTolerance, steelDensity, rejectionThreshold, scrapYieldPercent, allowOverRolling },
    });
    toast.success('Plant guardrails and operational parameters saved');
  };

  // Export the live Supabase data as a JSON backup
  const handleExportBackup = async () => {
    try {
      const supabase = createClient();
      const [workOrders, rollingPlans, diversions, productionLogs, usersRes, auditLogs, routesRes, stagesRes] = await Promise.all([
        supabase.from('work_orders').select('*'),
        supabase.from('rolling_plans').select('*'),
        supabase.from('diversion_plans').select('*'),
        supabase.from('production_logs').select('*'),
        supabase.from('app_users').select('*'),
        supabase.from('audit_log').select('*'),
        supabase.from('process_routes').select('*'),
        supabase.from('process_stages').select('*'),
      ]);
      const results = [workOrders, rollingPlans, diversions, productionLogs, usersRes, auditLogs, routesRes, stagesRes];
      const failed = results.find(r => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      const backupData = {
        timestamp: new Date().toISOString(),
        source: 'Supabase',
        workOrders: workOrders.data ?? [],
        rollingPlans: rollingPlans.data ?? [],
        diversions: diversions.data ?? [],
        productionLogs: productionLogs.data ?? [],
        users: usersRes.data ?? [],
        auditLogs: auditLogs.data ?? [],
        routes: routesRes.data ?? [],
        stages: stagesRes.data ?? [],
      };
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const anchor = document.createElement('a');
      anchor.href = dataStr;
      anchor.download = `seamless_wip_supabase_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.success('Supabase database backup exported successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup export failed.');
    }
  };

  // Reset transactional data in Supabase. Master routes/stages and Auth users remain intact.
  const handleResetData = async () => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group can reset factory data.');
      return;
    }

    try {
      // 1. First attempt: Server API with elevated service credentials
      try {
        const res = await fetch('/api/admin/reset-factory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            await loadData();
            setIsResetConfirmOpen(false);
            toast.success('Factory database transactional data cleared');
            return;
          }
        }
      } catch {
        // Fall through to client RPC or direct deletion
      }

      // 2. Second attempt: Database RPC if migration 035 is applied
      const supabase = createClient();
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('reset_factory_data');
      if (!rpcErr && (rpcRes as any)?.success) {
        await loadData();
        setIsResetConfirmOpen(false);
        toast.success('Factory database transactional data cleared');
        return;
      }

      // 3. Third attempt: Direct client deletion in safe foreign key cascade order
      // Deleting work_orders automatically cascade-deletes work_order_wip in Postgres
      for (const table of ['diversion_plans', 'production_logs', 'rolling_plans', 'work_orders']) {
        const { error } = await supabase.from(table).delete().not('id', 'is', null);
        if (error) throw new Error(`${table}: ${error.message}`);
      }

      // Optional cleanup of work_order_wip if any standalone rows exist
      try {
        await supabase.from('work_order_wip').delete().not('id', 'is', null);
      } catch {
        // Ignored safely as work_orders cascade delete already wiped related WIP records
      }

      await loadData();
      setIsResetConfirmOpen(false);
      toast.success('Factory database transactional data cleared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reset Supabase data.');
    }
  };

  // Export audit logs to CSV
  const handleExportAuditCSV = () => {
    const headers = ['ID,Date Time,User Name,User Email,Action Type,Entity Type,Details,IP Address'];
    const rows = filteredAuditLogs.map(l =>
      `"${l.id}","${l.created_at}","${l.user_name}","${l.user_email}","${l.action_type}","${l.entity_type}","${(l.details || '').replace(/"/g, '""')}","${l.ip_address || ''}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers, ...rows].join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `seamless_wip_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('Audit trail CSV downloaded');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Form Accessibility Banner */}
      <FormAccessBanner access={formAccess} />

      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Admin Control Panel</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Plant RBAC, user directory, process routes, system guardrails and audit logs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export Backup</span>
            </button>
            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700 shadow-xs hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
              <span>Reset Factory Data</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100 text-sm">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-sm font-medium text-slate-500">Active Operators & Staff</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
              {users.filter(u => u.active).length} <span className="text-sm font-normal text-slate-400">/ {users.length}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-sm font-medium text-slate-500">Process Routes Master</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
              {routes.filter(r => r.active).length} <span className="text-sm font-normal text-slate-400">Active</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-sm font-medium text-slate-500">Shop Floor Stages</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
              {stages.length} <span className="text-sm font-normal text-slate-400">Work Centers</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-sm font-medium text-slate-500">Audit Compliance Logs</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
              {auditLogs.length} <span className="text-sm font-normal text-slate-400">Records</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === 'users' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>User Management & RBAC ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('routes')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === 'routes' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Routes & Stages ({routes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guardrails')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === 'guardrails' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Plant Guardrails & Parameters</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === 'audit' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Audit Trail & Compliance</span>
          </button>
        </div>
      </div>

      {/* Tab 1: User Management */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, badge, work center..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Group Filter */}
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">All Groups ({users.length})</option>
                <option value="admin">Admin Group</option>
                <option value="super_user">Super User Group</option>
                <option value="user">User Group (Work Center)</option>
              </select>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">All Roles</option>
                <option value="admin">PPC Administrator</option>
                <option value="manager">Plant Operations Head</option>
                <option value="rolling_incharge">Rolling Mill In-charge</option>
                <option value="draw_operator">Cold Draw Operator</option>
                <option value="qa_inspector">QA Inspector</option>
                <option value="auditor">Auditor</option>
              </select>
            </div>

            <button
              type="button"
              onClick={openAddUser}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-500 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add New User</span>
            </button>
          </div>

          {/* User Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50/80 text-sm font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Operator / Staff</th>
                    <th className="py-3 px-4">User Group & Authority</th>
                    <th className="py-3 px-4">Assigned Work Center</th>
                    <th className="py-3 px-4">Role & Department</th>
                    <th className="py-3 px-4">Shift</th>
                    <th className="py-3 px-4">Terminal PIN</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No users matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const grp = (user.group || (user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
                      const grpConfig = GROUP_CONFIGS[grp] || GROUP_CONFIGS.user;
                      const wc = user.work_center || (grp === 'admin' || grp === 'super_user' ? 'ALL' : 'ROLLING');
                      const wcLabel = WORK_CENTER_OPTIONS.find(w => w.value === wc)?.label || wc;

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-sm ${user.avatar_color || 'bg-slate-600 text-white'}`}>
                                {String(user.name || (user as any).employee_name || user.email || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{user.name || (user as any).employee_name || user.email || 'Unnamed User'}</div>
                                <div className="text-sm text-slate-500 flex items-center gap-2">
                                  <span className="font-mono">{user.employee_id || (user as any).employee_code || '—'}</span>
                                  <span>•</span>
                                  <span>{user.email}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold border ${grpConfig.badgeClass}`}>
                                {grpConfig.name}
                              </span>
                              <div className="text-xs text-slate-500 font-medium">
                                {grp === 'admin' ? (
                                  <span className="text-blue-700 font-semibold">Global Delete + Users & Settings</span>
                                ) : grp === 'super_user' ? (
                                  <span className="text-purple-700 font-semibold">Global Delete (Any Work Center)</span>
                                ) : (
                                  <span className="text-amber-700 font-semibold">Work Center Delete & Edit Only</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md text-sm">
                              <Factory size={11} className="text-slate-500" />
                              {wc === 'ALL' ? 'Global (All Centers)' : wcLabel}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{user.role_title}</div>
                            <div className="text-xs text-slate-500">{user.department}</div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-slate-800">{user.shift}</div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md text-sm">
                              •••• ({user.pin || '1234'})
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleUser(user.id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium transition cursor-pointer ${
                                user.active
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                            >
                              {user.active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              <span>{user.active ? 'Active' : 'Disabled'}</span>
                            </button>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditUser(user)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                                title="Edit User Details"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              {user.email !== 'admin@seamlesswip.com' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user)}
                                  className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition-colors"
                                  title="Delete User"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Routes & Stages */}
      {activeTab === 'routes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Process Routes */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>Process Routes Master</span>
                </div>
                <span className="text-sm text-slate-400">{routes.length} standard routes</span>
              </div>

              <div className="divide-y divide-slate-100">
                {routes.map((route) => (
                  <div key={route.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm font-mono">{route.route_code}</span>
                        <span className="text-sm px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-medium">
                          {route.material_category}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500 mt-0.5">{route.route_name}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleRoute(route.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
                        route.active
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {route.active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      <span>{route.active ? 'Active' : 'Disabled'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Process Stages */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Factory className="h-4 w-4 text-amber-600" />
                  <span>Shop Floor Stages Master</span>
                </div>
                <span className="text-sm text-slate-400">{stages.length} work centers</span>
              </div>

              <div className="divide-y divide-slate-100">
                {stages.map((stage, idx) => (
                  <div key={stage.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 text-sm font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{stage.stage_name}</div>
                        <div className="text-xs text-slate-500 font-mono">{stage.stage_code}</div>
                      </div>
                    </div>

                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Standard Stage
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Guardrails & Parameters */}
      {activeTab === 'guardrails' && (
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Plant Operational Guardrails & Tolerances</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Set mill mathematical constants, maximum over-rolling allowances, and scrap spike triggers.
              </p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Rolling Capping Tolerance (%)
                  </label>
                  <input
                    type="number"
                    min={90}
                    max={120}
                    step={1}
                    value={cappingTolerance}
                    onChange={(e) => setCappingTolerance(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                  <p className="text-sm text-slate-400 mt-1">Default 100%. Set to 105% to allow 5% yield over-rolling buffer.</p>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Steel Density ($g/cm^3$)
                  </label>
                  <input
                    type="number"
                    min={7.0}
                    max={8.5}
                    step={0.01}
                    value={steelDensity}
                    onChange={(e) => setSteelDensity(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                  <p className="text-sm text-slate-400 mt-1">Standard 7.85 for carbon & alloy seamless pipe calculation.</p>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Scrap Rejection Spike Alert (%)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={0.5}
                    value={rejectionThreshold}
                    onChange={(e) => setRejectionThreshold(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                  <p className="text-sm text-slate-400 mt-1">Flag scrap rejection exceeding 5% in single shift.</p>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Scrap Factored in Yield Calculation (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={scrapYieldPercent}
                    onChange={(e) => setScrapYieldPercent(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                  <p className="text-sm text-slate-400 mt-1">
                    Standard percentage of process scrap (crop ends, scale loss) credited or accounted for in plant yield calculation.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">
                    Allow Over-Rolling Output
                  </label>
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowOverRolling}
                        onChange={(e) => setAllowOverRolling(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-700">Permit extra mother hollow pieces within tolerance</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Yield & Scrap Formula Explanatory Box */}
              <div className="rounded-lg bg-blue-50/70 border border-blue-200/80 p-3.5 text-xs text-blue-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-blue-900">
                  <Sliders className="h-4 w-4 text-blue-700" />
                  <span>Yield Calculation Formula & Scrap Inclusion:</span>
                </div>
                <div className="font-mono text-xs bg-white/90 rounded border border-blue-200 px-2.5 py-1.5 text-blue-900 font-semibold overflow-x-auto">
                  Recovery Yield (%) = [ Good Net Output + (Recorded Scrap × {scrapYieldPercent}%) ] ÷ Total Input × 100
                </div>
                <p className="text-[11px] text-blue-800">
                  Current configuration factors <strong>{scrapYieldPercent}%</strong> of recorded crop ends / rejected hollows into overall mill material recovery yield.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveGuardrails}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Guardrails</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search audit trail by user, action, order..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-blue-500"
                />
              </div>
              <select
                value={auditTypeFilter}
                onChange={(e) => setAuditTypeFilter(e.target.value)}
                className="text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-hidden"
              >
                <option value="ALL">All Actions ({auditLogs.length})</option>
                <option value="PRODUCTION_ENTRY">Production Entry</option>
                <option value="ROLLING_PLAN_CREATE">Rolling Plan</option>
                <option value="WORK_ORDER_IMPORT">Work Order Import</option>
                <option value="USER_CREATE">User Create</option>
                <option value="USER_UPDATE">User Update</option>
                <option value="AUTH_LOGIN">Login / Session</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportAuditCSV}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export Audit CSV</span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50/80 text-sm font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Date Time</th>
                    <th className="py-3 px-4">Operator / User</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4 text-right">Terminal IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No audit events recorded for the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 text-slate-500 font-mono text-sm whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div>{log.user_name}</div>
                          <div className="text-xs text-slate-400 font-mono font-normal">{log.user_email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 font-mono">
                            {log.action_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {log.entity_type} {log.entity_id && <span className="font-mono text-slate-400">({log.entity_id})</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-md">
                          {log.details}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sm text-slate-400">
                          {log.ip_address || '127.0.0.1'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* User Modal (Add / Edit) */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-hidden">
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser ? 'Edit User Credentials & Permissions' : 'Add New Plant Operator / Staff'}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Configure group authorization, work center boundaries, and employee credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body (Scrollable) */}
            <form id="user-mgmt-form" onSubmit={handleSaveUser} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
              {/* Group Selection */}
              <div className="space-y-2">
                <label className="font-bold text-slate-800 block">Select User Group & Authority Level *</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {GROUP_OPTIONS.map((grp) => {
                    const isSelected = formData.group === grp.value;
                    return (
                      <button
                        key={grp.value}
                        type="button"
                        onClick={() => {
                          const newWc = grp.value === 'admin' || grp.value === 'super_user' ? 'ALL' : (formData.work_center === 'ALL' ? 'ROLLING' : formData.work_center);
                          setFormData({
                            ...formData,
                            group: grp.value,
                            work_center: newWc,
                          });
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-sm">{grp.label}</span>
                            {isSelected && <CheckCircle2 size={14} className="text-blue-600" />}
                          </div>
                          <p className="text-sm text-slate-500 mt-1 leading-snug">
                            {grp.description}
                          </p>
                        </div>
                        <div className="mt-2.5">
                          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md ${grp.badge}`}>
                            {grp.value.toUpperCase()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Work Center Assignment */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                <label className="font-bold text-slate-800 block">
                  Assigned Work Center *
                </label>
                <select
                  value={formData.work_center}
                  onChange={(e) => setFormData({ ...formData, work_center: e.target.value as WorkCenterCode })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-hidden"
                >
                  {WORK_CENTER_OPTIONS.map(wc => (
                    <option
                      key={wc.value}
                      value={wc.value}
                      disabled={formData.group === 'user' && wc.value === 'ALL'}
                    >
                      {wc.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-slate-500">
                  {formData.group === 'user'
                    ? '⚠️ User group accounts can ONLY edit and delete production data within their assigned work center.'
                    : '✓ Admin and Super User accounts have global deletion authority across all work centers.'}
                </p>
                {(formData.work_center === 'HOLLOW_HEAT_TREATMENT' || formData.work_center === 'HEAT_TREATMENT') && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                    <span className="shrink-0 font-bold">ℹ️ Note:</span>
                    <span>
                      <strong>Joint Furnace Work Centers:</strong> Operators assigned to Hollow Heat Treatment or Heat Treatment have mutual authorization to work on, record, edit, and delete entries on <strong>BOTH</strong> furnace work centers.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee Badge ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MIL-105"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Official Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="name@seamlesswip.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Role Designation *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const r = e.target.value as UserRole;
                      const conf = ROLE_OPTIONS.find(opt => opt.value === r);
                      setFormData({
                        ...formData,
                        role: r,
                        department: conf?.department || formData.department,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-hidden"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Shift Assignment</label>
                  <select
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="Shift A (06:00 - 14:00)">Shift A (06:00 - 14:00)</option>
                    <option value="Shift B (14:00 - 22:00)">Shift B (14:00 - 22:00)</option>
                    <option value="Shift C (22:00 - 06:00)">Shift C (22:00 - 06:00)</option>
                    <option value="General (09:00 - 17:30)">General (09:00 - 17:30)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Default Stage</label>
                  <select
                    value={formData.default_stage}
                    onChange={(e) => setFormData({ ...formData, default_stage: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="ROLLING">Rolling Mill</option>
                    <option value="HOLLOW_HEAT_TREATMENT">Hollow Heat Treatment</option>
                    <option value="DRAW">Cold Draw Bench</option>
                    <option value="HEAT_TREATMENT">Heat Treatment</option>
                    <option value="FINISHING">Finishing & NDT</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 XXXXX XXXXX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      {editingUser ? 'Reset Password (optional)' : 'Initial Password (min. 8 chars) *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span>{showPin ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showPin ? 'text' : 'password'}
                    minLength={8}
                    autoComplete="new-password"
                    name="admin_user_initial_pass"
                    placeholder={editingUser ? 'Leave blank to keep current' : 'Min 8 characters (e.g. TempPass123!)'}
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {editingUser
                      ? 'Leave blank to keep existing user password unchanged.'
                      : 'Temporary credential for staff login. Must be at least 8 characters.'}
                  </p>
                </div>
              </div>
            </form>

            {/* Modal Sticky Footer */}
            <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50/90 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 hidden sm:block">
                <span>Directly syncs Supabase Auth credentials & factory role profile.</span>
              </div>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="user-mgmt-form"
                  disabled={isSavingUser}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 shadow-sm transition cursor-pointer disabled:opacity-60"
                >
                  {isSavingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{editingUser ? 'Save User Changes' : 'Create User Account'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Reset Factory Database?</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              This will restore all work orders, rolling plans, production logs, users, and audit records to factory default demonstration data.
            </p>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetData}
                className="px-4 py-2 rounded-lg bg-rose-600 font-semibold text-white hover:bg-rose-500 shadow-xs transition"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
