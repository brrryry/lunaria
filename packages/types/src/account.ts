export type AccountType =
  | 'depository'
  | 'credit'
  | 'loan'
  | 'investment'
  | 'other';

export type AccountSubtype =
  | 'checking'
  | 'savings'
  | 'cd'
  | 'money_market'
  | 'credit_card'
  | 'mortgage'
  | 'student'
  | 'brokerage'
  | 'ira'
  | '401k'
  | 'crypto'
  | 'other';

export interface Account {
  id: string;
  userId: string;
  plaidItemId: string;
  plaidAccountId: string;
  name: string;
  officialName?: string | null;
  mask?: string | null;
  type: AccountType;
  subtype?: AccountSubtype | null;
  currentBalance: number;
  availableBalance?: number | null;
  creditLimit?: number | null;
  isoCurrencyCode: string;
  institutionName: string;
  institutionLogo?: string | null;
  institutionColor?: string | null;
  isHidden: boolean;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
