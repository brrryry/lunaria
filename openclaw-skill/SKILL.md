---
name: lunaria
description: Connect to the Lunaria Personal Wealth & Financial Intelligence platform. Allows the agent to query real account balances, calculate net worth, inspect recent transactions, check budget progress, and recategorize expenses.
version: 1.0.0
author: Lunaria
tags: [finance, wealth, money, budget, transactions, accounts]
---

# Lunaria Financial Intelligence Skill

Use this skill whenever the user asks about their finances, bank accounts, credit cards, investments, net worth, transaction history, or budget progress.

## Configuration & Environment
The helper script `lunaria.sh` communicates with the local Lunaria backend.
- `LUNARIA_URL`: defaults to `http://localhost:3001/api`
- `LUNARIA_AGENT_API_KEY`: The secret agent key configured in Lunaria's `.env` (default: `lunaria_sec_53709a29af6c6dca6ef9050c4da79eb4`)

## Available Actions

### 1. Financial Overview & Net Worth
Retrieve overall net worth, liquid cash, investments, credit card balances, and loans:
```bash
./lunaria.sh overview
```
Returns:
- `netWorth`: Assets minus debts
- `cash`: Depository accounts (checking/savings)
- `investments`: Brokerage and retirement accounts
- `creditDebt`: Unpaid credit card balances
- `accounts`: List of individual institutions and balances

### 2. Recent Transactions
List transactions filtered by recency and count:
```bash
# Fetch transactions from the past 7 days (limit 20):
./lunaria.sh transactions 7 20

# Fetch transactions from the past 30 days (limit 50):
./lunaria.sh transactions 30 50
```

### 3. Monthly Budget & Spending Tracking
Inspect budgeted vs. actual spending for the current or specified month:
```bash
# Current month:
./lunaria.sh budget

# Specific month (YYYY-MM):
./lunaria.sh budget 2026-10
```
Returns:
- `budgetedExpenses`: Total planned budget
- `actualExpenses`: Total spent so far
- `leftToBudget`: Remaining balance to spend
- `categories`: Breakdown by category with percentage spent

### 4. Set or Formulate Monthly Budgets
Create or update budget targets for a single category or an entire month:
```bash
# Set a single category:
./lunaria.sh set-budget 2026-10 "Food & Dining" 600

# Set a full monthly budget across multiple categories at once:
./lunaria.sh set-budget 2026-10 '[{"category":"Food & Dining","amount":600},{"category":"Groceries","amount":450},{"category":"Utilities","amount":200},{"category":"Entertainment","amount":150}]'
```

#### Recommended Workflow for "Think of a good budget for the month":
When the user asks you to propose or set a budget:
1. **Analyze Past Spending**: Fetch recent transactions (`./lunaria.sh transactions 30 100`) and the current budget status (`./lunaria.sh budget`).
2. **Formulate a Balanced Budget Plan**:
   - Calculate typical monthly spending across essential categories (Housing, Utilities, Groceries, Transportation) and discretionary categories (Food & Dining, Shopping, Entertainment).
   - Propose a clear breakdown with recommended target amounts.
3. **Apply & Save**: Execute `./lunaria.sh set-budget <YYYY-MM> '<json_entries>'` to write the plan directly into Lunaria so the user immediately sees it in their Lunaria dashboard.

### 5. Daily Morning Briefing
Generates a pre-formatted snapshot ideal for morning messages or proactive notifications on Telegram, Discord, or WhatsApp:
```bash
./lunaria.sh briefing
```

### 6. Recategorize a Transaction
Update the category of a transaction and optionally create a persistent rule:
```bash
./lunaria.sh categorize "<transactionId>" "<category>" "<optionalSubCategory>" true
```

## Agent Guidelines & Style
1. **Always fetch live data**: Never hallucinate numbers. Run `./lunaria.sh overview`, `transactions`, or `budget` before answering questions about money.
2. **Formatting**: Always format numbers with currency symbols (e.g. `$1,420.50`).
3. **Chat App Friendliness**: When responding on messaging apps (Telegram, Discord, WhatsApp), keep summaries clean and bulleted.
4. **Action Confirmation**: When setting budget targets or recategorizing transactions, confirm the changes made and show the resulting totals.
