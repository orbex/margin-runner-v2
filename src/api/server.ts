import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import { sourcingAgent } from '../agents/sourcingAgent.js';
import { ceoAgent } from '../agents/ceoAgent.js';
import { operationsAgent } from '../agents/operationsAgent.js';
import { dealQueries, inventoryQueries, listingQueries, saleQueries } from '../db/queries.js';
import { config } from '../config.js';
import { loadSettings, saveSettings, getPublicSettings, AppSettings } from '../settings.js';
import { resetLLMProvider } from '../llm/provider.js';

export interface ApiContext {
  app: Express;
  io: SocketServer;
  server: any;
}

export function createApiServer(): ApiContext {
  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH'],
    },
  });

  app.use(cors());
  app.use(express.json());
  app.use(express.static('web/dist'));

  io.on('connection', (socket) => {
    console.log(`📱 Client connected: ${socket.id}`);

    socket.on('subscribe:kpi', () => {
      socket.join('kpi-updates');
    });

    socket.on('disconnect', () => {
      console.log(`📱 Client disconnected: ${socket.id}`);
    });
  });

  const broadcast = (event: string, data: any) => {
    io.emit(event, data);
  };

  app.get('/api/dashboard', async (req: Request, res: Response) => {
    try {
      const deals = dealQueries.getByStatus('discovered');
      const allDeals = dealQueries.getByStatus('discovered').length +
                       dealQueries.getByStatus('approved').length +
                       dealQueries.getByStatus('purchased').length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todaySales = saleQueries.getByDateRange(today, tomorrow);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekKpi = await operationsAgent.getWeeklyPerformance(weekStart, weekEnd);

      res.json({
        weeklyProfit: weekKpi?.totalProfit ?? 0,
        weeklyTarget: config.business.targetWeeklyRevenue,
        targetPercent: weekKpi ? (weekKpi.totalProfit / config.business.targetWeeklyRevenue) * 100 : 0,
        todaySales: todaySales.length,
        todayProfit: todaySales.reduce((sum, s) => sum + s.profit, 0),
        avgMargin: weekKpi?.avgMarginPercent ?? 0,
        dealsAvailable: deals.length,
        channelBreakdown: weekKpi?.channelBreakdown,
        recentActivity: [],
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  app.get('/api/deals', (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'discovered';
      const deals = dealQueries.getByStatus(status).sort((a, b) => b.opportunityScore - a.opportunityScore);

      res.json(deals);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch deals' });
    }
  });

  app.post('/api/deals/:id/approve', async (req: Request, res: Response) => {
    try {
      const deal = dealQueries.getById(req.params.id);
      if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      dealQueries.updateStatus(deal.id, 'approved');
      broadcast('deal:approved', { dealId: deal.id, deal });

      res.json({ success: true, deal: dealQueries.getById(deal.id) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to approve deal' });
    }
  });

  app.post('/api/deals/:id/reject', (req: Request, res: Response) => {
    try {
      const deal = dealQueries.getById(req.params.id);
      if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      dealQueries.updateStatus(deal.id, 'rejected');
      broadcast('deal:rejected', { dealId: deal.id });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reject deal' });
    }
  });

  app.get('/api/inventory', (req: Request, res: Response) => {
    try {
      const locations = ['warehouse', 'fba', 'at-home', 'bulk-buyer'];
      const inventory: any = {};

      for (const location of locations) {
        inventory[location] = inventoryQueries.getByLocation(location);
      }

      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inventory' });
    }
  });

  app.post('/api/inventory/:id/list', async (req: Request, res: Response) => {
    try {
      const { channel, price } = req.body;
      const inventory = inventoryQueries.getById(req.params.id);

      if (!inventory) {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      const deal = dealQueries.getById(inventory.dealId);
      if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      const listing = await operationsAgent.createListing(inventory, channel, price);
      broadcast('listing:created', { listing });

      res.json({ success: true, listing });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create listing' });
    }
  });

  app.get('/api/listings', (req: Request, res: Response) => {
    try {
      const channels = ['ebay', 'amazon-fba', 'b2b'];
      const listings: any = {};

      for (const channel of channels) {
        listings[channel] = listingQueries.getByChannel(channel);
      }

      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch listings' });
    }
  });

  app.get('/api/sales', (req: Request, res: Response) => {
    try {
      const days = parseInt((req.query.days as string) || '7');
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const sales = saleQueries.getByDateRange(startDate, endDate);

      res.json({
        sales,
        summary: {
          totalSales: sales.length,
          totalRevenue: sales.reduce((sum, s) => sum + s.finalPrice, 0),
          totalProfit: sales.reduce((sum, s) => sum + s.profit, 0),
          avgMargin: sales.length > 0 ? (sales.reduce((sum, s) => sum + s.profit, 0) / sales.reduce((sum, s) => sum + s.finalPrice, 0)) * 100 : 0,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sales' });
    }
  });

  app.get('/api/weekly-kpi', async (req: Request, res: Response) => {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const kpi = await operationsAgent.getWeeklyPerformance(weekStart, weekEnd);

      res.json(kpi || {
        weekStart,
        weekEnd,
        totalProfit: 0,
        totalRevenue: 0,
        itemsSold: 0,
        avgMarginPercent: 0,
        targetAchieved: false,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch KPI' });
    }
  });

  app.post('/api/agents/source', async (req: Request, res: Response) => {
    try {
      res.json({ status: 'running', message: 'Sourcing agent started in background' });

      sourcingAgent.discoverAndScoreManyDeals().then(deals => {
        broadcast('deals:updated', { count: deals.length });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger sourcing' });
    }
  });

  app.post('/api/agents/ceo-review', async (req: Request, res: Response) => {
    try {
      const topDeals = dealQueries.getByStatus('discovered').sort((a, b) => b.opportunityScore - a.opportunityScore);

      res.json({ status: 'running', message: 'CEO reviewing deals...' });

      ceoAgent.reviewAndApproveDeals(topDeals).then(approved => {
        broadcast('deals:approved', { count: approved.length });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger CEO review' });
    }
  });

  app.post('/api/agents/reconcile', async (req: Request, res: Response) => {
    try {
      res.json({ status: 'running', message: 'Operations reconciliation started...' });

      operationsAgent.generateDailyReport().then(report => {
        broadcast('kpi:updated', report);
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger reconciliation' });
    }
  });

  app.get('/api/settings', (_req: Request, res: Response) => {
    try {
      const settings = loadSettings();
      res.json(getPublicSettings(settings));
    } catch (error) {
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    try {
      const current = loadSettings();
      const incoming: AppSettings = req.body;

      // Preserve stored API key if the browser sent back the masked placeholder
      const claudeApiKey =
        incoming.llm.claudeApiKey && incoming.llm.claudeApiKey !== '••••••••'
          ? incoming.llm.claudeApiKey
          : current.llm.claudeApiKey;

      const updated: AppSettings = {
        llm: {
          provider: incoming.llm.provider,
          claudeModel: incoming.llm.claudeModel,
          claudeApiKey,
          ollamaBaseUrl: incoming.llm.ollamaBaseUrl,
          ollamaModel: incoming.llm.ollamaModel,
        },
        business: {
          targetWeeklyRevenue: Number(incoming.business.targetWeeklyRevenue),
          minMarginPercent: Number(incoming.business.minMarginPercent),
        },
        scraping: {
          maxConcurrentRequests: Number(incoming.scraping.maxConcurrentRequests),
          requestTimeoutMs: Number(incoming.scraping.requestTimeoutMs),
          retryAttempts: Number(incoming.scraping.retryAttempts),
        },
      };

      saveSettings(updated);

      // Apply LLM settings immediately without restart
      config.llm.provider = updated.llm.provider;
      config.llm.claudeModel = updated.llm.claudeModel;
      config.llm.ollamaBaseUrl = updated.llm.ollamaBaseUrl;
      config.llm.ollamaModel = updated.llm.ollamaModel;
      if (claudeApiKey) config.claude.apiKey = claudeApiKey;
      config.business.targetWeeklyRevenue = updated.business.targetWeeklyRevenue;
      config.business.minMarginPercent = updated.business.minMarginPercent;
      resetLLMProvider();

      res.json({ success: true, settings: getPublicSettings(updated) });
    } catch (error) {
      console.error('Settings save error:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  app.get('*', (req: Request, res: Response) => {
    res.sendFile('web/dist/index.html', { root: process.cwd() });
  });

  return { app, io, server };
}

export async function startWebServer(port: number = 3000) {
  const { app, io, server } = createApiServer();

  server.listen(port, () => {
    console.log(`🌐 Web server running on http://localhost:${port}`);
    console.log(`📡 API available at http://localhost:${port}/api`);
  });

  return { app, io, server };
}
