import { boolean, doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { plaidItems } from './plaid-items';

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    plaidItemId: uuid('plaid_item_id').references(() => plaidItems.id, { onDelete: 'cascade' }).notNull(),
    plaidAccountId: text('plaid_account_id').notNull().unique(),
    name: text('name').notNull(),
    officialName: text('official_name'),
    mask: text('mask'),
    type: text('type').notNull(), // depository, credit, loan, investment, other
    subtype: text('subtype'),     // checking, savings, brokerage, etc.
    currentBalance: doublePrecision('current_balance').default(0).notNull(),
    availableBalance: doublePrecision('available_balance'),
    creditLimit: doublePrecision('credit_limit'),
    isoCurrencyCode: text('iso_currency_code').default('USD').notNull(),
    institutionName: text('institution_name').notNull(),
    institutionLogo: text('institution_logo'),
    institutionColor: text('institution_color'),
    isHidden: boolean('is_hidden').default(false).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_accounts_user_hidden').on(table.userId, table.isHidden),
    index('idx_accounts_user_type').on(table.userId, table.type),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
