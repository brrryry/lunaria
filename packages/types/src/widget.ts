export type WidgetType =
  | 'net_worth'
  | 'spending_summary'
  | 'cash_flow'
  | 'recent_transactions'
  | 'investments_overview'
  | 'investment_graph'
  | 'budget_progress'
  | 'recurring_expenses'
  | 'account_balances';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  order: number;
  visible: boolean;
  settings?: Record<string, unknown>;
}

export interface UserDashboardLayout {
  userId: string;
  widgets: WidgetConfig[];
  updatedAt: Date;
}
