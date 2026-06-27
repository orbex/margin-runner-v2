import * as readline from 'readline';
import { dealQueries, inventoryQueries, listingQueries, saleQueries } from '../db/queries.js';
import { operationsAgent } from '../agents/operationsAgent.js';
import { sourcingAgent } from '../agents/sourcingAgent.js';
import { ceoAgent } from '../agents/ceoAgent.js';
import { config } from '../config.js';
import type { Deal, Sale, Inventory } from '../types/index.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

export async function startCLIDashboard() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          MARGIN RUNNER - Multi-Agent Arbitrage System           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let running = true;

  while (running) {
    console.log('\n📊 MAIN MENU');
    console.log('1. Run Sourcing Cycle');
    console.log('2. View Dashboard');
    console.log('3. Review Top Deals');
    console.log('4. Manage Inventory');
    console.log('5. View Weekly Report');
    console.log('6. Exit');

    const choice = await prompt('\nSelect option (1-6): ');

    switch (choice.trim()) {
      case '1':
        await runSourcingCycleInteractive();
        break;
      case '2':
        await displayDashboard();
        break;
      case '3':
        await reviewTopDeals();
        break;
      case '4':
        await manageInventory();
        break;
      case '5':
        await showWeeklyReport();
        break;
      case '6':
        running = false;
        console.log('\n👋 Goodbye!\n');
        break;
      default:
        console.log('Invalid option. Please try again.');
    }
  }

  rl.close();
}

async function runSourcingCycleInteractive() {
  console.log('\n🔍 Starting sourcing cycle...\n');

  try {
    const deals = await sourcingAgent.discoverAndScoreManyDeals();
    console.log(`✓ Found ${deals.length} qualified deals\n`);

    const topDeals = dealQueries.getByStatus('discovered').sort((a: Deal, b: Deal) => b.opportunityScore - a.opportunityScore).slice(0, 5);

    console.log('Top 5 Deals:');
    topDeals.forEach((deal: Deal, i: number) => {
      console.log(`${i + 1}. ${deal.title}`);
      console.log(`   Profit: $${deal.profitEstimate.toFixed(2)} | Margin: ${deal.marginPercent.toFixed(1)}%`);
    });

    const approve = await prompt('\nWould CEO approve these? (y/n): ');
    if (approve.toLowerCase() === 'y') {
      const approved = await ceoAgent.reviewAndApproveDeals(topDeals);
      console.log(`✅ CEO approved ${approved.length} deals`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function displayDashboard() {
  console.log('\n📈 DASHBOARD\n');

  const allDeals = dealQueries.getByStatus('discovered');
  console.log(`💰 Deals Available: ${allDeals.length}`);
  console.log(`💵 Total Potential Profit: $${allDeals.reduce((sum: number, d: Deal) => sum + d.profitEstimate, 0).toFixed(2)}`);

  const inventory = inventoryQueries.getByLocation('at-home');
  console.log(`📦 Items In Stock: ${inventory.length}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySales = saleQueries.getByDateRange(today, tomorrow);
  console.log(`🛒 Sales Today: ${todaySales.length}`);
  console.log(`💵 Profit Today: $${todaySales.reduce((sum: number, s: Sale) => sum + s.profit, 0).toFixed(2)}`);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSales = saleQueries.getByDateRange(weekStart, weekEnd);
  const weekProfit = weekSales.reduce((sum: number, s: Sale) => sum + s.profit, 0);
  console.log(`📊 Weekly Profit: $${weekProfit.toFixed(2)} / $${config.business.targetWeeklyRevenue}`);

  const percent = (weekProfit / config.business.targetWeeklyRevenue) * 100;
  console.log(`📈 Target Achievement: ${percent.toFixed(1)}%`);
}

async function reviewTopDeals() {
  console.log('\n🎯 TOP DEALS\n');

  const deals = dealQueries.getByStatus('discovered').sort((a: Deal, b: Deal) => b.opportunityScore - a.opportunityScore).slice(0, 10);

  if (deals.length === 0) {
    console.log('No deals available.');
    return;
  }

  deals.forEach((deal: Deal, i: number) => {
    console.log(`${i + 1}. ${deal.title}`);
    console.log(`   Source: ${deal.sourceType}`);
    console.log(`   Cost: $${deal.acquisitionCost.toFixed(2)} → Market: $${deal.estimatedMarketPrice.toFixed(2)}`);
    console.log(`   Profit: $${deal.profitEstimate.toFixed(2)} | Margin: ${deal.marginPercent.toFixed(1)}%`);
    console.log(`   Score: ${deal.opportunityScore.toFixed(2)}\n`);
  });

  const select = await prompt('Select deal # to approve (or Enter to skip): ');

  if (select.trim() && !isNaN(parseInt(select))) {
    const idx = parseInt(select) - 1;
    if (deals[idx]) {
      const inv = await operationsAgent.recordPurchase(deals[idx]);
      console.log(`✅ Purchased! SKU: ${inv.sku}`);
    }
  }
}

async function manageInventory() {
  console.log('\n📦 INVENTORY MANAGEMENT\n');

  const inventory = inventoryQueries.getByLocation('at-home');

  if (inventory.length === 0) {
    console.log('No items in inventory.');
    return;
  }

  console.log('Current Inventory:');
  inventory.forEach((item: Inventory, i: number) => {
    console.log(`${i + 1}. SKU ${item.sku} - Status: ${item.status}`);
  });

  const listNew = await prompt('\nCreate listing? (y/n): ');

  if (listNew.toLowerCase() === 'y' && inventory.length > 0) {
    const channel = await prompt('Channel (ebay/amazon-fba/b2b): ');
    const priceStr = await prompt('List price: $');

    if (!isNaN(parseFloat(priceStr))) {
      await operationsAgent.createListing(inventory[0], channel as any, parseFloat(priceStr));
      console.log('✅ Listing created!');
    }
  }
}

async function showWeeklyReport() {
  console.log('\n📋 WEEKLY REPORT\n');

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const kpi = await operationsAgent.getWeeklyPerformance(weekStart, weekEnd);

  if (!kpi) {
    console.log('No sales data available.');
    return;
  }

  console.log(`Period: ${weekStart.toDateString()} - ${weekEnd.toDateString()}\n`);
  console.log(`Total Revenue: $${kpi.totalRevenue.toFixed(2)}`);
  console.log(`Total Profit: $${kpi.totalProfit.toFixed(2)}`);
  console.log(`Profit Margin: ${kpi.avgMarginPercent.toFixed(1)}%`);
  console.log(`Items Sold: ${kpi.itemsSold}`);
  console.log(`Target Achievement: ${((kpi.totalProfit / config.business.targetWeeklyRevenue) * 100).toFixed(1)}%\n`);

  console.log('By Channel:');
  Object.entries(kpi.channelBreakdown).forEach(([channel, data]: [string, { profit: number; itemsSold: number; revenue: number }]) => {
    console.log(`  ${channel}: $${data.profit.toFixed(2)} profit (${data.itemsSold} items)`);
  });

  if (kpi.totalProfit > 0) {
    const rec = await ceoAgent.strategicDecision(kpi);
    console.log(`\n🎯 CEO Recommendation:\n${rec}`);
  }
}
