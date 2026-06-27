/**
 * Restposten.de Scraper — Germany
 *
 * Restposten.de is a B2B/B2C liquidation marketplace for surplus and
 * clearance stock, popular in the DACH region (Germany, Austria, Switzerland).
 * Listings include original retail price and the asking price, making
 * margin calculation straightforward.
 *
 * Strategy: axios + cheerio on server-rendered category pages.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { type RawDeal } from "./dealScorer.js";

const BASE_URL = "https://www.restposten.de";

const CATEGORIES = [
  { path: "/rubrik/elektronik/", label: "Elektronik" },
  { path: "/rubrik/haushalt-kueche/", label: "Haushalt & Küche" },
  { path: "/rubrik/spielzeug/", label: "Spielzeug" },
  { path: "/rubrik/sport-freizeit/", label: "Sport & Freizeit" },
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
  Accept: "text/html,application/xhtml+xml",
};

const MIN_DISCOUNT_PCT = 30;
const MAX_PAGES = 2;

function parseDollar(text: string): number {
  const m = text.match(/([\d.]+(?:,\d{1,2})?)\s*€/);
  if (!m) return 0;
  // German number format: 1.234,56 → 1234.56
  return parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

async function scrapeCategory(path: string, label: string): Promise<RawDeal[]> {
  const deals: RawDeal[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1
      ? `${BASE_URL}${path}`
      : `${BASE_URL}${path}?page=${page}`;

    try {
      console.log(`[restposten] Fetching ${label} page ${page}…`);
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 15_000 });
      const $ = cheerio.load(data);

      const cards = $(".artikel-liste .artikel, .product-item, .listing-item, article.product");

      if (cards.length === 0) {
        console.log(`[restposten] No items found on ${label} page ${page}`);
        break;
      }

      cards.each((_, el) => {
        try {
          const title = $(el).find(".artikel-titel, .product-title, h2, h3").first().text().trim();
          if (!title) return;

          const href = $(el).find("a").first().attr("href") ?? "";
          const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

          const priceText = $(el).find(".preis, .price, .asking-price").first().text();
          const retailText = $(el).find(".vk-preis, .retail-price, .uvp, .original-price").first().text();
          const imgSrc = $(el).find("img").first().attr("src") ?? $(el).find("img").first().attr("data-src");

          const acquisitionCost = parseDollar(priceText);
          const retailPrice = parseDollar(retailText);

          if (!acquisitionCost || !retailPrice) return;
          if (retailPrice <= acquisitionCost) return;

          const discountPct = ((retailPrice - acquisitionCost) / retailPrice) * 100;
          if (discountPct < MIN_DISCOUNT_PCT) return;

          deals.push({
            title,
            sourceUrl,
            sourceType: "liquidation",
            acquisitionCost,
            retailPrice,
            imageUrl: imgSrc ? (imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`) : undefined,
          });
        } catch {
          // skip malformed card
        }
      });

      console.log(`[restposten] ${label} page ${page}: ${deals.length} deals so far`);
      await sleep(1500 + Math.random() * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[restposten] Error on ${label} page ${page}: ${msg}`);
      break;
    }
  }

  return deals;
}

export async function scrapeRestpostenDeals(): Promise<RawDeal[]> {
  const all: RawDeal[] = [];

  for (const { path, label } of CATEGORIES) {
    const deals = await scrapeCategory(path, label);
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
