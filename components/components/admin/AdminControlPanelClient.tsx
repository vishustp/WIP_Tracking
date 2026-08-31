'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  mockStore, MockUserProfile, MockAuditLog, MockRoute, MockStage, UserRole, UserGroup, WorkCenterCode, DEFAULT_USERS
} from '@/lib/supabase/mock-store';
import { GROUP_CONFIGS, usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import {
  ShieldCheck, Users, Sliders, Activity, Database, Plus, Search,
  Edit2, Trash2, CheckCircle2, XCircle, RotateCcw, Download, Upload,
  KeyRound, Shield, AlertTriangle, RefreshCw, Layers, Check, X,
  Save, Filter, Lock, HardHat, Factory, UserCheck, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';

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
  { value: 'HOLLOW_HEAT_TREATMENT', label: 'Hollow Heat Treatment', stages: ['HOLLOW_HEAT_TREATMENT'] },
  { value: 'DRAW', label: 'Cold Draw Bench & Pilgering', stages: ['DRAW'] },
  { value: 'HEAT_TREATMENT', label: 'Heat Treatment & Furnace', stages: ['HEAT_TREATMENT'] },
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
  { value: 'auditor', label: 'Internal Auditor', department: 'Management & Audit Team', color: 'bg-slate-600 text-white', defaultGroup: 'user', defaultWorkCenter: 'AUDIT' },
];

export default function AdminControlPanelClient() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'admin_panel'), [user]);
  const canAdminister = formAccess.isAllowed;

  const [activeTab, setActiveTab] = useState<'users' | 'routes' | 'guardrails' | 'audit' | 'maintenance'>('users');
  const [users, setUsers] = useState<MockUserProfile[]>([]);
  const [routes, setRoutes] = useState<MockRoute[]>([]);
  const [stages, setStages] = useState<MockStage[]>([]);
  const [auditLogs, setAuditLogs] = useState<MockAuditLog[]>([]);
  const [currentUser, setCurrentUser] = useState<MockUserProfile | null>(null);

  // User search & filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');

  // Audit search & filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('ALL');

  // User modal / drawer state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<MockUserProfile | null>(null);
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
    pin: '1234',
  });

  // Guardrails state (persisted in localStorage)
  const [cappingTolerance, setCappingTolerance] = useState(100);
  const [steelDensity, setSteelDensity] = useState(7.85);
  const [rejectionThreshold, setRejectionThreshold] = useState(5.0);
  const [allowOverRolling, setAllowOverRolling] = useState(true);

  // Reset confirmation modal
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const loadData = () => {
    mockStore.loadFromStorage();
    setUsers([...mockStore.users]);
    setRoutes([...mockStore.routes]);
    setStages([...mockStore.stages]);
    setAuditLogs([...mockStore.auditLogs]);
    setCurrentUser(mockStore.getCurrentUser());

    if (typeof window !== 'undefined') {
      const savedTol = localStorage.getItem('seamless_wip_capping_tol');
      if (savedTol) setCappingTolerance(Number(savedTol));
      const savedDensity = localStorage.getItem('seamless_wip_density');
      if (savedDensity) setSteelDensity(Number(savedDensity));
      const savedRej = localStorage.getItem('seamless_wip_rej_threshold');
      if (savedRej) setRejectionThreshold(Number(savedRej));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchGroup = groupFilter === 'ALL' || (u.group || 'user') === groupFilter;
      const matchSearch =
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.employee_id.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.work_center && u.work_center.toLowerCase().includes(userSearch.toLowerCase()));
      return matchRole && matchGroup && matchSearch;
    });
  }, [users, roleFilter, groupFilter, userSearch]);

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchType = auditTypeFilter === 'ALL' || log.action_type === auditTypeFilter;
      const matchSearch =
        log.user_name.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.user_email.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.details.toLowerCase().includes(auditSearch.toLowerCase()) ||
        (log.entity_id && log.entity_id.toLowerCase().includes(auditSearch.toLowerCase()));
      return matchType && matchSearch;
    });
  }, [auditLogs, auditTypeFilter, auditSearch]);

  // Handle open Add User modal
  const openAddUser = () => {
    setEditingUser(null);
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
      pin: '1234',
    });
    setIsUserModalOpen(true);
  };

  // Handle open Edit User modal
  const openEditUser = (user: MockUserProfile) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      employee_id: user.employee_id,
      group: user.group || (user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'super_user' : 'user'),
      work_center: (user.work_center as WorkCenterCode) || (user.role === 'admin' || user.role === 'manager' ? 'ALL' : 'ROLLING'),
      role: user.role,
      department: user.department,
      shift: user.shift,
      default_stage: user.default_stage || 'ROLLING',
      phone: user.phone || '',
      pin: user.pin || '1234',
    });
    setIsUserModalOpen(true);
  };

  // Handle save user (create or edit)
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can create or modify users.');
      return;
    }
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and Email are required.');
      return;
    }

    const roleConfig = ROLE_OPTIONS.find(r => r.value === formData.role);
    const roleTitle = roleConfig?.label || 'User';
    const avatarColor = roleConfig?.color || 'bg-slate-600 text-white';

    // Compute allowed stages based on group and work center
    let allowedStages: string[] = [];
    if (formData.group === 'admin' || formData.group === 'super_user' || formData.work_center === 'ALL') {
      allowedStages = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'];
    } else {
      const wcOpt = WORK_CENTER_OPTIONS.find(w => w.value === formData.work_center);
      allowedStages = wcOpt ? wcOpt.stages : [formData.work_center];
    }

    if (editingUser) {
      mockStore.updateUserProfile(editingUser.id, {
        name: formData.name.trim(),
        group: formData.group,
        work_center: formData.work_center,
        allowed_stages: allowedStages,
        role: formData.role,
        role_title: roleTitle,
        department: formData.department,
        shift: formData.shift,
        default_stage: formData.default_stage,
        phone: formData.phone.trim(),
        pin: formData.pin.trim() || '1234',
        avatar_color: avatarColor,
      });
      toast.success(`User ${formData.name} updated (${formData.group.toUpperCase()})`);
    } else {
      mockStore.createUser({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        employee_id: formData.employee_id.trim() || `EMP-${Date.now().toString().slice(-4)}`,
        group: formData.group,
        work_center: formData.work_center,
        allowed_stages: allowedStages,
        role: formData.role,
        role_title: roleTitle,
        department: formData.department,
        shift: formData.shift,
        default_stage: formData.default_stage,
        phone: formData.phone.trim(),
        avatar_color: avatarColor,
        active: true,
        pin: formData.pin.trim() || '1234',
      });
      toast.success(`New ${formData.group.toUpperCase()} account created for ${formData.name}`);
    }

    setIsUserModalOpen(false);
    loadData();
  };

  // Handle toggle user active status
  const handleToggleUser = (userId: string) => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can enable or disable users.');
      return;
    }
    const active = mockStore.toggleUserStatus(userId);
    loadData();
    toast.info(`User status changed to ${active ? 'Active' : 'Disabled'}`);
  };

  // Handle delete user
  const handleDeleteUser = (user: MockUserProfile) => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can delete users.');
      return;
    }
    if (user.email === 'admin@seamlesswip.com') {
      toast.error('Primary Administrator account cannot be removed.');
      return;
    }
    if (confirm(`Are you sure you want to delete user ${user.name}?`)) {
      mockStore.deleteUser(user.id);
      loadData();
      toast.success(`User ${user.name} removed from system`);
    }
  };

  // Toggle route active
  const handleToggleRoute = (routeId: string) => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can modify routes.');
      return;
    }
    const route = mockStore.routes.find(r => r.id === routeId);
    if (!route) return;
    route.active = !route.active;
    mockStore.addAuditLog({
      user_email: currentUser?.email || 'admin@seamlesswip.com',
      user_name: currentUser?.name || 'Admin',
      action_type: 'ROUTE_CONFIG',
      entity_type: 'Process Route',
      entity_id: route.route_code,
      details: `Route ${route.route_code} toggled to ${route.active ? 'Active' : 'Inactive'}`,
    });
    mockStore.saveToStorage();
    loadData();
    toast.success(`Route ${route.route_code} updated`);
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
    }
    mockStore.addAuditLog({
      user_email: currentUser?.email || 'admin@seamlesswip.com',
      user_name: currentUser?.name || 'Admin',
      action_type: 'ROUTE_CONFIG',
      entity_type: 'System Settings',
      details: `Updated plant guardrails: Capping Tol = ${cappingTolerance}%, Density = ${steelDensity} g/cm³, Rej Spike = ${rejectionThreshold}%`,
    });
    toast.success('Plant guardrails and operational parameters saved');
  };

  // Export full JSON database backup
  const handleExportBackup = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      workOrders: mockStore.workOrders,
      rollingPlans: mockStore.rollingPlans,
      diversions: mockStore.diversions,
      productionLogs: mockStore.productionLogs,
      users: mockStore.users,
      auditLogs: mockStore.auditLogs,
      routes: mockStore.routes,
      stages: mockStore.stages,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `seamless_wip_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    toast.success('Database backup exported successfully');
  };

  // Reset database to default seed data
  const handleResetData = () => {
    if (!canAdminister) {
      toast.error('Permission denied: Only Admin Group accounts can reset factory data.');
      return;
    }
    mockStore.resetAllData();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('seamless_wip_capping_tol');
      localStorage.removeItem('seamless_wip_density');
      localStorage.removeItem('seamless_wip_rej_threshold');
    }
    loadData();
    setIsResetConfirmOpen(false);
    toast.success('System database restored to default factory seed');
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
                                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{user.name}</div>
                                <div className="text-sm text-slate-500 flex items-center gap-2">
                                  <span className="font-mono">{user.employee_id}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser ? 'Edit User Credentials & Permissions' : 'Add New Plant Operator / Staff'}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Configure group authorization, work center boundaries, and employee profile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 mt-4 text-sm">
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
                  <label className="font-semibold text-slate-700 block mb-1">Terminal Passcode / PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="4 digits"
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 shadow-xs transition"
                >
                  {editingUser ? 'Save User Changes' : 'Create User Account'}
                </button>
              </div>
            </form>
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
