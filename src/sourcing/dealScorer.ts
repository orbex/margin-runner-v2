import { Deal } from '../types/index.js';
import { config } from '../config.js';

export interface RawDeal {
  title: string;
  description?: string;
  sourceUrl: string;
  sourceType: 'walmart' | 'target' | 'liquidation' | 'ebay-outlet' | 'other';
  acquisitionCost: number;
  retailPrice: number;
  weight?: number;
  dimensions?: string;
  imageUrl?: string;
}

export class DealScorer {
  scoreDeal(rawDeal: RawDeal): Omit<Deal, 'id'> {
    const shippingCost = this.estimateShipping(rawDeal.weight);
    const totalCost = rawDeal.acquisitionCost + shippingCost;
    const estimatedMarketPrice = this.estimateMarketPrice(rawDeal);
    const profitEstimate = estimatedMarketPrice - totalCost;
    const marginPercent = (profitEstimate / estimatedMarketPrice) * 100;

    const demandScore = this.calculateDemandScore(rawDeal.title, rawDeal.retailPrice);
    const feasibilityScore = this.calculateFeasibilityScore(rawDeal);
    const opportunityScore = (marginPercent / 100) * demandScore * feasibilityScore;

    return {
      title: rawDeal.title,
      description: rawDeal.description,
      sourceUrl: rawDeal.sourceUrl,
      sourceType: rawDeal.sourceType,
      acquisitionCost: rawDeal.acquisitionCost,
      retailPrice: rawDeal.retailPrice,
      estimatedMarketPrice,
      marginPercent: Math.max(0, marginPercent),
      profitEstimate: Math.max(0, profitEstimate),
      shippingCost,
      weight: rawDeal.weight,
      dimensions: rawDeal.dimensions,
      imageUrl: rawDeal.imageUrl,
      demandScore,
      feasibilityScore,
      opportunityScore,
      status: 'discovered',
      discoveredAt: new Date(),
    };
  }

  private estimateShipping(weight?: number): number {
    if (!weight) return config.business.shippingCostEstimate.medium;
    if (weight < 2) return config.business.shippingCostEstimate.light;
    if (weight < 5) return config.business.shippingCostEstimate.medium;
    return config.business.shippingCostEstimate.heavy;
  }

  private estimateMarketPrice(deal: RawDeal): number {
    const discount = deal.retailPrice - deal.acquisitionCost;
    const discountPercent = (discount / deal.retailPrice) * 100;

    if (discountPercent > 80) return deal.retailPrice * 0.8;
    if (discountPercent > 50) return deal.retailPrice * 0.7;
    if (discountPercent > 30) return deal.retailPrice * 0.85;
    return deal.retailPrice * 0.9;
  }

  private calculateDemandScore(title: string, price: number): number {
    const title_lower = title.toLowerCase();

    const highDemandKeywords = [
      'electronics', 'smartphone', 'laptop', 'console', 'camera',
      'brand name', 'popular', 'trending', 'new',
    ];

    const lowDemandKeywords = [
      'niche', 'used', 'damaged', 'recalled', 'vintage',
    ];

    let score = 0.5;

    highDemandKeywords.forEach(keyword => {
      if (title_lower.includes(keyword)) score += 0.1;
    });

    lowDemandKeywords.forEach(keyword => {
      if (title_lower.includes(keyword)) score -= 0.1;
    });

    if (price > 100) score += 0.15;
    if (price > 500) score += 0.1;

    return Math.min(1, Math.max(0, score));
  }

  private calculateFeasibilityScore(deal: RawDeal): number {
    let score = 0.7;

    if (deal.weight && deal.weight > 20) score -= 0.2;
    if (deal.sourceType === 'walmart' || deal.sourceType === 'target') score += 0.2;
    if (deal.sourceType === 'liquidation') score += 0.1;

    if (deal.acquisitionCost < 10) score -= 0.1;
    if (deal.acquisitionCost > 500) score -= 0.15;

    return Math.min(1, Math.max(0, score));
  }
}

export const dealScorer = new DealScorer();
