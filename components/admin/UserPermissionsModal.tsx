'use client';

import React, { useState, useEffect } from 'react';
import type { AppUserProfile, AccessLevel, FormPermissions, UserGroup } from '@/lib/users/types';
import { MODULE_DEFINITIONS, getDefaultPermissions, GROUP_CONFIGS, WORK_CENTER_LABELS } from '@/lib/permissions';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Edit3,
  Ban,
  Save,
  RotateCcw,
  X,
  Factory,
  Layers,
  Wrench,
  Flame,
  CheckCircle2,
  Lock,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUserProfile | null;
  onSave: (updatedUser: AppUserProfile, permissions: FormPermissions) => Promise<void>;
}

export default function UserPermissionsModal({
  isOpen,
  onClose,
  user,
  onSave,
}: UserPermissionsModalProps) {
  const [permissions, setPermissions] = useState<FormPermissions>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const defaults = getDefaultPermissions(user.group, user.work_center);
      setPermissions({
        ...defaults,
        ...(user.permissions || {}),
      });
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const groupCfg = GROUP_CONFIGS[user.group] || GROUP_CONFIGS.user;
  const wcLabel = WORK_CENTER_LABELS[user.work_center] || user.work_center;

  const handleLevelChange = (key: keyof FormPermissions, level: AccessLevel) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: level,
    }));
  };

  const applyPreset = (type: 'all_edit' | 'all_view' | 'wc_default' | 'strict_wc') => {
    if (type === 'all_edit') {
      const p: FormPermissions = {};
      MODULE_DEFINITIONS.forEach((m) => {
        p[m.key] = 'edit';
      });
      setPermissions(p);
      toast.success('Applied "Full Editing Access" preset across all forms.');
    } else if (type === 'all_view') {
      const p: FormPermissions = {};
      MODULE_DEFINITIONS.forEach((m) => {
        p[m.key] = 'view';
      });
      p.admin_panel = 'none';
      setPermissions(p);
      toast.success('Applied "View-Only / Auditor" preset.');
    } else if (type === 'wc_default') {
      const defaults = getDefaultPermissions(user.group, user.work_center);
      setPermissions(defaults);
      toast.success('Reset to standard Work Center defaults.');
    } else if (type === 'strict_wc') {
      const p: FormPermissions = {};
      MODULE_DEFINITIONS.forEach((m) => {
        p[m.key] = 'none';
      });
      // Allow edit on assigned work center and view on reports
      if (user.work_center === 'ROLLING') p.production_rolling = 'edit';
      else if (user.work_center === 'HOLLOW_HEAT_TREATMENT') p.production_hollow_ht = 'edit';
      else if (user.work_center === 'DRAW') p.production_draw = 'edit';
      else if (user.work_center === 'HEAT_TREATMENT') p.production_ht = 'edit';
      else if (user.work_center === 'BAND_SAW') p.production_band_saw = 'edit';
      else if (user.work_center === 'VDI' || user.work_center === 'QA') p.production_vdi = 'edit';
      else if (user.work_center === 'FINISHING') p.production_finishing = 'edit';
      p.reports = 'view';
      setPermissions(p);
      toast.success('Applied "Strict Single Station" preset.');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(user, permissions);
      toast.success(`Access rights updated successfully for ${user.name || user.email}.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update user permissions.');
    } finally {
      setSaving(false);
    }
  };

  const categories = [
    {
      id: 'production',
      title: '🏭 Work Center Production Forms',
      subtitle: 'Shift logging, physical WIP output, batch completion, and scrap / rejection entries.',
    },
    {
      id: 'planning',
      title: '📋 Planning & Scheduling Modules',
      subtitle: 'Customer orders, master rolling campaign scheduling, and physical WIP pipe diversions.',
    },
    {
      id: 'tools',
      title: '📊 Tools & Management',
      subtitle: 'Excel bulk migration, factory tracking sheets, and system configuration control.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Configure Access Rights & Permissions</h2>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${groupCfg.badgeClass}`}>
                  {groupCfg.name}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Grant or restrict <strong className="text-slate-800">View-Only</strong> and <strong className="text-slate-800">Full Editing</strong> rights for{' '}
                <span className="font-semibold text-blue-700">{user.name || user.email}</span> ({user.employee_id || 'No ID'} • {wcLabel})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-blue-50/50 px-6 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span>1-Click Quick Presets:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset('all_edit')}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <Edit3 className="h-3 w-3" />
              Full Edit (All Forms)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all_view')}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
            >
              <Eye className="h-3 w-3" />
              View-Only (Auditor)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('wc_default')}
              className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
            >
              <RotateCcw className="h-3 w-3" />
              Station Default
            </button>
            <button
              type="button"
              onClick={() => applyPreset('strict_wc')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 transition"
            >
              <Lock className="h-3 w-3" />
              Strict Single Station
            </button>
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleFormSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {categories.map((cat) => {
              const modules = MODULE_DEFINITIONS.filter((m) => m.category === cat.id);
              if (modules.length === 0) return null;

              return (
                <div key={cat.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                  <div className="mb-3">
                    <h3 className="text-sm font-bold text-slate-900">{cat.title}</h3>
                    <p className="text-xs text-slate-500">{cat.subtitle}</p>
                  </div>

                  <div className="divide-y divide-slate-200/80 rounded-lg border border-slate-200 bg-white">
                    {modules.map((m) => {
                      const currentLevel: AccessLevel = permissions[m.key] || 'none';

                      return (
                        <div
                          key={m.key}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 transition hover:bg-slate-50/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-slate-900">{m.label}</span>
                              {currentLevel === 'edit' && (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                  Full Edit
                                </span>
                              )}
                              {currentLevel === 'view' && (
                                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                                  View Only
                                </span>
                              )}
                              {currentLevel === 'none' && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                  No Access
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                          </div>

                          {/* 3-way Segmented Button Group */}
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 shrink-0 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleLevelChange(m.key, 'none')}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                currentLevel === 'none'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Ban className="h-3 w-3" />
                              None
                            </button>

                            <button
                              type="button"
                              onClick={() => handleLevelChange(m.key, 'view')}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                currentLevel === 'view'
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() => handleLevelChange(m.key, 'edit')}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                currentLevel === 'edit'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4 rounded-b-2xl">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="h-4 w-4 text-blue-500 shrink-0" />
              <span>Permissions take effect immediately for the user upon saving.</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving Rights...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
