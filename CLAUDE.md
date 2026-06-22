# Margin Runner - Project Guide

## Overview
Multi-agent arbitrage system that sources underpriced items from online retailers and resells across eBay, Amazon FBA, and B2B channels to generate $2,000+ weekly revenue.

## Architecture

### Three AI Agents (using Claude API)
1. **CEO Agent** (`src/agents/ceoAgent.ts`)
   - Reviews sourced deals daily (9 AM)
   - Makes approval/rejection decisions
   - Analyzes weekly KPIs and recommends strategy adjustments
   - Uses Claude Opus for decision-making

2. **Sourcing Agent** (`src/agents/sourcingAgent.ts`)
   - Runs web scrapers every 4 hours
   - Scores deals by profitability and feasibility
   - Ranks opportunities for CEO review
   - Identifies deal clusters by source

3. **Operations Agent** (`src/agents/operationsAgent.ts`)
   - Tracks inventory through sales cycle
   - Creates listings on optimal channels
   - Reconciles daily/weekly sales
   - Generates performance reports

### Data Flow
```
Scrapers → Deal Scorer → CEO Agent → Operations Agent → Sales Channels
                           ↓
                      Weekly Reporting & Strategy
```

## Key Files
- `src/index.ts` - Main orchestration, CLI launcher
- `src/cli/dashboard.ts` - Interactive menu system
- `src/db/schema.ts` & `queries.ts` - Database layer
- `src/config.ts` - Environment configuration
- `src/sourcing/` - Deal discovery and scoring
- `src/agents/` - Claude-powered decision makers
- `src/listings/` - Channel integrations

## Database Schema

**deals** - Source opportunities
- `id`, `title`, `acquisitionCost`, `estimatedMarketPrice`, `profitEstimate`, `marginPercent`
- `status`: discovered → approved → purchased → listed → sold
- `opportunityScore`: Calculated profitability metric

**inventory** - Purchased items
- `id`, `sku`, `dealId`, `location` (at-home/fba/warehouse/bulk-buyer)
- `status`: received → in-stock → shipped → sold

**listings** - Sales listings
- `id`, `channel` (ebay/amazon-fba/b2b), `listedPrice`, `status`

**sales** - Completed transactions
- `id`, `listingId`, `finalPrice`, `profit`, `platformFees`, `channel`

## Running the System

```bash
npm install                    # Setup
npm start                      # Run one sourcing cycle
npm start -- --cli             # Interactive dashboard
npm run dev                    # Watch mode
```

## Configuration

Set in `.env`:
- `CLAUDE_API_KEY` - Required, from https://console.anthropic.com
- `TARGET_WEEKLY_REVENUE` - Profit goal (default $2000)
- `MIN_MARGIN_PERCENT` - Minimum profit threshold (default 20%)
- eBay/Amazon keys - Optional for testing

## Extending

### Add New Scraper
1. Add method to `Scraper` class in `src/sourcing/scrapers.ts`
2. Return `RawDeal[]` format
3. Include in `runAllScrapers()`

### Add New Sales Channel
1. Create manager in `src/listings/channelManagers.ts`
2. Implement `createListing()`, `updateInventory()`, `trackSales()`
3. Update `operationsAgent.optimizeChannel()` logic
4. Add to channel breakdown in sales queries

### Adjust Deal Scoring
- Modify `DealScorer` class in `src/sourcing/dealScorer.ts`
- Tweak weights: `demandScore`, `feasibilityScore`, `opportunityScore`
- Test with known items

## Key Metrics

**Weekly KPI** (`WeeklyKPI` type):
- `totalRevenue` - Sum of sale prices
- `totalProfit` - Revenue minus all costs/fees
- `itemsSold` - Number of transactions
- `avgMarginPercent` - Profit margin %
- `targetAchieved` - Boolean for $2000 goal
- `channelBreakdown` - Performance per channel

## Design Decisions

1. **SQLite for simplicity** - No external DB needed, good for prototyping
2. **Claude API for decisions** - Natural language reasoning for complex sourcing logic
3. **Scrapers return demo data** - Actual scraping needs retailer-specific logic
4. **Channel managers are stubs** - Implement real API calls when keys are available
5. **CLI dashboard over web UI** - Simpler to run, no server dependency

## Performance Targets

- **Daily**: 2-5 items sourced and listed
- **Weekly**: 8-15 items sold = $2,000 profit
- **Typical margins**: 25-40% (after fees)
- **Automation level**: <5 min/day human oversight

## Next Steps / Enhancements

1. **Real Scrapers**: Implement actual Cheerio/Puppeteer scraping for Walmart, Target, etc.
2. **API Integration**: Connect to real eBay, Amazon, and Keepa APIs
3. **Bulk Buyer Integration**: Email/CSV export to B2B partners
4. **Scheduling**: Deploy cron jobs to run 24/7 in cloud (AWS Lambda, Railway, etc.)
5. **Analytics**: Dashboard with charts and historical trend analysis
6. **Alerts**: SMS/email notifications when deals meet criteria
7. **Inventory Forecasting**: Predict inventory turnover and optimize sourcing
8. **Dynamic Pricing**: Adjust listing prices based on competition and demand

## Troubleshooting

**No deals found**: Scrapers return demo data. Update `scrapers.ts` to hit real sites.

**Agent errors**: Check `.env` for `CLAUDE_API_KEY`. Ensure it's valid and has credits.

**Database issues**: Delete `.db*` files to reset. Schema auto-creates on startup.

**Channel API failures**: Stub implementations log to files. Implement real API calls as needed.
