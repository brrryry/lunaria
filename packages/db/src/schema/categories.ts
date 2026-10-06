import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    group: varchar('group', { length: 100 }).notNull().default('General'),
    color: varchar('color', { length: 50 }).notNull().default('#6366f1'),
    icon: varchar('icon', { length: 50 }).default('tag'),
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_categories_user_id').on(table.userId),
    index('idx_categories_name').on(table.name),
  ],
);

export type CategoryRecord = typeof categories.$inferSelect;
export type NewCategoryRecord = typeof categories.$inferInsert;

export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    merchantName: text('merchant_name'),
    transactionName: text('transaction_name'),
    category: text('category').notNull(),
    subCategory: text('sub_category'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_category_rules_user').on(table.userId),
    index('idx_category_rules_merchant').on(table.userId, table.merchantName),
    index('idx_category_rules_tx_name').on(table.userId, table.transactionName),
  ],
);

export type CategoryRuleRecord = typeof categoryRules.$inferSelect;
export type NewCategoryRuleRecord = typeof categoryRules.$inferInsert;

export const userCategoryExclusions = pgTable(
  'user_category_exclusions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_cat_exclusions_user').on(table.userId),
    index('idx_user_cat_exclusions_unique').on(table.userId, table.categoryId),
  ],
);

export type UserCategoryExclusionRecord = typeof userCategoryExclusions.$inferSelect;
export type NewUserCategoryExclusionRecord = typeof userCategoryExclusions.$inferInsert;

