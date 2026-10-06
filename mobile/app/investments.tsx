import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from './api';

const TIMEFRAMES = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

export default function MobileInvestments() {
  const [selectedTf, setSelectedTf] = useState<Timeframe>('1Y');
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [investAccounts, setInvestAccounts] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchData = useCallback(async (tf: Timeframe) => {
    try {
      // 1. Fetch portfolio trajectory
      const portRes = await apiFetch(`/stocks/portfolio?timeframe=${tf}`);
      if (portRes.ok) {
        const pData = await portRes.json();
        setPortfolioData(pData);
      }

      // 2. Fetch accounts
      const accRes = await apiFetch('/transactions/accounts');
      if (accRes.ok) {
        const accData = await accRes.json();
        const filtered = (accData || []).filter(
          (a: any) => a.type === 'investment' && !a.isHidden,
        );
        setInvestAccounts(filtered);
      }

      // 3. Fetch holdings
      const holdRes = await apiFetch('/stocks/holdings');
      if (holdRes.ok) {
        const hData = await holdRes.json();
        setHoldings(hData || []);
      }

      // 4. Fetch investment activity
      const actRes = await apiFetch('/stocks/activity?limit=15');
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivity(actData || []);
      }
    } catch (err) {
      console.warn('Failed to load investments:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedTf);
  }, [selectedTf, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(selectedTf);
  };

  const currentValue = portfolioData?.currentValue || 0;
  const changeAmount = portfolioData?.changeAmount || 0;
  const changePercent = portfolioData?.changePercent || 0;
  const isPositive = changeAmount >= 0;
  const hasInvestments = investAccounts.length > 0 && currentValue > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#818cf8"
        />
      }
    >
      {/* Portfolio Value Header */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>PORTFOLIO GROWTH RATE</Text>
          <Text style={styles.badgeText}>
            {hasInvestments ? `${investAccounts.length} Connected` : 'No Accounts'}
          </Text>
        </View>

        <Text
          style={[
            styles.bigAmount,
            isPositive ? { color: '#34d399' } : { color: '#f87171' },
          ]}
        >
          {isPositive ? '+' : ''}
          {changePercent.toFixed(2)}%
        </Text>

        {hasInvestments && (
          <View style={{ gap: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <Feather
                name={isPositive ? 'trending-up' : 'trending-down'}
                size={14}
                color={isPositive ? '#34d399' : '#f87171'}
              />
              <Text style={isPositive ? styles.positiveBadge : styles.negativeBadge}>
                {selectedTf} Return: {isPositive ? '+' : ''}
                {changePercent.toFixed(2)}%
              </Text>
              {portfolioData?.totalUnrealizedGainPercent != null && (
                <Text style={{ fontSize: 11, color: '#34d399', fontWeight: '700' }}>
                  • All-Time: +{portfolioData.totalUnrealizedGainPercent}%
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Timeframe selector */}
        <View style={styles.tfContainer}>
          {(portfolioData?.availableTimeframes || ['1M', '3M', '6M', '1Y', 'ALL']).map((tf: string) => (
            <TouchableOpacity
              key={tf}
              onPress={() => setSelectedTf(tf as Timeframe)}
              style={[
                styles.tfButton,
                selectedTf === tf && styles.tfButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.tfText,
                  selectedTf === tf && styles.tfTextActive,
                ]}
              >
                {tf}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Graph representation info box */}
        <View style={styles.graphBox}>
          {isLoading ? (
            <ActivityIndicator color="#818cf8" />
          ) : !hasInvestments ? (
            <View style={{ alignItems: 'center', padding: 8 }}>
              <Text style={styles.emptyTitle}>No Active Holdings</Text>
              <Text style={styles.emptyDesc}>
                Connect a brokerage or retirement account via Plaid to see your portfolio performance curve.
              </Text>
            </View>
          ) : (
            <View style={{ width: '100%', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Feather name="bar-chart-2" size={12} color="#38bdf8" />
                <Text style={styles.graphNote}>
                  Market Benchmarks Comparison ({selectedTf})
                </Text>
              </View>

              {portfolioData?.benchmarks && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.2)', borderWidth: 1, borderRadius: 8, padding: 6, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#38bdf8', fontWeight: '600' }}>S&P 500</Text>
                    <Text style={{ fontSize: 11, color: '#e2e8f0', fontWeight: '700', marginTop: 1 }}>
                      {portfolioData.benchmarks.sp500.changePercent >= 0 ? '+' : ''}{portfolioData.benchmarks.sp500.changePercent.toFixed(1)}%
                    </Text>
                    <Text style={{ fontSize: 9, color: portfolioData.benchmarks.sp500.alpha >= 0 ? '#34d399' : '#f87171', marginTop: 1 }}>
                      {portfolioData.benchmarks.sp500.alpha >= 0 ? `+${portfolioData.benchmarks.sp500.alpha.toFixed(1)}%` : `${portfolioData.benchmarks.sp500.alpha.toFixed(1)}%`}
                    </Text>
                  </View>

                  <View style={{ flex: 1, backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)', borderWidth: 1, borderRadius: 8, padding: 6, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '600' }}>US Stocks</Text>
                    <Text style={{ fontSize: 11, color: '#e2e8f0', fontWeight: '700', marginTop: 1 }}>
                      {portfolioData.benchmarks.usStocks.changePercent >= 0 ? '+' : ''}{portfolioData.benchmarks.usStocks.changePercent.toFixed(1)}%
                    </Text>
                    <Text style={{ fontSize: 9, color: portfolioData.benchmarks.usStocks.alpha >= 0 ? '#34d399' : '#f87171', marginTop: 1 }}>
                      {portfolioData.benchmarks.usStocks.alpha >= 0 ? `+${portfolioData.benchmarks.usStocks.alpha.toFixed(1)}%` : `${portfolioData.benchmarks.usStocks.alpha.toFixed(1)}%`}
                    </Text>
                  </View>

                  <View style={{ flex: 1, backgroundColor: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)', borderWidth: 1, borderRadius: 8, padding: 6, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#a855f7', fontWeight: '600' }}>US Bonds</Text>
                    <Text style={{ fontSize: 11, color: '#e2e8f0', fontWeight: '700', marginTop: 1 }}>
                      {portfolioData.benchmarks.usBonds.changePercent >= 0 ? '+' : ''}{portfolioData.benchmarks.usBonds.changePercent.toFixed(1)}%
                    </Text>
                    <Text style={{ fontSize: 9, color: portfolioData.benchmarks.usBonds.alpha >= 0 ? '#34d399' : '#f87171', marginTop: 1 }}>
                      {portfolioData.benchmarks.usBonds.alpha >= 0 ? `+${portfolioData.benchmarks.usBonds.alpha.toFixed(1)}%` : `${portfolioData.benchmarks.usBonds.alpha.toFixed(1)}%`}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Asset Allocation Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>ASSET ALLOCATION</Text>
          <Text style={styles.badgeText}>Diversified</Text>
        </View>

        <View style={styles.allocBar}>
          <View style={[styles.allocSegment, { flex: 68, backgroundColor: '#6366f1' }]} />
          <View style={[styles.allocSegment, { flex: 20, backgroundColor: '#38bdf8' }]} />
          <View style={[styles.allocSegment, { flex: 12, backgroundColor: '#34d399' }]} />
        </View>

        <View style={styles.subRow}>
          <View style={styles.subCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.dot, { backgroundColor: '#6366f1' }]} />
              <Text style={styles.subLabel}>Equities</Text>
            </View>
            <Text style={styles.subValue}>68%</Text>
          </View>

          <View style={styles.subCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.dot, { backgroundColor: '#38bdf8' }]} />
              <Text style={styles.subLabel}>Bonds / Fixed</Text>
            </View>
            <Text style={styles.subValue}>20%</Text>
          </View>

          <View style={styles.subCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.dot, { backgroundColor: '#34d399' }]} />
              <Text style={styles.subLabel}>Cash Equivalent</Text>
            </View>
            <Text style={styles.subValue}>12%</Text>
          </View>
        </View>
      </View>

      {/* Holdings & Positions */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>PORTFOLIO HOLDINGS</Text>
          <Text style={styles.itemCountText}>
            {holdings.length > 0 ? `${holdings.length} Securities` : 'Synced via Plaid'}
          </Text>
        </View>

        {holdings.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text style={styles.emptyDesc}>
              No individual equity holdings synced. Your aggregated index fund balances are tracked directly under your investment accounts.
            </Text>
          </View>
        ) : (
          holdings.map((h) => {
            const val = Number(h.institutionValue) || 0;
            const price = Number(h.institutionPrice) || 0;
            const qty = Number(h.quantity) || 0;

            return (
              <View key={h.id} style={styles.holdingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.holdingTicker}>{h.tickerSymbol || 'HOLDING'}</Text>
                  <Text style={styles.holdingName} numberOfLines={1}>
                    {h.name} • {qty.toFixed(2)} shares @ ${price.toFixed(2)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.holdingValue}>
                    ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  {h.unrealizedGainPercent != null ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: h.unrealizedGainPercent >= 0 ? '#34d399' : '#f87171',
                        marginTop: 2,
                      }}
                    >
                      {h.unrealizedGainPercent >= 0 ? '+' : ''}
                      {h.unrealizedGainPercent}%
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                      Cash Core
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      {/* Connected Brokerage Accounts */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>INVESTMENT ACCOUNTS</Text>

        {investAccounts.length === 0 ? (
          <Text style={styles.emptyDesc}>
            No brokerage or retirement accounts currently tracked.
          </Text>
        ) : (
          investAccounts.map((acc) => {
            const balance = Number(acc.currentBalance) || 0;
            return (
              <View key={acc.id} style={styles.accountRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.accountName}>{acc.name}</Text>
                  <Text style={styles.accountSub}>
                    {acc.institutionName} • {acc.subtype || 'Brokerage'}{' '}
                    {acc.mask ? `(••• ${acc.mask})` : ''}
                  </Text>
                </View>

                <Text style={styles.accountBalance}>
                  $
                  {balance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Investment Activity */}
      {hasInvestments && activity.length > 0 && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardLabel}>INVESTMENT ACTIVITY</Text>
            <Text style={styles.badgeText}>{activity.length} Synced</Text>
          </View>

          {activity.map((tx: any) => {
            const isBuy = tx.type === 'buy';
            const isDividend = tx.subtype === 'dividend';
            const isDeposit =
              tx.subtype === 'deposit' || tx.subtype === 'contribution';
            return (
              <View key={tx.id} style={styles.activityRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {tx.tickerSymbol ? (
                      <View style={styles.tickerPill}>
                        <Text style={styles.tickerPillText}>
                          {tx.tickerSymbol}
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.tickerPill,
                          { backgroundColor: '#1e293b' },
                        ]}
                      >
                        <Text
                          style={[styles.tickerPillText, { color: '#94a3b8' }]}
                        >
                          CASH
                        </Text>
                      </View>
                    )}
                    <Text style={styles.activityDate}>{tx.date}</Text>
                  </View>
                  <Text style={styles.activityName} numberOfLines={1}>
                    {tx.name}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text
                    style={[
                      styles.activityAmount,
                      isBuy
                        ? { color: '#fff' }
                        : isDeposit || isDividend
                        ? { color: '#34d399' }
                        : {},
                    ]}
                  >
                    $
                    {Math.abs(Number(tx.amount)).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                  {Number(tx.quantity) > 0 && (
                    <Text style={styles.activityQty}>
                      {Number(tx.quantity).toFixed(3)} shares
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090a0f',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: '#11141f',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e2433',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeText: {
    color: '#818cf8',
    fontSize: 11,
    fontWeight: '700',
  },
  bigAmount: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  decimalText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#64748b',
  },
  positiveBadge: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
  },
  negativeBadge: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  tfContainer: {
    flexDirection: 'row',
    backgroundColor: '#0b0e14',
    borderRadius: 14,
    padding: 4,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  tfButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 10,
  },
  tfButtonActive: {
    backgroundColor: '#4f46e5',
  },
  tfText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  tfTextActive: {
    color: '#ffffff',
  },
  graphBox: {
    backgroundColor: '#0b0e14',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  graphNote: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '600',
  },
  graphSub: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  allocBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  allocSegment: {
    height: '100%',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  subCol: {
    flex: 1,
  },
  subLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  subValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  holdingTicker: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  holdingName: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  holdingValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  accountName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  accountSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  accountBalance: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  itemCountText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
    gap: 12,
  },
  tickerPill: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tickerPillText: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '800',
  },
  activityDate: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '500',
  },
  activityName: {
    color: '#94a3b8',
    fontSize: 11,
  },
  activityAmount: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  activityQty: {
    color: '#64748b',
    fontSize: 10,
  },
});
