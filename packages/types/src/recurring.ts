export type RecurringFrequency =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'SEMI_MONTHLY'
  | 'MONTHLY'
  | 'ANNUALLY'
  | 'UNKNOWN';

export type RecurringStatus = 'MATURE' | 'EARLY_DETECTION' | 'TOMBSTONED' | 'UNKNOWN';

export interface RecurringStreamItem {
  id: string; // unique streamId or generated heuristic id
  accountId?: string;
  accountName?: string;
  institutionName?: string;
  merchantName?: string;
  description: string;
  category?: string;
  subCategory?: string;
  frequency: RecurringFrequency;
  averageAmount: number;
  lastAmount: number;
  currency: string;
  firstDate?: string;
  lastDate?: string;
  isActive: boolean;
  status: RecurringStatus;
  isDismissed?: boolean;
  source: 'plaid' | 'heuristic';
  transactionCount?: number;
  transactionIds?: string[];
}

export interface RecurringSummary {
  totalMonthlyOutflow: number;
  totalMonthlyInflow: number;
  netMonthlyBurn: number;
  activeSubscriptionsCount: number;
  activeInflowStreamsCount: number;
}

export interface RecurringTransactionsResponse {
  inflows: RecurringStreamItem[];
  outflows: RecurringStreamItem[];
  dismissed: RecurringStreamItem[];
  summary: RecurringSummary;
}
