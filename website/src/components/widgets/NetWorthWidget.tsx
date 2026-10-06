'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  Landmark,
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from 'lucide-react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface NetWorthWidgetProps {
  accounts?: any[];
}

interface NetWorthData {
  timeframe: string;
  currentNetWorth: number;
  startingNetWorth: number;
  changeAmount: number;
  changePercent: number;
  cashTotal: number;
  investTotal: number;
  liabilitiesTotal: number;
  hasAccounts: boolean;
  history: { date: string; value: number }[];
}

const TIMEFRAMES = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

export const NetWorthWidget: React.FC<NetWorthWidgetProps> = ({
  accounts = [],
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1Y');
  const [netWorthData, setNetWorthData] = useState<NetWorthData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hoveredPoint, setHoveredPoint] = useState<{
    date: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);

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

  const fetchNetWorth = useCallback(async (tf: Timeframe) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/stocks/net-worth?timeframe=${tf}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setNetWorthData(data);
      }
    } catch (err) {
      console.warn('Failed to load net worth history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNetWorth(selectedTimeframe);
  }, [selectedTimeframe, fetchNetWorth, accounts]);

  // Only include tracked accounts (exclude isHidden: true)
  const trackedAccounts = accounts.filter((a) => !a.isHidden);
  const hiddenCount = accounts.length - trackedAccounts.length;
  const hasAccounts = trackedAccounts.length > 0 || Boolean(netWorthData?.hasAccounts);

  // Exact live calculations from tracked connected accounts
  const liveCash = trackedAccounts
    .filter((a) => a.type === 'depository')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const liveInvest = trackedAccounts
    .filter((a) => a.type === 'investment')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const liveCredit = trackedAccounts
    .filter((a) => a.type === 'credit')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const liveLoan = trackedAccounts
    .filter((a) => a.type === 'loan')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const liveLiabilities = liveCredit + liveLoan;

  const cashTotal = accounts.length > 0 ? liveCash : (netWorthData?.cashTotal ?? 0);
  const investTotal = accounts.length > 0 ? liveInvest : (netWorthData?.investTotal ?? 0);
  const totalLiabilities = accounts.length > 0 ? liveLiabilities : (netWorthData?.liabilitiesTotal ?? 0);

  // Net worth = Assets - Liabilities
  const netWorth = accounts.length > 0
    ? (liveCash + liveInvest - liveLiabilities)
    : (netWorthData?.currentNetWorth ?? 0);

  // Map authentic history data points
  const historyData = useMemo(() => {
    if (!netWorthData?.history || netWorthData.history.length === 0) {
      return [];
    }

    return netWorthData.history.map((p) => {
      let formattedDate = p.date;
      try {
        const d = new Date(p.date.includes('T') ? p.date : `${p.date}T12:00:00`);
        formattedDate = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      } catch {
        // fallback
      }
      return {
        date: formattedDate,
        rawDate: p.date,
        value: Number(p.value),
      };
    });
  }, [netWorthData]);

const formatAxisMetric = (val: number): string => {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2);
    return `${sign}$${formatted.replace(/\.0+$/, '')}M`;
  }
  if (abs >= 10_000) {
    const formatted = (abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1);
    return `${sign}$${formatted.replace(/\.0+$/, '')}k`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${sign}$${Math.round(abs)}`;
};

  // Calculate SVG curve geometry & vertical axis ticks
  const svgGeometry = useMemo(() => {
    if (!historyData || historyData.length < 2) return null;

    const values = historyData.map((p) => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const valRange = rawMax - rawMin || (rawMax > 0 ? rawMax * 0.1 : 100);
    const minVal = rawMin;
    const maxVal = rawMax;

    const width = 800;
    const height = 150;
    const paddingX = 8;
    const paddingY = 12;

    const coords = historyData.map((p, idx) => {
      const x = (idx / (historyData.length - 1)) * (width - paddingX * 2) + paddingX;
      const y =
        height -
        paddingY -
        ((p.value - minVal) / valRange) * (height - paddingY * 2);
      return { x, y, date: p.date, value: p.value };
    });

    // Generate 4 reference ticks from top to bottom
    const tickLevels = [1, 2 / 3, 1 / 3, 0];
    const ticks = tickLevels.map((lvl) => {
      const value = minVal + valRange * lvl;
      const y = height - paddingY - lvl * (height - paddingY * 2);
      return { value, y };
    });

    // Generate clean straight line segments from point to point
    let linePath = coords
      .map(
        (c: { x: number; y: number }, i: number) =>
          `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`,
      )
      .join(' ');

    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${
      coords[0].x.toFixed(1)
    } ${height} Z`;

    return { linePath, areaPath, coords, ticks, width, height };
  }, [historyData]);

  const changeAmount = netWorthData?.changeAmount ?? 0;
  const changePercent = netWorthData?.changePercent ?? 0;
  const isPositive = changeAmount >= 0;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgGeometry || !svgGeometry.coords.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgGeometry.width;

    let closest = svgGeometry.coords[0];
    let minDiff = Math.abs(closest.x - mouseX);
    for (let i = 1; i < svgGeometry.coords.length; i++) {
      const diff = Math.abs(svgGeometry.coords[i].x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = svgGeometry.coords[i];
      }
    }
    setHoveredPoint(closest);
  };

  return (
    <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-6 flex flex-col justify-between h-full relative overflow-hidden">
      {/* Top Bar */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Total Net Worth
              </span>
              <span className="text-[11px] text-slate-500">
                {hasAccounts
                  ? `${trackedAccounts.length} Tracked Account${
                      trackedAccounts.length === 1 ? '' : 's'
                    }${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}`
                  : 'No Accounts Tracked'}
              </span>
            </div>
          </div>

          {/* Timeframe selector */}
          <div className="flex flex-wrap items-center bg-slate-200/80 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800 self-start sm:self-auto gap-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedTimeframe === tf
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Big Balance & Change */}
        <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            ${Math.floor(netWorth).toLocaleString()}
            <span className="text-slate-400 dark:text-slate-500 text-lg sm:text-xl font-medium">
              .{Math.abs(Math.round((netWorth % 1) * 100)).toString().padStart(2, '0')}
            </span>
          </div>

          {hasAccounts && (
            <span
              className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              {isPositive ? '+' : '-'}$
              {Math.abs(changeAmount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              {selectedTimeframe}
            </span>
          )}
        </div>
      </div>

      {/* Interactive Net Worth Graph with Left Vertical Metrics */}
      <div className="relative w-full h-40 my-4 overflow-hidden rounded-xl">
        {!hasAccounts || !svgGeometry ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl bg-slate-50/50 dark:bg-slate-950/30">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              No Net Worth History Yet
            </div>
            <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
              Connect a bank account to generate your net worth trajectory curve.
            </p>
          </div>
        ) : (
          <div className="flex items-stretch w-full h-full">
            {/* Left Vertical Number Metrics Column */}
            <div className="flex flex-col justify-between py-2.5 text-[9px] sm:text-[10px] font-mono text-slate-500 dark:text-slate-400 select-none text-right shrink-0 pr-2 border-r border-slate-200 dark:border-slate-800/80 w-11 sm:w-14">
              {svgGeometry.ticks.map((t, idx) => (
                <span
                  key={idx}
                  className="leading-none truncate text-slate-500 dark:text-slate-400"
                  title={`$${Math.round(t.value).toLocaleString()}`}
                >
                  {formatAxisMetric(t.value)}
                </span>
              ))}
            </div>

            {/* Main Chart Area */}
            <div className="relative flex-1 h-full overflow-hidden">
              <svg
                viewBox={`0 0 ${svgGeometry.width} ${svgGeometry.height}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <defs>
                  <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#cb6de6" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#cb6de6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal reference gridlines matching vertical metrics */}
                {svgGeometry.ticks.map((t, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    y1={t.y.toFixed(1)}
                    x2={svgGeometry.width}
                    y2={t.y.toFixed(1)}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800/60"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                ))}

                {/* Area fill */}
                <path d={svgGeometry.areaPath} fill="url(#nwGradient)" />

                {/* Stroke line */}
                <path
                  d={svgGeometry.linePath}
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Interactive Hover Points */}
                {svgGeometry.coords.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="6"
                    className="fill-transparent hover:fill-indigo-400 cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredPoint(pt)}
                  />
                ))}

                {/* Active Hover Dot */}
                {hoveredPoint && (
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="5"
                    className="fill-indigo-300 stroke-2 stroke-slate-950"
                  />
                )}
              </svg>

              {/* Hover Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-12 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg shadow-xl text-center z-10"
                  style={{
                    left: `${(hoveredPoint.x / svgGeometry.width) * 100}%`,
                    top: `${(hoveredPoint.y / svgGeometry.height) * 100}%`,
                  }}
                >
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {hoveredPoint.date}
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    $
                    {hoveredPoint.value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Asset Breakdown Footer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5 bg-slate-100/60 dark:bg-slate-900/40 sm:bg-transparent p-2 sm:p-0 rounded-xl">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-500 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1 sm:flex-initial">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
              Cash & Savings
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
              $
              {cashTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-slate-100/60 dark:bg-slate-900/40 sm:bg-transparent p-2 sm:p-0 rounded-xl">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1 sm:flex-initial">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
              Investments
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
              $
              {investTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-slate-100/60 dark:bg-slate-900/40 sm:bg-transparent p-2 sm:p-0 rounded-xl">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1 sm:flex-initial">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
              Debts & Credit
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
              $
              {totalLiabilities.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
