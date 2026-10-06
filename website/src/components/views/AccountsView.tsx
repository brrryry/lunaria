'use client';

import React, { useState, useMemo } from 'react';
import {
  Landmark,
  Plus,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Check,
  X,
  Wallet,
  CreditCard,
  TrendingUp,
  Layers,
  LucideIcon,
} from 'lucide-react';

interface AccountsViewProps {
  accounts: any[];
  onOpenPlaid: () => void;
  onAccountUpdated?: () => void;
  onReconnectInstitution?: (inst: { id: string; name: string }) => void;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts = [],
  onOpenPlaid,
  onAccountUpdated,
  onReconnectInstitution,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState<string>('');
  const [isSavingLimit, setIsSavingLimit] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'institution' | 'account';
    id: string;
    name: string;
  } | null>(null);
  const [isInstitutionsModalOpen, setIsInstitutionsModalOpen] = useState(false);

  const handleSaveLimit = async (accId: string) => {
    const trimmed = editingLimitValue.trim();
    const val = trimmed === '' ? null : parseFloat(trimmed);
    if (trimmed !== '' && (isNaN(val as number) || (val as number) < 0)) {
      alert('Please enter a valid credit limit amount or leave blank to clear');
      return;
    }

    try {
      setIsSavingLimit(true);
      const res = await fetch(`${API_BASE}/transactions/accounts/${accId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ creditLimit: val }),
      });
      if (!res.ok) throw new Error('Failed to update credit limit');
      setEditingLimitId(null);
      setEditingLimitValue('');
      if (onAccountUpdated) {
        onAccountUpdated();
      }
    } catch (err) {
      console.error('Error saving credit limit:', err);
    } finally {
      setIsSavingLimit(false);
    }
  };

  const handleSyncAll = async () => {
    try {
      setIsSyncing(true);
      await fetch(`${API_BASE}/plaid/sync`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (onAccountUpdated) {
        onAccountUpdated();
      }
    } catch (err) {
      console.error('Failed to sync accounts:', err);
    } finally {
      setIsSyncing(false);
    }
  };

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

  const handleToggleTrack = async (account: any) => {
    const nextHidden = !account.isHidden;
    try {
      setUpdatingId(account.id);
      const res = await fetch(`${API_BASE}/transactions/accounts/${account.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ isHidden: nextHidden }),
      });

      if (res.ok && onAccountUpdated) {
        onAccountUpdated();
      }
    } catch (err) {
      console.error('Failed to toggle account tracking:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal) return;

    try {
      setIsDeleting(true);
      let res: Response;

      if (confirmModal.type === 'institution') {
        res = await fetch(`${API_BASE}/plaid/items/${confirmModal.id}`, {
          method: 'DELETE',
          headers: getHeaders(),
          credentials: 'include',
        });
      } else {
        res = await fetch(`${API_BASE}/transactions/accounts/${confirmModal.id}`, {
          method: 'DELETE',
          headers: getHeaders(),
          credentials: 'include',
        });
      }

      if (res.ok) {
        setConfirmModal(null);
        if (onAccountUpdated) {
          onAccountUpdated();
        }
      } else {
        console.error('Failed to delete item/account:', await res.text());
      }
    } catch (err) {
      console.error('Error during deletion:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const trackedCount = accounts.filter((a) => !a.isHidden).length;
  const untrackedCount = accounts.length - trackedCount;

  // Aggregate Credit Utilization across all tracked credit cards
  const trackedCreditAccounts = accounts.filter(
    (a) => !a.isHidden && a.type === 'credit',
  );
  const totalRevolvingBalance = trackedCreditAccounts.reduce(
    (sum, a) => sum + (Number(a.currentBalance) || 0),
    0,
  );
  const totalRevolvingLimit = trackedCreditAccounts.reduce((sum, a) => {
    const lim =
      Number(a.creditLimit) ||
      (a.availableBalance != null && a.currentBalance != null
        ? Number(a.availableBalance) + Number(a.currentBalance)
        : 0);
    return sum + lim;
  }, 0);
  const overallUtilizationPct =
    totalRevolvingLimit > 0
      ? (totalRevolvingBalance / totalRevolvingLimit) * 100
      : null;

  const TYPE_CONFIG: Record<
    string,
    {
      title: string;
      icon: LucideIcon;
      isLiability: boolean;
      color: string;
      order: number;
    }
  > = {
    depository: {
      title: 'Cash & Depository',
      icon: Wallet,
      isLiability: false,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      order: 1,
    },
    credit: {
      title: 'Credit Cards',
      icon: CreditCard,
      isLiability: true,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      order: 2,
    },
    investment: {
      title: 'Investments & Brokerage',
      icon: TrendingUp,
      isLiability: false,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      order: 3,
    },
    loan: {
      title: 'Loans & Mortgages',
      icon: Landmark,
      isLiability: true,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      order: 4,
    },
    other: {
      title: 'Other Accounts',
      icon: Layers,
      isLiability: false,
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      order: 5,
    },
  };

  // Group accounts by type
  const groupedByType = useMemo(() => {
    const map: Record<string, any[]> = {};
    accounts.forEach((acc) => {
      const t = acc.type && TYPE_CONFIG[acc.type] ? acc.type : 'other';
      if (!map[t]) map[t] = [];
      map[t].push(acc);
    });
    return map;
  }, [accounts]);

  const activeTypes = useMemo(() => {
    return Object.keys(groupedByType).sort((a, b) => {
      const orderA = TYPE_CONFIG[a]?.order ?? 99;
      const orderB = TYPE_CONFIG[b]?.order ?? 99;
      return orderA - orderB;
    });
  }, [groupedByType]);

  // Unique linked institutions for institutions management modal
  const linkedInstitutions = useMemo(() => {
    const instMap = new Map<
      string,
      { id: string; name: string; accountCount: number }
    >();
    accounts.forEach((acc) => {
      const name = acc.institutionName || 'Other Financial Institution';
      const plaidItemId = acc.plaidItemId || acc.id;
      if (!instMap.has(name)) {
        instMap.set(name, { id: plaidItemId, name, accountCount: 1 });
      } else {
        instMap.get(name)!.accountCount += 1;
      }
    });
    return Array.from(instMap.values());
  }, [accounts]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200 relative">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Landmark className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
            <span>Connected Institutions & Accounts</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage linked banks, toggle tracking for budget and net worth, or unlink accounts anytime
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          {linkedInstitutions.length > 0 && (
            <button
              type="button"
              onClick={() => setIsInstitutionsModalOpen(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 cursor-pointer flex-1 sm:flex-initial shadow-sm"
              title="Manage linked institutions and unlinking"
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Institutions ({linkedInstitutions.length})</span>
            </button>
          )}

          <button
            onClick={handleSyncAll}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 disabled:opacity-60 cursor-pointer flex-1 sm:flex-initial shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-500 dark:text-indigo-400' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Fresh Data'}</span>
          </button>

          <button
            onClick={onOpenPlaid}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 transition-all active:scale-95 flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            <span>Link Bank</span>
          </button>
        </div>
      </div>

      {/* Summary stats pill */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsInstitutionsModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs text-left transition-colors cursor-pointer group shadow-sm"
          >
            <span className="text-slate-500 block text-[10px] font-semibold uppercase group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
              Institutions
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{linkedInstitutions.length} Connected</span>
          </button>
          <div className="px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase">
              Tracked Accounts
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{trackedCount}</span>
          </div>
          {untrackedCount > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">
                Untracked / Hidden
              </span>
              <span className="font-bold text-slate-500 dark:text-slate-400">{untrackedCount}</span>
            </div>
          )}

          {/* Overall Revolving Credit Utilization Pill */}
          {overallUtilizationPct != null && (
            <div className="px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs col-span-2 sm:col-span-auto shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 text-[10px] font-semibold uppercase">
                  Revolving Credit Used
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                    overallUtilizationPct < 10
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      : overallUtilizationPct < 30
                        ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20'
                        : overallUtilizationPct < 50
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                          : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20'
                  }`}
                >
                  {overallUtilizationPct < 10
                    ? 'Optimal (<10%)'
                    : overallUtilizationPct < 30
                      ? 'Good (<30%)'
                      : overallUtilizationPct < 50
                        ? 'Elevated'
                        : 'High (>50%)'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className={`font-bold text-sm ${
                    overallUtilizationPct < 10
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : overallUtilizationPct < 30
                        ? 'text-sky-600 dark:text-sky-400'
                        : overallUtilizationPct < 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {overallUtilizationPct.toFixed(1)}%
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  (${Math.round(totalRevolvingBalance).toLocaleString()} / $
                  {Math.round(totalRevolvingLimit).toLocaleString()} limit)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account List Grouped by Institution */}
      {accounts.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No Accounts Connected</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
              Connect your bank or brokerage account via Plaid to choose which accounts to track.
            </p>
          </div>
          <button
            onClick={onOpenPlaid}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Bank Account</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeTypes.map((typeKey) => {
            const typeAccounts = groupedByType[typeKey];
            const cfg = TYPE_CONFIG[typeKey] || TYPE_CONFIG.other;
            const Icon = cfg.icon;

            const groupTotal = typeAccounts
              .filter((a) => !a.isHidden)
              .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

            return (
              <div key={typeKey} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${cfg.color} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                          {cfg.title}
                        </h3>
                        <span className="text-xs text-slate-500 font-medium">
                          • {typeAccounts.length} account{typeAccounts.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mr-1.5 hidden sm:inline">
                      Total:
                    </span>
                    <span
                      className={`text-sm font-extrabold ${
                        cfg.isLiability ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {cfg.isLiability && groupTotal > 0 ? '-' : ''}$
                      {groupTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {typeAccounts.map((acc: any) => {
                    const balance = Number(acc.currentBalance) || 0;
                    const isTracked = !acc.isHidden;
                    const isBusy = updatingId === acc.id;

                    const isCredit = acc.type === 'credit';
                    const creditLimit =
                      Number(acc.creditLimit) ||
                      (acc.availableBalance != null && acc.currentBalance != null
                        ? Number(acc.availableBalance) + Number(acc.currentBalance)
                        : null);
                    const availableCredit =
                      acc.availableBalance != null
                        ? Number(acc.availableBalance)
                        : creditLimit != null
                          ? Math.max(0, creditLimit - balance)
                          : null;
                    const cardUtilization =
                      isCredit && creditLimit != null && creditLimit > 0
                        ? Math.min(100, Math.max(0, (balance / creditLimit) * 100))
                        : null;

                    return (
                      <div
                        key={acc.id}
                        className={`glass-panel rounded-2xl p-5 flex flex-col justify-between transition-all min-w-0 ${
                          isTracked
                            ? 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                            : 'border-slate-200/50 dark:border-slate-800/40 opacity-70 bg-slate-100/40 dark:bg-slate-950/40'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isTracked
                                  ? cfg.color
                                  : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className={`text-sm font-bold truncate ${
                                  isTracked ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {acc.name}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 capitalize truncate">
                                {acc.institutionName ? `${acc.institutionName} • ` : ''}
                                {acc.subtype || acc.type}{' '}
                                {acc.mask ? `(••• ${acc.mask})` : ''}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons: Tracking Toggle & Delete */}
                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleTrack(acc)}
                              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                isTracked
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : 'bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
                              }`}
                              title={
                                isTracked
                                  ? 'Click to untrack this account'
                                  : 'Click to track this account'
                              }
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isTracked ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Tracked</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Untracked</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setConfirmModal({
                                  type: 'account',
                                  id: acc.id,
                                  name: acc.name,
                                 })
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20 cursor-pointer"
                              title={`Remove ${acc.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Credit Utilization Bar & Metrics (for credit cards) */}
                        {isCredit && isTracked && editingLimitId === acc.id && (
                          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex flex-col gap-2">
                            <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                              <span>Set Credit Limit:</span>
                              <span className="text-[10px] text-slate-500 font-normal">Banks like Discover/Fidelity omit limits via Plaid</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs font-semibold">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="100"
                                  value={editingLimitValue}
                                  onChange={(e) => setEditingLimitValue(e.target.value)}
                                  placeholder="e.g. 10000"
                                  className="w-full bg-white dark:bg-slate-900 border border-indigo-500/40 focus:border-indigo-500 rounded-xl pl-6 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveLimit(acc.id);
                                    if (e.key === 'Escape') {
                                      setEditingLimitId(null);
                                      setEditingLimitValue('');
                                    }
                                  }}
                                />
                              </div>
                              <button
                                type="button"
                                disabled={isSavingLimit}
                                onClick={() => handleSaveLimit(acc.id)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                              >
                                {isSavingLimit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSavingLimit}
                                onClick={() => {
                                  setEditingLimitId(null);
                                  setEditingLimitValue('');
                                }}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {isCredit && isTracked && editingLimitId !== acc.id && creditLimit != null && creditLimit > 0 && cardUtilization != null && (
                          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                                <span>Credit Utilization</span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    cardUtilization < 10
                                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                                      : cardUtilization < 30
                                        ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20'
                                        : cardUtilization < 50
                                          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                                          : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20'
                                  }`}
                                >
                                  {cardUtilization < 10
                                    ? 'Optimal (<10%)'
                                    : cardUtilization < 30
                                      ? 'Good (<30%)'
                                      : cardUtilization < 50
                                        ? 'Elevated'
                                        : 'High (>50%)'}
                                </span>
                              </span>
                              <span
                                className={`font-bold ${
                                  cardUtilization < 10
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : cardUtilization < 30
                                      ? 'text-sky-600 dark:text-sky-400'
                                      : cardUtilization < 50
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {cardUtilization.toFixed(1)}%
                              </span>
                            </div>

                            {/* Progress bar track */}
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  cardUtilization < 10
                                    ? 'bg-emerald-500'
                                    : cardUtilization < 30
                                      ? 'bg-sky-500'
                                      : cardUtilization < 50
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(2, cardUtilization))}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                              <span>
                                {availableCredit != null
                                  ? `$${Math.round(availableCredit).toLocaleString()} available`
                                  : ''}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span>Limit: ${Math.round(creditLimit).toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLimitId(acc.id);
                                    setEditingLimitValue(String(Math.round(creditLimit)));
                                  }}
                                  className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {isCredit && isTracked && editingLimitId !== acc.id && (creditLimit == null || creditLimit <= 0) && (
                          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                              Limit not reported by bank
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLimitId(acc.id);
                                setEditingLimitValue('');
                              }}
                              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Set Limit</span>
                            </button>
                          </div>
                        )}

                        <div className="mt-5 pt-3.5 border-t border-slate-200 dark:border-slate-800/80 flex items-baseline justify-between">
                          <div className="text-xs text-slate-500">
                            {isTracked ? (isCredit ? 'Current Balance (Revolving)' : 'Current Balance') : 'Excluded from Totals'}
                          </div>
                          <div
                            className={`text-xl font-extrabold ${
                              isTracked ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 line-through'
                            }`}
                          >
                            $
                            {balance.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0e121b] border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-black/80 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {confirmModal.type === 'institution'
                  ? `Unlink ${confirmModal.name}?`
                  : `Remove ${confirmModal.name}?`}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                {confirmModal.type === 'institution'
                  ? 'This will disconnect the institution and delete all associated accounts, transactions, and holdings from your workspace. If linked to Plaid, the connection will be revoked.'
                  : 'This will permanently remove this account and its associated transactions from your dashboard.'}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {confirmModal.type === 'institution' ? 'Unlink' : 'Remove'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected Institutions Management Modal */}
      {isInstitutionsModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0e121b] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Connected Institutions</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {linkedInstitutions.length} linked banking institution{linkedInstitutions.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInstitutionsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {linkedInstitutions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No linked institutions.
                </div>
              ) : (
                linkedInstitutions.map((inst) => (
                  <div
                    key={inst.name}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{inst.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {inst.accountCount} linked account{inst.accountCount === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {onReconnectInstitution && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsInstitutionsModalOpen(false);
                            onReconnectInstitution({ id: inst.id, name: inst.name });
                          }}
                          className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-white bg-indigo-500/10 hover:bg-indigo-600/30 border border-indigo-500/20 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer font-medium"
                          title={`Re-authenticate with ${inst.name} using Plaid Update Mode`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Fix / Reconnect</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setIsInstitutionsModalOpen(false);
                          setConfirmModal({
                            type: 'institution',
                            id: inst.id,
                            name: inst.name,
                          });
                        }}
                        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-200 dark:bg-slate-850 hover:bg-rose-500/10 border border-slate-300 dark:border-slate-800 hover:border-rose-500/30 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
                        title={`Unlink ${inst.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Unlink</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsInstitutionsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
