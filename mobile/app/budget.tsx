import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from './api';
import { MonthlyBudgetSummary, CategoryBudgetEntry } from '@lunaria/types';

export default function MobileBudget() {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().substring(0, 7);
  });

  const [budgetData, setBudgetData] = useState<MonthlyBudgetSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'expenses' | 'income'>('all');

  // Edit category target modal
  const [editingCategory, setEditingCategory] = useState<CategoryBudgetEntry | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editAdjustFuture, setEditAdjustFuture] = useState<boolean>(true);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Add custom category modal
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');
  const [newCatAmount, setNewCatAmount] = useState<string>('');
  const [newCatAdjustFuture, setNewCatAdjustFuture] = useState<boolean>(true);
  const [isSubmittingNewCat, setIsSubmittingNewCat] = useState<boolean>(false);

  const formattedMonth = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) - 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(new Date().toISOString().substring(0, 7));
  };

  const fetchBudget = useCallback(async (month: string) => {
    try {
      const res = await apiFetch(`/budget?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setBudgetData(data);
      }
    } catch (err) {
      console.warn('Failed to load budget:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchBudget(selectedMonth);
  }, [selectedMonth, fetchBudget]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBudget(selectedMonth);
  };

  const handleCopyPrevious = async () => {
    try {
      setIsCopying(true);
      const res = await apiFetch('/budget/copy-previous', {
        method: 'POST',
        body: JSON.stringify({ month: selectedMonth }),
      });

      if (res.ok) {
        const data = await res.json();
        setBudgetData(data);
        Alert.alert('Success', 'Previous month budget targets copied successfully!');
      } else {
        Alert.alert('Notice', 'No budget targets found in previous month to copy.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to copy previous month budget.');
    } finally {
      setIsCopying(false);
    }
  };

  const handleSaveCategoryBudget = async () => {
    if (!editingCategory) return;
    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid positive number.');
      return;
    }

    try {
      setIsSavingEdit(true);
      const res = await apiFetch('/budget', {
        method: 'PUT',
        body: JSON.stringify({
          month: selectedMonth,
          entries: [
            {
              category: editingCategory.category,
              type: editingCategory.type || 'expense',
              budgetedAmount: amountNum,
            },
          ],
          adjustFuture: editAdjustFuture,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setBudgetData(updated);
        setEditingCategory(null);
      } else {
        Alert.alert('Error', 'Failed to update category target.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error updating target.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      Alert.alert('Missing name', 'Please enter a category name.');
      return;
    }

    const amountNum = Math.max(0, parseFloat(newCatAmount) || 0);

    try {
      setIsSubmittingNewCat(true);
      const res = await apiFetch('/budget', {
        method: 'PUT',
        body: JSON.stringify({
          month: selectedMonth,
          entries: [
            {
              category: newCatName.trim(),
              type: newCatType,
              budgetedAmount: amountNum,
            },
          ],
          adjustFuture: newCatAdjustFuture,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setBudgetData(updated);
        setIsAddingCategory(false);
        setNewCatName('');
        setNewCatAmount('');
        setNewCatAdjustFuture(true);
      } else {
        Alert.alert('Error', 'Failed to create category.');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error creating category.');
    } finally {
      setIsSubmittingNewCat(false);
    }
  };

  // Zero-Based Budgeting Calculations
  const totalBudgetedIncome = budgetData?.totalBudgetedIncome || 0;
  const totalBudgetedExpenses = budgetData?.totalBudgetedExpenses || 0;
  const totalActualExpenses = budgetData?.totalActualExpenses || 0;
  const totalActualIncome = budgetData?.totalActualIncome || 0;

  const leftToBudget = budgetData?.leftToBudget ?? (totalBudgetedIncome - totalBudgetedExpenses);
  const isZeroBalanced = leftToBudget === 0 && totalBudgetedIncome > 0;
  const isOverAllocated = leftToBudget < 0;

  const incomeCategories = budgetData?.incomeCategories || [];
  const expenseCategories = budgetData?.expenseCategories || [];

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
      {/* Month Navigator Bar */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrow}>
          <Feather name="chevron-left" size={20} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleCurrentMonth} style={styles.monthLabelBox}>
          <View style={styles.monthTitleRow}>
            <Feather name="calendar" size={14} color="#818cf8" style={{ marginRight: 6 }} />
            <Text style={styles.monthTitle}>{formattedMonth}</Text>
          </View>
          <Text style={styles.todayHint}>Tap for Current Month</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNextMonth} style={styles.navArrow}>
          <Feather name="chevron-right" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Hero: Zero-Based "Left to Budget" Allocation Card */}
      <View
        style={[
          styles.heroCard,
          isOverAllocated
            ? styles.heroOverAllocated
            : isZeroBalanced
            ? styles.heroZeroBalanced
            : styles.heroReady,
        ]}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.badge,
              isOverAllocated
                ? styles.badgeOverAllocated
                : isZeroBalanced
                ? styles.badgeZeroBalanced
                : styles.badgeReady,
            ]}
          >
            <Feather
              name={isOverAllocated ? 'alert-circle' : isZeroBalanced ? 'award' : 'check-circle'}
              size={12}
              color={isOverAllocated ? '#f87171' : isZeroBalanced ? '#a5b4fc' : '#34d399'}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.badgeText,
                { color: isOverAllocated ? '#f87171' : isZeroBalanced ? '#a5b4fc' : '#34d399' },
              ]}
            >
              {isOverAllocated
                ? 'OVERALLOCATED BUDGET'
                : isZeroBalanced
                ? 'ALL DOLLARS ASSIGNED'
                : 'READY TO ALLOCATE'}
            </Text>
          </View>
        </View>

        <View style={styles.amountHeroRow}>
          <Text
            style={[
              styles.bigHeroAmount,
              { color: isOverAllocated ? '#f87171' : isZeroBalanced ? '#c7d2fe' : '#34d399' },
            ]}
          >
            {leftToBudget < 0 ? '-' : '+'}$
            {Math.abs(leftToBudget).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.heroSubLabel}>Left to Budget</Text>
        </View>

        <Text style={styles.heroExplanation}>
          {isOverAllocated
            ? `You have allocated $${Math.abs(leftToBudget).toFixed(
                2,
              )} more than your planned income. Reduce expense targets or increase planned income to zero-balance.`
            : isZeroBalanced
            ? 'Every dollar of expected income has a job! Your budget is completely zero-balanced.'
            : `You have $${leftToBudget.toFixed(
                2,
              )} in unassigned income remaining. Allocate it to savings, investments, or discretionary envelopes.`}
        </Text>

        {/* 3 Metrics Breakdown */}
        <View style={styles.subRow}>
          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Expected Income</Text>
            <Text style={[styles.subValue, { color: '#34d399' }]}>
              ${totalBudgetedIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Budgeted Spend</Text>
            <Text style={[styles.subValue, { color: '#e2e8f0' }]}>
              ${totalBudgetedExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.subCol}>
            <Text style={styles.subLabel}>Actual Spent</Text>
            <Text style={[styles.subValue, { color: '#f87171' }]}>
              ${totalActualExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleCopyPrevious}
          disabled={isCopying}
          style={styles.secondaryActionBtn}
        >
          {isCopying ? (
            <ActivityIndicator size="small" color="#818cf8" />
          ) : (
            <Feather name="copy" size={14} color="#818cf8" />
          )}
          <Text style={styles.secondaryActionText}>Copy Prev Month</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsAddingCategory(true)}
          style={styles.primaryActionBtn}
        >
          <Feather name="plus" size={14} color="#ffffff" />
          <Text style={styles.primaryActionText}>Add Target</Text>
        </TouchableOpacity>
      </View>

      {/* Section Filter Pills */}
      <View style={styles.filterPillsRow}>
        <TouchableOpacity
          onPress={() => setActiveFilter('all')}
          style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
        >
          <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
            All ({incomeCategories.length + expenseCategories.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveFilter('expenses')}
          style={[styles.filterPill, activeFilter === 'expenses' && styles.filterPillActive]}
        >
          <Text style={[styles.filterPillText, activeFilter === 'expenses' && styles.filterPillTextActive]}>
            Expenses ({expenseCategories.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveFilter('income')}
          style={[styles.filterPill, activeFilter === 'income' && styles.filterPillActive]}
        >
          <Text style={[styles.filterPillText, activeFilter === 'income' && styles.filterPillTextActive]}>
            Income ({incomeCategories.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* SECTION 1: INCOME STREAMS */}
      {(activeFilter === 'all' || activeFilter === 'income') && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Feather name="arrow-down-left" size={15} color="#34d399" />
              </View>
              <View>
                <Text style={styles.cardLabel}>INCOME STREAMS</Text>
                <Text style={styles.sectionSubtitle}>Salary, investments, cash inflows</Text>
              </View>
            </View>
            <View style={styles.sectionTotalRight}>
              <Text style={styles.sectionTotalLabel}>Planned Inflow</Text>
              <Text style={[styles.sectionTotalValue, { color: '#34d399' }]}>
                ${totalBudgetedIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#818cf8" style={{ padding: 24 }} />
          ) : incomeCategories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No income streams tracked for this month.</Text>
              <TouchableOpacity
                onPress={() => {
                  setNewCatType('income');
                  setIsAddingCategory(true);
                }}
                style={{ marginTop: 8 }}
              >
                <Text style={styles.linkText}>+ Add planned income target</Text>
              </TouchableOpacity>
            </View>
          ) : (
            incomeCategories.map((cat: CategoryBudgetEntry) => {
              const catActual = cat.actual || 0;
              const catTarget = cat.budgeted || 0;
              const diff = catActual - catTarget;
              const isMet = catActual >= catTarget && catTarget > 0;

              return (
                <TouchableOpacity
                  key={`income-${cat.category}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    setEditingCategory(cat);
                    setEditAmount(String(catTarget || ''));
                    setEditAdjustFuture(true);
                  }}
                  style={styles.categoryItem}
                >
                  <View style={styles.catHeader}>
                    <View style={styles.catTitleRow}>
                      <Text style={styles.catName}>{cat.category}</Text>
                      <Feather name="edit-2" size={11} color="#64748b" style={{ marginLeft: 6 }} />
                    </View>
                    <View style={styles.catValuesRight}>
                      <Text style={styles.catAmounts}>
                        ${catActual.toFixed(2)}{' '}
                        <Text style={{ color: '#64748b' }}>
                          / ${catTarget > 0 ? catTarget.toFixed(2) : '0.00'}
                        </Text>
                      </Text>
                    </View>
                  </View>

                  <View style={styles.catFooter}>
                    <View style={styles.incomeDiffRow}>
                      <Text
                        style={[
                          styles.diffText,
                          { color: diff >= 0 ? '#34d399' : '#94a3b8' },
                        ]}
                      >
                        {diff >= 0 ? '+' : ''}${diff.toFixed(2)} received vs target
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.miniBadge,
                        {
                          backgroundColor: isMet
                            ? 'rgba(16, 185, 129, 0.15)'
                            : catActual > 0
                            ? 'rgba(99, 102, 241, 0.15)'
                            : 'rgba(30, 41, 59, 0.8)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniBadgeText,
                          {
                            color: isMet
                              ? '#34d399'
                              : catActual > 0
                              ? '#a5b4fc'
                              : '#94a3b8',
                          },
                        ]}
                      >
                        {isMet ? 'Target Met' : catActual > 0 ? 'In Progress' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* SECTION 2: EXPENSE ENVELOPES */}
      {(activeFilter === 'all' || activeFilter === 'expenses') && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Feather name="arrow-up-right" size={15} color="#f87171" />
              </View>
              <View>
                <Text style={styles.cardLabel}>EXPENSE ENVELOPES</Text>
                <Text style={styles.sectionSubtitle}>Allocated spending limits and pacing</Text>
              </View>
            </View>
            <View style={styles.sectionTotalRight}>
              <Text style={styles.sectionTotalLabel}>Planned Spend</Text>
              <Text style={[styles.sectionTotalValue, { color: '#f87171' }]}>
                ${totalBudgetedExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#818cf8" style={{ padding: 24 }} />
          ) : expenseCategories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No expense categories tracked for this month.</Text>
              <TouchableOpacity
                onPress={handleCopyPrevious}
                style={{ marginTop: 8 }}
              >
                <Text style={styles.linkText}>Copy targets from previous month →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            expenseCategories.map((cat: CategoryBudgetEntry) => {
              const catSpent = cat.actual || 0;
              const catTarget = cat.budgeted || 0;
              const catRemaining = cat.remaining || 0;
              const catPercent = Math.round(cat.percentSpent || 0);
              const catOver = catRemaining < 0;
              const isNearLimit = !catOver && catPercent >= 80;

              return (
                <TouchableOpacity
                  key={`expense-${cat.category}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    setEditingCategory(cat);
                    setEditAmount(String(catTarget || ''));
                    setEditAdjustFuture(true);
                  }}
                  style={styles.categoryItem}
                >
                  <View style={styles.catHeader}>
                    <View style={styles.catTitleRow}>
                      <Text style={styles.catName}>{cat.category}</Text>
                      <Feather name="edit-2" size={11} color="#64748b" style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={styles.catAmounts}>
                      ${catSpent.toFixed(2)}{' '}
                      <Text style={{ color: '#64748b' }}>
                        / ${catTarget > 0 ? catTarget.toFixed(2) : '0.00'}
                      </Text>
                    </Text>
                  </View>

                  {/* Visual pacing progress bar */}
                  <View style={styles.progressBarBackgroundSmall}>
                    <View
                      style={[
                        styles.progressBarFillSmall,
                        {
                          width: `${Math.min(100, catPercent)}%`,
                          backgroundColor: catOver
                            ? '#ef4444'
                            : catPercent > 85
                            ? '#f59e0b'
                            : '#10b981',
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.catFooter}>
                    <Text style={styles.catPercentText}>{catPercent}% of budget</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={[
                          styles.catRemainingText,
                          { color: catOver ? '#f87171' : '#34d399' },
                        ]}
                      >
                        {catOver
                          ? `Over by $${Math.abs(catRemaining).toFixed(2)}`
                          : `$${catRemaining.toFixed(2)} left`}
                      </Text>
                      <View
                        style={[
                          styles.miniBadge,
                          {
                            backgroundColor: catOver
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isNearLimit
                              ? 'rgba(245, 158, 11, 0.15)'
                              : catTarget > 0
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(30, 41, 59, 0.8)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniBadgeText,
                            {
                              color: catOver
                                ? '#f87171'
                                : isNearLimit
                                ? '#fbbf24'
                                : catTarget > 0
                                ? '#34d399'
                                : '#94a3b8',
                            },
                          ]}
                        >
                          {catOver
                            ? 'Over'
                            : isNearLimit
                            ? 'Near Limit'
                            : catTarget > 0
                            ? 'On Track'
                            : 'Unbudgeted'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* Edit Category Limit Modal */}
      <Modal
        visible={!!editingCategory}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCategory(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Budget Target</Text>
            <Text style={styles.modalSubtitle}>
              {editingCategory?.category} ({formattedMonth}) • {editingCategory?.type === 'income' ? 'Income Stream' : 'Expense Envelope'}
            </Text>

            <View style={styles.inputBox}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.inputField}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#64748b"
                value={editAmount}
                onChangeText={setEditAmount}
                autoFocus
              />
            </View>

            {/* Adjust Future Months Switch */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.switchTitle}>Adjust future budget sheets</Text>
                <Text style={styles.switchSubtitle}>
                  Automatically propagates this target to all upcoming months
                </Text>
              </View>
              <Switch
                value={editAdjustFuture}
                onValueChange={setEditAdjustFuture}
                trackColor={{ false: '#1e293b', true: '#4f46e5' }}
                thumbColor={editAdjustFuture ? '#ffffff' : '#94a3b8'}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setEditingCategory(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveCategoryBudget}
                disabled={isSavingEdit}
                style={styles.modalSaveBtn}
              >
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Target</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Custom Category Modal */}
      <Modal
        visible={isAddingCategory}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddingCategory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Category Target</Text>
            <Text style={styles.modalSubtitle}>
              Create an envelope or income stream target for {formattedMonth}.
            </Text>

            <TextInput
              style={styles.modalTextInput}
              placeholder="Category name (e.g. Salary, Groceries, Travel)"
              placeholderTextColor="#64748b"
              value={newCatName}
              onChangeText={setNewCatName}
            />

            <View style={styles.typeSelectorRow}>
              <TouchableOpacity
                onPress={() => setNewCatType('expense')}
                style={[
                  styles.typePill,
                  newCatType === 'expense' && styles.typePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    newCatType === 'expense' && styles.typePillTextActive,
                  ]}
                >
                  Expense Envelope
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setNewCatType('income')}
                style={[
                  styles.typePill,
                  newCatType === 'income' && styles.typePillActive,
                ]}
              >
                <Text
                  style={[
                    styles.typePillText,
                    newCatType === 'income' && styles.typePillTextActive,
                  ]}
                >
                  Income Stream
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalTextInput}
              placeholder="Monthly Budget Amount ($)"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={newCatAmount}
              onChangeText={setNewCatAmount}
            />

            {/* Adjust Future Months Switch */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.switchTitle}>Adjust future budget sheets</Text>
                <Text style={styles.switchSubtitle}>
                  Applies this category and target to all upcoming months
                </Text>
              </View>
              <Switch
                value={newCatAdjustFuture}
                onValueChange={setNewCatAdjustFuture}
                trackColor={{ false: '#1e293b', true: '#4f46e5' }}
                thumbColor={newCatAdjustFuture ? '#ffffff' : '#94a3b8'}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsAddingCategory(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreateCategory}
                disabled={isSubmittingNewCat}
                style={styles.modalSaveBtn}
              >
                {isSubmittingNewCat ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSaveText}>Create Target</Text>
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
    paddingBottom: 48,
    gap: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#11141f',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  navArrow: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#181d2a',
  },
  monthLabelBox: {
    alignItems: 'center',
  },
  monthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  todayHint: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  heroCard: {
    backgroundColor: '#11141f',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 10,
  },
  heroOverAllocated: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: '#161118',
  },
  heroZeroBalanced: {
    borderColor: 'rgba(99, 102, 241, 0.35)',
    backgroundColor: '#111424',
  },
  heroReady: {
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: '#0f171c',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOverAllocated: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  badgeZeroBalanced: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  badgeReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  amountHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
  },
  bigHeroAmount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSubLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  heroExplanation: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 17,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
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
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#181d2a',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  secondaryActionText: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 12,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillsRow: {
    flexDirection: 'row',
    backgroundColor: '#11141f',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2433',
    gap: 4,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterPillActive: {
    backgroundColor: '#1e2538',
  },
  filterPillText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#ffffff',
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 1,
  },
  sectionTotalRight: {
    alignItems: 'flex-end',
  },
  sectionTotalLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  sectionTotalValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
  },
  linkText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
    gap: 6,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  catValuesRight: {
    alignItems: 'flex-end',
  },
  catAmounts: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  incomeDiffRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  diffText: {
    fontSize: 11,
    fontWeight: '600',
  },
  miniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressBarBackgroundSmall: {
    height: 5,
    backgroundColor: '#181d2a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFillSmall: {
    height: '100%',
    borderRadius: 3,
  },
  catFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catPercentText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  catRemainingText: {
    fontSize: 11,
    fontWeight: '700',
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
    gap: 14,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090a0f',
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  dollarSign: {
    color: '#818cf8',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 6,
  },
  inputField: {
    flex: 1,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 12,
  },
  modalTextInput: {
    backgroundColor: '#090a0f',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#090a0f',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  typePillActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#6366f1',
  },
  typePillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  typePillTextActive: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0b0d14',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  switchTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  switchSubtitle: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
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
});
