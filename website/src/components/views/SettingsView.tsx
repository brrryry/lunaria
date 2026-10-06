'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Shield,
  Trash2,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Bell,
  Mail,
  Smartphone,
  Check,
  Receipt,
  TrendingUp,
  Wallet,
  DollarSign,
  Send,
  Sparkles,
  Tag,
  Plus,
  Edit2,
  RotateCcw,
  HelpCircle,
  X,
  Sliders,
  ExternalLink,
  Palette,
  Sun,
  Moon,
  Search,
} from 'lucide-react';
import type { Category, CategoryRule } from '@lunaria/types';
import { useWebPush } from '../../hooks/useWebPush';
import { useTheme } from '@/context/ThemeContext';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#38bdf8', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#22c55e', // Green
  '#fbbf24', // Yellow
];

interface SettingsViewProps {
  onRefreshData?: () => void;
  transactions?: any[];
}

const ChannelToggleButtons: React.FC<{
  emailKey: string;
  pushKey: string;
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  onToggle: (key: string, val: boolean) => void;
}> = ({ emailKey, pushKey, emailEnabled = true, pushEnabled = true, onToggle }) => (
  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 sm:ml-4 self-end sm:self-auto mt-2 sm:mt-0">
    <button
      type="button"
      onClick={() => onToggle(emailKey, !emailEnabled)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
        emailEnabled
          ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-700 dark:text-indigo-200 shadow-sm'
          : 'bg-slate-100 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-400'
      }`}
      title={emailEnabled ? 'Email notifications enabled' : 'Email notifications disabled'}
    >
      <Mail className="w-3.5 h-3.5" />
      <span>Email</span>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          emailEnabled ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-slate-400 dark:bg-slate-600'
        }`}
      />
    </button>
    <button
      type="button"
      onClick={() => onToggle(pushKey, !pushEnabled)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
        pushEnabled
          ? 'bg-purple-600/20 border-purple-500/40 text-purple-700 dark:purple-200 shadow-sm'
          : 'bg-slate-100 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-400'
      }`}
      title={pushEnabled ? 'Push notifications enabled' : 'Push notifications disabled'}
    >
      <Smartphone className="w-3.5 h-3.5" />
      <span>Push</span>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          pushEnabled ? 'bg-purple-500 dark:bg-purple-400' : 'bg-slate-400 dark:bg-slate-600'
        }`}
      />
    </button>
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({ onRefreshData, transactions = [] }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'appearance' | 'notifications' | 'categories' | 'system'>('appearance');

  // Category & Rules Management State
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [excludedList, setExcludedList] = useState<Category[]>([]);
  const [rulesList, setRulesList] = useState<CategoryRule[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(false);
  const [categorySubTab, setCategorySubTab] = useState<'categories' | 'rules'>('categories');
  const [categorySearch, setCategorySearch] = useState<string>('');

  // Modals & form state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState<boolean>(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('Uncategorized');
  const [catNameInput, setCatNameInput] = useState<string>('');
  const [catGroupInput, setCatGroupInput] = useState<string>('Custom Categories');
  const [catColorInput, setCatColorInput] = useState<string>('#6366f1');
  const [isSubmittingCat, setIsSubmittingCat] = useState<boolean>(false);
  const [catActionSuccess, setCatActionSuccess] = useState<string | null>(null);

  // Notification Preferences State
  const [prefs, setPrefs] = useState<any>({
    emailEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    emailAddress: '',

    accountDisconnected: true,
    accountDisconnectedEmail: true,
    accountDisconnectedPush: true,

    depositAlert: true,
    depositAlertEmail: true,
    depositAlertPush: true,
    depositMinAmount: '500.00',

    expenseAlert: true,
    expenseAlertEmail: true,
    expenseAlertPush: true,
    expenseMinAmount: '500.00',

    txNeedReview: true,
    txNeedReviewEmail: true,
    txNeedReviewPush: true,

    receiptImportError: true,
    receiptImportErrorEmail: true,
    receiptImportErrorPush: true,

    receiptImported: true,
    receiptImportedEmail: true,
    receiptImportedPush: true,

    receiptMatched: true,
    receiptMatchedEmail: true,
    receiptMatchedPush: true,

    dailyTopMovers: true,
    dailyTopMoversEmail: true,
    dailyTopMoversPush: true,

    budgetExceeded: true,
    budgetExceededEmail: true,
    budgetExceededPush: true,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [depositAmountInput, setDepositAmountInput] = useState('500');
  const [expenseAmountInput, setExpenseAmountInput] = useState('500');
  const [savedField, setSavedField] = useState<string | null>(null);
  const {
    isSupported: isPushSupported,
    permission: pushPermission,
    isSubscribed: isPushSubscribed,
    loading: pushLoading,
    errorMessage: pushErrorMessage,
    subscribeToPush,
    unsubscribeFromPush,
  } = useWebPush();

  const getHeaders = () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('lunaria_token')
        : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchCategoriesData = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const [catsRes, excludedRes, rulesRes] = await Promise.all([
        fetch(`${API_BASE}/categories`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${API_BASE}/categories/excluded`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${API_BASE}/categories/rules/all`, { headers: getHeaders(), credentials: 'include' }),
      ]);

      if (catsRes.ok) {
        const data = await catsRes.json();
        setCategoriesList(data);
      }
      if (excludedRes.ok) {
        const data = await excludedRes.json();
        setExcludedList(data);
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRulesList(data);
      }
    } catch (err) {
      console.warn('Failed to load categories/rules data:', err);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'categories') {
      fetchCategoriesData();
    }
  }, [activeTab, fetchCategoriesData]);

  const handleDeleteCategoryConfirm = async () => {
    if (!deletingCategory) return;
    try {
      setIsSubmittingCat(true);
      const res = await fetch(
        `${API_BASE}/categories/${deletingCategory.id}?reassignTo=${encodeURIComponent(reassignTarget)}`,
        {
          method: 'DELETE',
          headers: getHeaders(),
          credentials: 'include',
        },
      );
      if (res.ok) {
        setCatActionSuccess(
          `Removed "${deletingCategory.name}" and reassigned transactions to "${reassignTarget}".`
        );
        setTimeout(() => setCatActionSuccess(null), 4000);
        setDeletingCategory(null);
        await fetchCategoriesData();
        onRefreshData?.();
      }
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const handleRestoreSingleCategory = async (catId: string, catName: string) => {
    try {
      setIsSubmittingCat(true);
      const res = await fetch(`${API_BASE}/categories/${catId}/restore`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        setCatActionSuccess(`Restored default category "${catName}".`);
        setTimeout(() => setCatActionSuccess(null), 4000);
        await fetchCategoriesData();
        onRefreshData?.();
      }
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const handleRestoreAllDefaults = async () => {
    try {
      setIsSubmittingCat(true);
      const res = await fetch(`${API_BASE}/categories/restore-defaults`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        setCatActionSuccess('Restored all default categories.');
        setTimeout(() => setCatActionSuccess(null), 4000);
        await fetchCategoriesData();
        onRefreshData?.();
      }
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim()) return;
    try {
      setIsSubmittingCat(true);
      if (editingCategory) {
        const res = await fetch(`${API_BASE}/categories/${editingCategory.id}`, {
          method: 'PATCH',
          headers: getHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            name: catNameInput.trim(),
            group: catGroupInput.trim(),
            color: catColorInput,
          }),
        });
        if (res.ok) {
          setCatActionSuccess(`Updated category "${catNameInput}".`);
          setTimeout(() => setCatActionSuccess(null), 4000);
          setEditingCategory(null);
          await fetchCategoriesData();
          onRefreshData?.();
        }
      } else {
        const res = await fetch(`${API_BASE}/categories`, {
          method: 'POST',
          headers: getHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            name: catNameInput.trim(),
            group: catGroupInput.trim(),
            color: catColorInput,
          }),
        });
        if (res.ok) {
          setCatActionSuccess(`Created category "${catNameInput}".`);
          setTimeout(() => setCatActionSuccess(null), 4000);
          setIsCreatingCategory(false);
          await fetchCategoriesData();
          onRefreshData?.();
        }
      }
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const handleDeleteRule = async (ruleId: string, pattern: string) => {
    try {
      const res = await fetch(`${API_BASE}/categories/rules/${ruleId}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        setCatActionSuccess(`Deleted auto-categorization rule for "${pattern}".`);
        setTimeout(() => setCatActionSuccess(null), 4000);
        await fetchCategoriesData();
      }
    } catch (err) {
      console.warn('Failed to delete rule:', err);
    }
  };

  const fetchPreferences = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/notifications/preferences`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setPrefs(data);
        setDepositAmountInput(String(Math.round(Number(data.depositMinAmount) || 500)));
        setExpenseAmountInput(String(Math.round(Number(data.expenseMinAmount) || 500)));
      }
    } catch (err) {
      console.warn('Failed to load notification preferences:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = async (key: string, value: any) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);

    try {
      const res = await fetch(`${API_BASE}/notifications/preferences`, {
        method: 'PUT',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        setSavedField(key);
        setTimeout(() => setSavedField(null), 2000);
      }
    } catch (err) {
      console.warn('Failed to save preference:', err);
    }
  };

  const saveThreshold = async (field: 'deposit' | 'expense') => {
    const amount =
      field === 'deposit'
        ? parseFloat(depositAmountInput) || 500
        : parseFloat(expenseAmountInput) || 500;

    const key = field === 'deposit' ? 'depositMinAmount' : 'expenseMinAmount';
    await updatePreference(key, amount);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-slate-400" />
            <span>Settings</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage your interface appearance, notifications, thresholds, and privacy
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-200/70 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'appearance'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'notifications'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Notifications</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'categories'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Categories</span>
            {excludedList.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'system'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>System & Privacy</span>
          </button>
        </div>
      </div>

      {activeTab === 'appearance' ? (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Theme & Appearance</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select your preferred interface appearance or sync with your system defaults
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              {/* Light Option */}
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`relative p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 cursor-pointer ${
                  theme === 'light'
                    ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-50/70 dark:bg-purple-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/70 dark:bg-slate-900/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                      <Sun className="w-5 h-5" />
                    </div>
                    {theme === 'light' && (
                      <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Light Mode</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Clean, high-contrast porcelain theme for bright environments
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300" />
                  <span className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-[10px] text-slate-500 font-medium">Porcelain / Violet</span>
                </div>
              </button>

              {/* Dark Option */}
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`relative p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 cursor-pointer ${
                  theme === 'dark'
                    ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-50/70 dark:bg-purple-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/70 dark:bg-slate-900/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Moon className="w-5 h-5" />
                    </div>
                    {theme === 'dark' && (
                      <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Dark Mode</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Deep obsidian canvas with subtle glassmorphism and glow
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="w-3 h-3 rounded-full bg-[#08090d] border border-slate-700" />
                  <span className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-[10px] text-slate-500 font-medium">Obsidian / Orchid</span>
                </div>
              </button>

              {/* System Option */}
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`relative p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 cursor-pointer ${
                  theme === 'system'
                    ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-50/70 dark:bg-purple-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/70 dark:bg-slate-900/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-600 dark:text-slate-400">
                      <Sliders className="w-5 h-5" />
                    </div>
                    {theme === 'system' && (
                      <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">System Sync</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Automatically adapts to your device's light or dark mode
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="text-[10px] text-slate-500 font-medium">
                    Currently active: <strong className="text-purple-600 dark:text-purple-400 capitalize">{resolvedTheme}</strong>
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'notifications' ? (
        <div className="space-y-6">

          {/* Email Communications & Legal Consent Card */}
          <div className="rounded-2xl p-5 border border-purple-500/20 bg-gradient-to-r from-purple-950/20 via-slate-900/40 to-slate-900/60 backdrop-blur-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Email Communications & Consent</span>
                    {prefs.emailEnabled ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Consent Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-medium">
                        Consent Revoked
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl leading-relaxed">
                    In compliance with CAN-SPAM and consumer privacy standards, Lunaria only dispatches financial notifications with your explicit opt-in consent. You can withdraw or adjust your consent anytime.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors"
                >
                  <span>Privacy Policy</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* 1. Delivery Channels Card */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                <span>Delivery Channels</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose how you want to receive your alerts and financial summaries
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {/* Email Toggle */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Email Alerts</div>
                    <div className="text-[11px] text-slate-400">Direct to inbox</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePreference('emailEnabled', !prefs.emailEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    prefs.emailEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      prefs.emailEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Push Toggle */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Phone & Push</div>
                    <div className="text-[11px] text-slate-400">Mobile & web alerts</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePreference('pushEnabled', !prefs.pushEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    prefs.pushEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      prefs.pushEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* In-App Toggle */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">In-App Center</div>
                    <div className="text-[11px] text-slate-400">Header bell popover</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePreference('inAppEnabled', !prefs.inAppEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    prefs.inAppEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      prefs.inAppEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Browser Push Device Subscription Controller */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">Browser Push Registration</span>
                  {isPushSubscribed ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Active on this Device
                    </span>
                  ) : pushPermission === 'denied' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      Permission Blocked
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                      Not Subscribed
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  {isPushSubscribed
                    ? 'This browser will receive native OS notifications (RFC 8291 VAPID) even when Lunaria is closed.'
                    : pushPermission === 'denied'
                    ? 'Notifications are blocked in your browser site permissions. Click the lock icon in your address bar to re-enable.'
                    : 'Subscribe this device via Web Push API to receive instant OS desktop & mobile push alerts.'}
                </p>
                {pushErrorMessage && (
                  <p className="text-[11px] text-rose-400 font-medium">{pushErrorMessage}</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isPushSubscribed ? (
                  <button
                    type="button"
                    disabled={pushLoading}
                    onClick={unsubscribeFromPush}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {pushLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Disable on Device'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pushLoading || pushPermission === 'denied' || !isPushSupported}
                    onClick={subscribeToPush}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-indigo-950/50"
                  >
                    {pushLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Smartphone className="w-3.5 h-3.5" />
                    )}
                    <span>Enable Browser Push</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Account Alerts */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Account Alerts</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Financial institution connection status
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white">Account disconnected</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Receive a notification if one of your financial accounts needs to be reconnected.
                </div>
              </div>
              <ChannelToggleButtons
                emailKey="accountDisconnectedEmail"
                pushKey="accountDisconnectedPush"
                emailEnabled={prefs.accountDisconnectedEmail}
                pushEnabled={prefs.accountDisconnectedPush}
                onToggle={updatePreference}
              />
            </div>
          </div>

          {/* 3. Transaction Alerts with Custom Thresholds */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-sky-400" />
                <span>Transactions</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Deposit and expense alerts with customizable minimum thresholds and channel controls
              </p>
            </div>

            <div className="space-y-3">
              {/* Deposit Alert */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Deposit alert</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Receive a notification when a deposit syncs to Lunaria that is above the amount you specify below.
                    </div>
                  </div>
                  <div className="self-end sm:self-auto">
                    <ChannelToggleButtons
                      emailKey="depositAlertEmail"
                      pushKey="depositAlertPush"
                      emailEnabled={prefs.depositAlertEmail}
                      pushEnabled={prefs.depositAlertPush}
                      onToggle={updatePreference}
                    />
                  </div>
                </div>

                {(prefs.depositAlertEmail || prefs.depositAlertPush) && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="text-[11px] text-slate-400 font-medium">Minimum Amount:</span>
                    <div className="relative flex items-center">
                      <span className="absolute left-2.5 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        min="1"
                        step="50"
                        value={depositAmountInput}
                        onChange={(e) => setDepositAmountInput(e.target.value)}
                        className="w-28 pl-6 pr-2.5 py-1 text-xs font-bold rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => saveThreshold('deposit')}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                    >
                      {savedField === 'depositMinAmount' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <span>Save</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Expense Alert */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Expense alert</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Receive a notification when an expense syncs to Lunaria that is above the amount you specify below.
                    </div>
                  </div>
                  <div className="self-end sm:self-auto">
                    <ChannelToggleButtons
                      emailKey="expenseAlertEmail"
                      pushKey="expenseAlertPush"
                      emailEnabled={prefs.expenseAlertEmail}
                      pushEnabled={prefs.expenseAlertPush}
                      onToggle={updatePreference}
                    />
                  </div>
                </div>

                {(prefs.expenseAlertEmail || prefs.expenseAlertPush) && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="text-[11px] text-slate-400 font-medium">Minimum Amount:</span>
                    <div className="relative flex items-center">
                      <span className="absolute left-2.5 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        min="1"
                        step="50"
                        value={expenseAmountInput}
                        onChange={(e) => setExpenseAmountInput(e.target.value)}
                        className="w-28 pl-6 pr-2.5 py-1 text-xs font-bold rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => saveThreshold('expense')}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                    >
                      {savedField === 'expenseMinAmount' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <span>Save</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Transactions that need review */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Transactions that need review</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Receive a notification if you have any new transactions that need review.
                  </div>
                </div>
                <div className="self-end sm:self-auto">
                  <ChannelToggleButtons
                    emailKey="txNeedReviewEmail"
                    pushKey="txNeedReviewPush"
                    emailEnabled={prefs.txNeedReviewEmail}
                    pushEnabled={prefs.txNeedReviewPush}
                    onToggle={updatePreference}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Receipts */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>Receipts</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Email receipt matching and forwarding notifications
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Receipt import error</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Receive a notification when there is an error when trying to forward a receipt from your verified email(s).
                  </div>
                </div>
                <div className="self-end sm:self-auto">
                  <ChannelToggleButtons
                    emailKey="receiptImportErrorEmail"
                    pushKey="receiptImportErrorPush"
                    emailEnabled={prefs.receiptImportErrorEmail}
                    pushEnabled={prefs.receiptImportErrorPush}
                    onToggle={updatePreference}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Receipt imported</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Receive a notification when a receipt forwarded from your verified email(s) is successfully imported.
                  </div>
                </div>
                <div className="self-end sm:self-auto">
                  <ChannelToggleButtons
                    emailKey="receiptImportedEmail"
                    pushKey="receiptImportedPush"
                    emailEnabled={prefs.receiptImportedEmail}
                    pushEnabled={prefs.receiptImportedPush}
                    onToggle={updatePreference}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Receipt matched with transaction</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Receive a notification when a receipt is successfully matched with a transaction.
                  </div>
                </div>
                <div className="self-end sm:self-auto">
                  <ChannelToggleButtons
                    emailKey="receiptMatchedEmail"
                    pushKey="receiptMatchedPush"
                    emailEnabled={prefs.receiptMatchedEmail}
                    pushEnabled={prefs.receiptMatchedPush}
                    onToggle={updatePreference}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 5. Investments & Budget */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Investments */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Investments</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Market and balance digests</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Daily top movers</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Receive an email with a summary of the account balance changes that happened on the previous day.
                  </div>
                </div>
                <div className="self-end sm:self-auto">
                  <ChannelToggleButtons
                    emailKey="dailyTopMoversEmail"
                    pushKey="dailyTopMoversPush"
                    emailEnabled={prefs.dailyTopMoversEmail}
                    pushEnabled={prefs.dailyTopMoversPush}
                    onToggle={updatePreference}
                  />
                </div>
              </div>
            </div>

            {/* Budget */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-rose-400" />
                  <span>Budget</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Category spending limits with anti-spam protection</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Budget exceeded</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      You'll receive an alert when you exceed your monthly budget in any category.
                    </div>
                  </div>
                  <div className="self-end sm:self-auto">
                    <ChannelToggleButtons
                      emailKey="budgetExceededEmail"
                      pushKey="budgetExceededPush"
                      emailEnabled={prefs.budgetExceededEmail}
                      pushEnabled={prefs.budgetExceededPush}
                      onToggle={updatePreference}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span>
                    <strong className="text-slate-300">Anti-Spam Throttling:</strong> Max 1 alert per category per calendar month. Subsequent daily transactions in an exceeded category will not trigger duplicate notifications.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'categories' ? (
        /* Categories & Rules Tab */
        <div className="space-y-6">
          {catActionSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300 flex items-center gap-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{catActionSuccess}</span>
            </div>
          )}

          {/* Header Actions & Sub-tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setCategorySubTab('categories')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  categorySubTab === 'categories'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Active Categories ({categoriesList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCategorySubTab('rules')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  categorySubTab === 'rules'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Merchant Rules ({rulesList.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              {excludedList.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreAllDefaults}
                  disabled={isSubmittingCat}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore All Defaults ({excludedList.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setCatNameInput('');
                  setCatGroupInput('Custom Categories');
                  setCatColorInput(PRESET_COLORS[0]);
                  setIsCreatingCategory(true);
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>New Category</span>
              </button>
            </div>
          </div>

          {categorySubTab === 'categories' ? (
            <div className="space-y-6">
              {/* Excluded Defaults Notice if any */}
              {excludedList.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Excluded Default Categories ({excludedList.length})</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Hidden from your budget and category selector. Incoming Plaid transactions in these categories default to Uncategorized.
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {excludedList.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2 pl-3 pr-2 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-slate-300 font-medium">{cat.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRestoreSingleCategory(cat.id, cat.name)}
                          disabled={isSubmittingCat}
                          className="text-amber-400 hover:text-amber-300 text-[11px] font-semibold flex items-center gap-1 ml-1 hover:underline cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Categories Grid */}
              <div className="glass-panel rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-indigo-400" />
                      <span>Active Categories</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      You can delete or hide any default category, or edit names, colors, and groups
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {isLoadingCategories ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Loading categories...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {categoriesList
                      .filter((c) =>
                        c.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                        c.group.toLowerCase().includes(categorySearch.toLowerCase())
                      )
                      .map((cat) => {
                        const txCount = transactions.filter(
                          (t) => (t.category || '').toLowerCase() === cat.name.toLowerCase()
                        ).length;

                        return (
                          <div
                            key={cat.id}
                            className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 transition-all flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              <span
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                                style={{ backgroundColor: cat.color }}
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                                  <span className="truncate">{cat.name}</span>
                                  {cat.isSystem ? (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60 font-normal">
                                      Default
                                    </span>
                                  ) : (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-normal">
                                      Custom
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <span>{cat.group}</span>
                                  <span>•</span>
                                  <span>{txCount} tx{txCount === 1 ? '' : 's'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setCatNameInput(cat.name);
                                  setCatGroupInput(cat.group);
                                  setCatColorInput(cat.color);
                                  setEditingCategory(cat);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="Edit category"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReassignTarget('Uncategorized');
                                  setDeletingCategory(cat);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title={cat.isSystem ? 'Remove / Hide Default Category' : 'Delete Custom Category'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Learned Merchant Memory Rules Section */
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <span>Learned Merchant Memory Rules</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    When you categorize a transaction and enable "Apply to all", Lunaria saves a deterministic rule here. You can delete any rule below to reset behavior.
                  </p>
                </div>
              </div>

              {rulesList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 space-y-2 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                  <Sliders className="w-6 h-6 text-slate-600 mx-auto" />
                  <div className="font-semibold text-slate-400">No Custom Merchant Rules Yet</div>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    When you edit a transaction's category in Activity and check "Rule: Apply to all transactions from this merchant", it will be listed here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                  {rulesList.map((rule) => {
                    const pattern = rule.merchantName || rule.transactionName || 'Unnamed Pattern';
                    return (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 transition-all text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-white px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                            "{pattern}"
                          </span>
                          <span className="text-slate-500 font-medium">auto-maps to</span>
                          <span className="font-bold text-indigo-300 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            {rule.category}
                          </span>
                          {rule.subCategory && (
                            <span className="text-[11px] text-slate-400">({rule.subCategory})</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id, pattern)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete memory rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Delete / Remove Category Modal with Reassignment */}
          {deletingCategory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
              <div className="w-full max-w-md bg-white dark:bg-[#10141f] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-slate-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 flex items-center justify-center">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {deletingCategory.isSystem ? 'Remove Default Category' : 'Delete Custom Category'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-semibold text-rose-500 dark:text-rose-300">
                        "{deletingCategory.name}"
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDeletingCategory(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-xs text-slate-400 leading-relaxed">
                  {deletingCategory.isSystem ? (
                    <p>
                      This will hide <strong className="text-white">{deletingCategory.name}</strong> from your account. You can restore it anytime in Settings.
                    </p>
                  ) : (
                    <p>
                      This will permanently delete custom category <strong className="text-white">{deletingCategory.name}</strong>.
                    </p>
                  )}
                </div>

                {/* Reassignment Dropdown */}
                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Reassign Existing Transactions:
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Existing transactions in "{deletingCategory.name}" will be automatically migrated to:
                  </p>
                  <select
                    value={reassignTarget}
                    onChange={(e) => setReassignTarget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Uncategorized">Mark as "Uncategorized" (Flag for Review)</option>
                    {categoriesList
                      .filter((c) => c.id !== deletingCategory.id)
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} ({c.group})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingCategory(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingCat}
                    onClick={handleDeleteCategoryConfirm}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmittingCat ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Removing...</span>
                      </>
                    ) : (
                      <span>Remove & Reassign</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add / Edit Category Modal */}
          {(isCreatingCategory || editingCategory) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
              <div className="w-full max-w-md bg-white dark:bg-[#10141f] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-slate-900 dark:text-slate-100">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Tag className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {editingCategory ? 'Edit Category' : 'Create Custom Category'}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setIsCreatingCategory(false);
                      setEditingCategory(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveCategory} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category Name</label>
                    <input
                      type="text"
                      required
                      value={catNameInput}
                      onChange={(e) => setCatNameInput(e.target.value)}
                      placeholder="e.g. Pet Care, Software Subscriptions"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category Group</label>
                    <select
                      value={catGroupInput}
                      onChange={(e) => setCatGroupInput(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="Living Expenses" className="bg-white dark:bg-slate-950">Living Expenses</option>
                      <option value="Food & Lifestyle" className="bg-white dark:bg-slate-950">Food & Lifestyle</option>
                      <option value="Discretionary" className="bg-white dark:bg-slate-950">Discretionary</option>
                      <option value="Financial" className="bg-white dark:bg-slate-950">Financial</option>
                      <option value="Income" className="bg-white dark:bg-slate-950">Income</option>
                      <option value="Custom Categories" className="bg-white dark:bg-slate-950">Custom Categories</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Badge Color</label>
                    <div className="flex items-center gap-2 pt-1">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setCatColorInput(color)}
                          className={`w-6 h-6 rounded-full transition-transform ${
                            catColorInput === color
                              ? 'scale-125 ring-2 ring-indigo-500 dark:ring-white'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingCategory(false);
                        setEditingCategory(null);
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCat || !catNameInput.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSubmittingCat ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>{editingCategory ? 'Update Category' : 'Create Category'}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* System & Security Tab */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Security Architecture Card */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Zero-Casual-Access Security Model</span>
            </h3>

            <div className="space-y-2.5 text-xs text-slate-400">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span>PostgreSQL Transparent Encryption</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span>Plaid Access Token Encryption</span>
                <span className="text-indigo-300 font-semibold">AES-256-GCM</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span>Immutable Audit Logs Table</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enforced
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span>Pino Financial Log Scrubbing</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Redacting
                </span>
              </div>
            </div>
          </div>

          {/* Database & Infrastructure Card */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Infrastructure & Storage</span>
            </h3>

            <div className="space-y-2.5 text-xs text-slate-400">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span>PostgreSQL / TimescaleDB</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span>Redis Cache & Queues</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              </div>
            </div>
          </div>

          {/* Data Privacy & Policies Card */}
          <div className="glass-panel rounded-2xl p-5 space-y-4 md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span>Consumer Privacy, Rights & Governance</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Lunaria adheres to strict financial privacy standards. Your data is encrypted, never sold, never shared with third-party advertisers, and you maintain complete control to unlink accounts or purge records at any time.
                </p>
              </div>

              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-all shrink-0 self-start sm:self-auto"
              >
                <span>Read Full Privacy Policy</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

