import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  HttpStatus,
  HttpException,
  Inject,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { BudgetService } from '../budget/budget.service.js';
import { DATABASE_TOKEN } from '../database/database.module.js';
import { LunariaDb, accounts, transactions } from '@lunaria/db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly authService: AuthService,
    private readonly transactionsService: TransactionsService,
    private readonly budgetService: BudgetService,
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  /**
   * Helper to verify authentication for OpenClaw / external agents.
   */
  private async authenticateAgent(
    authHeader?: string,
    apiKeyHeader?: string,
    queryUserId?: string,
  ): Promise<string> {
    try {
      return await this.authService.resolveUserId(
        queryUserId,
        authHeader,
        apiKeyHeader,
      );
    } catch {
      throw new HttpException(
        {
          error: 'Unauthorized',
          message:
            'Invalid or missing agent credentials. Provide x-api-key or Authorization: Bearer <LUNARIA_AGENT_API_KEY>.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Health / Discovery endpoint for OpenClaw.
   */
  @Get('info')
  async getAgentInfo(
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);
    const user = await this.authService.getUser(userId);

    return {
      status: 'online',
      platform: 'Lunaria Financial Intelligence',
      user: {
        name: user?.fullName || 'Lunaria User',
        email: user?.email,
        currency: user?.currency || 'USD',
      },
      availableEndpoints: [
        'GET /api/agent/overview',
        'GET /api/agent/transactions?days=7&limit=25',
        'GET /api/agent/budget?month=YYYY-MM',
        'GET /api/agent/briefing',
        'POST /api/agent/categorize',
      ],
    };
  }

  /**
   * Complete Net Worth & Account Overview.
   */
  @Get('overview')
  async getOverview(
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);

    const userAccounts = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)));

    let totalDepository = 0;
    let totalInvestments = 0;
    let totalCreditDebt = 0;
    let totalLoans = 0;

    const list = userAccounts.map((acc) => {
      const bal = Number(acc.currentBalance) || 0;
      const t = (acc.type || '').toLowerCase();

      if (t === 'depository') totalDepository += bal;
      else if (t === 'investment') totalInvestments += bal;
      else if (t === 'credit') totalCreditDebt += Math.abs(bal);
      else if (t === 'loan') totalLoans += Math.abs(bal);

      return {
        id: acc.id,
        name: acc.name,
        institution: acc.institutionName,
        type: acc.type,
        subtype: acc.subtype,
        balance: bal,
        available: acc.availableBalance,
        mask: acc.mask ? `•••${acc.mask}` : undefined,
      };
    });

    const totalAssets = totalDepository + totalInvestments;
    const totalLiabilities = totalCreditDebt + totalLoans;
    const netWorth = totalAssets - totalLiabilities;

    return {
      netWorth: Math.round(netWorth * 100) / 100,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      cash: Math.round(totalDepository * 100) / 100,
      investments: Math.round(totalInvestments * 100) / 100,
      creditDebt: Math.round(totalCreditDebt * 100) / 100,
      loans: Math.round(totalLoans * 100) / 100,
      accounts: list,
    };
  }

  /**
   * Filtered Transactions.
   */
  @Get('transactions')
  async getTransactions(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);

    let startDate: string | undefined;
    if (days && parseInt(days, 10) > 0) {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(days, 10));
      startDate = d.toISOString().substring(0, 10);
    }

    const res = await this.transactionsService.getTransactions(userId, {
      startDate,
      category,
      search,
      limit: Math.min(Number(limit) || 25, 100),
    });

    return {
      count: res.items.length,
      transactions: res.items.map((tx) => ({
        id: tx.id,
        date: tx.date,
        name: tx.name,
        merchant: tx.merchantName,
        amount: tx.amount,
        category: tx.category,
        subCategory: tx.subCategory,
        pending: tx.pending,
      })),
    };
  }

  /**
   * Monthly Budget Status.
   */
  @Get('budget')
  async getBudget(
    @Query('month') month?: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);
    const summary = await this.budgetService.getMonthlyBudget(userId, month);

    return {
      month: summary.month,
      budgetedIncome: summary.totalBudgetedIncome,
      budgetedExpenses: summary.totalBudgetedExpenses,
      leftToBudget: summary.leftToBudget,
      actualIncome: summary.totalActualIncome,
      actualExpenses: summary.totalActualExpenses,
      actualNetSavings: summary.actualNetSavings,
      categories: summary.expenseCategories.map((c) => ({
        category: c.category,
        budgeted: c.budgeted,
        actualSpent: c.actual,
        remaining: c.remaining,
        percentSpent: c.percentSpent,
      })),
    };
  }

  /**
   * Ready-to-Send Daily Briefing Text (ideal for Telegram/Discord/WhatsApp agent pushes).
   */
  @Get('briefing')
  async getBriefing(
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);

    // Fetch Overview
    const userAccounts = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)));

    let totalCash = 0;
    let totalInvestments = 0;
    let totalDebt = 0;
    for (const a of userAccounts) {
      const b = Number(a.currentBalance) || 0;
      const t = (a.type || '').toLowerCase();
      if (t === 'depository') totalCash += b;
      else if (t === 'investment') totalInvestments += b;
      else if (t === 'credit' || t === 'loan') totalDebt += Math.abs(b);
    }
    const netWorth = totalCash + totalInvestments - totalDebt;

    // Fetch Recent 48h transactions
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const recentTx = await this.transactionsService.getTransactions(userId, {
      startDate: twoDaysAgo.toISOString().substring(0, 10),
      limit: 10,
    });

    const recentSpend = recentTx.items
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Fetch Budget
    const currentMonth = new Date().toISOString().substring(0, 7);
    const budget = await this.budgetService.getMonthlyBudget(userId, currentMonth);

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    const briefingText = [
      `📊 **Lunaria Financial Snapshot**`,
      `• **Net Worth**: ${formatter.format(netWorth)}`,
      `• **Cash**: ${formatter.format(totalCash)} | **Debt**: ${formatter.format(totalDebt)}`,
      `• **Recent Spend (Last 48h)**: ${formatter.format(recentSpend)} across ${recentTx.items.length} transactions`,
      `• **Monthly Budget (${currentMonth})**: ${formatter.format(budget.actualNetSavings >= 0 ? budget.totalBudgetedExpenses - budget.totalActualExpenses : 0)} left to spend`,
    ].join('\n');

    return {
      date: new Date().toISOString().substring(0, 10),
      formattedText: briefingText,
      netWorth,
      totalCash,
      totalDebt,
      recentSpend,
    };
  }

  /**
   * Recategorize Transaction.
   */
  @Post('categorize')
  async categorize(
    @Body()
    body: {
      transactionId: string;
      category: string;
      subCategory?: string;
      applyToMerchant?: boolean;
    },
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);

    if (!body?.transactionId || !body?.category) {
      throw new HttpException(
        { error: 'Bad Request', message: 'transactionId and category are required.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.transactionsService.updateCategory(
      body.transactionId,
      userId,
      {
        category: body.category,
        subCategory: body.subCategory,
        applyToAllMerchant: Boolean(body.applyToMerchant),
      },
    );

    return {
      success: true,
      message: `Transaction categorized as "${body.category}".`,
      transaction: updated,
    };
  }

  /**
   * Set or Update Monthly Budget (Single or Batch).
   */
  @Post('budget')
  async setBudget(
    @Body()
    body: {
      month: string;
      entries?: Array<{ category: string; amount: number; type?: 'income' | 'expense' }>;
      category?: string;
      amount?: number;
      type?: 'income' | 'expense';
      adjustFuture?: boolean;
    },
    @Headers('authorization') authHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
  ) {
    const userId = await this.authenticateAgent(authHeader, apiKeyHeader);

    if (!body?.month) {
      throw new HttpException(
        { error: 'Bad Request', message: 'month in YYYY-MM format is required.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    let entriesToSave: Array<{
      category: string;
      budgetedAmount: number;
      type: 'income' | 'expense';
    }> = [];

    if (Array.isArray(body.entries) && body.entries.length > 0) {
      entriesToSave = body.entries.map((e) => ({
        category: e.category,
        budgetedAmount: Number(e.amount) || 0,
        type: e.type === 'income' ? 'income' : 'expense',
      }));
    } else if (body.category && body.amount !== undefined) {
      entriesToSave = [
        {
          category: body.category,
          budgetedAmount: Number(body.amount) || 0,
          type: body.type === 'income' ? 'income' : 'expense',
        },
      ];
    } else {
      throw new HttpException(
        {
          error: 'Bad Request',
          message: 'Provide either entries array or category + amount.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updatedSummary = await this.budgetService.upsertBudget(userId, {
      month: body.month,
      entries: entriesToSave,
      adjustFuture: body.adjustFuture,
    });

    return {
      success: true,
      message: `Successfully updated budget for ${body.month}.`,
      month: body.month,
      totalBudgetedExpenses: updatedSummary.totalBudgetedExpenses,
      leftToBudget: updatedSummary.leftToBudget,
      categories: updatedSummary.expenseCategories.map((c) => ({
        category: c.category,
        budgeted: c.budgeted,
        actualSpent: c.actual,
        remaining: c.remaining,
      })),
    };
  }
}
