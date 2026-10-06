import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import {
  LunariaDb,
  plaidItems,
  accounts,
  transactions,
  securityHoldings,
  portfolioSnapshots,
  categoryRules,
  investmentTransactions,
  categories,
  userCategoryExclusions,
  institutionUnlinkHistory,
  userRecurringExclusions,
} from '@lunaria/db';
import { eq, and, or, gte, desc, sql } from 'drizzle-orm';
import {
  RecurringStreamItem,
  RecurringFrequency,
  RecurringTransactionsResponse,
} from '@lunaria/types';
import { DATABASE_TOKEN } from '../database/database.module.js';
import { EncryptionService } from '../common/encryption.service.js';
import { AuthService } from '../auth/auth.service.js';
import { StocksService } from '../stocks/stocks.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private readonly client: PlaidApi;
  private readonly keyCache = new Map<string, { pem: string; expiresAt: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
    private readonly authService: AuthService,
    private readonly stocksService: StocksService,
    private readonly notificationsService: NotificationsService,
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {
    const clientId = this.config.get<string>('PLAID_CLIENT_ID');
    const secret = this.config.get<string>('PLAID_SECRET');
    const rawEnv = (this.config.get<string>('PLAID_ENV') || 'sandbox').toLowerCase();
    let basePath = PlaidEnvironments.sandbox;
    if (rawEnv === 'production') {
      basePath = PlaidEnvironments.production;
    } else if (rawEnv === 'development') {
      this.logger.warn(
        'PLAID_ENV is configured as "development". Plaid has retired the development environment. Defaulting to sandbox. Set PLAID_ENV=production for live production.',
      );
      basePath = PlaidEnvironments.sandbox;
    }

    this.logger.log(`Initialized Plaid client on: ${basePath} (PLAID_ENV=${rawEnv})`);

    const configuration = new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId || '',
          'PLAID-SECRET': secret || '',
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  private async resolveUser(providedUserId?: string) {
    if (providedUserId && providedUserId.length > 20) {
      const user = await this.authService.getUser(providedUserId);
      if (user) return user;
    }
    throw new UnauthorizedException('User not authenticated or not found');
  }

  async createLinkToken(userId?: string) {
    const user = await this.resolveUser(userId);

    const request = {
      user: { client_user_id: user.id },
      client_name: 'Lunaria',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: 'en',
      transactions: {
        days_requested: 730, // Request full 2 years (730 days) of historical transactions
      },
    };

    try {
      const response = await this.client.linkTokenCreate(request);
      return { linkToken: response.data.link_token, userId: user.id };
    } catch (err: any) {
      const plaidError = err?.response?.data;
      if (plaidError) {
        this.logger.error(
          `Plaid linkTokenCreate failed: [${plaidError.error_code}] ${plaidError.error_message}`,
        );
        throw new BadRequestException(
          plaidError.error_message || 'Failed to initialize Plaid Link',
        );
      }
      this.logger.error(`Plaid linkTokenCreate failed: ${err.message || err}`);
      throw err;
    }
  }

  async createUpdateLinkToken(userId: string, itemId: string) {
    const user = await this.resolveUser(userId);

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        itemId,
      );
    const condition = isUuid
      ? and(
          or(eq(plaidItems.id, itemId), eq(plaidItems.itemId, itemId)),
          eq(plaidItems.userId, user.id),
        )
      : and(eq(plaidItems.itemId, itemId), eq(plaidItems.userId, user.id));

    const [item] = await this.db.select().from(plaidItems).where(condition);
    if (!item) {
      throw new NotFoundException(`Plaid item ${itemId} not found`);
    }

    const decryptedToken = this.encryption.decrypt(item.accessTokenEncrypted);

    // In Update Mode, products parameter MUST NOT be passed.
    // access_token is passed to put Link into update mode.
    const request: any = {
      user: { client_user_id: user.id },
      client_name: 'Lunaria',
      country_codes: [CountryCode.Us],
      language: 'en',
      access_token: decryptedToken,
      update: {
        account_selection_enabled: true,
      },
    };

    try {
      const response = await this.client.linkTokenCreate(request);
      return {
        linkToken: response.data.link_token,
        userId: user.id,
        itemId: item.id,
        institutionName: item.institutionName,
      };
    } catch (err: any) {
      const plaidError = err?.response?.data;
      if (plaidError) {
        this.logger.error(
          `Plaid linkTokenCreate (update mode) failed: [${plaidError.error_code}] ${plaidError.error_message}`,
        );
        throw new BadRequestException(
          plaidError.error_message ||
            'Failed to initialize Plaid Link Update Mode',
        );
      }
      this.logger.error(
        `Plaid linkTokenCreate (update mode) failed: ${err.message || err}`,
      );
      throw err;
    }
  }

  async resolveUpdateModeSuccess(userId: string, itemId: string) {
    const user = await this.resolveUser(userId);

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        itemId,
      );
    const condition = isUuid
      ? and(
          or(eq(plaidItems.id, itemId), eq(plaidItems.itemId, itemId)),
          eq(plaidItems.userId, user.id),
        )
      : and(eq(plaidItems.itemId, itemId), eq(plaidItems.userId, user.id));

    const [item] = await this.db.select().from(plaidItems).where(condition);
    if (!item) {
      throw new NotFoundException(`Plaid item ${itemId} not found`);
    }

    await this.db
      .update(plaidItems)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(plaidItems.id, item.id));

    this.logger.log(
      `Plaid Item ${item.itemId} (${item.institutionName}) re-authenticated via Update Mode`,
    );

    // Sync item accounts and transactions in the background
    try {
      const accessToken = this.encryption.decrypt(item.accessTokenEncrypted);
      await this.syncAccounts(
        item.id,
        accessToken,
        user.id,
        item.institutionName,
      );
      await this.syncTransactions(item.id, accessToken, user.id);
      await this.syncInvestmentHoldings(item.id, accessToken, user.id);
      await this.syncInvestmentTransactions(item.id, accessToken, user.id);
    } catch (syncErr: any) {
      this.logger.warn(
        `Post-update sync notice for item ${item.id}: ${syncErr.message || syncErr}`,
      );
    }

    return {
      success: true,
      itemId: item.id,
      institutionName: item.institutionName,
      status: 'active',
    };
  }

  async exchangePublicToken(
    userId: string,
    publicToken: string,
    metadata: {
      institutionId?: string;
      institutionName?: string;
      accounts?: Array<{
        id?: string;
        name?: string;
        mask?: string;
        type?: string;
        subtype?: string;
      }>;
    } = {},
  ) {
    const user = await this.resolveUser(userId);

    // 1. Prevent excessive unlinking/churning (max 3 unlinks in 24 hours per institution)
    await this.checkChurnLimit(user.id, metadata);

    // 2. Prevent duplicate Items before requesting an access token
    await this.checkDuplicateItem(user.id, metadata);

    const exchangeResponse = await this.client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Encrypt accessToken before storing in PostgreSQL
    const encryptedToken = this.encryption.encrypt(accessToken);

    const [savedItem] = await this.db
      .insert(plaidItems)
      .values({
        userId: user.id,
        itemId,
        accessTokenEncrypted: encryptedToken,
        institutionId: metadata.institutionId || 'unknown',
        institutionName: metadata.institutionName || 'Financial Institution',
      })
      .returning();

    // Fetch and sync accounts immediately
    await this.syncAccounts(savedItem.id, accessToken, user.id, metadata.institutionName || 'Bank');

    // Fetch and sync transactions immediately
    await this.syncTransactions(savedItem.id, accessToken, user.id);

    // Fetch and sync investment holdings
    await this.syncInvestmentHoldings(savedItem.id, accessToken, user.id);

    // Fetch and sync investment transactions
    await this.syncInvestmentTransactions(savedItem.id, accessToken, user.id);

    return { itemId: savedItem.id, userId: user.id, success: true };
  }

  /**
   * Enforces 24-hour institution churn rate limiting.
   * If a user removes and re-adds the same institution 3 times within 24 hours,
   * block token exchange to prevent excessive Plaid billing / Denial of Wallet.
   */
  async checkChurnLimit(
    userId: string,
    metadata: {
      institutionId?: string;
      institutionName?: string;
    },
  ) {
    const incomingInstId = (metadata.institutionId || '').trim().toLowerCase();
    const incomingInstName = (metadata.institutionName || '').trim().toLowerCase();

    if (!incomingInstId && !incomingInstName) {
      return;
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentUnlinks = await this.db
      .select()
      .from(institutionUnlinkHistory)
      .where(
        and(
          eq(institutionUnlinkHistory.userId, userId),
          gte(institutionUnlinkHistory.unlinkedAt, twentyFourHoursAgo),
        ),
      );

    const matchingUnlinks = recentUnlinks.filter((u) => {
      const uId = (u.institutionId || '').trim().toLowerCase();
      const uName = (u.institutionName || '').trim().toLowerCase();
      const idMatch = Boolean(
        incomingInstId &&
          uId &&
          incomingInstId !== 'unknown' &&
          incomingInstId !== 'bank' &&
          incomingInstId === uId,
      );
      const nameMatch = Boolean(
        incomingInstName &&
          uName &&
          (incomingInstName === uName ||
            incomingInstName.includes(uName) ||
            uName.includes(incomingInstName)),
      );
      return idMatch || nameMatch;
    });

    if (matchingUnlinks.length >= 3) {
      this.logger.warn(
        `Blocked churn attempt for institution "${metadata.institutionName}" (${metadata.institutionId}) by user ${userId}. Unlinked ${matchingUnlinks.length} times in past 24h.`,
      );
      throw new ForbiddenException({
        code: 'INSTITUTION_CHURN_LIMIT_EXCEEDED',
        message: `You have removed and re-added ${metadata.institutionName || 'this bank'} 3 times in the last 24 hours. To protect against excessive connection charges, re-connecting this bank is temporarily paused. Please wait 24 hours before trying again.`,
        institutionName: metadata.institutionName,
        unlinkCount: matchingUnlinks.length,
        retryAfterHours: 24,
      });
    }
  }

  /**
   * Official Plaid duplicate Item prevention strategy.
   * Examines and compares incoming Plaid Link onSuccess callback metadata
   * to the user's existing Items and accounts prior to exchanging the public token.
   * If a duplicate is detected, throws ConflictException and prevents token exchange.
   */
  async checkDuplicateItem(
    userId: string,
    metadata: {
      institutionId?: string;
      institutionName?: string;
      accounts?: Array<{
        id?: string;
        name?: string;
        mask?: string;
        type?: string;
        subtype?: string;
      }>;
    },
  ) {
    // 1. Fetch user's existing active items
    const existingItems = await this.db
      .select()
      .from(plaidItems)
      .where(
        and(
          eq(plaidItems.userId, userId),
          eq(plaidItems.status, 'active'),
        ),
      );

    if (!existingItems || existingItems.length === 0) {
      return;
    }

    // 2. Fetch all existing accounts for this user
    const userAccounts = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const incomingAccounts = metadata.accounts || [];
    const incomingInstId = (metadata.institutionId || '').trim().toLowerCase();
    const incomingInstName = (metadata.institutionName || '').trim().toLowerCase();

    // Map active items by ID
    const itemMap = new Map(existingItems.map((item) => [item.id, item]));

    const duplicateMatches: Array<{
      incomingName: string;
      matchedAccountName: string;
      institutionName: string;
      mask?: string;
    }> = [];

    for (const inAcc of incomingAccounts) {
      const inId = inAcc.id;
      const inName = (inAcc.name || '').trim().toLowerCase();
      const inMask = (inAcc.mask || '').trim();

      for (const exAcc of userAccounts) {
        const item = itemMap.get(exAcc.plaidItemId);
        if (!item) continue;

        const exInstId = (item.institutionId || '').trim().toLowerCase();
        const exInstName = (item.institutionName || exAcc.institutionName || '').trim().toLowerCase();

        const isSameInstitution =
          Boolean(incomingInstId && exInstId && incomingInstId !== 'unknown' && incomingInstId === exInstId) ||
          Boolean(incomingInstName && exInstName && incomingInstName === exInstName);

        // Match condition 1: Exact plaidAccountId match
        const isExactPlaidId = Boolean(inId && exAcc.plaidAccountId && inId === exAcc.plaidAccountId);

        // Match condition 2: Same institution + same mask + matching name
        const exMask = (exAcc.mask || '').trim();
        const exName = (exAcc.name || '').trim().toLowerCase();
        const isSameMaskAndName =
          isSameInstitution &&
          Boolean(inMask && exMask && inMask === exMask) &&
          Boolean(inName && exName && (inName === exName || inName.includes(exName) || exName.includes(inName)));

        // Match condition 3: Same institution + same mask + matching subtype/type if name has slight variation
        const isSameMaskAndType =
          isSameInstitution &&
          Boolean(inMask && exMask && inMask === exMask) &&
          Boolean(
            inAcc.type &&
              exAcc.type &&
              inAcc.type === exAcc.type &&
              inAcc.subtype &&
              exAcc.subtype &&
              inAcc.subtype === exAcc.subtype,
          );

        if (isExactPlaidId || isSameMaskAndName || isSameMaskAndType) {
          duplicateMatches.push({
            incomingName: inAcc.name || 'Account',
            matchedAccountName: exAcc.name,
            institutionName: item.institutionName || metadata.institutionName || 'Financial Institution',
            mask: inMask || exMask || undefined,
          });
          break; // move to next incoming account
        }
      }
    }

    // Fallback check: if link provided no individual accounts, check for identical institution_id
    if (incomingAccounts.length === 0 && incomingInstId && incomingInstId !== 'unknown' && incomingInstId !== 'bank') {
      const matchingItem = existingItems.find(
        (item) => (item.institutionId || '').trim().toLowerCase() === incomingInstId,
      );
      if (matchingItem) {
        duplicateMatches.push({
          incomingName: matchingItem.institutionName,
          matchedAccountName: matchingItem.institutionName,
          institutionName: matchingItem.institutionName,
        });
      }
    }

    if (duplicateMatches.length > 0) {
      const instName = duplicateMatches[0].institutionName;
      const accountNames = duplicateMatches
        .map((d) => (d.mask ? `${d.matchedAccountName} (••• ${d.mask})` : d.matchedAccountName))
        .join(', ');

      this.logger.warn(
        `Duplicate Plaid Item detected for user ${userId} at institution "${instName}": [${accountNames}]. Aborting token exchange.`,
      );

      throw new ConflictException({
        code: 'DUPLICATE_ITEM',
        message: `You have already linked this ${instName} account: ${accountNames}.`,
        institutionName: instName,
        duplicateAccounts: duplicateMatches,
      });
    }
  }

  async syncAccounts(
    plaidItemRecordId: string,
    accessToken: string,
    userId: string,
    institutionName: string,
  ) {
    try {
      const response = await this.client.accountsGet({
        access_token: accessToken,
      });

      for (const acc of response.data.accounts) {
        const creditLimit =
          acc.balances.limit ??
          (acc.type === 'credit' && acc.balances.available != null && acc.balances.current != null
            ? acc.balances.available + acc.balances.current
            : null);

        await this.db
          .insert(accounts)
          .values({
            userId,
            plaidItemId: plaidItemRecordId,
            plaidAccountId: acc.account_id,
            name: acc.name,
            officialName: acc.official_name || null,
            mask: acc.mask || null,
            type: acc.type,
            subtype: acc.subtype || null,
            currentBalance: acc.balances.current || 0,
            availableBalance: acc.balances.available || null,
            creditLimit: creditLimit ?? null,
            isoCurrencyCode: acc.balances.iso_currency_code || 'USD',
            institutionName,
          })
          .onConflictDoUpdate({
            target: accounts.plaidAccountId,
            set: {
              currentBalance: acc.balances.current || 0,
              availableBalance: acc.balances.available || null,
              ...(creditLimit != null ? { creditLimit } : {}),
              lastSyncedAt: new Date(),
            },
          });
      }

      // Update today's portfolio snapshot if user has active investment accounts
      const userInvestAccounts = await this.db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.type, 'investment'),
            eq(accounts.isHidden, false),
          ),
        );

      const today = new Date().toISOString().split('T')[0];
      for (const invAcc of userInvestAccounts) {
        const balance = Number(invAcc.currentBalance) || 0;
        await this.stocksService.recordDailySnapshot(
          userId,
          invAcc.id,
          balance,
          today,
        );
        // Retroactively populate complete historical snapshots for newly linked account
        await this.stocksService.backfillHistoricalSnapshots(
          userId,
          invAcc.id,
          balance,
          730,
        );
      }
    } catch (err) {
      this.logger.error('Error syncing accounts from Plaid:', err);
    }
  }

  async syncTransactions(
    plaidItemRecordId: string,
    accessToken: string,
    userId: string,
  ) {
    try {
      // Get stored cursor for this item
      const [itemRecord] = await this.db
        .select({ cursor: plaidItems.cursor })
        .from(plaidItems)
        .where(eq(plaidItems.id, plaidItemRecordId))
        .limit(1);

      let cursor = itemRecord?.cursor || undefined;
      const isInitialSync = !cursor;
      let hasMore = true;
      let totalAdded = 0;

      // Get account map
      const userAccounts = await this.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      const accountMap = new Map(userAccounts.map((a) => [a.plaidAccountId, a.id]));

      // Pre-fetch active categorization rules for user merchant memory
      const userRules = await this.db
        .select()
        .from(categoryRules)
        .where(eq(categoryRules.userId, userId));

      // Pre-fetch excluded category names for this user
      const userExclusions = await this.db
        .select({ name: categories.name })
        .from(userCategoryExclusions)
        .innerJoin(categories, eq(userCategoryExclusions.categoryId, categories.id))
        .where(eq(userCategoryExclusions.userId, userId));

      const excludedNames = new Set(userExclusions.map((e) => e.name.toLowerCase()));

      const resolveCategory = (tx: {
        name: string;
        merchant_name?: string | null;
        category?: string[] | null;
      }) => {
        const merchantLower = tx.merchant_name?.trim().toLowerCase();
        const nameLower = tx.name?.trim().toLowerCase();

        // 1. Exact match on merchantName
        if (merchantLower) {
          const match = userRules.find(
            (r) => r.merchantName && r.merchantName.trim().toLowerCase() === merchantLower,
          );
          if (match) {
            return { category: match.category, subCategory: match.subCategory, matched: true };
          }
        }

        // 2. Exact match on transactionName
        if (nameLower) {
          const match = userRules.find(
            (r) => r.transactionName && r.transactionName.trim().toLowerCase() === nameLower,
          );
          if (match) {
            return { category: match.category, subCategory: match.subCategory, matched: true };
          }
        }

        // 3. Substring match: if rule merchantName is inside tx.name (e.g. "STARBUCKS #123" contains "Starbucks")
        if (nameLower) {
          const match = userRules.find(
            (r) =>
              r.merchantName &&
              r.merchantName.trim().length >= 3 &&
              nameLower.includes(r.merchantName.trim().toLowerCase()),
          );
          if (match) {
            return { category: match.category, subCategory: match.subCategory, matched: true };
          }
        }

        // 4. Default from Plaid, unless user has explicitly excluded this category
        const rawPlaidCategory =
          tx.category && tx.category.length > 0 ? tx.category[0] : 'Uncategorized';

        if (excludedNames.has(rawPlaidCategory.toLowerCase())) {
          return {
            category: 'Uncategorized',
            subCategory: tx.category && tx.category.length > 1 ? tx.category[1] : null,
            matched: false,
          };
        }

        return {
          category: rawPlaidCategory,
          subCategory: tx.category && tx.category.length > 1 ? tx.category[1] : null,
          matched: false,
        };
      };

      while (hasMore) {
        const response = await this.client.transactionsSync({
          access_token: accessToken,
          cursor,
        });

        const { added, modified, next_cursor, has_more } = response.data;
        const allTx = [...added, ...modified];
        hasMore = has_more;
        cursor = next_cursor;

        // Process transactions in concurrent batches for high-throughput insertion
        const BATCH_SIZE = 25;
        for (let i = 0; i < allTx.length; i += BATCH_SIZE) {
          const batch = allTx.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (tx) => {
              const accountDbId = accountMap.get(tx.account_id);
              if (!accountDbId) return;

              const resolved = resolveCategory(tx);

              await this.db
                .insert(transactions)
                .values({
                  userId,
                  accountId: accountDbId,
                  plaidTransactionId: tx.transaction_id,
                  amount: tx.amount,
                  isoCurrencyCode: tx.iso_currency_code || 'USD',
                  date: tx.date,
                  datetime: tx.datetime ? new Date(tx.datetime) : null,
                  name: tx.name,
                  merchantName: tx.merchant_name || null,
                  category: resolved.category,
                  subCategory: resolved.subCategory,
                  pending: tx.pending || false,
                  logoUrl: tx.logo_url || null,
                })
                .onConflictDoUpdate({
                  target: transactions.plaidTransactionId,
                  set: {
                    amount: tx.amount,
                    pending: tx.pending || false,
                    ...(resolved.matched
                      ? { category: resolved.category, subCategory: resolved.subCategory }
                      : {}),
                    updatedAt: new Date(),
                  },
                });
            }),
          );
        }

        // Live notification alerts: strictly for newly added CURRENT transactions during incremental sync.
        // Never alert on historical backfill / initial sync.
        if (!isInitialSync && added && added.length > 0) {
          for (const tx of added) {
            try {
              await this.notificationsService.handleNewTransaction(userId, {
                plaidTransactionId: tx.transaction_id,
                amount: tx.amount,
                name: tx.name,
                merchantName: tx.merchant_name,
                date: tx.date,
              });
            } catch (alertErr) {
              this.logger.error('Failed processing notification for current transaction:', alertErr);
            }
          }

          // Evaluate budget exceeded alerts with monthly deduplication anti-spam guard
          try {
            await this.notificationsService.checkBudgetExceededAlerts(userId);
          } catch (budgetAlertErr) {
            this.logger.error('Failed evaluating budget alerts:', budgetAlertErr);
          }
        }

        totalAdded += allTx.length;
      }

      // Update cursor
      await this.db
        .update(plaidItems)
        .set({ cursor, updatedAt: new Date() })
        .where(eq(plaidItems.id, plaidItemRecordId));

      this.logger.log(`Synced ${totalAdded} transactions for item ${plaidItemRecordId}`);
    } catch (err: any) {
      this.logger.error(`Error syncing transactions from Plaid: ${err?.message || err}`);
    }
  }

  async syncAllItems(userId: string) {
    const items = await this.db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.userId, userId));
    await Promise.all(
      items.map(async (item) => {
        try {
          const accessToken = this.encryption.decrypt(item.accessTokenEncrypted);
          await this.syncAccounts(item.id, accessToken, userId, item.institutionName);
          await this.syncTransactions(item.id, accessToken, userId);
          await this.syncInvestmentHoldings(item.id, accessToken, userId);
          await this.syncInvestmentTransactions(item.id, accessToken, userId);
        } catch (err: any) {
          this.logger.warn(`Could not sync item ${item.id}: ${err?.message || err}`);
        }
      }),
    );
    return { success: true, count: items.length };
  }

  /**
   * Periodic background cron job to sync all active Plaid accounts,
   * transactions, and investments on a regular schedule (runs every hour).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCronSync() {
    this.logger.log('Starting scheduled cron sync for all active Plaid items...');
    try {
      const activeItems = await this.db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.status, 'active'));

      if (activeItems.length === 0) {
        this.logger.log('Scheduled cron sync: no active Plaid items found.');
        return;
      }

      this.logger.log(
        `Scheduled cron sync: syncing ${activeItems.length} active Plaid item(s)...`,
      );

      for (const item of activeItems) {
        try {
          const accessToken = this.encryption.decrypt(item.accessTokenEncrypted);
          await this.syncAccounts(item.id, accessToken, item.userId, item.institutionName);
          await this.syncTransactions(item.id, accessToken, item.userId);
          await this.syncInvestmentHoldings(item.id, accessToken, item.userId);
          await this.syncInvestmentTransactions(item.id, accessToken, item.userId);
          this.logger.log(
            `Cron synced item ${item.id} (${item.institutionName || 'Financial Institution'}) for user ${item.userId}`,
          );
        } catch (err: any) {
          this.logger.warn(`Cron sync failed for item ${item.id}: ${err?.message || err}`);
        }
      }

      this.logger.log('Completed scheduled cron sync for all active Plaid items.');
    } catch (err: any) {
      this.logger.error(`Error in handleCronSync: ${err?.message || err}`);
    }
  }

  async syncInvestmentHoldings(
    plaidItemRecordId: string,
    accessToken: string,
    userId: string,
  ) {
    try {
      const response = await this.client.investmentsHoldingsGet({
        access_token: accessToken,
      });

      const { holdings, securities } = response.data;
      if (!holdings || holdings.length === 0) {
        return;
      }

      // Map security details by security_id
      const secMap = new Map(securities.map((s) => [s.security_id, s]));

      // Map Plaid accountId to database account UUID
      const userAccounts = await this.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      const accountMap = new Map(userAccounts.map((a) => [a.plaidAccountId, a.id]));

      // Clear existing holdings for the accounts belonging to this synced item
      const itemAccountDbIds = userAccounts
        .filter((a) => a.plaidItemId === plaidItemRecordId)
        .map((a) => a.id);

      if (itemAccountDbIds.length > 0) {
        for (const accId of itemAccountDbIds) {
          await this.db
            .delete(securityHoldings)
            .where(
              and(
                eq(securityHoldings.userId, userId),
                eq(securityHoldings.accountId, accId),
              ),
            );
        }
      }

      for (const h of holdings) {
        const accountDbId = accountMap.get(h.account_id);
        if (!accountDbId) continue;

        const sec = secMap.get(h.security_id);
        const tickerSymbol =
          sec?.ticker_symbol ||
          (sec?.name ? sec.name.substring(0, 10).toUpperCase() : 'CASH');
        const name = sec?.name || tickerSymbol;
        const quantity = Number(h.quantity) || 0;
        const costBasis = h.cost_basis != null ? Number(h.cost_basis) : null;
        const institutionPrice =
          Number(h.institution_price) || Number(sec?.close_price) || 0;
        const institutionValue =
          Number(h.institution_value) || quantity * institutionPrice;

        await this.db
          .insert(securityHoldings)
          .values({
            userId,
            accountId: accountDbId,
            securityId: h.security_id,
            tickerSymbol,
            name,
            quantity,
            costBasis,
            institutionPrice,
            institutionValue,
            currency: h.iso_currency_code || 'USD',
            lastUpdated: new Date(),
          })
          .onConflictDoUpdate({
            target: [securityHoldings.accountId, securityHoldings.securityId],
            set: {
              tickerSymbol,
              name,
              quantity,
              costBasis,
              institutionPrice,
              institutionValue,
              currency: h.iso_currency_code || 'USD',
              lastUpdated: new Date(),
            },
          });
      }

      this.logger.log(
        `Synced ${holdings.length} investment holdings across ${itemAccountDbIds.length} accounts for item ${plaidItemRecordId}`,
      );
    } catch (err: any) {
      const code = err?.response?.data?.error_code;
      if (
        code === 'PRODUCTS_NOT_SUPPORTED' ||
        code === 'INVALID_PRODUCT' ||
        code === 'ITEM_NOT_SUPPORTED'
      ) {
        // Expected for non-investment depository/credit accounts
        return;
      }
      this.logger.warn(
        `Could not sync investment holdings for item ${plaidItemRecordId}: ${err?.response?.data?.error_message || err.message || err}`,
      );
    }
  }

  async syncInvestmentTransactions(
    plaidItemRecordId: string,
    accessToken: string,
    userId: string,
  ) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const startDate = '2024-01-01';

      let allTx: any[] = [];
      let offset = 0;
      const count = 100;

      while (true) {
        const response = await this.client.investmentsTransactionsGet({
          access_token: accessToken,
          start_date: startDate,
          end_date: today,
          options: { count, offset },
        });

        const txs = response.data.investment_transactions || [];
        allTx = allTx.concat(txs);

        if (
          allTx.length >= response.data.total_investment_transactions ||
          txs.length === 0
        ) {
          break;
        }
        offset += txs.length;
      }

      if (allTx.length === 0) {
        return;
      }

      // Map Plaid accountId to database account UUID
      const userAccounts = await this.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      const accountMap = new Map(
        userAccounts.map((a) => [a.plaidAccountId, a.id]),
      );

      let addedCount = 0;
      for (const tx of allTx) {
        const accountDbId = accountMap.get(tx.account_id);
        if (!accountDbId) continue;

        await this.db
          .insert(investmentTransactions)
          .values({
            userId,
            accountId: accountDbId,
            plaidInvestmentTransactionId: tx.investment_transaction_id,
            securityId: tx.security_id || null,
            date: tx.date,
            name: tx.name,
            quantity: Number(tx.quantity) || 0,
            price: Number(tx.price) || 0,
            amount: Number(tx.amount) || 0,
            fees: Number(tx.fees) || 0,
            type: tx.type,
            subtype: tx.subtype || null,
            currency: tx.iso_currency_code || 'USD',
          })
          .onConflictDoUpdate({
            target: investmentTransactions.plaidInvestmentTransactionId,
            set: {
              name: tx.name,
              quantity: Number(tx.quantity) || 0,
              price: Number(tx.price) || 0,
              amount: Number(tx.amount) || 0,
              fees: Number(tx.fees) || 0,
              type: tx.type,
              subtype: tx.subtype || null,
            },
          });
        addedCount++;
      }

      this.logger.log(
        `Synced ${addedCount} investment transactions for item ${plaidItemRecordId}`,
      );

      // Trigger transaction-aware snapshot reconstruction for all investment accounts in this item
      const itemInvestAccounts = userAccounts.filter(
        (a) => a.plaidItemId === plaidItemRecordId && a.type === 'investment',
      );
      for (const invAcc of itemInvestAccounts) {
        await this.stocksService.reconstructHistoricalSnapshots(
          userId,
          invAcc.id,
          Number(invAcc.currentBalance) || 0,
          730,
        );
      }
    } catch (err: any) {
      const code = err?.response?.data?.error_code;
      if (
        code === 'PRODUCTS_NOT_SUPPORTED' ||
        code === 'INVALID_PRODUCT' ||
        code === 'ITEM_NOT_SUPPORTED'
      ) {
        return;
      }
      this.logger.warn(
        `Could not sync investment transactions for item ${plaidItemRecordId}: ${err?.response?.data?.error_message || err.message || err}`,
      );
    }
  }

  async getItems(userId: string) {
    return this.db
      .select({
        id: plaidItems.id,
        userId: plaidItems.userId,
        itemId: plaidItems.itemId,
        institutionId: plaidItems.institutionId,
        institutionName: plaidItems.institutionName,
        status: plaidItems.status,
        createdAt: plaidItems.createdAt,
        updatedAt: plaidItems.updatedAt,
      })
      .from(plaidItems)
      .where(eq(plaidItems.userId, userId));
  }

  async removeItem(id: string, userId: string) {
    const [item] = await this.db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.id, id), eq(plaidItems.userId, userId)));

    if (!item) {
      return { success: false, message: 'Plaid item not found' };
    }

    // Record unlink in institutionUnlinkHistory before deletion to enforce churn limits
    try {
      if (item.institutionId || item.institutionName) {
        await this.db.insert(institutionUnlinkHistory).values({
          userId,
          institutionId: item.institutionId || 'unknown',
          institutionName: item.institutionName || 'Financial Institution',
          unlinkedAt: new Date(),
        });
      }
    } catch (auditErr: any) {
      this.logger.warn(
        `Could not record institution unlink history: ${auditErr.message || auditErr}`,
      );
    }

    // Attempt to remove item from Plaid API
    try {
      const accessToken = this.encryption.decrypt(item.accessTokenEncrypted);
      await this.client.itemRemove({ access_token: accessToken });
      this.logger.log(`Successfully removed item from Plaid API: ${item.itemId}`);
    } catch (err: any) {
      const plaidError = err?.response?.data;
      if (plaidError) {
        this.logger.warn(
          `Plaid API item/remove note: [${plaidError.error_code || plaidError.error_type}] ${plaidError.error_message || err.message}`,
        );
      } else {
        this.logger.warn(`Could not remove item from Plaid API: ${err.message || err}`);
      }
    }

    // Delete from PostgreSQL (cascades to accounts, transactions, holdings)
    await this.db
      .delete(plaidItems)
      .where(and(eq(plaidItems.id, id), eq(plaidItems.userId, userId)));

    return { success: true, removedItemId: id };
  }

  async verifyWebhookSignature(
    verificationHeader?: string,
    rawBody: string = '',
  ): Promise<boolean> {
    const isProd = process.env.NODE_ENV === 'production';

    if (!verificationHeader) {
      if (isProd) {
        this.logger.error('Plaid webhook missing plaid-verification header in production');
        throw new UnauthorizedException('Missing Plaid verification signature');
      } else {
        this.logger.warn('Skipping Plaid webhook verification (no signature header provided in non-prod)');
        return true;
      }
    }

    try {
      const decoded = jwt.decode(verificationHeader, { complete: true }) as any;
      if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new UnauthorizedException('Malformed Plaid verification header');
      }

      const kid = decoded.header.kid;
      let pem = '';
      const cached = this.keyCache.get(kid);
      if (cached && cached.expiresAt > Date.now()) {
        pem = cached.pem;
      } else {
        const keyResponse = await this.client.webhookVerificationKeyGet({
          key_id: kid,
        });
        const jwk = keyResponse.data.key;
        const keyObject = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
        pem = keyObject.export({ type: 'spki', format: 'pem' }) as string;
        // Cache key for 24 hours
        this.keyCache.set(kid, { pem, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      }

      // Verify JWT signature (algorithm ES256, max age 5 minutes)
      const claims = jwt.verify(verificationHeader, pem, {
        algorithms: ['ES256'],
        maxAge: '5m',
      }) as any;

      if (!claims || !claims.request_body_sha256) {
        throw new UnauthorizedException('Plaid verification claims missing request_body_sha256');
      }

      // Hash raw body
      const computedHash = crypto
        .createHash('sha256')
        .update(rawBody)
        .digest('hex');

      const claimsHashBuf = Buffer.from(claims.request_body_sha256, 'hex');
      const computedHashBuf = Buffer.from(computedHash, 'hex');

      if (
        claimsHashBuf.length !== computedHashBuf.length ||
        !crypto.timingSafeEqual(claimsHashBuf, computedHashBuf)
      ) {
        throw new UnauthorizedException('Plaid webhook body hash mismatch');
      }

      return true;
    } catch (err: any) {
      this.logger.error(`Plaid webhook signature verification failed: ${err?.message || err}`);
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid Plaid webhook signature');
    }
  }

  async handleWebhook(body: any) {
    this.logger.log(`Received Plaid webhook: ${body?.webhook_type} - ${body?.webhook_code}`);

    if (body?.webhook_type === 'TRANSACTIONS' && body?.item_id) {
      // Plaid fires INITIAL_UPDATE, HISTORICAL_UPDATE, DEFAULT_UPDATE, SYNC_UPDATES_AVAILABLE
      const [item] = await this.db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.itemId, body.item_id))
        .limit(1);

      if (item) {
        const accessToken = this.encryption.decrypt(item.accessTokenEncrypted);
        await this.syncTransactions(item.id, accessToken, item.userId);
        this.logger.log(
          `Auto-synced transactions for item ${item.id} upon receiving ${body.webhook_code}`,
        );
      }
    }

    return { received: true };
  }

  private async ensureRecurringExclusionsTable() {
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_recurring_exclusions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          stream_id TEXT NOT NULL,
          merchant_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_user_recurring_exclusions_user ON user_recurring_exclusions(user_id);
      `);
    } catch (err) {
      this.logger.warn(`Could not verify user_recurring_exclusions table: ${err}`);
    }
  }

  async dismissRecurringStream(userId: string, streamId: string, merchantName?: string) {
    await this.ensureRecurringExclusionsTable();
    const existing = await this.db
      .select()
      .from(userRecurringExclusions)
      .where(
        and(
          eq(userRecurringExclusions.userId, userId),
          eq(userRecurringExclusions.streamId, streamId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(userRecurringExclusions).values({
        userId,
        streamId,
        merchantName: merchantName || null,
      });
    }

    return { success: true, streamId, action: 'dismissed' };
  }

  async restoreRecurringStream(userId: string, streamId: string) {
    await this.ensureRecurringExclusionsTable();
    await this.db
      .delete(userRecurringExclusions)
      .where(
        and(
          eq(userRecurringExclusions.userId, userId),
          eq(userRecurringExclusions.streamId, streamId),
        ),
      );

    return { success: true, streamId, action: 'restored' };
  }

  async getRecurringTransactions(userId: string): Promise<RecurringTransactionsResponse> {
    await this.ensureRecurringExclusionsTable();

    // 1. Fetch user exclusions
    const exclusions = await this.db
      .select()
      .from(userRecurringExclusions)
      .where(eq(userRecurringExclusions.userId, userId));
    const excludedStreamIds = new Set(exclusions.map((e) => e.streamId));

    // 2. Fetch user accounts to enrich account names & masks
    const userAccounts = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const plaidAccountMap = new Map(
      userAccounts
        .filter((a) => a.plaidAccountId)
        .map((a) => [a.plaidAccountId!, a]),
    );

    // 3. Query active Plaid items
    const items = await this.db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.userId, userId), eq(plaidItems.status, 'active')));

    const rawInflows: RecurringStreamItem[] = [];
    const rawOutflows: RecurringStreamItem[] = [];
    const knownMerchantKeys = new Set<string>();

    for (const item of items) {
      try {
        const accessToken = this.encryption.decrypt(item.accessTokenEncrypted);
        const recurringRes = await this.client.transactionsRecurringGet({
          access_token: accessToken,
        });

        const parseStream = (s: any, isExpense: boolean): RecurringStreamItem => {
          const acct = plaidAccountMap.get(s.account_id);
          const avgAmt = Math.abs(Number(s.average_amount?.amount) || 0);
          const lastAmt = Math.abs(Number(s.last_amount?.amount) || 0);
          const freq: RecurringFrequency = s.frequency || 'MONTHLY';
          const cat =
            s.personal_finance_category?.primary ||
            s.category?.[0] ||
            (isExpense ? 'Living Expenses' : 'Income');
          const subCat =
            s.personal_finance_category?.detailed || s.category?.[1] || undefined;
          const isDismissed = excludedStreamIds.has(s.stream_id);
          const merchantName = s.merchant_name || s.description || 'Merchant';

          knownMerchantKeys.add(merchantName.trim().toLowerCase());

          return {
            id: s.stream_id,
            accountId: acct?.id || s.account_id,
            accountName: acct
              ? `${acct.name}${acct.mask ? ` (••${acct.mask})` : ''}`
              : undefined,
            institutionName: acct?.institutionName || item.institutionName,
            merchantName,
            description: s.description || merchantName,
            category: cat,
            subCategory: subCat,
            frequency: freq,
            averageAmount: avgAmt,
            lastAmount: lastAmt,
            currency: s.average_amount?.iso_currency_code || 'USD',
            firstDate: s.first_date,
            lastDate: s.last_date,
            isActive: s.is_active !== false,
            status: s.status || 'MATURE',
            isDismissed,
            source: 'plaid',
            transactionCount: s.transaction_ids?.length || 0,
            transactionIds: s.transaction_ids || [],
          };
        };

        for (const s of recurringRes.data.inflow_streams || []) {
          rawInflows.push(parseStream(s, false));
        }
        for (const s of recurringRes.data.outflow_streams || []) {
          rawOutflows.push(parseStream(s, true));
        }
      } catch (err: any) {
        this.logger.warn(
          `Could not fetch Plaid recurring transactions for item ${item.id}: ${
            err?.response?.data?.error_message || err?.message || err
          }`,
        );
      }
    }

    // 4. Local heuristic fallback over stored transactions
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

      const txList = await this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, sixMonthsAgoStr),
          ),
        )
        .orderBy(desc(transactions.date));

      const transferRegex =
        /(transfer|credit card payment|autopay|payment - thank you|online payment|ach transfer|wire transfer|zelle|venmo)/i;

      // Group transactions by normalized merchant & type
      const groups = new Map<
        string,
        {
          merchantName: string;
          isExpense: boolean;
          category?: string;
          subCategory?: string;
          dates: string[];
          amounts: number[];
          accountId: string;
          txIds: string[];
        }
      >();

      for (const tx of txList) {
        const rawName = (tx.merchantName || tx.name || '').trim();
        if (!rawName || transferRegex.test(rawName)) continue;
        if (
          tx.category &&
          /^(transfer|credit card|payment)/i.test(tx.category)
        ) {
          continue;
        }

        const amt = Number(tx.amount) || 0;
        if (Math.abs(amt) < 0.5) continue;

        const isExpense = amt > 0;
        const normKey = `${rawName.toLowerCase()}__${isExpense ? 'out' : 'in'}`;

        if (!groups.has(normKey)) {
          groups.set(normKey, {
            merchantName: rawName,
            isExpense,
            category: tx.category || undefined,
            subCategory: tx.subCategory || undefined,
            dates: [],
            amounts: [],
            accountId: tx.accountId,
            txIds: [],
          });
        }

        const g = groups.get(normKey)!;
        g.dates.push(tx.date);
        g.amounts.push(Math.abs(amt));
        g.txIds.push(tx.id);
      }

      // Analyze intervals
      for (const [normKey, g] of groups.entries()) {
        const cleanNameLower = g.merchantName.toLowerCase();
        // Skip if Plaid already found this stream
        if (knownMerchantKeys.has(cleanNameLower)) continue;
        if (g.dates.length < 2) continue;

        // Calculate intervals between sorted consecutive dates
        const sortedDates = [...g.dates]
          .map((d) => new Date(d).getTime())
          .sort((a, b) => b - a);

        const intervals: number[] = [];
        for (let i = 0; i < sortedDates.length - 1; i++) {
          const diffDays = Math.round(
            (sortedDates[i] - sortedDates[i + 1]) / (1000 * 60 * 60 * 24),
          );
          if (diffDays > 0) {
            intervals.push(diffDays);
          }
        }

        if (intervals.length === 0) continue;
        const avgInterval =
          intervals.reduce((a, b) => a + b, 0) / intervals.length;

        let detectedFreq: RecurringFrequency | null = null;
        if (avgInterval >= 24 && avgInterval <= 36) {
          detectedFreq = 'MONTHLY';
        } else if (avgInterval >= 11 && avgInterval <= 17) {
          detectedFreq = 'BIWEEKLY';
        } else if (avgInterval >= 5 && avgInterval <= 9) {
          detectedFreq = 'WEEKLY';
        } else if (avgInterval >= 330 && avgInterval <= 400) {
          detectedFreq = 'ANNUALLY';
        }

        if (!detectedFreq) continue;

        const streamId = `heur_${Buffer.from(normKey).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
        const isDismissed = excludedStreamIds.has(streamId);
        const avgAmt = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length;
        const lastAmt = g.amounts[0];
        const targetAcct = userAccounts.find((a) => a.id === g.accountId);

        const streamItem: RecurringStreamItem = {
          id: streamId,
          accountId: g.accountId,
          accountName: targetAcct
            ? `${targetAcct.name}${targetAcct.mask ? ` (••${targetAcct.mask})` : ''}`
            : undefined,
          institutionName: targetAcct?.institutionName,
          merchantName: g.merchantName,
          description: g.merchantName,
          category: g.category || (g.isExpense ? 'Living Expenses' : 'Income'),
          subCategory: g.subCategory,
          frequency: detectedFreq,
          averageAmount: avgAmt,
          lastAmount: lastAmt,
          currency: 'USD',
          firstDate: g.dates[g.dates.length - 1],
          lastDate: g.dates[0],
          isActive: true,
          status: 'MATURE',
          isDismissed,
          source: 'heuristic',
          transactionCount: g.dates.length,
          transactionIds: g.txIds,
        };

        if (g.isExpense) {
          rawOutflows.push(streamItem);
        } else {
          rawInflows.push(streamItem);
        }
      }
    } catch (heuristicErr) {
      this.logger.warn(`Heuristic recurring detection error: ${heuristicErr}`);
    }

    // 5. Partition active vs dismissed
    const activeInflows: RecurringStreamItem[] = [];
    const activeOutflows: RecurringStreamItem[] = [];
    const dismissedItems: RecurringStreamItem[] = [];

    for (const item of rawInflows) {
      if (item.isDismissed) {
        dismissedItems.push(item);
      } else {
        activeInflows.push(item);
      }
    }

    for (const item of rawOutflows) {
      if (item.isDismissed) {
        dismissedItems.push(item);
      } else {
        activeOutflows.push(item);
      }
    }

    // Sort: highest last amount first
    activeInflows.sort((a, b) => b.lastAmount - a.lastAmount);
    activeOutflows.sort((a, b) => b.lastAmount - a.lastAmount);
    dismissedItems.sort((a, b) => b.lastAmount - a.lastAmount);

    // 6. Compute monthly summary normalized to 1 month
    const getMonthlyMultiplier = (freq: RecurringFrequency): number => {
      switch (freq) {
        case 'WEEKLY':
          return 52 / 12;
        case 'BIWEEKLY':
          return 26 / 12;
        case 'SEMI_MONTHLY':
          return 2;
        case 'MONTHLY':
          return 1;
        case 'ANNUALLY':
          return 1 / 12;
        default:
          return 1;
      }
    };

    let totalMonthlyOutflow = 0;
    let activeSubscriptionsCount = 0;
    for (const item of activeOutflows) {
      if (item.isActive) {
        totalMonthlyOutflow += item.lastAmount * getMonthlyMultiplier(item.frequency);
        activeSubscriptionsCount++;
      }
    }

    let totalMonthlyInflow = 0;
    let activeInflowStreamsCount = 0;
    for (const item of activeInflows) {
      if (item.isActive) {
        totalMonthlyInflow += item.lastAmount * getMonthlyMultiplier(item.frequency);
        activeInflowStreamsCount++;
      }
    }

    return {
      inflows: activeInflows,
      outflows: activeOutflows,
      dismissed: dismissedItems,
      summary: {
        totalMonthlyOutflow: Math.round(totalMonthlyOutflow * 100) / 100,
        totalMonthlyInflow: Math.round(totalMonthlyInflow * 100) / 100,
        netMonthlyBurn: Math.round((totalMonthlyInflow - totalMonthlyOutflow) * 100) / 100,
        activeSubscriptionsCount,
        activeInflowStreamsCount,
      },
    };
  }
}

