export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  plaidTransactionId?: string | null;
  amount: number;
  isoCurrencyCode: string;
  date: string; // ISO date string YYYY-MM-DD
  datetime?: string | null;
  name: string;
  merchantName?: string | null;
  category: string;
  subCategory?: string | null;
  pending: boolean;
  notes?: string | null;
  tags?: string[];
  logoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionFilter {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  search?: string;
  pending?: boolean;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}
