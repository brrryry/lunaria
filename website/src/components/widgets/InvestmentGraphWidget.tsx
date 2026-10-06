'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Loader2, Landmark, Check } from 'lucide-react';

const TIMEFRAMES = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface InvestmentGraphWidgetProps {
  accounts?: any[];
  onOpenPlaid?: () => void;
}

export const InvestmentGraphWidget: React.FC<InvestmentGraphWidgetProps> = ({
  accounts,
  onOpenPlaid,
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1Y');
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Benchmark toggle states
  const [showSp500, setShowSp500] = useState<boolean>(true);
  const [showUsStocks, setShowUsStocks] = useState<boolean>(true);
  const [showUsBonds, setShowUsBonds] = useState<boolean>(true);

  const [hoveredPoint, setHoveredPoint] = useState<{
    date: string;
    value: number;
    percent: number;
    sp500Percent?: number;
    usStocksPercent?: number;
    usBondsPercent?: number;
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

  // Check user's live tracked investment accounts
  const investAccounts = useMemo(() => {
    if (!accounts) return null;
    return accounts.filter((a: any) => a.type === 'investment' && !a.isHidden);
  }, [accounts]);

  const liveInvestmentTotal = useMemo(() => {
    if (!investAccounts) return null;
    return investAccounts.reduce(
      (sum: number, a: any) => sum + (Number(a.currentBalance) || 0),
      0,
    );
  }, [investAccounts]);

  const fetchPortfolio = useCallback(async (tf: Timeframe) => {
    if (investAccounts !== null && investAccounts.length === 0) {
      setPortfolioData({
        timeframe: tf,
        currentValue: 0,
        startingValue: 0,
        changeAmount: 0,
        changePercent: 0,
        hasInvestments: false,
        history: [],
      });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/stocks/portfolio?timeframe=${tf}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setPortfolioData(data);
      }
    } catch (err) {
      console.warn('Failed to load portfolio history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [investAccounts]);

  useEffect(() => {
    fetchPortfolio(selectedTimeframe);
  }, [selectedTimeframe, fetchPortfolio]);

  const history = portfolioData?.history || [];
  const currentValue =
    liveInvestmentTotal !== null && liveInvestmentTotal > 0
      ? liveInvestmentTotal
      : portfolioData?.currentValue || 0;
  const changeAmount = portfolioData?.changeAmount || 0;
  const changePercent = portfolioData?.changePercent || 0;
  const isPositive = changeAmount >= 0;
  const hasInvestments =
    (investAccounts !== null ? investAccounts.length > 0 : portfolioData?.hasInvestments) &&
    currentValue > 0;

  const benchmarks = portfolioData?.benchmarks || {
    sp500: { name: 'S&P 500', ticker: 'SPX', changePercent: 19.16, alpha: 0.32 },
    usStocks: { name: 'US Total Stock Market', ticker: 'VTI', changePercent: 18.85, alpha: 0.63 },
    usBonds: { name: 'US Aggregate Bond Market', ticker: 'BND', changePercent: 4.82, alpha: 14.66 },
  };

  // Calculate SVG curve paths based on Growth Percentage (%) across active lines
  const svgGeometry = useMemo(() => {
    if (!history || history.length < 2) return null;

    const portfolioValues = history.map((p: any) => Number(p.percent) || 0);
    const sp500Values = history.map((p: any) => Number(p.sp500Percent) || 0);
    const usStocksValues = history.map((p: any) => Number(p.usStocksPercent) || 0);
    const usBondsValues = history.map((p: any) => Number(p.usBondsPercent) || 0);

    const allActiveValues = [...portfolioValues];
    if (showSp500) allActiveValues.push(...sp500Values);
    if (showUsStocks) allActiveValues.push(...usStocksValues);
    if (showUsBonds) allActiveValues.push(...usBondsValues);

    const rawMin = Math.min(...allActiveValues);
    const rawMax = Math.max(...allActiveValues);
    const minVal = Math.min(0, rawMin);
    const maxVal = Math.max(5, rawMax);
    const valRange = maxVal - minVal || 1;

    const width = 800;
    const height = 200;
    const padding = 20;
    const zeroY =
      height - padding - ((0 - minVal) / valRange) * (height - padding * 2);

    const coords = history.map((p: any, idx: number) => {
      const x = (idx / (history.length - 1)) * (width - padding * 2) + padding;
      const pct = portfolioValues[idx];
      const y =
        height - padding - ((pct - minVal) / valRange) * (height - padding * 2);

      let formattedDate = p.timestamp;
      try {
        const d = new Date(
          p.timestamp.includes('T') ? p.timestamp : `${p.timestamp}T12:00:00`,
        );
        formattedDate = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      } catch {
        // fallback
      }

      return {
        x,
        y,
        date: formattedDate,
        rawDate: p.timestamp,
        percent: pct,
        sp500Percent: sp500Values[idx],
        usStocksPercent: usStocksValues[idx],
        usBondsPercent: usBondsValues[idx],
        value: p.value,
      };
    });

    const sp500Coords = history.map((p: any, idx: number) => {
      const x = (idx / (history.length - 1)) * (width - padding * 2) + padding;
      const pct = sp500Values[idx];
      const y =
        height - padding - ((pct - minVal) / valRange) * (height - padding * 2);
      return { x, y, percent: pct };
    });

    const usStocksCoords = history.map((p: any, idx: number) => {
      const x = (idx / (history.length - 1)) * (width - padding * 2) + padding;
      const pct = usStocksValues[idx];
      const y =
        height - padding - ((pct - minVal) / valRange) * (height - padding * 2);
      return { x, y, percent: pct };
    });

    const usBondsCoords = history.map((p: any, idx: number) => {
      const x = (idx / (history.length - 1)) * (width - padding * 2) + padding;
      const pct = usBondsValues[idx];
      const y =
        height - padding - ((pct - minVal) / valRange) * (height - padding * 2);
      return { x, y, percent: pct };
    });

    const buildPath = (pts: Array<{ x: number; y: number }>) =>
      pts
        .map(
          (c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`,
        )
        .join(' ');

    const linePath = buildPath(coords);
    const sp500LinePath = buildPath(sp500Coords);
    const usStocksLinePath = buildPath(usStocksCoords);
    const usBondsLinePath = buildPath(usBondsCoords);

    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${
      coords[0].x.toFixed(1)
    } ${height} Z`;

    return {
      linePath,
      areaPath,
      sp500LinePath,
      usStocksLinePath,
      usBondsLinePath,
      coords,
      sp500Coords,
      usStocksCoords,
      usBondsCoords,
      width,
      height,
      zeroY,
      minVal,
      maxVal,
    };
  }, [history, showSp500, showUsStocks, showUsBonds]);

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
    <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden min-w-0 max-w-full">
      {/* Top Header & Metrics */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4 mb-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Portfolio Growth Rate vs Benchmarks</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
            <div
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight shrink-0 ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPositive ? '+' : ''}
              {changePercent.toFixed(2)}%
            </div>

            {hasInvestments && (
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full font-medium">
                  <span className="text-slate-500">Period:</span>
                  <span>{selectedTimeframe}</span>
                </div>

                {portfolioData?.totalUnrealizedGainPercent != null && (
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full font-bold">
                    <span>
                      All-Time: +{portfolioData.totalUnrealizedGainPercent}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium mt-1">
            {hasInvestments
              ? selectedTimeframe === 'ALL' && portfolioData?.earliestHistoryDate
                ? `Cumulative growth since ${new Date(
                    portfolioData.earliestHistoryDate + 'T12:00:00',
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : `Normalized cumulative growth from 0.0% (${selectedTimeframe})`
              : 'No investment accounts currently connected'}
          </div>
        </div>

        {/* Timeframe Controls */}
        <div className="flex flex-wrap items-center bg-slate-200/80 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800 self-start sm:self-auto gap-0.5">
          {(portfolioData?.availableTimeframes || ['1M', '3M', '6M', '1Y', 'ALL']).map(
            (tf: string) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf as Timeframe)}
                className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedTimeframe === tf
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Benchmark Series Toggle Bar */}
      {hasInvestments && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 my-2 min-w-0">
          <span className="text-[11px] text-slate-500 font-medium mr-1">Compare:</span>

          {/* Portfolio Pill (Always Active) */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Portfolio ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</span>
          </div>

          {/* S&P 500 Toggle */}
          <button
            onClick={() => setShowSp500(!showSp500)}
            className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              showSp500
                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showSp500 ? 'bg-sky-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
            <span>S&P 500 ({benchmarks.sp500.changePercent >= 0 ? '+' : ''}{benchmarks.sp500.changePercent.toFixed(2)}%)</span>
          </button>

          {/* US Stocks Toggle */}
          <button
            onClick={() => setShowUsStocks(!showUsStocks)}
            className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              showUsStocks
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showUsStocks ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
            <span>US Stocks ({benchmarks.usStocks.changePercent >= 0 ? '+' : ''}{benchmarks.usStocks.changePercent.toFixed(2)}%)</span>
          </button>

          {/* US Bonds Toggle */}
          <button
            onClick={() => setShowUsBonds(!showUsBonds)}
            className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              showUsBonds
                ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showUsBonds ? 'bg-violet-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
            <span>US Bonds ({benchmarks.usBonds.changePercent >= 0 ? '+' : ''}{benchmarks.usBonds.changePercent.toFixed(2)}%)</span>
          </button>
        </div>
      )}

      {/* Main Chart Area */}
      <div className="relative w-full h-48 mt-1 overflow-hidden rounded-xl">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : !hasInvestments || !svgGeometry ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-2">
              <Landmark className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xs font-semibold text-slate-300">
              No Investment Accounts Linked
            </div>
            <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
              Connect a Fidelity, Schwab, or Vanguard account via Plaid to see your live portfolio growth.
            </p>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${svgGeometry.width} ${svgGeometry.height}`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                <linearGradient id="invGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isPositive ? '#10b981' : '#f43f5e'}
                    stopOpacity="0.22"
                  />
                  <stop
                    offset="100%"
                    stopColor={isPositive ? '#10b981' : '#f43f5e'}
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>

              {/* Zero-baseline dashed guide */}
              <line
                x1={svgGeometry.coords[0].x}
                y1={svgGeometry.zeroY}
                x2={svgGeometry.coords[svgGeometry.coords.length - 1].x}
                y2={svgGeometry.zeroY}
                stroke="#334155"
                strokeDasharray="4 4"
                strokeWidth="1"
              />

              {/* Baseline 0% text */}
              <text
                x={svgGeometry.coords[0].x + 4}
                y={svgGeometry.zeroY - 4}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                0.0%
              </text>

              {/* Area fill for Portfolio */}
              <path d={svgGeometry.areaPath} fill="url(#invGradient)" />

              {/* Benchmark: S&P 500 dashed line */}
              {showSp500 && (
                <path
                  d={svgGeometry.sp500LinePath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-opacity duration-300"
                />
              )}

              {/* Benchmark: US Total Stocks dashed line */}
              {showUsStocks && (
                <path
                  d={svgGeometry.usStocksLinePath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-opacity duration-300"
                />
              )}

              {/* Benchmark: US Bonds dashed line */}
              {showUsBonds && (
                <path
                  d={svgGeometry.usBondsLinePath}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.8"
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-opacity duration-300"
                />
              )}

              {/* Portfolio Primary Stroke line */}
              <path
                d={svgGeometry.linePath}
                fill="none"
                stroke={isPositive ? '#10b981' : '#f43f5e'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactive Hover Point Zones */}
              {svgGeometry.coords.map((pt: any, i: number) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r="6"
                  className="fill-transparent hover:fill-emerald-400/40 cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredPoint(pt)}
                />
              ))}

              {/* Active Hover Dot for Portfolio */}
              {hoveredPoint && (
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r="5"
                  className={`${
                    isPositive ? 'fill-emerald-300' : 'fill-rose-300'
                  } stroke-2 stroke-slate-950`}
                />
              )}
            </svg>

            {/* Multi-Series Hover Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-24 bg-slate-900/95 backdrop-blur-md border border-slate-700 px-3 py-2 rounded-xl shadow-2xl z-20 min-w-[170px]"
                style={{
                  left: `${(hoveredPoint.x / svgGeometry.width) * 100}%`,
                  top: `${Math.max(5, (hoveredPoint.y / svgGeometry.height) * 100)}%`,
                }}
              >
                <div className="text-[10px] text-slate-400 font-medium mb-1.5 border-b border-slate-800 pb-1">
                  {hoveredPoint.date}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Portfolio:
                    </span>
                    <span className="font-bold text-emerald-300">
                      {hoveredPoint.percent >= 0 ? '+' : ''}{hoveredPoint.percent.toFixed(2)}%
                    </span>
                  </div>

                  {showSp500 && hoveredPoint.sp500Percent != null && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-sky-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        S&P 500:
                      </span>
                      <span className="font-bold text-sky-300">
                        {hoveredPoint.sp500Percent >= 0 ? '+' : ''}{hoveredPoint.sp500Percent.toFixed(2)}%
                      </span>
                    </div>
                  )}

                  {showUsStocks && hoveredPoint.usStocksPercent != null && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        US Stocks:
                      </span>
                      <span className="font-bold text-amber-300">
                        {hoveredPoint.usStocksPercent >= 0 ? '+' : ''}{hoveredPoint.usStocksPercent.toFixed(2)}%
                      </span>
                    </div>
                  )}

                  {showUsBonds && hoveredPoint.usBondsPercent != null && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-violet-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                        US Bonds:
                      </span>
                      <span className="font-bold text-violet-300">
                        {hoveredPoint.usBondsPercent >= 0 ? '+' : ''}{hoveredPoint.usBondsPercent.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Benchmark Comparison Stats Cards */}
      {hasInvestments && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
          {/* S&P 500 Card */}
          <div
            onClick={() => setShowSp500(!showSp500)}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              showSp500
                ? 'bg-sky-50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-500/30 hover:border-sky-400 dark:hover:border-sky-500/50'
                : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 opacity-60 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${showSp500 ? 'bg-sky-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
                S&P 500 ({benchmarks.sp500.ticker})
              </span>
              <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                {benchmarks.sp500.changePercent >= 0 ? '+' : ''}{benchmarks.sp500.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
              <span>vs Portfolio:</span>
              <span className={benchmarks.sp500.alpha >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                {benchmarks.sp500.alpha >= 0 ? `+${benchmarks.sp500.alpha.toFixed(2)}% alpha` : `${benchmarks.sp500.alpha.toFixed(2)}%`}
              </span>
            </div>
          </div>

          {/* US Total Stocks Card */}
          <div
            onClick={() => setShowUsStocks(!showUsStocks)}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              showUsStocks
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/30 hover:border-amber-400 dark:hover:border-amber-500/50'
                : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 opacity-60 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${showUsStocks ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
                US Stocks ({benchmarks.usStocks.ticker})
              </span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                {benchmarks.usStocks.changePercent >= 0 ? '+' : ''}{benchmarks.usStocks.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
              <span>vs Portfolio:</span>
              <span className={benchmarks.usStocks.alpha >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                {benchmarks.usStocks.alpha >= 0 ? `+${benchmarks.usStocks.alpha.toFixed(2)}% alpha` : `${benchmarks.usStocks.alpha.toFixed(2)}%`}
              </span>
            </div>
          </div>

          {/* US Bonds Card */}
          <div
            onClick={() => setShowUsBonds(!showUsBonds)}
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              showUsBonds
                ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-300 dark:border-violet-500/30 hover:border-violet-400 dark:hover:border-violet-500/50'
                : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 opacity-60 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${showUsBonds ? 'bg-violet-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
                US Bonds ({benchmarks.usBonds.ticker})
              </span>
              <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
                {benchmarks.usBonds.changePercent >= 0 ? '+' : ''}{benchmarks.usBonds.changePercent.toFixed(2)}%
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
              <span>vs Portfolio:</span>
              <span className={benchmarks.usBonds.alpha >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                {benchmarks.usBonds.alpha >= 0 ? `+${benchmarks.usBonds.alpha.toFixed(2)}% alpha` : `${benchmarks.usBonds.alpha.toFixed(2)}%`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
