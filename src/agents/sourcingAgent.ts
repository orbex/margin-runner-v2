import { config } from '../config.js';
import { getLLMProvider } from '../llm/provider.js';
import { Deal } from '../types/index.js';
import { dealScorer, RawDeal } from '../sourcing/dealScorer.js';
import { scraper, priceLookup } from '../sourcing/scrapers.js';
import { dealQueries, agentDecisionQueries } from '../db/queries.js';

export class SourcingAgent {
  async discoverAndScoreManyDeals(): Promise<Deal[]> {
    console.log('🔍 Sourcing Agent: Discovering deals...');

    const rawDeals = await scraper.runAllScrapers();
    console.log(`Found ${rawDeals.length} potential deals`);

    const scoredDeals: Deal[] = [];

    for (const raw of rawDeals) {
      const scored = dealScorer.scoreDeal(raw);

      if (scored.marginPercent >= config.business.minMarginPercent) {
        const id = dealQueries.insert(scored);
        scoredDeals.push({ ...scored, id });
      }
    }

    console.log(`✓ Scored ${scoredDeals.length} deals meeting ${config.business.minMarginPercent}% margin threshold`);

    agentDecisionQueries.insert({
      agent: 'sourcing',
      action: 'discovered_deals',
      reasoning: `Ran all scrapers and scored ${rawDeals.length} items, ${scoredDeals.length} met profit threshold`,
      timestamp: new Date(),
      status: 'executed',
    });

    return scoredDeals;
  }

  async rankDeals(deals: Deal[]): Promise<Deal[]> {
    if (deals.length === 0) return [];

    const dealsJson = JSON.stringify(
      deals.map(d => ({
        id: d.id,
        title: d.title,
        margin: d.marginPercent.toFixed(1),
        profit: d.profitEstimate.toFixed(2),
        demand: d.demandScore.toFixed(2),
        feasibility: d.feasibilityScore.toFixed(2),
        source: d.sourceType,
      })),
      null,
      2
    );

    const responseText = await getLLMProvider().chat(
      `You are a sourcing expert. Rank these deals by profitability and likelihood of success.
Return a JSON array of deal IDs ordered from best to worst.
Consider: profit potential, demand, feasibility, and balance.`,
      `Rank these deals:\n${dealsJson}`,
      1024
    );
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);

    if (jsonMatch) {
      try {
        const rankedIds: string[] = JSON.parse(jsonMatch[0]);
        const ranked = rankedIds.map(id => deals.find(d => d.id === id)).filter(Boolean) as Deal[];

        agentDecisionQueries.insert({
          agent: 'sourcing',
          action: 'ranked_deals',
          reasoning: `Ranked ${deals.length} deals by AI scoring`,
          timestamp: new Date(),
          status: 'executed',
        });

        return ranked.length > 0 ? ranked : deals.sort((a, b) => b.opportunityScore - a.opportunityScore);
      } catch {
        return deals.sort((a, b) => b.opportunityScore - a.opportunityScore);
      }
    }

    return deals.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  async identifyArbitrageClusters(): Promise<Map<string, Deal[]>> {
    const deals = dealQueries.getByStatus('discovered');

    const clusters = new Map<string, Deal[]>();

    deals.forEach(deal => {
      if (!clusters.has(deal.sourceType)) {
        clusters.set(deal.sourceType, []);
      }
      clusters.get(deal.sourceType)!.push(deal);
    });

    console.log(`✓ Identified ${clusters.size} deal clusters`);

    return clusters;
  }
}

export const sourcingAgent = new SourcingAgent();
