/**
 * Bol.com Scraper — Netherlands & Belgium
 *
 * Bol.com is the dominant online retailer in the Netherlands and Belgium
 * (similar to Amazon). Their deals/sale pages list items with original
 * and discounted prices. We scrape both NL and BE storefronts.
 *
 * Strategy: axios + cheerio. Bol.com embeds product data in server-rendered
 * HTML and uses a `data-test` attribute scheme for key elements.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { type RawDeal } from "./dealScorer.js";

// Outlet sorted by popularity (wishListRank1), paginated via &page=N
const OUTLET_BASE_NL = "https://www.bol.com/nl/nl/ra/outlet/392102/?sort=wishListRank1&page=";
const OUTLET_BASE_BE = "https://www.bol.com/be/nl/ra/outlet/392102/?sort=wishListRank1&page=";

const STOREFRONTS = [
  {
    base: "https://www.bol.com",
    dealsUrl: OUTLET_BASE_NL,
    country: "NL",
    lang: "nl-NL",
  },
  {
    base: "https://www.bol.com",
    dealsUrl: OUTLET_BASE_BE,
    country: "BE",
    lang: "nl-BE",
  },
];

const MIN_DISCOUNT_PCT = 25;
const MAX_PAGES = 2;

function parseEuroPrice(text: string): number {
  // Handles "€ 29,99" and "29.99" and "1.299,00"
  const cleaned = text
    .replace(/[€\s]/g, "")
    .replace(/\.(?=\d{3})/g, "")  // remove thousands separator dots
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

async function scrapeBolStorefront(
  base: string,
  dealsUrl: string,
  country: string,
  lang: string
): Promise<RawDeal[]> {
  const deals: RawDeal[] = [];

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": `${lang},en;q=0.5`,
    Accept: "text/html,application/xhtml+xml",
  };

  for (let page = 1; page <= MAX_PAGES; page++) {
    // dealsUrl already ends with &page= or ?page= — just append the number
    const url = `${dealsUrl}${page}`;

    try {
      console.log(`[bolcom] Fetching ${country} deals page ${page}…`);
      const { data } = await axios.get(url, { headers, timeout: 15_000 });
      const $ = cheerio.load(data);

      // Bol.com product cards use data-test selectors
      const cards = $("[data-test='product-card'], .product-item--row, .js_item_root, li.product-item");

      if (cards.length === 0) {
        console.log(`[bolcom] No items on ${country} page ${page}`);
        break;
      }

      cards.each((_, el) => {
        try {
          const title =
            $(el).find("[data-test='product-title'], .product-title, h3, h4").first().text().trim();
          if (!title) return;

          const href = $(el).find("a[data-test='product-title-link'], a").first().attr("href") ?? "";
          const sourceUrl = href.startsWith("http") ? href : `${base}${href}`;

          const priceEl = $(el).find("[data-test='price-value'], .prijs-sales, .buy-block__price");
          const retailEl = $(el).find("[data-test='from-price'], .prijs-was, .buy-block__list-price");

          const acquisitionCost = parseEuroPrice(priceEl.first().text());
          const retailPrice = parseEuroPrice(retailEl.first().text());

          if (!acquisitionCost || !retailPrice) return;
          if (retailPrice <= acquisitionCost) return;

          const discountPct = ((retailPrice - acquisitionCost) / retailPrice) * 100;
          if (discountPct < MIN_DISCOUNT_PCT) return;

          const imgSrc =
            $(el).find("img[data-test='product-image'], img.product-image").first().attr("src") ??
            $(el).find("img").first().attr("src");

          deals.push({
            title,
            sourceUrl,
            sourceType: "other",
            acquisitionCost,
            retailPrice,
            imageUrl: imgSrc,
          });
        } catch {
          // skip malformed card
        }
      });

      console.log(`[bolcom] ${country} page ${page}: ${deals.length} deals so far`);
      await sleep(1500 + Math.random() * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[bolcom] Error on ${country} page ${page}: ${msg}`);
      break;
    }
  }

  return deals;
}

export async function scrapeBolcomDeals(): Promise<RawDeal[]> {
  const all: RawDeal[] = [];

  for (const sf of STOREFRONTS) {
    const deals = await scrapeBolStorefront(sf.base, sf.dealsUrl, sf.country, sf.lang);
    all.push(...deals);
  }

  const seen = new Set<string>();
  return all.filter(d => {
    if (seen.has(d.sourceUrl)) return false;
    seen.add(d.sourceUrl);
    return true;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
