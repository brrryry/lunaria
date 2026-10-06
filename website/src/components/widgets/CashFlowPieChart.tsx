'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Store, HelpCircle } from 'lucide-react';

export interface PieSliceItem {
  id: string;
  label: string;
  value: number;
  color: string;
  percentage: number;
  explanation?: string;
  subItems?: { name: string; count: number; value: number }[];
}

interface CashFlowPieChartProps {
  title: string;
  icon: React.ReactNode;
  items: PieSliceItem[];
  totalValue: number;
  timeframeLabel?: string;
  timeframeSelector?: React.ReactNode;
  titleControl?: React.ReactNode;
  emptyMessage?: string;
  valuePrefix?: string;
  accentColor?: string;
  secondaryAction?: React.ReactNode;
}

export const CashFlowPieChart: React.FC<CashFlowPieChartProps> = ({
  title,
  icon,
  items = [],
  totalValue,
  timeframeLabel,
  timeframeSelector,
  titleControl,
  emptyMessage = 'No transactions recorded for this period',
  valuePrefix = '$',
  accentColor = 'text-indigo-400',
  secondaryAction,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // SVG Geometry Constants
  const size = 200;
  const center = size / 2;
  const outerRadius = 82;
  const innerRadius = 52;

  // Compute SVG paths for each slice
  const slices = useMemo(() => {
    if (totalValue <= 0 || items.length === 0) return [];

    let currentAngle = -Math.PI / 2; // Start from 12 o'clock

    return items.map((item) => {
      const sliceRatio = Math.max(0, item.value / totalValue);
      const sliceAngle = sliceRatio * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const isHovered = hoveredId === item.id;
      const rOuter = outerRadius;
      const rInner = innerRadius;

      // Special case: Single category takes 99.9%+ of the pie
      if (sliceRatio >= 0.999) {
        return {
          ...item,
          isFullCircle: true as const,
          pathData: '',
          isHovered,
          rOuter,
          rInner,
        };
      }

      // Normal pie / donut slice arc path
      // Small gap between slices if multiple categories
      const gapAngle = items.length > 1 ? 0.02 : 0;
      const a1 = startAngle + gapAngle / 2;
      const a2 = endAngle - gapAngle / 2;

      const x1Outer = center + rOuter * Math.cos(a1);
      const y1Outer = center + rOuter * Math.sin(a1);
      const x2Outer = center + rOuter * Math.cos(a2);
      const y2Outer = center + rOuter * Math.sin(a2);

      const x1Inner = center + rInner * Math.cos(a1);
      const y1Inner = center + rInner * Math.sin(a1);
      const x2Inner = center + rInner * Math.cos(a2);
      const y2Inner = center + rInner * Math.sin(a2);

      const largeArcFlag = a2 - a1 > Math.PI ? 1 : 0;

      const pathData = [
        `M ${x1Outer} ${y1Outer}`,
        `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2Outer} ${y2Outer}`,
        `L ${x2Inner} ${y2Inner}`,
        `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x1Inner} ${y1Inner}`,
        'Z',
      ].join(' ');

      return {
        ...item,
        isFullCircle: false as const,
        pathData,
        isHovered,
        rOuter,
        rInner,
      };
    });
  }, [items, totalValue, hoveredId, center, outerRadius, innerRadius]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="glass-panel glass-panel-hover rounded-2xl p-4 sm:p-5 flex flex-col h-full min-w-0">
      {/* Widget Header */}
      <div className="flex items-start justify-between gap-3 mb-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span className={accentColor}>{icon}</span>
              <span>{title}</span>
            </h3>
            {titleControl}
            {timeframeSelector ? (
              timeframeSelector
            ) : timeframeLabel ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                {timeframeLabel}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
            {items.length > 0
              ? `${valuePrefix}${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${items.length} categories`
              : 'No transactions recorded'}
          </p>
        </div>
        {secondaryAction && <div className="shrink-0">{secondaryAction}</div>}
      </div>

      {/* Donut Chart Visual & Center Display */}
      <div className="flex items-center justify-center py-2 relative">
        {totalValue > 0 && items.length > 0 ? (
          <div className="relative w-[180px] h-[180px] sm:w-[200px] sm:h-[200px]">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-full h-full transform transition-all duration-300 overflow-visible"
            >
              {slices.map((slice) => {
                if (slice.isFullCircle) {
                  const ringRadius = (slice.rOuter + slice.rInner) / 2;
                  const strokeW = slice.rOuter - slice.rInner;
                  return (
                    <circle
                      key={slice.id}
                      cx={center}
                      cy={center}
                      r={ringRadius}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth={strokeW}
                      style={{ opacity: hoveredId && hoveredId !== slice.id ? 0.65 : 1 }}
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHoveredId(slice.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => toggleExpand(slice.id)}
                    >
                      <title>{slice.label}: {valuePrefix}{slice.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({slice.percentage}%)</title>
                    </circle>
                  );
                }

                return (
                  <path
                    key={slice.id}
                    d={slice.pathData}
                    fill={slice.color}
                    style={{ opacity: hoveredId && hoveredId !== slice.id ? 0.65 : 1 }}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="cursor-pointer transition-all duration-200 text-slate-100 dark:text-[#0b0f19]"
                    onMouseEnter={() => setHoveredId(slice.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => toggleExpand(slice.id)}
                  >
                    <title>{slice.label}: {valuePrefix}{slice.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({slice.percentage}%)</title>
                  </path>
                );
              })}
            </svg>

            {/* Center Label inside Donut Hole */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-3">
              <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 block">
                Total
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white block mt-0.5">
                {valuePrefix}
                {totalValue.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                {items.length} {items.length === 1 ? 'category' : 'categories'}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-[180px] h-[180px] rounded-full border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-4 text-center">
            <span className="text-xs text-slate-500 font-medium leading-tight">
              {emptyMessage}
            </span>
          </div>
        )}
      </div>

      {/* Categories & Drilldown List */}
      <div className="space-y-1.5 flex-1 max-h-[260px] overflow-y-auto pr-1 mt-2 border-t border-slate-200/80 dark:border-slate-800/60 pt-3">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center py-4">
            {emptyMessage}
          </div>
        ) : (
          items.map((item) => {
            const isHovered = hoveredId === item.id;
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-2 transition-all cursor-pointer ${
                  isHovered
                    ? 'border-indigo-500/40 bg-indigo-500/5'
                    : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800/80 hover:bg-slate-100/60 dark:hover:bg-slate-900/40'
                }`}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => toggleExpand(item.id)}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                    )}
                    <span
                      className={`font-semibold truncate ${
                        isHovered ? 'text-indigo-600 dark:text-white' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      {valuePrefix}
                      {item.value.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                      {item.percentage}%
                    </span>
                  </div>
                </div>

                {/* Progress bar line */}
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800/80 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>

                {/* Expanded Drilldown Drawer */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/60 pl-5 text-xs animate-in fade-in duration-150 space-y-2">
                    {item.explanation && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <HelpCircle className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                        <span>{item.explanation}</span>
                      </p>
                    )}

                    {item.subItems && item.subItems.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                          Top Contributors:
                        </span>
                        <div className="mt-1 space-y-1">
                          {item.subItems.map((sub) => (
                            <div
                              key={sub.name}
                              className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300 py-0.5"
                            >
                              <span className="flex items-center gap-1.5 truncate pr-2">
                                <Store className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                                <span className="truncate">{sub.name}</span>
                                <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                                  ({sub.count} tx{sub.count > 1 ? 's' : ''})
                                </span>
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-slate-200 shrink-0">
                                {valuePrefix}
                                {sub.value.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
