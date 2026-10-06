import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const plaidItems = pgTable('plaid_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  itemId: text('item_id').notNull().unique(),
  // Stored with AES-256-GCM encryption
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  institutionId: text('institution_id').notNull(),
  institutionName: text('institution_name').notNull(),
  cursor: text('cursor'),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PlaidItemRow = typeof plaidItems.$inferSelect;
export type NewPlaidItemRow = typeof plaidItems.$inferInsert;
