# Margin Runner - Multi-Agent Arbitrage System

An AI-powered arbitrage system that automatically sources underpriced items from online clearance sections, liquidation sites, and coupon deals, then resells them across multiple channels (eBay, Amazon FBA, B2B) to generate $2,000+ weekly revenue.

## 🎯 Features

- **Three AI Agents** working in coordination:
  - **CEO Agent**: Reviews deals, approves purchases, makes strategic decisions based on weekly KPIs
  - **Sourcing Agent**: Discovers items on clearance/liquidation sites, scores by profit potential
  - **Operations Agent**: Tracks inventory, manages listings across channels, reconciles sales

- **Multi-Channel Selling**: 
  - eBay (automated listings with API integration)
  - Amazon FBA (shipment management, fulfillment tracking)
  - B2B Bulk Sales (wholesale buyers, large orders)

- **Web Scraping**: 
  - Walmart clearance sections
  - Target clearance sections  
  - Liquidation.com
  - eBay Outlet
  - Coupon stacking sites

- **Smart Deal Scoring**:
  - Calculates profit margins (target: >20%)
  - Estimates market prices
  - Scores by demand and feasibility
  - Filters for shipping feasibility

- **Automated Orchestration**:
  - Claude API agents make autonomous decisions
  - Human approval gates for high-value decisions
  - Real-time KPI tracking
  - Weekly strategic reviews

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Claude API key (from https://console.anthropic.com)
- Optional: eBay, Amazon, and API keys for channel integrations

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/margin-runner.git
cd margin-runner

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Add your CLAUDE_API_KEY to .env
# (eBay/Amazon keys optional for initial testing)
```

### Running the System

```bash
# Run one sourcing cycle (automated mode)
npm start

# Start interactive CLI dashboard
npm start -- --cli
npm start -- -i

# Run in watch mode for development
npm run dev

# Build TypeScript
npm run build
```

## 📊 How It Works

### Sourcing Cycle

1. **Discovery Phase**
   - Scrapers check Walmart, Target, liquidation sites every 4 hours
   - Items identified that are 20%+ below market price
   - Deal scoring calculates profit potential

2. **CEO Review** (Daily at 9 AM)
   - CEO Agent reviews top 10 deals
   - Uses Claude to make approval decisions
   - Only approved deals move to operations

3. **Operations Phase**
   - Purchase approved items (recorded in database)
   - Determine optimal sales channel (eBay/FBA/B2B)
   - Create listings with calculated pricing

4. **Sales & Reconciliation** (Daily at 8 PM)
   - Track sales across all channels
   - Calculate profit per item
   - Generate daily and weekly reports

5. **Strategy Adjustment** (Weekly)
   - CEO analyzes weekly KPIs
   - Recommends sourcing/channel adjustments
   - Scale up/down based on performance

### Data Models

**Deal**: Item sourced, with cost/market price/profit calculations
- `discoveredAt`: When found
- `status`: discovered → approved → purchased → listed → sold
- `opportunityScore`: AI-calculated profitability score

**Inventory**: Purchased items tracking
- `location`: at-home, fba, warehouse, or bulk-buyer
- `status`: received → in-stock → shipped → sold

**Listing**: Active sales listings per channel
- `channel`: ebay, amazon-fba, or b2b
- `status`: active, sold, delisted

**Sale**: Completed transactions
- `finalPrice`, `platformFees`, `shippingCost`, `profit`

## 💰 Economics

### Target: $2,000/week profit

Example breakdown:
- Source 20 items at average $50 profit each = $1,000/week base
- Scale to 40 items across channels = $2,000/week

### Costs
- Acquisition: Variable (clearance/liquidation sourcing)
- Platform fees: 
  - eBay: 15%
  - Amazon FBA: 35%
  - B2B: 5%
- Shipping: $5-15 per item average

### Margins
- Target minimum margin: 20%
- Typical margins: 25-40% on clearance items
- B2B offers: 40-50% wholesale margins

## 🎮 Interactive Dashboard

The CLI dashboard provides:

```
1. Run Sourcing Cycle - Manually trigger deal discovery
2. View Dashboard - See real-time KPIs
3. Review Top Deals - Browse and approve individual deals
4. Manage Inventory - View and list items
5. View Weekly Report - Detailed performance analysis
```

## 🔧 Configuration

Edit `.env` to customize:

```env
TARGET_WEEKLY_REVENUE=2000        # Weekly profit goal
MIN_MARGIN_PERCENT=20              # Minimum margin threshold
DATABASE_URL=./margin-runner.db    # SQLite database path
CLAUDE_API_KEY=sk-...              # Required: Claude API key
EBAY_CLIENT_ID=...                 # Optional: eBay API
AMAZON_ACCESS_KEY_ID=...           # Optional: Amazon FBA
```

## 📈 Monitoring

### Dashboard Metrics
- **Available Deals**: Total qualified items to source
- **Inventory**: Items in stock, FBA, or bulk awaiting sale
- **Daily Sales**: Revenue and profit today
- **Weekly Performance**: Progress toward $2,000 target

### Agent Decisions
All agent decisions are logged in database for transparency:
- CEO approval history
- Sourcing recommendations
- Operations actions and results

## 🛠️ Development

### Project Structure
```
src/
├── index.ts              # Main entry point
├── types/                # TypeScript interfaces
├── config.ts             # Configuration
├── db/
│   ├── schema.ts         # Database setup
│   └── queries.ts        # CRUD operations
├── sourcing/
│   ├── scrapers.ts       # Web scrapers
│   └── dealScorer.ts     # Deal scoring logic
├── agents/
│   ├── ceoAgent.ts       # CEO decision-making
│   ├── sourcingAgent.ts  # Deal discovery
│   └── operationsAgent.ts# Inventory tracking
├── listings/
│   └── channelManagers.ts # eBay, Amazon, B2B
├── cli/
│   └── dashboard.ts      # Interactive CLI
└── scheduler.ts          # Cron jobs
```

### Adding a New Scraper
1. Add scraper method to `Scraper` class in `src/sourcing/scrapers.ts`
2. Include in `runAllScrapers()` call
3. Return `RawDeal[]` format

### Extending Channel Integration
1. Implement API client in `src/listings/channelManagers.ts`
2. Update `operationsAgent.createListing()` to call new channel
3. Add reconciliation to pull sold items

## 🚨 Troubleshooting

**"Missing CLAUDE_API_KEY"**
- Add `CLAUDE_API_KEY=sk-...` to `.env`

**"No deals found"**
- Scrapers may need updates (retailer sites change)
- Check scrapers.ts for correctness
- Adjust margin thresholds in config

**"Database locked"**
- Another process is using the database
- Check for running instances
- Delete `.db-shm` and `.db-wal` files

## 📝 License

MIT - See LICENSE file

## 🤝 Contributing

1. Test all scrapers before submitting
2. Ensure margins are realistic (not too aggressive)
3. Add documentation for new features
4. Keep agent prompts focused and concise

## 📞 Support

For issues or questions:
- Check database for agent decision logs
- Review scrapers for retailer changes
- Validate margin calculations
- Test with --cli dashboard first

---

**Status**: Production-ready for authorized testing. Scale responsibly and monitor margins carefully.
