import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const categoryBudgets = pgTable(
  'category_budgets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    month: text('month').notNull(), // Format: YYYY-MM, e.g. "2026-09"
    category: text('category').notNull(),
    subCategory: text('sub_category'),
    type: text('type').default('expense').notNull(), // "income" or "expense"
    budgetedAmount: doublePrecision('budgeted_amount').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_cat_budgets_user_month').on(table.userId, table.month),
    uniqueIndex('uniq_cat_budget_user_month_cat').on(
      table.userId,
      table.month,
      table.category,
      table.type,
    ),
  ],
);

export type CategoryBudgetRow = typeof categoryBudgets.$inferSelect;
export type NewCategoryBudgetRow = typeof categoryBudgets.$inferInsert;
