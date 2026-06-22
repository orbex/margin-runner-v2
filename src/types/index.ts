export interface Deal {
  id: string;
  title: string;
  description?: string;
  sourceUrl: string;
  sourceType: 'walmart' | 'target' | 'liquidation' | 'ebay-outlet' | 'other';
  acquisitionCost: number;
  retailPrice: number;
  estimatedMarketPrice: number;
  marginPercent: number;
  profitEstimate: number;
  shippingCost: number;
  weight?: number;
  dimensions?: string;
  imageUrl?: string;
  demandScore: number;
  feasibilityScore: number;
  opportunityScore: number;
  status: 'discovered' | 'approved' | 'purchased' | 'listed' | 'sold' | 'rejected';
  discoveredAt: Date;
  approvedAt?: Date;
  purchasedAt?: Date;
  notes?: string;
}

export interface Inventory {
  id: string;
  dealId: string;
  sku: string;
  quantity: number;
  location: 'warehouse' | 'fba' | 'at-home' | 'bulk-buyer';
  acquisitionCost: number;
  purchaseDate: Date;
  status: 'received' | 'in-stock' | 'shipped' | 'sold';
  expiryDate?: Date;
}

export interface Listing {
  id: string;
  inventoryId: string;
  channel: 'ebay' | 'amazon-fba' | 'b2b';
  channelListingId?: string;
  title: string;
  description: string;
  listedPrice: number;
  quantity: number;
  listedDate: Date;
  soldDate?: Date;
  status: 'active' | 'sold' | 'delisted' | 'pending';
  views?: number;
  watchers?: number;
}

export interface Sale {
  id: string;
  listingId: string;
  finalPrice: number;
  platFormFees: number;
  shippingCost: number;
  profit: number;
  saleDate: Date;
  channel: 'ebay' | 'amazon-fba' | 'b2b';
}

export interface AgentDecision {
  id: string;
  agent: 'ceo' | 'sourcing' | 'operations';
  action: string;
  reasoning: string;
  timestamp: Date;
  status: 'pending' | 'executed' | 'rejected';
  result?: string;
}

export interface WeeklyKPI {
  weekStart: Date;
  weekEnd: Date;
  totalRevenue: number;
  totalProfit: number;
  totalCost: number;
  avgMarginPercent: number;
  itemsSourced: number;
  itemsListed: number;
  itemsSold: number;
  turnoverRate: number;
  targetAchieved: boolean;
  channelBreakdown: {
    ebay: { revenue: number; profit: number; itemsSold: number };
    amazonFba: { revenue: number; profit: number; itemsSold: number };
    b2b: { revenue: number; profit: number; itemsSold: number };
  };
}
