import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LunariaDb, transactions, accounts, categoryRules } from '@lunaria/db';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module.js';
import type { TransactionFilter } from '@lunaria/types';

export function normalizeTransactionString(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNameOrMerchantSimilar(
  pendingName?: string | null,
  pendingMerchant?: string | null,
  postedName?: string | null,
  postedMerchant?: string | null,
): boolean {
  const normPN = normalizeTransactionString(pendingName);
  const normTN = normalizeTransactionString(postedName);
  const normPM = normalizeTransactionString(pendingMerchant);
  const normTM = normalizeTransactionString(postedMerchant);

  // Exact matches
  if (normPN && normTN && normPN === normTN) return true;
  if (normPM && normTM && normPM === normTM) return true;

  // Cross-matches between merchant and name
  if (normPM && normTN && (normPM === normTN || normTN.includes(normPM) || normPM.includes(normTN))) return true;
  if (normPN && normTM && (normPN === normTM || normPN.includes(normTM) || normTM.includes(normPN))) return true;

  // Substring matches
  if (normPN && normTN && (normPN.includes(normTN) || normTN.includes(normPN))) return true;
  if (normPM && normTM && (normPM.includes(normTM) || normPM.includes(normTM))) return true;

  // Token matching: first word of at least 4 characters (e.g. "TARGET 0432" vs "TARGET STORE")
  const pTokens = (normPM || normPN).split(' ').filter((w) => w.length >= 4);
  const tTokens = (normTM || normTN).split(' ').filter((w) => w.length >= 4);
  if (pTokens.length > 0 && tTokens.length > 0 && pTokens[0] === tTokens[0]) {
    return true;
  }

  return false;
}

export function filterPendingDuplicates<T extends {
  id?: string;
  accountId?: string;
  amount: number | string;
  date: string;
  name?: string | null;
  merchantName?: string | null;
  pending?: boolean;
}>(items: T[]): T[] {
  const pendingItems = items.filter((item) => item.pending);
  const postedItems = items.filter((item) => !item.pending);

  if (pendingItems.length === 0 || postedItems.length === 0) {
    return items;
  }

  const supersededPendingIds = new Set<string>();

  for (const pending of pendingItems) {
    const pAmt = Number(pending.amount);
    const pDate = new Date(pending.date).getTime();

    const match = postedItems.find((posted) => {
      if (posted.accountId && pending.accountId && posted.accountId !== pending.accountId) {
        return false;
      }

      const tAmt = Number(posted.amount);
      const exactAmount = Math.abs(tAmt - pAmt) < 0.001;
      const isTip = tAmt >= pAmt && pAmt > 0 && (tAmt - pAmt) <= 0.5 * pAmt;
      if (!exactAmount && !isTip) return false;

      const tDate = new Date(posted.date).getTime();
      const diffDays = Math.abs(tDate - pDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 7) return false;

      // Exact amount on the same day in the same account is a match
      if (exactAmount && diffDays === 0) return true;

      // Otherwise check name or merchant similarity
      return isNameOrMerchantSimilar(
        pending.name,
        pending.merchantName,
        posted.name,
        posted.merchantName,
      );
    });

    if (match && pending.id) {
      supersededPendingIds.add(pending.id);
    }
  }

  if (supersededPendingIds.size === 0) {
    return items;
  }

  return items.filter((item) => !item.id || !supersededPendingIds.has(item.id));
}

export async function reconcilePendingTransactionsInDb(
  db: LunariaDb,
  userId: string,
): Promise<{ deletedPendingCount: number }> {
  // 1. Fetch pending transactions for this user
  const pendingTxs = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      plaidTransactionId: transactions.plaidTransactionId,
      amount: transactions.amount,
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      notes: transactions.notes,
      tags: transactions.tags,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.pending, true)));

  if (!pendingTxs.length) {
    return { deletedPendingCount: 0 };
  }

  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const pendingDates = pendingTxs.map((p) => p.date).sort();
  const earliestPendingDate = pendingDates[0];
  const earlyDate = new Date(earliestPendingDate);
  earlyDate.setDate(earlyDate.getDate() - 7);
  const startDateStr = earlyDate.toISOString().split('T')[0];

  // 2. Fetch posted transactions within range
  const postedTxs = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      plaidTransactionId: transactions.plaidTransactionId,
      amount: transactions.amount,
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      notes: transactions.notes,
      tags: transactions.tags,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.pending, false),
        gte(transactions.date, startDateStr),
      ),
    );

  const pendingIdsToDelete: string[] = [];
  const matchedPostedIds = new Set<string>();

  for (const pending of pendingTxs) {
    // 1. Prune stale pending authorizations (> 21 days old)
    if (pending.date < staleCutoff) {
      pendingIdsToDelete.push(pending.id);
      continue;
    }

    const pAmt = Number(pending.amount);
    const pDate = new Date(pending.date).getTime();

    const match = postedTxs.find((posted) => {
      if (posted.accountId !== pending.accountId) return false;
      if (matchedPostedIds.has(posted.id)) return false;

      const tAmt = Number(posted.amount);
      const exactAmount = Math.abs(tAmt - pAmt) < 0.001;
      const isTip = tAmt >= pAmt && pAmt > 0 && (tAmt - pAmt) <= 0.5 * pAmt;
      if (!exactAmount && !isTip) return false;

      const tDate = new Date(posted.date).getTime();
      const diffDays = Math.abs(tDate - pDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 7) return false;

      if (exactAmount && diffDays === 0) return true;

      return isNameOrMerchantSimilar(
        pending.name,
        pending.merchantName,
        posted.name,
        posted.merchantName,
      );
    });

    if (match) {
      matchedPostedIds.add(match.id);
      pendingIdsToDelete.push(pending.id);

      // Preserve notes or tags if pending had them and posted does not
      if (
        (pending.notes && !match.notes) ||
        (pending.tags && pending.tags.length > 0 && (!match.tags || match.tags.length === 0))
      ) {
        await db
          .update(transactions)
          .set({
            notes: match.notes || pending.notes,
            tags: match.tags?.length ? match.tags : pending.tags,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, match.id));
      }
    }
  }

  if (pendingIdsToDelete.length > 0) {
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.id, pendingIdsToDelete),
        ),
      );
  }

  return { deletedPendingCount: pendingIdsToDelete.length };
}

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  async reconcilePendingTransactions(userId: string) {
    return reconcilePendingTransactionsInDb(this.db, userId);
  }

  async getTransactions(userId: string, filter: TransactionFilter = {}) {
    // 1. Clean up lingering or duplicate pending transactions in the background/inline
    try {
      await this.reconcilePendingTransactions(userId);
    } catch {
      // Non-blocking fallback
    }

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
      const searchCond = or(
        ilike(transactions.name, `%${filter.search}%`),
        ilike(transactions.merchantName, `%${filter.search}%`),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
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

    // 2. Ensure all transaction IDs are strictly unique
    const seenIds = new Set<string>();
    const seenPlaidIds = new Set<string>();
    const uniqueList: typeof list = [];

    for (const item of list) {
      if (item.id && seenIds.has(item.id)) {
        continue;
      }
      if (item.plaidTransactionId && seenPlaidIds.has(item.plaidTransactionId)) {
        continue;
      }
      if (item.id) seenIds.add(item.id);
      if (item.plaidTransactionId) seenPlaidIds.add(item.plaidTransactionId);
      uniqueList.push(item);
    }

    // 3. Filter out any pending transaction duplicates whose posted counterpart is present
    const cleanList = filterPendingDuplicates(uniqueList);

    return {
      items: cleanList,
      count: cleanList.length,
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
    try {
      await this.reconcilePendingTransactions(userId);
    } catch {
      // Non-blocking fallback
    }

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
      throw new NotFoundException('Transaction not found');
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
