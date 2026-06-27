import { initializeSchema } from './db/schema.js';
import { validateConfig, config } from './config.js';
import { startCLIDashboard } from './cli/dashboard.js';
import { startWebServer } from './api/server.js';
import { sourcingAgent } from './agents/sourcingAgent.js';
import { ceoAgent } from './agents/ceoAgent.js';
import { operationsAgent } from './agents/operationsAgent.js';
import { dealQueries } from './db/queries.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureDirectories() {
  const dirs = ['logs', 'dist', 'web/dist'];
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

async function runFullSourcingCycle() {
  console.log('\n🚀 Starting full sourcing cycle...\n');

  try {
    const rawDeals = await sourcingAgent.discoverAndScoreManyDeals();
    console.log(`✅ Found ${rawDeals.length} qualified deals`);

    const topDeals = dealQueries
      .getByStatus('discovered')
      .sort((a, b) => b.opportunityScore - a.opportunityScore);

    if (topDeals.length === 0) {
      console.log('No deals to process.');
      return;
    }

    console.log(`\n📋 Top 10 Available Deals:`);
    topDeals.slice(0, 10).forEach((deal, i) => {
      console.log(`${i + 1}. ${deal.title}`);
      console.log(`   💰 Cost: $${deal.acquisitionCost.toFixed(2)} → Market: $${deal.estimatedMarketPrice.toFixed(2)}`);
      console.log(`   📈 Profit: $${deal.profitEstimate.toFixed(2)} | Margin: ${deal.marginPercent.toFixed(1)}%`);
      console.log(`   ⭐ Score: ${deal.opportunityScore.toFixed(2)}\n`);
    });

    console.log('🤖 CEO Agent reviewing...');
    const approved = await ceoAgent.reviewAndApproveDeals(topDeals);
    console.log(`✅ CEO approved ${approved.length} deals for operations\n`);

    for (const deal of approved.slice(0, 2)) {
      console.log(`📦 Processing: ${deal.title}`);

      const inventory = await operationsAgent.recordPurchase(deal);
      console.log(`   ✓ Recorded purchase (SKU: ${inventory.sku})`);

      const optimalChannel = await operationsAgent.optimizeChannel(inventory.id);
      const listingPrice = deal.estimatedMarketPrice * 0.95;

      await operationsAgent.createListing(inventory, optimalChannel as any, listingPrice);
      console.log(`   ✓ Listed on ${optimalChannel} for $${listingPrice.toFixed(2)}\n`);
    }

    const dailyReport = await operationsAgent.generateDailyReport();
    console.log(`\n📊 Today's Metrics:`);
    console.log(`   Sales: ${dailyReport.salesCount}`);
    console.log(`   Revenue: $${dailyReport.revenue.toFixed(2)}`);
    console.log(`   Profit: $${dailyReport.profit.toFixed(2)}\n`);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const kpi = await operationsAgent.getWeeklyPerformance(weekStart, weekEnd);

    if (kpi && kpi.itemsSold > 0) {
      console.log(`📈 Weekly Performance:`);
      console.log(`   Revenue: $${kpi.totalRevenue.toFixed(2)}`);
      console.log(`   Profit: $${kpi.totalProfit.toFixed(2)} / $${config.business.targetWeeklyRevenue} target`);
      console.log(`   Target: ${((kpi.totalProfit / config.business.targetWeeklyRevenue) * 100).toFixed(1)}%`);
      console.log(`   Items Sold: ${kpi.itemsSold}`);
      console.log(`   Margin: ${kpi.avgMarginPercent.toFixed(1)}%\n`);

      console.log('🎯 CEO Strategic Recommendation:');
      const recommendation = await ceoAgent.strategicDecision(kpi);
      console.log(`${recommendation}\n`);
    } else {
      console.log('📌 No sales recorded yet for this week.\n');
    }
  } catch (error) {
    console.error('❌ Error in sourcing cycle:', error);
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🏢 MARGIN RUNNER - Multi-Agent Arbitrage System              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await ensureDirectories();
  validateConfig();
  initializeSchema();

  const args = process.argv.slice(2);

  if (args.includes('--web')) {
    const port = parseInt(process.env.PORT || '3000');
    console.log('\n🌐 Starting Web Interface...\n');
    await startWebServer(port);
    console.log('\n💡 Open http://localhost:3000 in your browser\n');
    await new Promise(() => {}); // Keep running
  } else if (args.includes('--cli') || args.includes('-i')) {
    console.log('\n📱 Starting Interactive CLI Dashboard...\n');
    await startCLIDashboard();
  } else {
    console.log('\n⚙️ Running automated sourcing cycle...\n');
    await runFullSourcingCycle();
    console.log('✨ Sourcing cycle complete!\n');
    console.log('💡 Tips:\n  npm start -- --cli          (interactive dashboard)\n  npm start -- --web          (web interface)\n');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
