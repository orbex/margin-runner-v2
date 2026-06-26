import { config } from '../config.js';
import { getLLMProvider } from '../llm/provider.js';
import { Deal, WeeklyKPI } from '../types/index.js';
import { dealQueries, agentDecisionQueries, saleQueries } from '../db/queries.js';

export class CEOAgent {
  async reviewAndApproveDeals(topDeals: Deal[]): Promise<Deal[]> {
    const dealsJson = JSON.stringify(
      topDeals.slice(0, 10).map(d => ({
        title: d.title,
        acquisitionCost: d.acquisitionCost,
        marketPrice: d.estimatedMarketPrice,
        profitEstimate: d.profitEstimate,
        marginPercent: d.marginPercent.toFixed(1),
        opportunityScore: d.opportunityScore.toFixed(2),
        source: d.sourceType,
      })),
      null,
      2
    );

    const responseText = await getLLMProvider().chat(
      `You are the CEO of an arbitrage reselling business. Your role is to review sourced deals and decide which ones to approve for purchase.

Consider:
- Profit margin (need >20%)
- Opportunity score (how likely to sell quickly at good margin)
- Feasibility (shipping costs, weight, demand)
- Portfolio balance (mix of items across price ranges)

Respond with a JSON array of indices (0-based) of deals you approve.`,
      `Review these top 10 deals and approve promising ones:\n${dealsJson}`,
      1024
    );
    const jsonMatch = responseText.match(/\[[\d,\s]*\]/);

    if (!jsonMatch) {
      console.log('CEO approved top 5 deals by default');
      return topDeals.slice(0, 5);
    }

    try {
      const approvedIndices: number[] = JSON.parse(jsonMatch[0]);
      const approvedDeals = approvedIndices.map(i => topDeals[i]).filter(Boolean);

      const decisionId = agentDecisionQueries.insert({
        agent: 'ceo',
        action: 'approved_deals',
        reasoning: `Reviewed ${topDeals.length} deals, approved ${approvedDeals.length}`,
        timestamp: new Date(),
        status: 'executed',
      });

      console.log(`✓ CEO approved ${approvedDeals.length} deals (Decision: ${decisionId})`);
      return approvedDeals;
    } catch {
      return topDeals.slice(0, 5);
    }
  }

  async generateWeeklyReport(startDate: Date, endDate: Date): Promise<WeeklyKPI | null> {
    const sales = saleQueries.getByDateRange(startDate, endDate);
    const totalData = saleQueries.getTotalWeekly(startDate, endDate);
    const channelData = saleQueries.getWeeklySummary(startDate, endDate);

    if (!totalData || totalData.itemsSold === 0) {
      return null;
    }

    const channelBreakdown = {
      ebay: { revenue: 0, profit: 0, itemsSold: 0 },
      amazonFba: { revenue: 0, profit: 0, itemsSold: 0 },
      b2b: { revenue: 0, profit: 0, itemsSold: 0 },
    };

    channelData.forEach((row: any) => {
      const channel = row.channel as keyof typeof channelBreakdown;
      if (channel in channelBreakdown) {
        channelBreakdown[channel] = {
          revenue: row.revenue || 0,
          profit: row.profit || 0,
          itemsSold: row.itemsSold || 0,
        };
      }
    });

    const kpi: WeeklyKPI = {
      weekStart: startDate,
      weekEnd: endDate,
      totalRevenue: totalData.revenue || 0,
      totalProfit: totalData.profit || 0,
      totalCost: (totalData.revenue || 0) - (totalData.profit || 0),
      avgMarginPercent: totalData.itemsSold > 0 ? ((totalData.profit || 0) / (totalData.revenue || 1)) * 100 : 0,
      itemsSourced: 0,
      itemsListed: 0,
      itemsSold: totalData.itemsSold || 0,
      turnoverRate: totalData.itemsSold || 0,
      targetAchieved: (totalData.profit || 0) >= config.business.targetWeeklyRevenue * 0.5,
      channelBreakdown,
    };

    return kpi;
  }

  async strategicDecision(kpi: WeeklyKPI): Promise<string> {
    const revenueGap = config.business.targetWeeklyRevenue - kpi.totalProfit;
    const performancePercent = (kpi.totalProfit / config.business.targetWeeklyRevenue) * 100;

    const recommendation = await getLLMProvider().chat(
      `You are the CEO. Based on weekly performance, provide strategic recommendations in 2-3 sentences. Focus on actionable changes.`,
      `Weekly Performance:
- Revenue Goal: $${config.business.targetWeeklyRevenue}
- Actual Profit: $${kpi.totalProfit.toFixed(2)}
- Target Achievement: ${performancePercent.toFixed(1)}%
- Items Sold: ${kpi.itemsSold}
- Best Channel: ${Object.entries(kpi.channelBreakdown).sort((a, b) => b[1].profit - a[1].profit)[0][0]}

What should we do?`,
      500
    ) || 'Keep current strategy';

    agentDecisionQueries.insert({
      agent: 'ceo',
      action: 'strategic_recommendation',
      reasoning: `Performance: ${performancePercent.toFixed(1)}% of target. ${revenueGap > 0 ? `Need $${revenueGap.toFixed(2)} more.` : 'Target achieved!'}`,
      timestamp: new Date(),
      status: 'executed',
      result: recommendation,
    });

    return recommendation;
  }
}

export const ceoAgent = new CEOAgent();
