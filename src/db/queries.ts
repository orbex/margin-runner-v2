import { db } from './schema.js';
import { Deal, Inventory, Listing, Sale, AgentDecision, WeeklyKPI } from '../types/index.js';
import { randomUUID } from 'crypto';

export const dealQueries = {
  insert: (deal: Omit<Deal, 'id'>) => {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO deals (
        id, title, description, sourceUrl, sourceType, acquisitionCost,
        retailPrice, estimatedMarketPrice, marginPercent, profitEstimate,
        shippingCost, weight, dimensions, imageUrl, demandScore,
        feasibilityScore, opportunityScore, status, discoveredAt, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id, deal.title, deal.description, deal.sourceUrl, deal.sourceType,
      deal.acquisitionCost, deal.retailPrice, deal.estimatedMarketPrice,
      deal.marginPercent, deal.profitEstimate, deal.shippingCost, deal.weight,
      deal.dimensions, deal.imageUrl, deal.demandScore, deal.feasibilityScore,
      deal.opportunityScore, deal.status, deal.discoveredAt.toISOString(), deal.notes
    );
    return id;
  },

  getById: (id: string): Deal | null => {
    const stmt = db.prepare('SELECT * FROM deals WHERE id = ?');
    return stmt.get(id) as Deal | null;
  },

  getByStatus: (status: string): Deal[] => {
    const stmt = db.prepare('SELECT * FROM deals WHERE status = ? ORDER BY opportunityScore DESC');
    return stmt.all(status) as Deal[];
  },

  updateStatus: (id: string, status: string) => {
    const stmt = db.prepare('UPDATE deals SET status = ? WHERE id = ?');
    stmt.run(status, id);
  },

  getTopDeals: (limit: number = 10): Deal[] => {
    const stmt = db.prepare(`
      SELECT * FROM deals
      WHERE status IN ('discovered', 'approved')
      ORDER BY opportunityScore DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Deal[];
  },
};

export const inventoryQueries = {
  insert: (inventory: Omit<Inventory, 'id'>) => {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO inventory (
        id, dealId, sku, quantity, location, acquisitionCost, purchaseDate, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id, inventory.dealId, inventory.sku, inventory.quantity, inventory.location,
      inventory.acquisitionCost, inventory.purchaseDate.toISOString(), inventory.status
    );
    return id;
  },

  getById: (id: string): Inventory | null => {
    const stmt = db.prepare('SELECT * FROM inventory WHERE id = ?');
    return stmt.get(id) as Inventory | null;
  },

  getByLocation: (location: string): Inventory[] => {
    const stmt = db.prepare('SELECT * FROM inventory WHERE location = ?');
    return stmt.all(location) as Inventory[];
  },

  updateStatus: (id: string, status: string) => {
    const stmt = db.prepare('UPDATE inventory SET status = ? WHERE id = ?');
    stmt.run(status, id);
  },
};

export const listingQueries = {
  insert: (listing: Omit<Listing, 'id'>) => {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO listings (
        id, inventoryId, channel, channelListingId, title, description,
        listedPrice, quantity, listedDate, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id, listing.inventoryId, listing.channel, listing.channelListingId,
      listing.title, listing.description, listing.listedPrice, listing.quantity,
      listing.listedDate.toISOString(), listing.status
    );
    return id;
  },

  getByChannel: (channel: string): Listing[] => {
    const stmt = db.prepare('SELECT * FROM listings WHERE channel = ? AND status = "active"');
    return stmt.all(channel) as Listing[];
  },

  updateStatus: (id: string, status: string, soldDate?: Date) => {
    const stmt = db.prepare('UPDATE listings SET status = ?, soldDate = ? WHERE id = ?');
    stmt.run(status, soldDate?.toISOString(), id);
  },
};

export const saleQueries = {
  insert: (sale: Omit<Sale, 'id'>) => {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO sales (
        id, listingId, finalPrice, platformFees, shippingCost, profit, saleDate, channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id, sale.listingId, sale.finalPrice, sale.platFormFees, sale.shippingCost,
      sale.profit, sale.saleDate.toISOString(), sale.channel
    );
    return id;
  },

  getByDateRange: (startDate: Date, endDate: Date): Sale[] => {
    const stmt = db.prepare(`
      SELECT * FROM sales WHERE saleDate BETWEEN ? AND ?
      ORDER BY saleDate DESC
    `);
    return stmt.all(startDate.toISOString(), endDate.toISOString()) as Sale[];
  },

  getWeeklySummary: (startDate: Date, endDate: Date) => {
    const stmt = db.prepare(`
      SELECT
        channel,
        COUNT(*) as itemsSold,
        SUM(finalPrice) as revenue,
        SUM(profit) as profit,
        AVG((profit / finalPrice) * 100) as avgMarginPercent
      FROM sales
      WHERE saleDate BETWEEN ? AND ?
      GROUP BY channel
    `);
    return stmt.all(startDate.toISOString(), endDate.toISOString()) as any[];
  },

  getTotalWeekly: (startDate: Date, endDate: Date) => {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as itemsSold,
        SUM(finalPrice) as revenue,
        SUM(profit) as profit
      FROM sales
      WHERE saleDate BETWEEN ? AND ?
    `);
    return stmt.get(startDate.toISOString(), endDate.toISOString()) as any;
  },
};

export const agentDecisionQueries = {
  insert: (decision: Omit<AgentDecision, 'id'>) => {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO agentDecisions (
        id, agent, action, reasoning, status, result
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, decision.agent, decision.action, decision.reasoning, decision.status, decision.result);
    return id;
  },

  updateStatus: (id: string, status: string, result?: string) => {
    const stmt = db.prepare('UPDATE agentDecisions SET status = ?, result = ? WHERE id = ?');
    stmt.run(status, result, id);
  },

  getRecent: (limit: number = 50): AgentDecision[] => {
    const stmt = db.prepare('SELECT * FROM agentDecisions ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit) as AgentDecision[];
  },
};
