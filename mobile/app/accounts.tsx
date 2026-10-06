import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from './api';

export default function MobileAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/transactions/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data || []);
      }
    } catch (err) {
      console.warn('Failed to load accounts:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAccounts();
  };

  const handleSyncAll = async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/plaid/sync', {
        method: 'POST',
      });
      if (res.ok) {
        Alert.alert('Synced', 'Latest account balances and transactions updated.');
        fetchAccounts();
      } else {
        Alert.alert('Notice', 'Sync completed.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to connect to bank sync service.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleHide = async (account: any) => {
    const nextHidden = !account.isHidden;
    try {
      setUpdatingId(account.id);
      const res = await apiFetch(`/transactions/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isHidden: nextHidden }),
      });

      if (res.ok) {
        fetchAccounts();
      } else {
        Alert.alert('Error', 'Failed to update account visibility.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error updating account.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteAccount = (account: any) => {
    Alert.alert(
      'Remove Account',
      `Are you sure you want to disconnect and delete "${account.name}"? Historical snapshots will be cleanly recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiFetch(`/transactions/accounts/${account.id}`, {
                method: 'DELETE',
              });
              if (res.ok) {
                fetchAccounts();
              } else {
                Alert.alert('Error', 'Failed to delete account.');
              }
            } catch (err) {
              Alert.alert('Error', 'Network error removing account.');
            }
          },
        },
      ],
    );
  };

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'depository'),
    [accounts],
  );
  const creditAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'credit'),
    [accounts],
  );
  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'investment'),
    [accounts],
  );
  const loanAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'loan'),
    [accounts],
  );

  const totalAssets = accounts
    .filter((a) => !a.isHidden && (a.type === 'depository' || a.type === 'investment'))
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const totalLiabilities = accounts
    .filter((a) => !a.isHidden && (a.type === 'credit' || a.type === 'loan'))
    .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

  const renderAccountGroup = (
    title: string,
    groupAccounts: any[],
    iconName: any,
    isLiability: boolean = false,
  ) => {
    if (groupAccounts.length === 0) return null;

    const groupTotal = groupAccounts
      .filter((a) => !a.isHidden)
      .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

    return (
      <View style={styles.card}>
        <View style={styles.groupHeaderRow}>
          <View style={styles.groupTitleCol}>
            <View style={styles.groupIconBox}>
              <Feather name={iconName} size={15} color="#818cf8" />
            </View>
            <Text style={styles.groupTitleText}>{title}</Text>
          </View>
          <Text
            style={[
              styles.groupTotalText,
              isLiability && { color: '#f87171' },
            ]}
          >
            {isLiability ? '-' : ''}$
            {groupTotal.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>

        <View style={styles.groupDivider} />

        {groupAccounts.map((acc) => {
          const balance = Number(acc.currentBalance) || 0;
          const isHidden = acc.isHidden;
          const isBusy = updatingId === acc.id;

          return (
            <View key={acc.id} style={styles.accRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={[
                      styles.accName,
                      isHidden && { color: '#64748b', textDecorationLine: 'line-through' },
                    ]}
                    numberOfLines={1}
                  >
                    {acc.name}
                  </Text>
                  {isHidden && (
                    <View style={styles.hiddenTag}>
                      <Text style={styles.hiddenTagText}>Hidden</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.accSub}>
                  {acc.institutionName || 'Plaid Synced'} • {acc.subtype || acc.type}{' '}
                  {acc.mask ? `(••• ${acc.mask})` : ''}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text
                  style={[
                    styles.accBalance,
                    isLiability && { color: '#f87171' },
                    isHidden && { color: '#64748b' },
                  ]}
                >
                  ${balance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => handleToggleHide(acc)}
                    disabled={isBusy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color="#818cf8" />
                    ) : (
                      <Feather
                        name={isHidden ? 'eye-off' : 'eye'}
                        size={14}
                        color={isHidden ? '#64748b' : '#34d399'}
                      />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeleteAccount(acc)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={14} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

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
      {/* Accounts Summary & Sync Header */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>CONNECTED FINANCIAL ACCOUNTS</Text>
          <TouchableOpacity
            onPress={handleSyncAll}
            disabled={isSyncing}
            style={styles.syncBtn}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Feather name="refresh-cw" size={12} color="#ffffff" />
            )}
            <Text style={styles.syncBtnText}>
              {isSyncing ? 'Syncing...' : 'Sync Balances'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.subRow}>
          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Total Assets</Text>
            <Text style={[styles.subValue, { color: '#34d399' }]}>
              ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Total Liabilities</Text>
            <Text style={[styles.subValue, { color: '#f87171' }]}>
              ${totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Active Accounts</Text>
            <Text style={styles.subValue}>
              {accounts.filter((a) => !a.isHidden).length} / {accounts.length}
            </Text>
          </View>
        </View>
      </View>

      {/* Account Groups */}
      {isLoading ? (
        <ActivityIndicator color="#818cf8" style={{ padding: 32 }} />
      ) : accounts.length === 0 ? (
        <View style={[styles.card, { alignItems: 'center', padding: 32 }]}>
          <Feather name="credit-card" size={32} color="#64748b" />
          <Text style={[styles.emptyText, { marginTop: 12 }]}>
            No financial institutions connected yet.
          </Text>
          <Text style={[styles.accSub, { textAlign: 'center', marginTop: 4 }]}>
            Connect your bank accounts securely on the Lunaria web portal via Plaid.
          </Text>
        </View>
      ) : (
        <>
          {renderAccountGroup('Cash & Checking', cashAccounts, 'dollar-sign')}
          {renderAccountGroup('Credit Cards', creditAccounts, 'credit-card', true)}
          {renderAccountGroup('Investments & 401(k)', investmentAccounts, 'trending-up')}
          {renderAccountGroup('Loans & Mortgages', loanAccounts, 'home', true)}
        </>
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
    gap: 12,
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
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e2433',
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
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  groupTotalText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  groupDivider: {
    height: 1,
    backgroundColor: '#1e2433',
    marginVertical: 4,
  },
  accRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  accName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  accSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  accBalance: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  hiddenTag: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hiddenTagText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
