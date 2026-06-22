import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { Deal, Inventory, Listing, Sale, WeeklyKPI } from '../types/index.js';
import { dealQueries, inventoryQueries, listingQueries, saleQueries, agentDecisionQueries } from '../db/queries.js';
import { randomUUID } from 'crypto';

const client = new Anthropic({
  apiKey: config.claude.apiKey,
});

export class OperationsAgent {
  async recordPurchase(deal: Deal, quantity: number = 1): Promise<Inventory> {
    const sku = `${deal.id.split('-')[0].toUpperCase()}-${quantity}`;

    const inventory = inventoryQueries.insert({
      dealId: deal.id,
      sku,
      quantity,
      location: 'at-home',
      acquisitionCost: deal.acquisitionCost,
      purchaseDate: new Date(),
      status: 'received',
    });

    dealQueries.updateStatus(deal.id, 'purchased');

    agentDecisionQueries.insert({
      agent: 'operations',
      action: 'purchase_recorded',
      reasoning: `Purchased "${deal.title}" for $${deal.acquisitionCost}`,
      timestamp: new Date(),
      status: 'executed',
    });

    return inventoryQueries.getById(inventory)!;
  }

  async createListing(inventory: Inventory, channel: 'ebay' | 'amazon-fba' | 'b2b', price: number): Promise<Listing> {
    const title = dealQueries.getById(inventory.dealId)?.title || 'Item';
    const platformFee = config.business.platformFeePercent[channel];
    const netPrice = price * (1 - platformFee);

    const listing = listingQueries.insert({
      inventoryId: inventory.id,
      channel,
      title,
      description: `High-quality item. Fast shipping available. ${channel === 'amazon-fba' ? 'Fulfilled by Amazon.' : ''}`,
      listedPrice: price,
      quantity: inventory.quantity,
      listedDate: new Date(),
      status: 'active',
    });

    agentDecisionQueries.insert({
      agent: 'operations',
      action: 'listing_created',
      reasoning: `Listed on ${channel} at $${price.toFixed(2)} (net: $${netPrice.toFixed(2)})`,
      timestamp: new Date(),
      status: 'executed',
    });

    return listingQueries.insert({
      inventoryId: inventory.id,
      channel,
      title,
      description: `High-quality item. Fast shipping.`,
      listedPrice: price,
      quantity: inventory.quantity,
      listedDate: new Date(),
      status: 'active',
    }) as any;
  }

  async recordSale(listing: Listing, finalPrice: number, shippingCost: number = 0): Promise<Sale> {
    const platformFees = finalPrice * config.business.platformFeePercent[listing.channel];
    const inventory = inventoryQueries.getById(listing.inventoryId)!;
    const profit = finalPrice - platformFees - shippingCost - inventory.acquisitionCost;

    const sale = saleQueries.insert({
      listingId: listing.id,
      finalPrice,
      platFormFees: platformFees,
      shippingCost,
      profit,
      saleDate: new Date(),
      channel: listing.channel,
    });

    listingQueries.updateStatus(listing.id, 'sold', new Date());
    inventoryQueries.updateStatus(inventory.id, 'sold');

    agentDecisionQueries.insert({
      agent: 'operations',
      action: 'sale_recorded',
      reasoning: `Sold on ${listing.channel}: $${finalPrice.toFixed(2)} | Profit: $${profit.toFixed(2)}`,
      timestamp: new Date(),
      status: 'executed',
    });

    return saleQueries.insert({
      listingId: listing.id,
      finalPrice,
      platFormFees: platformFees,
      shippingCost,
      profit,
      saleDate: new Date(),
      channel: listing.channel,
    }) as any;
  }

  async getInventoryStatus(): Promise<Record<string, number>> {
    const locations = ['warehouse', 'fba', 'at-home', 'bulk-buyer'];
    const status: Record<string, number> = {};

    for (const location of locations) {
      const items = inventoryQueries.getByLocation(location);
      status[location] = items.reduce((sum, item) => sum + item.quantity, 0);
    }

    return status;
  }

  async optimizeChannel(inventoryId: string): Promise<string> {
    const inventory = inventoryQueries.getById(inventoryId);
    if (!inventory) return 'unknown';

    const deal = dealQueries.getById(inventory.dealId);
    if (!deal) return 'unknown';

    const options = [
      { channel: 'ebay', margin: 0.85 },
      { channel: 'amazon-fba', margin: 0.65 },
      { channel: 'b2b', margin: 0.95 },
    ];

    let bestChannel = 'ebay';
    let bestMargin = 0;

    for (const opt of options) {
      const price = (inventory.acquisitionCost * 1.5) / (1 - (1 - opt.margin));
      const platformFees = price * config.business.platformFeePercent[opt.channel as keyof typeof config.business.platformFeePercent];
      const netMargin = ((price - platformFees - inventory.acquisitionCost) / price) * 100;

      if (netMargin > bestMargin) {
        bestMargin = netMargin;
        bestChannel = opt.channel;
      }
    }

    return bestChannel;
  }

  async generateDailyReport(): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaySales = saleQueries.getByDateRange(today, tomorrow);
    const inventory = inventoryQueries.getByLocation('at-home');

    const summary = {
      date: today.toISOString().split('T')[0],
      salesCount: todaySales.length,
      revenue: todaySales.reduce((sum, s) => sum + s.finalPrice, 0),
      profit: todaySales.reduce((sum, s) => sum + s.profit, 0),
      itemsInInventory: inventory.reduce((sum, i) => sum + i.quantity, 0),
      activeListings: inventory.filter(i => i.status === 'in-stock').length,
    };

    console.log(`📊 Daily Report: ${summary.salesCount} sales, $${summary.profit.toFixed(2)} profit`);

    return summary;
  }

  async getWeeklyPerformance(startDate: Date, endDate: Date): Promise<WeeklyKPI | null> {
    const sales = saleQueries.getByDateRange(startDate, endDate);

    if (sales.length === 0) {
      return {
        weekStart: startDate,
        weekEnd: endDate,
        totalRevenue: 0,
        totalProfit: 0,
        totalCost: 0,
        avgMarginPercent: 0,
        itemsSourced: 0,
        itemsListed: 0,
        itemsSold: 0,
        turnoverRate: 0,
        targetAchieved: false,
        channelBreakdown: {
          ebay: { revenue: 0, profit: 0, itemsSold: 0 },
          amazonFba: { revenue: 0, profit: 0, itemsSold: 0 },
          b2b: { revenue: 0, profit: 0, itemsSold: 0 },
        },
      };
    }

    const totalRevenue = sales.reduce((sum, s) => sum + s.finalPrice, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
    const channelBreakdown = {
      ebay: { revenue: 0, profit: 0, itemsSold: 0 },
      amazonFba: { revenue: 0, profit: 0, itemsSold: 0 },
      b2b: { revenue: 0, profit: 0, itemsSold: 0 },
    };

    sales.forEach(s => {
      const channel = s.channel as keyof typeof channelBreakdown;
      if (channel in channelBreakdown) {
        channelBreakdown[channel].revenue += s.finalPrice;
        channelBreakdown[channel].profit += s.profit;
        channelBreakdown[channel].itemsSold += 1;
      }
    });

    return {
      weekStart: startDate,
      weekEnd: endDate,
      totalRevenue,
      totalProfit,
      totalCost: totalRevenue - totalProfit,
      avgMarginPercent: (totalProfit / totalRevenue) * 100,
      itemsSourced: 0,
      itemsListed: 0,
      itemsSold: sales.length,
      turnoverRate: sales.length,
      targetAchieved: totalProfit >= config.business.targetWeeklyRevenue,
      channelBreakdown,
    };
  }
}

export const operationsAgent = new OperationsAgent();
