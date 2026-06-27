import cron from 'cron';
import { config } from './config.js';
import { sourcingAgent } from './agents/sourcingAgent.js';
import { ceoAgent } from './agents/ceoAgent.js';
import { operationsAgent } from './agents/operationsAgent.js';
import { dealQueries } from './db/queries.js';

export class Scheduler {
  private jobs: cron.CronJob[] = [];

  start() {
    console.log('⏰ Starting scheduler...\n');

    this.scheduleSourcingCheck();
    this.scheduleCEOReview();
    this.scheduleOperationsReconciliation();
  }

  private scheduleSourcingCheck() {
    const interval = config.scheduling.sourcingCheckIntervalMinutes;
    const cronExpression = `0 */${interval} * * * *`;

    const job = new cron.CronJob(cronExpression, async () => {
      console.log(`\n🔍 [${new Date().toISOString()}] Running scheduled sourcing check...`);
      try {
        const deals = await sourcingAgent.discoverAndScoreManyDeals();
        if (deals.length > 0) {
          console.log(`✓ Found ${deals.length} new qualified deals`);
        }
      } catch (error) {
        console.error('Sourcing check failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log(`✓ Sourcing check scheduled every ${interval} minutes`);
  }

  private scheduleCEOReview() {
    const hour = config.scheduling.ceoReviewHour;
    const cronExpression = `0 ${hour} * * *`;

    const job = new cron.CronJob(cronExpression, async () => {
      console.log(`\n👔 [${new Date().toISOString()}] CEO Daily Review...`);
      try {
        const topDeals = dealQueries.getByStatus('discovered').sort((a, b) => b.opportunityScore - a.opportunityScore);

        if (topDeals.length > 0) {
          const approved = await ceoAgent.reviewAndApproveDeals(topDeals);
          console.log(`✓ CEO approved ${approved.length} deals`);
        } else {
          console.log('No pending deals for CEO review');
        }
      } catch (error) {
        console.error('CEO review failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log(`✓ CEO review scheduled daily at ${hour}:00`);
  }

  private scheduleOperationsReconciliation() {
    const hour = config.scheduling.operationsReconcileHour;
    const cronExpression = `0 ${hour} * * *`;

    const job = new cron.CronJob(cronExpression, async () => {
      console.log(`\n📊 [${new Date().toISOString()}] Operations Reconciliation...`);
      try {
        const report = await operationsAgent.generateDailyReport();
        console.log(`✓ Daily report generated:`, report);

        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const kpi = await operationsAgent.getWeeklyPerformance(weekStart, weekEnd);
        if (kpi && kpi.itemsSold > 0) {
          console.log(`Weekly profit: $${kpi.totalProfit.toFixed(2)} (Target: $${config.business.targetWeeklyRevenue})`);
        }
      } catch (error) {
        console.error('Operations reconciliation failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log(`✓ Operations reconciliation scheduled daily at ${hour}:00`);
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    console.log('✓ Scheduler stopped');
  }
}

export const scheduler = new Scheduler();
