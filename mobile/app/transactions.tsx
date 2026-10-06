import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from './api';

type DateFilterOption = 'all' | '7d' | '30d' | 'quarter' | 'year';

const DATE_OPTIONS: { key: DateFilterOption; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

const COMMON_CATEGORIES = [
  'All',
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Transportation',
  'Travel',
  'Entertainment',
  'Utilities',
  'Living Expenses',
  'Income',
  'General',
];

export default function MobileTransactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [needsReviewOnly, setNeedsReviewOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Edit category modal state
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [newCatSelection, setNewCatSelection] = useState<string>('');
  const [isUpdatingCat, setIsUpdatingCat] = useState<boolean>(false);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await apiFetch('/transactions?limit=2000');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.items || []);
      }
    } catch (err) {
      console.warn('Failed to load transactions:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const handleUpdateCategory = async (txId: string, category: string) => {
    try {
      setIsUpdatingCat(true);
      const target = transactions.find((t) => t.id === txId);
      const res = await apiFetch(`/transactions/${txId}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category, applyToAllMerchant: true }),
      });

      if (res.ok) {
        const targetMerchant = (target?.merchantName || target?.name || '').trim().toLowerCase();
        setTransactions((prev) =>
          prev.map((t) => {
            const m = (t.merchantName || t.name || '').trim().toLowerCase();
            if (t.id === txId || (targetMerchant && m === targetMerchant)) {
              return { ...t, category };
            }
            return t;
          }),
        );
        setSelectedTx(null);
      } else {
        Alert.alert('Error', 'Failed to update transaction category.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error updating category.');
    } finally {
      setIsUpdatingCat(false);
    }
  };

  // Date range calculation
  const dateRange = useMemo(() => {
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];

    switch (dateFilter) {
      case '7d':
        return { start: toYMD(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) };
      case '30d':
        return { start: toYMD(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) };
      case 'quarter':
        return { start: toYMD(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)) };
      case 'year':
        return { start: toYMD(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)) };
      case 'all':
      default:
        return { start: null };
    }
  }, [dateFilter]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const nameMatch =
        (tx.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.merchantName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const dateMatch = !dateRange.start || (tx.date && tx.date >= dateRange.start);

      const catMatch =
        categoryFilter === 'All' ||
        (tx.category || '').toLowerCase() === categoryFilter.toLowerCase();

      const reviewMatch =
        !needsReviewOnly ||
        tx.needsReview === true ||
        !tx.category ||
        tx.category === 'General';

      return nameMatch && dateMatch && catMatch && reviewMatch;
    });
  }, [transactions, searchTerm, dateRange, categoryFilter, needsReviewOnly]);

  const unreviewed = useMemo(() => {
    return transactions.filter(
      (tx) =>
        !tx.category ||
        tx.category === 'Uncategorized' ||
        tx.category === 'General' ||
        tx.needsReview === true,
    );
  }, [transactions]);

  const unreviewedTotal = useMemo(() => {
    return unreviewed
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [unreviewed]);

  const totalSpent = filtered
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalIncome = filtered
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

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
      {/* Search & Needs Review Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant, item, amount..."
            placeholderTextColor="#64748b"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Feather name="x" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setNeedsReviewOnly(!needsReviewOnly)}
          style={[
            styles.reviewBtn,
            needsReviewOnly && styles.reviewBtnActive,
          ]}
        >
          <Feather
            name="alert-circle"
            size={14}
            color={needsReviewOnly ? '#ffffff' : '#f59e0b'}
          />
          <Text style={[styles.reviewBtnText, needsReviewOnly && { color: '#ffffff' }]}>
            Review
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {DATE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setDateFilter(opt.key)}
            style={[
              styles.filterPill,
              dateFilter === opt.key && styles.filterPillActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                dateFilter === opt.key && styles.filterTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {COMMON_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setCategoryFilter(cat)}
            style={[
              styles.catPill,
              categoryFilter === cat && styles.catPillActive,
            ]}
          >
            <Text
              style={[
                styles.catPillText,
                categoryFilter === cat && styles.catPillTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Summary KPI Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>PERIOD CASH FLOW</Text>
          <Text style={styles.badgeText}>{filtered.length} Transactions</Text>
        </View>

        <View style={styles.subRow}>
          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Outflow (Expenses)</Text>
            <Text style={[styles.subValue, { color: '#f87171' }]}>
              -${totalSpent.toFixed(2)}
            </Text>
          </View>

          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Inflow (Income)</Text>
            <Text style={[styles.subValue, { color: '#34d399' }]}>
              +${totalIncome.toFixed(2)}
            </Text>
          </View>

          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Net Cash Flow</Text>
            <Text
              style={[
                styles.subValue,
                { color: totalIncome >= totalSpent ? '#34d399' : '#f87171' },
              ]}
            >
              {totalIncome >= totalSpent ? '+' : '-'}$
              {Math.abs(totalIncome - totalSpent).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Transactions to Review Widget */}
      {unreviewed.length > 0 ? (
        <TouchableOpacity
          onPress={() => setNeedsReviewOnly(!needsReviewOnly)}
          style={[
            styles.reviewWidgetCard,
            needsReviewOnly && styles.reviewWidgetCardActive,
          ]}
        >
          <View style={styles.reviewWidgetHeader}>
            <View style={styles.reviewWidgetIconContainer}>
              <Feather name="alert-circle" size={18} color="#f59e0b" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.reviewWidgetTitle}>Transactions to Review</Text>
                <View style={styles.reviewCountPill}>
                  <Text style={styles.reviewCountText}>{unreviewed.length}</Text>
                </View>
              </View>
              <Text style={styles.reviewWidgetSubtitle}>
                ${unreviewedTotal.toFixed(2)} unreviewed • Tap to {needsReviewOnly ? 'show all' : 'filter'}
              </Text>
            </View>
            <Feather
              name={needsReviewOnly ? 'check-circle' : 'chevron-right'}
              size={18}
              color={needsReviewOnly ? '#6366f1' : '#64748b'}
            />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.reviewWidgetCaughtUp}>
          <Feather name="check-circle" size={16} color="#10b981" />
          <Text style={styles.reviewCaughtUpText}>
            All caught up! All transactions are categorized.
          </Text>
        </View>
      )}

      {/* Transactions List */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>ACTIVITY FEED</Text>
          <Text style={styles.hintText}>Tap to edit category</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#818cf8" style={{ padding: 24 }} />
        ) : filtered.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Feather name="inbox" size={28} color="#64748b" />
            <Text style={[styles.emptyText, { marginTop: 8 }]}>
              No matching transactions found.
            </Text>
          </View>
        ) : (
          filtered.map((tx) => {
            const rawAmt = Number(tx.amount) || 0;
            const isIncome = rawAmt < 0;

            return (
              <TouchableOpacity
                key={tx.id || tx.plaidTransactionId}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedTx(tx);
                  setNewCatSelection(tx.category || 'General');
                }}
                style={styles.txRow}
              >
                <View style={styles.txLeft}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {tx.name || tx.merchantName}
                  </Text>
                  <View style={styles.txSubRow}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>
                        {tx.category || 'General'}
                      </Text>
                    </View>
                    <Text style={styles.txDate}>{tx.date}</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text
                    style={[
                      styles.txAmount,
                      isIncome ? styles.positiveText : styles.negativeText,
                    ]}
                  >
                    {isIncome ? '+' : '-'}${Math.abs(rawAmt).toFixed(2)}
                  </Text>
                  {tx.pending && (
                    <Text style={styles.pendingText}>Pending</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Edit Category Modal */}
      <Modal
        visible={!!selectedTx}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTx(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Category</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>
              {selectedTx?.name || selectedTx?.merchantName}
            </Text>
            <Text style={styles.modalAmountText}>
              ${Math.abs(Number(selectedTx?.amount) || 0).toFixed(2)} on {selectedTx?.date}
            </Text>

            <Text style={styles.modalSectionLabel}>Select Category:</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              <View style={styles.catGrid}>
                {COMMON_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setNewCatSelection(cat)}
                    style={[
                      styles.catChoicePill,
                      newCatSelection === cat && styles.catChoicePillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.catChoiceText,
                        newCatSelection === cat && styles.catChoiceTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setSelectedTx(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  selectedTx && handleUpdateCategory(selectedTx.id, newCatSelection)
                }
                disabled={isUpdatingCat}
                style={styles.modalSaveBtn}
              >
                {isUpdatingCat ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSaveText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    gap: 14,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11141f',
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 10,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  reviewBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  reviewBtnText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    backgroundColor: '#11141f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  filterPillActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#6366f1',
  },
  filterText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  catPill: {
    backgroundColor: '#0d1017',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  catPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
  },
  catPillText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
  catPillTextActive: {
    color: '#c7d2fe',
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
  hintText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
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
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  txLeft: {
    flex: 1,
    marginRight: 12,
  },
  txTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  txSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  categoryBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    color: '#818cf8',
    fontSize: 9,
    fontWeight: '700',
  },
  txDate: {
    color: '#64748b',
    fontSize: 10,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  positiveText: {
    color: '#34d399',
  },
  negativeText: {
    color: '#e2e8f0',
  },
  pendingText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '600',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#11141f',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2d3748',
    gap: 12,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  modalAmountText: {
    color: '#818cf8',
    fontSize: 12,
  },
  modalSectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 6,
  },
  catChoicePill: {
    backgroundColor: '#090a0f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  catChoicePillActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#6366f1',
  },
  catChoiceText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  catChoiceTextActive: {
    color: '#ffffff',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#181d2a',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  reviewWidgetCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  reviewWidgetCardActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: '#6366f1',
  },
  reviewWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewWidgetIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewWidgetTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewCountPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  reviewCountText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  reviewWidgetSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  reviewWidgetCaughtUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  reviewCaughtUpText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '600',
  },
});
