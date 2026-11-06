import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { TransactionsService } from '../transactions/transactions.service.js';
import { BudgetService } from '../budget/budget.service.js';
import { DATABASE_TOKEN } from '../database/database.module.js';
import { LunariaDb, accounts } from '@lunaria/db';
import { eq, and } from 'drizzle-orm';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface StreamEvent {
  type: 'status' | 'chunk' | 'tool_start' | 'tool_end' | 'done' | 'error';
  text?: string;
  tool?: string;
  args?: any;
  message?: string;
}

const SYSTEM_INSTRUCTION = `
You are the Lunaria AI Financial Copilot, an elite personal wealth and financial intelligence assistant.
Lunaria is a private financial intelligence platform. You are interacting with the primary owner of the account.

Your goal is to provide fast, deeply actionable, and accurate financial advice, summaries, calculations, and actions.
You have direct, live tool access to the user's financial database (accounts, balances, transactions, and monthly budgets).

Rules & Guidelines:
1. Live Data First: Always use tools to fetch actual balances, transactions, and budget data instead of guessing.
2. Conciseness: Be crisp, clear, and direct. Avoid fluffy boilerplate. Get straight to the numbers.
3. Currency Formatting: Always format monetary amounts properly (e.g. $1,245.50 or -$85.00).
4. Direct Action: If the user asks you to recategorize a transaction or update a budget, use the respective tool to perform the update and confirm what was changed.
5. Privacy & Trust: Do not share raw account masks or PII unnecessarily. Treat all financial data with strict confidentiality.
6. Financial Intelligence: When summarizing spending or budgets, highlight anomalies, high burn rates, upcoming recurring expenses, or opportunities to save.
`;

const FUNCTION_DECLARATIONS = [
  {
    name: 'get_accounts_overview',
    description:
      'Fetch all connected user accounts (checking, savings, credit cards, investments, loans) with current balances, types, and net worth calculations.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'query_transactions',
    description:
      'Search and list user transactions with optional filters for date range, category, merchant name, min/max amount, or search query.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: {
          type: Type.STRING,
          description: 'Start date in YYYY-MM-DD format (e.g., 2026-09-01)',
        },
        endDate: {
          type: Type.STRING,
          description: 'End date in YYYY-MM-DD format (e.g., 2026-09-30)',
        },
        category: {
          type: Type.STRING,
          description:
            'Category name (e.g., Food & Dining, Groceries, Living Expenses, Shopping)',
        },
        merchant: {
          type: Type.STRING,
          description: 'Merchant or transaction name to search for (e.g., Uber, Amazon, Netflix)',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of transactions to return (default: 30, max: 100)',
        },
      },
    },
  },
  {
    name: 'get_monthly_budget',
    description:
      'Get planned budget vs actual spending for all categories for a given month.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description:
            'Target month in YYYY-MM format (e.g., 2026-10). If omitted, defaults to the current month.',
        },
      },
    },
  },
  {
    name: 'categorize_transaction',
    description:
      'Update the category of a transaction. Optionally creates a merchant rule to auto-categorize future transactions from this merchant.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        transactionId: {
          type: Type.STRING,
          description: 'The UUID of the transaction to recategorize.',
        },
        category: {
          type: Type.STRING,
          description: 'The new category name (e.g., Food & Dining, Groceries, Utilities).',
        },
        subCategory: {
          type: Type.STRING,
          description: 'Optional subcategory name.',
        },
        applyToAllMerchant: {
          type: Type.BOOLEAN,
          description:
            'If true, creates a rule so all past and future transactions for this merchant use this category.',
        },
      },
      required: ['transactionId', 'category'],
    },
  },
  {
    name: 'update_budget_target',
    description:
      'Set or update the budgeted amount for a single expense or income category for a given month.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Target month in YYYY-MM format (e.g., 2026-10).',
        },
        category: {
          type: Type.STRING,
          description: 'Category name (e.g., Food & Dining, Groceries, Entertainment).',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Budgeted target amount in dollars.',
        },
        type: {
          type: Type.STRING,
          description: 'Type of budget: "expense" or "income" (default: "expense").',
        },
      },
      required: ['month', 'category', 'amount'],
    },
  },
  {
    name: 'set_monthly_budget',
    description:
      'Design, create, or update the full planned budget targets across multiple categories for a month (e.g. creating an optimal monthly budget based on historical spending).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Target month in YYYY-MM format (e.g., 2026-10).',
        },
        entries: {
          type: Type.ARRAY,
          description: 'List of category budget entries.',
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: 'Category name' },
              amount: { type: Type.NUMBER, description: 'Target amount in dollars' },
              type: {
                type: Type.STRING,
                description: '"expense" or "income" (default: "expense")',
              },
            },
            required: ['category', 'amount'],
          },
        },
      },
      required: ['month', 'entries'],
    },
  },
];

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: GoogleGenAI | null = null;
  private readonly modelName: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionsService: TransactionsService,
    private readonly budgetService: BudgetService,
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {
    this.apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      '';
    this.modelName =
      this.configService.get<string>('GEMINI_MODEL') ||
      process.env.GEMINI_MODEL ||
      'gemini-2.5-flash';

    if (this.apiKey) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
        this.logger.log(`Initialized Gemini AI client with model: ${this.modelName}`);
      } catch (err: any) {
        this.logger.error(`Failed to initialize Gemini AI client: ${err?.message}`);
      }
    } else {
      this.logger.warn(
        'GEMINI_API_KEY is not set. AI Copilot endpoints will prompt user to configure it.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.client);
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      model: this.modelName,
    };
  }

  /**
   * Executes a registered tool against the database for the authenticated user.
   */
  private async executeTool(
    userId: string,
    toolName: string,
    args: any = {},
  ): Promise<any> {
    this.logger.log(`Executing AI Tool: ${toolName} with args: ${JSON.stringify(args)}`);

    try {
      switch (toolName) {
        case 'get_accounts_overview': {
          const userAccounts = await this.db
            .select()
            .from(accounts)
            .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)));

          let totalDepository = 0;
          let totalInvestments = 0;
          let totalCreditDebt = 0;
          let totalLoans = 0;

          const summaryList = userAccounts.map((acc) => {
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
              availableBalance: acc.availableBalance,
              creditLimit: acc.creditLimit,
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
            totalCash: Math.round(totalDepository * 100) / 100,
            totalInvestments: Math.round(totalInvestments * 100) / 100,
            totalCreditDebt: Math.round(totalCreditDebt * 100) / 100,
            totalLoans: Math.round(totalLoans * 100) / 100,
            accountCount: userAccounts.length,
            accounts: summaryList,
          };
        }

        case 'query_transactions': {
          const res = await this.transactionsService.getTransactions(userId, {
            startDate: args.startDate,
            endDate: args.endDate,
            category: args.category,
            search: args.merchant || args.search,
            limit: Math.min(Number(args.limit) || 30, 100),
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

        case 'get_monthly_budget': {
          const summary = await this.budgetService.getMonthlyBudget(
            userId,
            args.month,
          );
          return {
            month: summary.month,
            totalBudgetedIncome: summary.totalBudgetedIncome,
            totalBudgetedExpenses: summary.totalBudgetedExpenses,
            leftToBudget: summary.leftToBudget,
            totalActualIncome: summary.totalActualIncome,
            totalActualExpenses: summary.totalActualExpenses,
            actualNetSavings: summary.actualNetSavings,
            expenseCategories: summary.expenseCategories.map((c) => ({
              category: c.category,
              budgeted: c.budgeted,
              actual: c.actual,
              remaining: c.remaining,
              percentSpent: c.percentSpent,
            })),
          };
        }

        case 'categorize_transaction': {
          const updated = await this.transactionsService.updateCategory(
            args.transactionId,
            userId,
            {
              category: args.category,
              subCategory: args.subCategory,
              applyToAllMerchant: Boolean(args.applyToAllMerchant),
            },
          );
          return {
            success: true,
            message: `Successfully categorized transaction as "${args.category}".`,
            updated,
          };
        }

        case 'update_budget_target': {
          await this.budgetService.upsertBudget(userId, {
            month: args.month,
            entries: [
              {
                category: args.category,
                budgetedAmount: Number(args.amount) || 0,
                type: args.type || 'expense',
              },
            ],
          });
          return {
            success: true,
            message: `Updated ${args.category} budget for ${args.month} to $${args.amount}.`,
          };
        }

        case 'set_monthly_budget': {
          const rawEntries = Array.isArray(args.entries) ? args.entries : [];
          const formattedEntries = rawEntries.map((e: any) => ({
            category: e.category,
            budgetedAmount: Number(e.amount) || 0,
            type: e.type || 'expense',
          }));

          const updatedSummary = await this.budgetService.upsertBudget(userId, {
            month: args.month,
            entries: formattedEntries,
          });

          return {
            success: true,
            message: `Successfully created and saved budget for ${args.month} across ${formattedEntries.length} categories.`,
            totalBudgetedExpenses: updatedSummary.totalBudgetedExpenses,
            categories: updatedSummary.expenseCategories.map((c) => ({
              category: c.category,
              budgeted: c.budgeted,
            })),
          };
        }

        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (err: any) {
      this.logger.error(`Error executing tool ${toolName}: ${err?.message}`, err?.stack);
      return { error: err?.message || 'Tool execution failed' };
    }
  }

  /**
   * Main chat streaming handler with multi-turn tool calling support.
   */
  async streamChat(
    userId: string,
    message: string,
    history: ChatMessage[] = [],
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    if (!this.client) {
      onEvent({
        type: 'error',
        message:
          'Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file.',
      });
      onEvent({ type: 'done' });
      return;
    }

    try {
      const contents: any[] = [];

      // Reconstruct conversation history
      for (const h of history) {
        if (h.text && h.text.trim()) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          });
        }
      }

      // Append current user message
      contents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      // Tool-calling loop (supports compound actions: queries, recategorizations, and budget planning)
      let turn = 0;
      const MAX_TURNS = 8;
      let emittedAnyChunk = false;

      while (turn < MAX_TURNS) {
        turn++;

        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any }],
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        const usage = (response as any).usageMetadata;
        if (usage) {
          this.logger.log(
            `[AiCopilot] Turn ${turn}/${MAX_TURNS}: promptTokens=${usage.promptTokenCount}, candidatesTokens=${usage.candidatesTokenCount}, thoughtsTokens=${usage.thoughtsTokenCount || 0}, totalTokens=${usage.totalTokenCount}`,
          );
        }

        const candidate = response.candidates?.[0];
        const content = candidate?.content;
        if (!content) {
          break;
        }

        contents.push(content);

        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
          // Final text response reached — stream tokens to client
          const text = response.text || '';
          if (text) {
            emittedAnyChunk = true;
            // Emit smoothly
            const words = text.split(' ');
            for (let i = 0; i < words.length; i += 3) {
              const slice = words.slice(i, i + 3).join(' ') + ' ';
              onEvent({ type: 'chunk', text: slice });
            }
          }
          break;
        }

        // Execute function calls
        const functionResponseParts: any[] = [];
        for (const call of functionCalls) {
          if (!call.name) continue;
          const toolLabel = call.name.replace(/_/g, ' ');
          onEvent({
            type: 'tool_start',
            tool: call.name,
            args: call.args,
            message: `Checking ${toolLabel}...`,
          });

          const toolResult = await this.executeTool(userId, call.name, call.args);

          onEvent({
            type: 'tool_end',
            tool: call.name,
          });

          functionResponseParts.push({
            functionResponse: {
              name: call.name,
              response: toolResult,
            },
          });
        }

        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });
      }

      if (!emittedAnyChunk) {
        onEvent({
          type: 'chunk',
          text: 'Completed your requested actions. Let me know if you would like any additional adjustments or details.',
        });
      }

      onEvent({ type: 'done' });
    } catch (err: any) {
      this.logger.error(`Error in streamChat: ${err?.message}`, err?.stack);
      onEvent({
        type: 'error',
        message: err?.message || 'An error occurred while communicating with Gemini.',
      });
      onEvent({ type: 'done' });
    }
  }
}
