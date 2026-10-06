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
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from './api';

export default function MobileDashboard() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch accounts
      const accRes = await apiFetch('/transactions/accounts');
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData || []);
      }

      // 2. Fetch transactions
      const txRes = await apiFetch('/transactions?limit=10');
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.items || []);
      }

      // 3. Fetch current monthly budget summary
      const currentMonth = new Date().toISOString().substring(0, 7);
      const budgetRes = await apiFetch(`/budget?month=${currentMonth}`);
      if (budgetRes.ok) {
        const bData = await budgetRes.json();
        setBudgetSummary(bData);
      }
    } catch (err) {
      console.warn('Mobile API fetch error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Compute live net worth
  const trackedAccounts = accounts.filter((a) => !a.isHidden);
  const cashTotal = trackedAccounts
    .filter((a) => a.type === 'depository')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const investTotal = trackedAccounts
    .filter((a) => a.type === 'investment')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const creditTotal = trackedAccounts
    .filter((a) => a.type === 'credit')
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const netWorth = cashTotal + investTotal - creditTotal;

  // Compute live cash flow
  let income = 0;
  let expenses = 0;
  transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    if (amt < 0) income += Math.abs(amt);
    else expenses += amt;
  });
  const netCashFlow = income - expenses;

  // Budget calculations
  const totalBudgeted = budgetSummary?.totalBudgetedExpenses || 0;
  const totalSpent = budgetSummary?.totalActualExpenses || 0;
  const remainingBudget = totalBudgeted - totalSpent;
  const percentBudgetUsed = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const isOverBudget = remainingBudget < 0;

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
      {/* Net Worth Hero Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>TOTAL NET WORTH</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {trackedAccounts.length > 0
                ? `${trackedAccounts.length} Tracked Accounts`
                : 'No Accounts'}
            </Text>
          </View>
        </View>

        <Text style={styles.bigAmount}>
          ${Math.floor(netWorth).toLocaleString()}
          <Text style={styles.decimalText}>
            .{Math.abs(Math.round((netWorth % 1) * 100)).toString().padStart(2, '0')}
          </Text>
        </Text>

        <Text style={styles.subHint}>
          {trackedAccounts.length > 0
            ? 'Live calculated from synced bank feeds'
            : 'Link your bank on web or mobile to sync'}
        </Text>

        <View style={styles.divider} />

        <View style={styles.subRow}>
          <TouchableOpacity
            onPress={() => router.push('/accounts')}
            style={styles.subCol}
          >
            <Text style={styles.subLabel}>Cash & Savings</Text>
            <Text style={styles.subValue}>
              ${cashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/investments')}
            style={styles.subCol}
          >
            <Text style={styles.subLabel}>Investments</Text>
            <Text style={styles.subValue}>
              ${investTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/accounts')}
            style={styles.subCol}
          >
            <Text style={styles.subLabel}>Debts</Text>
            <Text style={[styles.subValue, { color: '#f87171' }]}>
              ${creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Navigation Action Grid */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          onPress={() => router.push('/budget')}
          style={styles.quickActionCard}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
            <Feather name="pie-chart" size={16} color="#818cf8" />
          </View>
          <Text style={styles.actionTitle}>Budget</Text>
          <Text style={styles.actionSub}>Targets</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/transactions')}
          style={styles.quickActionCard}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
            <Feather name="repeat" size={16} color="#38bdf8" />
          </View>
          <Text style={styles.actionTitle}>Activity</Text>
          <Text style={styles.actionSub}>Review</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/investments')}
          style={styles.quickActionCard}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(52, 211, 153, 0.15)' }]}>
            <Feather name="trending-up" size={16} color="#34d399" />
          </View>
          <Text style={styles.actionTitle}>Stocks</Text>
          <Text style={styles.actionSub}>Holdings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/accounts')}
          style={styles.quickActionCard}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
            <Feather name="credit-card" size={16} color="#fbbf24" />
          </View>
          <Text style={styles.actionTitle}>Accounts</Text>
          <Text style={styles.actionSub}>Sync</Text>
        </TouchableOpacity>
      </View>

      {/* Monthly Budget Summary Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>MONTHLY BUDGET PROGRESS</Text>
          <TouchableOpacity onPress={() => router.push('/budget')}>
            <Text style={styles.linkText}>Manage →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={styles.mediumAmount}>
            ${Math.floor(totalSpent).toLocaleString()}{' '}
            <Text style={styles.ofBudgetAmount}>
              / ${Math.floor(totalBudgeted).toLocaleString()}
            </Text>
          </Text>

          <Text
            style={[
              styles.budgetStatusText,
              { color: isOverBudget ? '#f87171' : '#34d399' },
            ]}
          >
            {isOverBudget ? `Over by $${Math.abs(remainingBudget).toFixed(0)}` : `${percentBudgetUsed}% Used`}
          </Text>
        </View>

        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, percentBudgetUsed)}%`,
                backgroundColor: isOverBudget
                  ? '#ef4444'
                  : percentBudgetUsed > 85
                  ? '#f59e0b'
                  : '#6366f1',
              },
            ]}
          />
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.subHint}>
            Left to spend:{' '}
            <Text style={{ color: isOverBudget ? '#f87171' : '#34d399', fontWeight: '700' }}>
              {isOverBudget ? '-' : ''}${Math.abs(remainingBudget).toFixed(2)}
            </Text>
          </Text>
          <Text style={styles.subHint}>
            Categories: <Text style={{ color: '#ffffff', fontWeight: '700' }}>{budgetSummary?.expenseCategories?.length || 0}</Text>
          </Text>
        </View>
      </View>

      {/* Monthly Cash Flow Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>RECENT CASH FLOW</Text>
          <Text style={styles.badgeText}>Real Time</Text>
        </View>

        <Text
          style={[
            styles.bigAmount,
            { color: netCashFlow >= 0 ? '#34d399' : '#f87171' },
          ]}
        >
          {netCashFlow >= 0 ? '+' : '-'}${Math.abs(Math.floor(netCashFlow)).toLocaleString()}
          <Text style={styles.decimalText}>
            .{Math.abs(Math.round((netCashFlow % 1) * 100)).toString().padStart(2, '0')}
          </Text>
        </Text>

        <View style={styles.rowBetween}>
          <Text style={styles.subHint}>
            Inflow: <Text style={{ color: '#34d399', fontWeight: '700' }}>+${income.toFixed(2)}</Text>
          </Text>
          <Text style={styles.subHint}>
            Outflow: <Text style={{ color: '#e2e8f0', fontWeight: '700' }}>-${expenses.toFixed(2)}</Text>
          </Text>
        </View>
      </View>

      {/* Recent Activity Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>RECENT TRANSACTIONS</Text>
          <TouchableOpacity onPress={() => router.push('/transactions')}>
            <Text style={styles.linkText}>View All →</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#818cf8" style={{ padding: 20 }} />
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyText}>No recent transactions recorded</Text>
        ) : (
          transactions.slice(0, 5).map((tx) => {
            const rawAmt = Number(tx.amount) || 0;
            const isIncome = rawAmt < 0;

            return (
              <View key={tx.id || tx.plaidTransactionId} style={styles.txItem}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {tx.name || tx.merchantName}
                  </Text>
                  <Text style={styles.txSub}>
                    {tx.category || 'General'} • {tx.date}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.txAmount,
                    isIncome ? styles.txPositive : styles.txNegative,
                  ]}
                >
                  {isIncome ? '+' : '-'}${Math.abs(rawAmt).toFixed(2)}
                </Text>
              </View>
            );
          })
        )}
      </View>
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
  badge: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
  mediumAmount: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  ofBudgetAmount: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  budgetStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  decimalText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#64748b',
  },
  subHint: {
    color: '#94a3b8',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e2433',
    marginVertical: 4,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  subCol: {
    flex: 1,
  },
  subLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  subValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: '#11141f',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e2433',
    gap: 4,
  },
  actionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  actionSub: {
    color: '#64748b',
    fontSize: 9,
  },
  progressBarBackground: {
    height: 7,
    backgroundColor: '#1e2433',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  linkText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  txTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  txSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  txPositive: {
    color: '#34d399',
  },
  txNegative: {
    color: '#e2e8f0',
  },
});
