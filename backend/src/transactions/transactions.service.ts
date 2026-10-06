import { Inject, Injectable } from '@nestjs/common';
import { LunariaDb, transactions, accounts, categoryRules } from '@lunaria/db';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module.js';
import type { TransactionFilter } from '@lunaria/types';

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  async getTransactions(userId: string, filter: TransactionFilter = {}) {
    const conditions = [
      eq(transactions.userId, userId),
      eq(accounts.isHidden, false),
    ];

    if (filter.accountId) {
      conditions.push(eq(transactions.accountId, filter.accountId));
    }
    if (filter.startDate) {
      conditions.push(gte(transactions.date, filter.startDate));
    }
    if (filter.endDate) {
      conditions.push(lte(transactions.date, filter.endDate));
    }
    if (filter.category) {
      conditions.push(eq(transactions.category, filter.category));
    }
    if (filter.search) {
      conditions.push(ilike(transactions.name, `%${filter.search}%`));
    }

    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    const list = await this.db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        accountId: transactions.accountId,
        plaidTransactionId: transactions.plaidTransactionId,
        amount: transactions.amount,
        isoCurrencyCode: transactions.isoCurrencyCode,
        date: transactions.date,
        datetime: transactions.datetime,
        name: transactions.name,
        merchantName: transactions.merchantName,
        category: transactions.category,
        subCategory: transactions.subCategory,
        pending: transactions.pending,
        notes: transactions.notes,
        tags: transactions.tags,
        logoUrl: transactions.logoUrl,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: list,
      count: list.length,
      limit,
      offset,
    };
  }

  async getAccounts(userId: string) {
    return this.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(accounts.institutionName, accounts.name);
  }

  async updateAccount(
    id: string,
    userId: string,
    dto: { isHidden?: boolean; creditLimit?: number | null },
  ) {
    const [updated] = await this.db
      .update(accounts)
      .set({
        ...(typeof dto.isHidden === 'boolean' ? { isHidden: dto.isHidden } : {}),
        ...(dto.creditLimit !== undefined ? { creditLimit: dto.creditLimit } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();

    return updated;
  }

  async deleteAccount(id: string, userId: string) {
    const [deleted] = await this.db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();

    return { success: Boolean(deleted), deleted };
  }

  async getSpendingSummary(userId: string, excludeTransfers: boolean = true) {
    const conditions = [
      eq(transactions.userId, userId),
      eq(accounts.isHidden, false),
      gte(transactions.amount, 0),
    ];

    if (excludeTransfers) {
      conditions.push(sql`lower(${transactions.category}) NOT IN ('payment', 'transfer')`);
    }

    const summary = await this.db
      .select({
        category: transactions.category,
        total: sql<number>`sum(${transactions.amount})`,
        count: sql<number>`count(${transactions.id})`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(...conditions))
      .groupBy(transactions.category);

    return summary;
  }

  async getCategoryRules(userId: string) {
    return this.db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.userId, userId))
      .orderBy(desc(categoryRules.updatedAt));
  }

  async updateCategory(
    id: string,
    userId: string,
    dto: { category: string; subCategory?: string; applyToAllMerchant?: boolean },
  ) {
    const [target] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .limit(1);

    if (!target) {
      throw new Error('Transaction not found');
    }

    const merchantKey = target.merchantName?.trim();
    const nameKey = target.name?.trim();

    // 1. Persist/upsert categorization rule for merchant / transaction name
    let existingRule = null;
    if (merchantKey) {
      const [rule] = await this.db
        .select()
        .from(categoryRules)
        .where(
          and(
            eq(categoryRules.userId, userId),
            sql`lower(${categoryRules.merchantName}) = lower(${merchantKey})`,
          ),
        )
        .limit(1);
      existingRule = rule;
    } else if (nameKey) {
      const [rule] = await this.db
        .select()
        .from(categoryRules)
        .where(
          and(
            eq(categoryRules.userId, userId),
            sql`lower(${categoryRules.transactionName}) = lower(${nameKey})`,
          ),
        )
        .limit(1);
      existingRule = rule;
    }

    if (existingRule) {
      await this.db
        .update(categoryRules)
        .set({
          category: dto.category,
          subCategory: dto.subCategory || null,
          merchantName: merchantKey || existingRule.merchantName,
          transactionName: nameKey || existingRule.transactionName,
          updatedAt: new Date(),
        })
        .where(eq(categoryRules.id, existingRule.id));
    } else {
      await this.db.insert(categoryRules).values({
        userId,
        merchantName: merchantKey || null,
        transactionName: nameKey || null,
        category: dto.category,
        subCategory: dto.subCategory || null,
      });
    }

    // 2. Synchronize transactions
    // If applyToAllMerchant is not explicitly false (i.e. defaults to true or passed true)
    if (dto.applyToAllMerchant !== false) {
      const matchConditions = [
        sql`lower(${transactions.name}) = lower(${target.name})`,
      ];
      if (target.merchantName) {
        matchConditions.push(
          sql`lower(${transactions.merchantName}) = lower(${target.merchantName})`,
        );
      }

      await this.db
        .update(transactions)
        .set({
          category: dto.category,
          subCategory: dto.subCategory || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(transactions.userId, userId),
            matchConditions.length > 1 ? or(...matchConditions) : matchConditions[0],
          ),
        );
    } else {
      await this.db
        .update(transactions)
        .set({
          category: dto.category,
          subCategory: dto.subCategory || null,
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    }

    const [updated] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    return updated;
  }
}
