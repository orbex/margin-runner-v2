import fetch from 'node-fetch';
import { RawDeal } from './dealScorer.js';
import { scrapeWalmartClearance } from './walmartScraper.js';
import { scrapeTargetClearance } from './targetScraper.js';
import { scrapeLiquidationDeals } from './liquidationScraper.js';

export class PriceLookup {
  async getMarketPrice(title: string, retailPrice: number): Promise<number> {
    try {
      const searchTerm = encodeURIComponent(title.split(' ').slice(0, 5).join(' '));

      const ebayPrice = await this.fetchEbayPrice(searchTerm);
      if (ebayPrice) return ebayPrice;

      const amazonPrice = await this.fetchAmazonPrice(title);
      if (amazonPrice) return amazonPrice;

      return retailPrice * 0.85;
    } catch (error) {
      console.error('Price lookup error:', error);
      return retailPrice * 0.85;
    }
  }

  private async fetchEbayPrice(searchTerm: string): Promise<number | null> {
    try {
      const response = await fetch(
        `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0&SECURITY-APPNAME=YourAppID&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${searchTerm}&sortOrder=EndTimeSoonest&paginationInput.entriesPerPage=5`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) return null;

      const data = await response.json() as any;
      const items = data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item;

      if (!items || items.length === 0) return null;

      const prices = items
        .map((item: any) => parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || '0'))
        .filter((p: number) => p > 0);

      return prices.length > 0 ? Math.median(prices) : null;
    } catch (error) {
      return null;
    }
  }

  private async fetchAmazonPrice(title: string): Promise<number | null> {
    try {
      const searchTerm = encodeURIComponent(title.split(' ').slice(0, 3).join(' '));
      const response = await fetch(
        `https://www.amazon.com/s?k=${searchTerm}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) return null;

      const html = await response.text();
      const priceMatches = html.match(/\$[\d,]+\.?\d{0,2}/g);

      if (!priceMatches || priceMatches.length === 0) return null;

      const prices = priceMatches
        .map(p => parseFloat(p.replace(/[$,]/g, '')))
        .filter(p => p > 5 && p < 10000);

      return prices.length > 0 ? Math.median(prices) : null;
    } catch (error) {
      return null;
    }
  }
}

export class Scraper {
  async scrapeWalmartClearance(): Promise<RawDeal[]> {
    console.log('Scraping Walmart clearance...');
    return scrapeWalmartClearance();
  }

  async scrapeTargetClearance(): Promise<RawDeal[]> {
    console.log('Scraping Target clearance...');
    return scrapeTargetClearance();
  }

  async scrapeLiquidationSites(): Promise<RawDeal[]> {
    console.log('Scraping liquidation sites...');
    return scrapeLiquidationDeals();
  }

  async scrapeEbayOutlet(): Promise<RawDeal[]> {
    console.log('Scraping eBay Outlet (demo)...');
    return [
      {
        title: 'Canon EOS R100 Mirrorless Camera',
        sourceUrl: 'https://ebay.com/outlet',
        sourceType: 'ebay-outlet',
        acquisitionCost: 600,
        retailPrice: 799,
        weight: 1.2,
        imageUrl: 'https://via.placeholder.com/200?text=Canon+Camera',
      },
    ];
  }

  async scrapeCouponStackingSites(): Promise<RawDeal[]> {
    console.log('Scraping coupon sites (demo)...');
    return [
      {
        title: 'Instant Pot Duo 7-in-1',
        sourceUrl: 'https://slickdeals.net',
        sourceType: 'other',
        acquisitionCost: 45,
        retailPrice: 99.95,
        weight: 3,
        imageUrl: 'https://via.placeholder.com/200?text=Instant+Pot',
      },
    ];
  }

  async runAllScrapers(): Promise<RawDeal[]> {
    const deals = await Promise.all([
      this.scrapeWalmartClearance(),
      this.scrapeTargetClearance(),
      this.scrapeLiquidationSites(),
      this.scrapeEbayOutlet(),
      this.scrapeCouponStackingSites(),
    ]);
    return deals.flat();
  }
}

export const scraper = new Scraper();
export const priceLookup = new PriceLookup();

declare global {
  interface Array<T> {
    median(): T extends number ? number : never;
  }
}

if (!Array.prototype.median) {
  Array.prototype.median = function () {
    const sorted = [...this].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
}
