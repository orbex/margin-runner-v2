import fetch from 'node-fetch';
import { RawDeal } from './dealScorer.js';
import { loadSettings, DEFAULT_SCRAPER_STATES } from '../settings.js';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

import { scrapeWalmartClearance } from './walmartScraper.js';
import { scrapeTargetClearance } from './targetScraper.js';
import { scrapeLiquidationDeals } from './liquidationScraper.js';
import { scrapeRestpostenDeals } from './restpostenScraper.js';
import { scrapeBolcomDeals } from './bolcomScraper.js';
import { scrapeTweedehandsDeals } from './tweedehandsScraper.js';

function isEnabled(id: string): boolean {
  const settings = loadSettings();
  const states = { ...DEFAULT_SCRAPER_STATES, ...settings.scrapers };
  return states[id] ?? true;
}

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
      return prices.length > 0 ? median(prices) : null;
    } catch {
      return null;
    }
  }

  private async fetchAmazonPrice(title: string): Promise<number | null> {
    try {
      const searchTerm = encodeURIComponent(title.split(' ').slice(0, 3).join(' '));
      const response = await fetch(`https://www.amazon.com/s?k=${searchTerm}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const html = await response.text();
      const priceMatches = html.match(/\$[\d,]+\.?\d{0,2}/g);
      if (!priceMatches || priceMatches.length === 0) return null;
      const prices = priceMatches
        .map(p => parseFloat(p.replace(/[$,]/g, '')))
        .filter(p => p > 5 && p < 10000);
      return prices.length > 0 ? median(prices) : null;
    } catch {
      return null;
    }
  }
}

export class Scraper {
  async scrapeWalmartClearance(): Promise<RawDeal[]> {
    if (!isEnabled('walmart')) { console.log('[scrapers] Walmart disabled, skipping'); return []; }
    console.log('Scraping Walmart clearance...');
    return scrapeWalmartClearance();
  }

  async scrapeTargetClearance(): Promise<RawDeal[]> {
    if (!isEnabled('target')) { console.log('[scrapers] Target disabled, skipping'); return []; }
    console.log('Scraping Target clearance...');
    return scrapeTargetClearance();
  }

  async scrapeLiquidationSites(): Promise<RawDeal[]> {
    if (!isEnabled('liquidation')) { console.log('[scrapers] Liquidation.com disabled, skipping'); return []; }
    console.log('Scraping Liquidation.com...');
    return scrapeLiquidationDeals();
  }

  async scrapeRestposten(): Promise<RawDeal[]> {
    if (!isEnabled('restposten')) { console.log('[scrapers] Restposten.de disabled, skipping'); return []; }
    console.log('Scraping Restposten.de...');
    return scrapeRestpostenDeals();
  }

  async scrapeBolcom(): Promise<RawDeal[]> {
    if (!isEnabled('bolcom')) { console.log('[scrapers] Bol.com disabled, skipping'); return []; }
    console.log('Scraping Bol.com...');
    return scrapeBolcomDeals();
  }

  async scrapeTweedehands(): Promise<RawDeal[]> {
    if (!isEnabled('tweedehands')) { console.log('[scrapers] 2dehands disabled, skipping'); return []; }
    console.log('Scraping 2dehands...');
    return scrapeTweedehandsDeals();
  }

  async runAllScrapers(): Promise<RawDeal[]> {
    const results = await Promise.allSettled([
      this.scrapeWalmartClearance(),
      this.scrapeTargetClearance(),
      this.scrapeLiquidationSites(),
      this.scrapeRestposten(),
      this.scrapeBolcom(),
      this.scrapeTweedehands(),
    ]);

    return results
      .filter((r): r is PromiseFulfilledResult<RawDeal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}

export const scraper = new Scraper();
export const priceLookup = new PriceLookup();
