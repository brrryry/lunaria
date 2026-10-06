import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { WidgetConfig } from '@lunaria/types';

export const userWidgets = pgTable('user_widgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  widgets: jsonb('widgets').$type<WidgetConfig[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserWidgetRow = typeof userWidgets.$inferSelect;
export type NewUserWidgetRow = typeof userWidgets.$inferInsert;
