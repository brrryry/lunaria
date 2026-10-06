import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LunariaDb,
  categoryBudgets,
  transactions,
  categories,
  accounts,
} from '@lunaria/db';
import { and, eq, gte, lte, gt, desc, sql } from 'drizzle-orm';

import {
  MonthlyBudgetSummary,
  CategoryBudgetEntry,
  UpdateBudgetDto,
} from '@lunaria/types';
import { DATABASE_TOKEN } from '../database/database.module.js';

const DEFAULT_INCOME_CATEGORIES = [
  'Income',
  'Salary',
  'Investments',
  'Other Income',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Living Expenses',
  'Food & Lifestyle',
  'Discretionary',
  'Financial',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'General',
];

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  /**
   * Helper to compute start and end date for a YYYY-MM month string
   */
  private getMonthDateRange(month: string) {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);

    const startDate = `${month}-01`;
    // Last day of month
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
  }

  /**
   * Helper to compute the previous month YYYY-MM
   */
  private getPreviousMonth(month: string): string {
    const [yearStr, monthStr] = month.split('-');
    let year = parseInt(yearStr, 10);
    let m = parseInt(monthStr, 10) - 1;
    if (m === 0) {
      m = 12;
      year -= 1;
    }
    return `${year}-${String(m).padStart(2, '0')}`;
  }

  /**
   * Helper to compute the next N consecutive calendar months (YYYY-MM)
   */
  private getNextMonths(month: string, count: number = 24): string[] {
    const result: string[] = [];
    const [yearStr, monthStr] = month.split('-');
    let year = parseInt(yearStr, 10);
    let m = parseInt(monthStr, 10);

    for (let i = 0; i < count; i++) {
      m += 1;
      if (m > 12) {
        m = 1;
        year += 1;
      }
      result.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    return result;
  }

  async getMonthlyBudget(
    userId: string,
    month?: string,
  ): Promise<MonthlyBudgetSummary> {
    const activeMonth =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : new Date().toISOString().substring(0, 7);

    const { startDate, endDate } = this.getMonthDateRange(activeMonth);

    // 1. Fetch saved budgets for this user & month
    const savedBudgets = await this.db
      .select()
      .from(categoryBudgets)
      .where(
        and(
          eq(categoryBudgets.userId, userId),
          eq(categoryBudgets.month, activeMonth),
        ),
      );

    // 1b. Fetch all user category budgets defined in prior months up to activeMonth
    // to guarantee that once a category is added, it automatically adjusts future budget sheets
    const priorBudgets = await this.db
      .select()
      .from(categoryBudgets)
      .where(
        and(
          eq(categoryBudgets.userId, userId),
          lte(categoryBudgets.month, activeMonth),
        ),
      )
      .orderBy(desc(categoryBudgets.month));

    const budgetMap = new Map<string, { budgetedAmount: number; type: string }>();
    for (const b of savedBudgets) {
      budgetMap.set(`${b.type}:${b.category.toLowerCase()}`, {
        budgetedAmount: Number(b.budgetedAmount) || 0,
        type: b.type,
      });
    }

    const carriedForwardRows: typeof savedBudgets = [];
    for (const pb of priorBudgets) {
      const key = `${pb.type}:${pb.category.toLowerCase()}`;
      if (!budgetMap.has(key)) {
        budgetMap.set(key, {
          budgetedAmount: Number(pb.budgetedAmount) || 0,
          type: pb.type,
        });
        carriedForwardRows.push(pb);
      }
    }


    // 2. Fetch all transactions for this user within this calendar month from active non-hidden accounts
    const monthTransactions = await this.db
      .select({
        amount: transactions.amount,
        category: transactions.category,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(accounts.isHidden, false),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
        ),
      );

    // 3. Aggregate actual amounts by category
    // In our system: negative amount = income credit (e.g. paycheck -4850)
    // positive amount = expense debit (e.g. rent 2400)
    const actualIncomeMap = new Map<string, number>();
    const actualExpenseMap = new Map<string, number>();

    for (const tx of monthTransactions) {
      const amt = Number(tx.amount) || 0;
      const cat = tx.category || 'General';
      const catKey = cat.toLowerCase();

      if (amt < 0) {
        // Income (exclude credit card statement credits or internal transfers tagged as Payment/Transfer)
        if (catKey === 'transfer' || catKey === 'payment') {
          continue;
        }
        actualIncomeMap.set(
          catKey,
          (actualIncomeMap.get(catKey) || 0) + Math.abs(amt),
        );
      } else {
        // Expense (exclude internal transfers and debt payments from consumer living expense budgets)
        if (catKey === 'transfer' || catKey === 'payment') {
          continue;
        }
        actualExpenseMap.set(
          catKey,
          (actualExpenseMap.get(catKey) || 0) + amt,
        );
      }
    }

    // 4. Build Income Categories List
    const incomeCatNames = new Set<string>();
    // Default categories
    DEFAULT_INCOME_CATEGORIES.forEach((c) => incomeCatNames.add(c));
    // Saved budgets
    savedBudgets
      .filter((b) => b.type === 'income')
      .forEach((b) => incomeCatNames.add(b.category));
    // Carried forward categories from prior user adjustments
    carriedForwardRows
      .filter((b) => b.type === 'income')
      .forEach((b) => incomeCatNames.add(b.category));
    // Actuals from transactions
    for (const tx of monthTransactions) {
      const catLower = (tx.category || '').toLowerCase();
      if (
        Number(tx.amount) < 0 &&
        tx.category &&
        catLower !== 'transfer' &&
        catLower !== 'payment'
      ) {
        incomeCatNames.add(tx.category);
      }
    }

    const incomeCategories: CategoryBudgetEntry[] = Array.from(incomeCatNames).map(
      (cat) => {
        const key = `income:${cat.toLowerCase()}`;
        const budgeted = budgetMap.get(key)?.budgetedAmount || 0;
        const actual = actualIncomeMap.get(cat.toLowerCase()) || 0;
        const remaining = actual - budgeted; // for income: positive means exceeded target
        const percentSpent =
          budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;

        return {
          category: cat,
          type: 'income',
          budgeted,
          actual: Math.round(actual * 100) / 100,
          remaining: Math.round(remaining * 100) / 100,
          percentSpent,
        };
      },
    );

    // 5. Build Expense Categories List
    const expenseCatNames = new Set<string>();
    DEFAULT_EXPENSE_CATEGORIES.forEach((c) => expenseCatNames.add(c));
    savedBudgets
      .filter((b) => b.type === 'expense')
      .forEach((b) => expenseCatNames.add(b.category));
    carriedForwardRows
      .filter((b) => b.type === 'expense')
      .forEach((b) => expenseCatNames.add(b.category));

    for (const tx of monthTransactions) {
      const catLower = (tx.category || '').toLowerCase();
      if (
        Number(tx.amount) >= 0 &&
        tx.category &&
        tx.category !== 'Income' &&
        catLower !== 'transfer' &&
        catLower !== 'payment'
      ) {
        expenseCatNames.add(tx.category);
      }
    }

    const expenseCategories: CategoryBudgetEntry[] = Array.from(
      expenseCatNames,
    ).map((cat) => {
      const key = `expense:${cat.toLowerCase()}`;
      const budgeted = budgetMap.get(key)?.budgetedAmount || 0;
      const actual = actualExpenseMap.get(cat.toLowerCase()) || 0;
      const remaining = budgeted - actual; // for expense: positive means under budget (savings)
      const percentSpent =
        budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;

      return {
        category: cat,
        type: 'expense',
        budgeted,
        actual: Math.round(actual * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        percentSpent,
      };
    });

    // 6. Compute Totals
    const totalBudgetedIncome = incomeCategories.reduce(
      (sum, c) => sum + c.budgeted,
      0,
    );
    const totalBudgetedExpenses = expenseCategories.reduce(
      (sum, c) => sum + c.budgeted,
      0,
    );
    // ZERO-BASED BUDGETING: Left to Budget = Expected Income - Allocated Expenses
    const leftToBudget = totalBudgetedIncome - totalBudgetedExpenses;

    const totalActualIncome = Array.from(actualIncomeMap.values()).reduce(
      (sum, v) => sum + v,
      0,
    );
    const totalActualExpenses = Array.from(actualExpenseMap.values()).reduce(
      (sum, v) => sum + v,
      0,
    );
    const actualNetSavings = totalActualIncome - totalActualExpenses;

    return {
      month: activeMonth,
      totalBudgetedIncome: Math.round(totalBudgetedIncome * 100) / 100,
      totalBudgetedExpenses: Math.round(totalBudgetedExpenses * 100) / 100,
      leftToBudget: Math.round(leftToBudget * 100) / 100,
      totalActualIncome: Math.round(totalActualIncome * 100) / 100,
      totalActualExpenses: Math.round(totalActualExpenses * 100) / 100,
      actualNetSavings: Math.round(actualNetSavings * 100) / 100,
      incomeCategories,
      expenseCategories,
    };
  }

  async upsertBudget(
    userId: string,
    dto: UpdateBudgetDto,
  ): Promise<MonthlyBudgetSummary> {
    const month = dto.month;

    for (const entry of dto.entries) {
      await this.db
        .insert(categoryBudgets)
        .values({
          userId,
          month,
          category: entry.category,
          subCategory: entry.subCategory || null,
          type: entry.type || 'expense',
          budgetedAmount: Number(entry.budgetedAmount) || 0,
        })
        .onConflictDoUpdate({
          target: [
            categoryBudgets.userId,
            categoryBudgets.month,
            categoryBudgets.category,
            categoryBudgets.type,
          ],
          set: {
            budgetedAmount: Number(entry.budgetedAmount) || 0,
            updatedAt: new Date(),
          },
        });
    }

    if (dto.adjustFuture !== false) {
      await this.propagateToFutureMonths(userId, month, dto.entries);
    }


    this.logger.log(
      `Saved ${dto.entries.length} budget entries for user ${userId} in ${month}`,
    );

    return this.getMonthlyBudget(userId, month);
  }

  /**
   * Propagates new or adjusted category budgets to future budget sheets
   */
  private async propagateToFutureMonths(
    userId: string,
    currentMonth: string,
    entries: UpdateBudgetDto['entries'],
  ) {
    if (!entries || entries.length === 0) return;

    try {
      // 1. Fetch any future months already in the DB
      const existingFutureRows = await this.db
        .select({ month: categoryBudgets.month })
        .from(categoryBudgets)
        .where(
          and(
            eq(categoryBudgets.userId, userId),
            gt(categoryBudgets.month, currentMonth),
          ),
        );

      const futureMonthsSet = new Set<string>();
      existingFutureRows.forEach((r) => futureMonthsSet.add(r.month));

      // 2. Pre-populate consecutive future months for the next 24 months
      const next24 = this.getNextMonths(currentMonth, 24);
      next24.forEach((m) => futureMonthsSet.add(m));

      const futureMonths = Array.from(futureMonthsSet).sort();

      // 3. For each entry, upsert into future months
      for (const entry of entries) {
        for (const futureMonth of futureMonths) {
          await this.db
            .insert(categoryBudgets)
            .values({
              userId,
              month: futureMonth,
              category: entry.category,
              subCategory: entry.subCategory || null,
              type: entry.type || 'expense',
              budgetedAmount: Number(entry.budgetedAmount) || 0,
            })
            .onConflictDoUpdate({
              target: [
                categoryBudgets.userId,
                categoryBudgets.month,
                categoryBudgets.category,
                categoryBudgets.type,
              ],
              set: {
                budgetedAmount: Number(entry.budgetedAmount) || 0,
                updatedAt: new Date(),
              },
            });
        }
      }

      this.logger.log(
        `Propagated ${entries.length} category targets across ${futureMonths.length} future months for user ${userId}`,
      );
    } catch (err) {
      this.logger.error('Failed propagating category to future months:', err);
    }
  }


  async copyPreviousMonth(
    userId: string,
    currentMonth: string,
  ): Promise<MonthlyBudgetSummary> {
    const prevMonth = this.getPreviousMonth(currentMonth);

    const prevBudgets = await this.db
      .select()
      .from(categoryBudgets)
      .where(
        and(
          eq(categoryBudgets.userId, userId),
          eq(categoryBudgets.month, prevMonth),
        ),
      );

    if (prevBudgets.length > 0) {
      for (const b of prevBudgets) {
        await this.db
          .insert(categoryBudgets)
          .values({
            userId,
            month: currentMonth,
            category: b.category,
            subCategory: b.subCategory,
            type: b.type,
            budgetedAmount: b.budgetedAmount,
          })
          .onConflictDoUpdate({
            target: [
              categoryBudgets.userId,
              categoryBudgets.month,
              categoryBudgets.category,
              categoryBudgets.type,
            ],
            set: {
              budgetedAmount: b.budgetedAmount,
              updatedAt: new Date(),
            },
          });
      }
      this.logger.log(
        `Copied ${prevBudgets.length} budget targets from ${prevMonth} to ${currentMonth}`,
      );
    }

    return this.getMonthlyBudget(userId, currentMonth);
  }
}
