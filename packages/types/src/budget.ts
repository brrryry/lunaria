export interface CategoryBudgetEntry {
  category: string;
  subCategory?: string | null;
  type: 'income' | 'expense';
  budgeted: number;
  actual: number;
  remaining: number;
  percentSpent: number;
}

export interface MonthlyBudgetSummary {
  month: string; // YYYY-MM
  totalBudgetedIncome: number;
  totalBudgetedExpenses: number;
  leftToBudget: number;
  totalActualIncome: number;
  totalActualExpenses: number;
  actualNetSavings: number;
  incomeCategories: CategoryBudgetEntry[];
  expenseCategories: CategoryBudgetEntry[];
}

export interface UpdateBudgetEntryDto {
  category: string;
  subCategory?: string | null;
  type: 'income' | 'expense';
  budgetedAmount: number;
}

export interface UpdateBudgetDto {
  month: string;
  entries: UpdateBudgetEntryDto[];
  adjustFuture?: boolean;
}

