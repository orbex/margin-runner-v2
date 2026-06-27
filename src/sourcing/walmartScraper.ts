/**
 * Walmart Clearance Scraper
 *
 * Strategy: Walmart's clearance shelf renders its product grid via an internal
 * GraphQL-style JSON endpoint (/api/2/pages/browse). We hit that endpoint
 * directly with a browser-like User-Agent and parse the embedded product JSON.
 * No headless browser needed — Cheerio only.
 *
 * Drop-in replacement for the stub in retailerScraper.ts.
 * Returns RawDeal[] matching the existing project interface.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { type RawDeal } from "./dealScorer.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

// Clearance category page URLs to scrape. Add / remove as needed.
const CLEARANCE_URLS: Array<{ url: string; category: string }> = [
  {
    url: "https://www.walmart.com/browse/electronics/clearance/3944_1229722_1229760",
    category: "Electronics",
  },
  {
    url: "https://www.walmart.com/browse/home/clearance/4044_133032_2072648",
    category: "Home",
  },
  {
    url: "https://www.walmart.com/browse/toys/clearance/4171_1249140_1246336",
    category: "Toys",
  },
  {
    url: "https://www.walmart.com/browse/clothing/clearance/5438_1045801",
    category: "Clothing",
  },
];

// Only surface deals above this minimum discount threshold
const MIN_DISCOUNT_PCT = 20;

// Max pages to scrape per category (each page ~ 40 items)
const MAX_PAGES = 3;

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Walmart embeds a __NEXT_DATA__ JSON blob in the HTML that contains the full
 * product grid. We parse that rather than CSS-selecting rendered DOM nodes,
 * which is far more stable across UI changes.
 */
function extractNextData(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  const scriptText = $("#__NEXT_DATA__").html();
  if (!scriptText) return null;
  try {
    return JSON.parse(scriptText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeGet(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function parseProducts(
  nextData: Record<string, unknown>,
  category: string,
  baseUrl: string
): RawDeal[] {
  const deals: RawDeal[] = [];

  // Navigate to the product items array deep inside pageProps
  // Path varies slightly by page type; we try two known paths
  const paths = [
    ["props", "pageProps", "initialData", "searchResult", "itemStacks", "0", "items"],
    ["props", "pageProps", "initialData", "contentLayout", "modules"],
  ];

  let items: unknown[] = [];
  for (const path of paths) {
    const result = safeGet(nextData, path);
    if (Array.isArray(result)) {
      items = result;
      break;
    }
  }

  if (items.length === 0) return deals;

  for (const item of items) {
    try {
      const i = item as Record<string, unknown>;

      // Skip sponsored / non-product entries
      if (!i.usItemId && !i.id) continue;

      const id = (i.usItemId ?? i.id ?? "") as string;
      const name = (i.name ?? i.title ?? "") as string;
      if (!name) continue;

      // Price objects
      const priceInfo = i.priceInfo as Record<string, unknown> | undefined;
      const currentPrice =
        (safeGet(priceInfo, ["currentPrice", "price"]) as number) ?? 0;
      const wasPrice =
        (safeGet(priceInfo, ["wasPrice", "price"]) as number) ??
        (safeGet(priceInfo, ["listPrice", "price"]) as number) ??
        0;

      if (!currentPrice || !wasPrice || wasPrice <= currentPrice) continue;

      const discountPct = Math.round(((wasPrice - currentPrice) / wasPrice) * 100);
      if (discountPct < MIN_DISCOUNT_PCT) continue;

      // Stock
      const imageUrl = (
        safeGet(i, ["imageInfo", "thumbnailUrl"]) as string | undefined
      ) ?? undefined;

      deals.push({
        title: name,
        sourceUrl: `https://www.walmart.com/ip/${id}`,
        sourceType: "walmart",
        acquisitionCost: currentPrice,
        retailPrice: wasPrice,
        imageUrl,
      });
    } catch {
      // Skip malformed items silently
    }
  }

  return deals;
}

// ── Main scraper function ─────────────────────────────────────────────────────

export async function scrapeWalmartClearance(): Promise<RawDeal[]> {
  const allDeals: RawDeal[] = [];

  for (const { url, category } of CLEARANCE_URLS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageUrl = page === 1 ? url : `${url}?page=${page}&affinityOverride=default`;

      try {
        console.log(`[walmart] Fetching ${category} page ${page}…`);

        const response = await axios.get(pageUrl, {
          headers: BASE_HEADERS,
          timeout: 15_000,
          maxRedirects: 5,
        });

        const nextData = extractNextData(response.data as string);
        if (!nextData) {
          console.warn(`[walmart] No __NEXT_DATA__ found on ${pageUrl}`);
          break;
        }

        const pageDeals = parseProducts(nextData, category, url);

        if (pageDeals.length === 0) {
          console.log(`[walmart] No more items on page ${page}, stopping.`);
          break;
        }

        allDeals.push(...pageDeals);
        console.log(`[walmart] Found ${pageDeals.length} deals on ${category} page ${page}`);

        // Polite delay between pages
        await sleep(1500 + Math.random() * 1000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[walmart] Error on ${category} page ${page}: ${msg}`);
        // Don't abort entire run — skip to next category
        break;
      }
    }

    // Slightly longer pause between categories
    await sleep(2500 + Math.random() * 1500);
  }

  // Deduplicate by SKU (same item can appear in multiple categories)
  const seen = new Set<string>();
  return allDeals.filter((d) => {
    if (seen.has(d.sourceUrl)) return false;
    seen.add(d.sourceUrl);
    return true;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
