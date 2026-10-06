export interface SecurityHolding {
  id: string;
  userId: string;
  accountId: string;
  securityId: string;
  tickerSymbol: string;
  name: string;
  quantity: number;
  costBasis?: number | null;
  institutionPrice: number;
  institutionValue: number;
  currency: string;
  lastUpdated: Date;
}

export interface PriceSnapshot {
  time: Date;
  ticker: string;
  price: number;
  source: string;
}

export interface PortfolioHistoryPoint {
  timestamp: string;
  value: number;
  changeAmount?: number;
  changePercent?: number;
}
