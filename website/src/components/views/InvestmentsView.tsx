'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  PieChart,
  Layers,
  Plus,
  Landmark,
  CheckCircle2,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Clock,
} from 'lucide-react';
import { InvestmentGraphWidget } from '../widgets/InvestmentGraphWidget';

interface InvestmentsViewProps {
  accounts?: any[];
  onOpenPlaid?: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  accounts = [],
  onOpenPlaid,
}) => {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [isLoadingHoldings, setIsLoadingHoldings] = useState<boolean>(true);
  const [activity, setActivity] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(true);

  // Only include tracked investment accounts
  const investAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'investment' && !a.isHidden),
    [accounts],
  );

  const totalInvestments = useMemo(
    () =>
      investAccounts.reduce(
        (sum, a) => sum + (Number(a.currentBalance) || 0),
        0,
      ),
    [investAccounts],
  );

  const hasInvestments = investAccounts.length > 0;

  useEffect(() => {
    async function fetchHoldings() {
      try {
        setIsLoadingHoldings(true);
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('lunaria_token')
            : null;
        const [hRes, aRes] = await Promise.all([
          fetch(`${API_BASE}/stocks/holdings`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }),
          fetch(`${API_BASE}/stocks/activity?limit=30`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }),
        ]);

        if (hRes.ok) {
          const hData = await hRes.json();
          setHoldings(hData || []);
        }
        if (aRes.ok) {
          const aData = await aRes.json();
          setActivity(aData || []);
        }
      } catch (err) {
        console.warn('Failed to load investment data:', err);
      } finally {
        setIsLoadingHoldings(false);
        setIsLoadingActivity(false);
      }
    }

    fetchHoldings();
  }, [accounts]);

  const { totalCostBasis, totalGain, totalGainPercent } = useMemo(() => {
    let basisSum = 0;
    let valueSum = 0;
    for (const h of holdings) {
      if (h.costBasis && Number(h.costBasis) > 0) {
        basisSum += Number(h.costBasis);
        valueSum += Number(h.institutionValue) || 0;
      }
    }
    const gain = valueSum - basisSum;
    const gainPercent = basisSum > 0 ? (gain / basisSum) * 100 : 0;
    return {
      totalCostBasis: basisSum,
      totalGain: gain,
      totalGainPercent: gainPercent,
    };
  }, [holdings]);

  // Asset distribution palette
  const PALETTE = ['bg-purple-500', 'bg-fuchsia-400', 'bg-emerald-400', 'bg-amber-400', 'bg-sky-400'];


  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-full overflow-x-hidden">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Investments & Portfolio</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {hasInvestments
              ? `Tracking ${investAccounts.length} investment accounts totaling $${totalInvestments.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : 'No investment or brokerage accounts connected yet'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Plaid Live Holdings Synced</span>
          </div>

          <button
            onClick={onOpenPlaid}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Link Brokerage</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {hasInvestments && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="glass-panel rounded-2xl p-4 space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Portfolio Value
            </span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              ${totalInvestments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500">Live aggregated market value</div>
          </div>

          <div className="glass-panel rounded-2xl p-4 space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Cost Basis
            </span>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">
              ${totalCostBasis > 0 ? totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </div>
            <div className="text-xs text-slate-500">Total dollars invested</div>
          </div>

          <div className="glass-panel rounded-2xl p-4 space-y-1 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Unrealized Return
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-extrabold ${totalGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totalGain >= 0 ? '+' : ''}${Math.abs(totalGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {totalCostBasis > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  totalGain >= 0
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                    : 'text-rose-600 dark:text-rose-400 bg-rose-500/15 border-rose-500/30'
                }`}>
                  {totalGain >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">Capital gains across all funds</div>
          </div>
        </div>
      )}

      {/* Large Investment Performance Chart */}
      <div className="grid grid-cols-1 gap-5">
        <InvestmentGraphWidget accounts={accounts} onOpenPlaid={onOpenPlaid} />
      </div>

      {/* Live Holdings & Asset Breakdown */}
      {hasInvestments ? (
        <div className="space-y-6">
          {/* Individual Holdings Table */}
          <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4 min-w-0 max-w-full overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span>Live Portfolio Holdings</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {holdings.length} Positions Synced via Plaid
              </span>
            </div>

            {holdings.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                Syncing live stock and fund positions...
              </div>
            ) : (
              <div className="overflow-x-auto w-full max-w-full">
                <table className="w-full text-left text-xs min-w-[620px]">
                  <thead>
                    <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Security / Fund</th>
                      <th className="pb-3 font-semibold">Account</th>
                      <th className="pb-3 font-semibold text-right">Shares & Price</th>
                      <th className="pb-3 font-semibold text-right">Cost Basis</th>
                      <th className="pb-3 font-semibold text-right">Market Value</th>
                      <th className="pb-3 font-semibold text-right">Unrealized Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                    {holdings.map((h) => {
                      const value = Number(h.institutionValue) || 0;
                      const price = Number(h.institutionPrice) || 0;
                      const quantity = Number(h.quantity) || 0;
                      const basis = h.costBasis != null ? Number(h.costBasis) : null;
                      const gainAmount = h.unrealizedGain;
                      const gainPercent = h.unrealizedGainPercent;

                      return (
                        <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 pr-4">
                            <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{h.tickerSymbol}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20">
                                {h.tickerSymbol === 'SPAXX' ? 'CASH' : 'INDEX FUND'}
                              </span>
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-xs mt-0.5" title={h.name}>
                              {h.name}
                            </div>
                          </td>

                          <td className="py-3.5 pr-4 text-slate-700 dark:text-slate-300 font-medium">
                            <div>{h.accountName || 'Brokerage'}</div>
                            <div className="text-[10px] text-slate-500">{h.institutionName}</div>
                          </td>

                          <td className="py-3.5 pr-4 text-right">
                            <div className="text-slate-800 dark:text-slate-200 font-semibold">{quantity.toFixed(3)} shares</div>
                            <div className="text-[10px] text-slate-500">@ ${price.toFixed(2)}</div>
                          </td>

                          <td className="py-3.5 pr-4 text-right text-slate-500 dark:text-slate-400 font-medium">
                            {basis != null ? `$${basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                          </td>

                          <td className="py-3.5 pr-4 text-right font-bold text-slate-900 dark:text-slate-100">
                            ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="py-3.5 text-right">
                            {gainPercent != null ? (
                              <div>
                                <span
                                  className={`inline-flex items-center gap-0.5 font-bold px-2 py-0.5 rounded-full text-[11px] border ${
                                    gainPercent >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                      : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                                  }`}
                                >
                                  {gainPercent >= 0 ? '+' : ''}{gainPercent}%
                                </span>
                                {gainAmount != null && (
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    {gainAmount >= 0 ? '+' : ''}${Math.abs(gainAmount).toFixed(2)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Asset Allocation Breakdown & Connected Accounts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0 max-w-full">
            {/* Holdings Allocation */}
            <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4 min-w-0 max-w-full overflow-hidden shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                <span>Security Allocation</span>
              </h3>

              <div className="space-y-3 pt-2">
                {holdings.map((h, i) => {
                  const val = Number(h.institutionValue) || 0;
                  const pct = totalInvestments > 0 ? Math.round((val / totalInvestments) * 1000) / 10 : 0;
                  const color = PALETTE[i % PALETTE.length];

                  return (
                    <div key={h.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">{h.tickerSymbol} <span className="text-slate-500 font-normal">({h.accountName})</span></span>
                        <span className="font-bold text-slate-900 dark:text-white">{pct}% <span className="text-slate-500 dark:text-slate-400 font-normal">(${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span></span>
                      </div>
                      <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Connected Accounts */}
            <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4 min-w-0 max-w-full overflow-hidden shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>Connected Accounts</span>
              </h3>

              <div className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {investAccounts.map((acc) => {
                  const balance = Number(acc.currentBalance) || 0;
                  return (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white">{acc.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {acc.institutionName} •{' '}
                            <span className="capitalize">{acc.subtype || 'Brokerage'}</span>{' '}
                            {acc.mask ? `(••• ${acc.mask})` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                          ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Active
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Investment Activity & Stock Purchases Table */}
            <div className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4 min-w-0 max-w-full overflow-hidden shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span>Investment Activity & Recurring Purchases</span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {activity.length} Transactions Synced via Plaid
                </span>
              </div>

              {isLoadingActivity ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                  Loading investment activity...
                </div>
              ) : activity.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                  No investment transactions recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto w-full max-w-full">
                  <table className="w-full text-left border-collapse min-w-[580px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 pl-2">Date</th>
                        <th className="pb-3">Security</th>
                        <th className="pb-3">Type & Description</th>
                        <th className="pb-3 text-right">Shares</th>
                        <th className="pb-3 text-right">Price</th>
                        <th className="pb-3 text-right pr-2">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50 text-xs">
                      {activity.map((tx: any) => {
                        const isBuy = tx.type === 'buy';
                        const isDividend = tx.subtype === 'dividend';
                        const isDeposit = tx.subtype === 'deposit' || tx.subtype === 'contribution';
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 pl-2 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                              {tx.date}
                            </td>
                            <td className="py-3 whitespace-nowrap">
                              {tx.tickerSymbol ? (
                                <span className="font-extrabold text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
                                  {tx.tickerSymbol}
                                </span>
                              ) : (
                                <span className="font-semibold text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  CASH
                                </span>
                              )}
                            </td>
                            <td className="py-3 max-w-xs truncate text-slate-700 dark:text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                    isBuy
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                      : isDividend
                                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                                      : isDeposit
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {tx.subtype || tx.type}
                                </span>
                                <span className="truncate text-slate-600 dark:text-slate-300" title={tx.name}>
                                  {tx.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 text-right text-slate-700 dark:text-slate-300 font-mono">
                              {Number(tx.quantity) !== 0
                                ? Number(tx.quantity).toFixed(3)
                                : '—'}
                            </td>
                            <td className="py-3 text-right text-slate-500 dark:text-slate-400 font-mono">
                              {Number(tx.price) > 0
                                ? `$${Number(tx.price).toFixed(2)}`
                                : '—'}
                            </td>
                            <td
                              className={`py-3 text-right pr-2 font-bold font-mono ${
                                isBuy
                                  ? 'text-slate-900 dark:text-white'
                                  : isDeposit || isDividend
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              ${Math.abs(Number(tx.amount)).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-10 text-center space-y-3 border border-dashed border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Investment Accounts Connected</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Link a brokerage, IRA, or 401(k) account via Plaid to track live equity holdings and performance.
          </p>
          <div className="pt-2">
            <button
              onClick={onOpenPlaid}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Link Investment Account</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
