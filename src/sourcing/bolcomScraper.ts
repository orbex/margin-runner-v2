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

// Parse Dutch price format: "49,95" → 49.95, "1.299,00" → 1299
function parseEuroPrice(text: string): number {
  const cleaned = text.trim()
    .replace(/[€\s]/g, "")
    .replace(/\.(?=\d{3})/g, "")   // strip thousands dots
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

// Parse the bol.com accessible price span:
// "De prijs van dit product is '44' euro en '99' cent" → 44.99
function parseAccessiblePrice(text: string): number {
  const m = text.match(/'(\d+)'\s+euro\s+en\s+'(\d+)'\s+cent/i);
  if (m) return parseFloat(`${m[1]}.${m[2]}`);
  // fallback: just grab first number with optional comma-decimal
  const m2 = text.match(/(\d+)[,.](\d{2})/);
  if (m2) return parseFloat(`${m2[1]}.${m2[2]}`);
  return 0;
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

      // Each product has a title link: <a href="/nl/nl/p/..."><h2>…</h2></a>
      const titleLinks = $(`a[href*="/${country.toLowerCase()}/p/"] h2`).toArray();

      if (titleLinks.length === 0) {
        console.log(`[bolcom] No items on ${country} page ${page}`);
        break;
      }

      for (const h2El of titleLinks) {
        try {
          const $h2 = $(h2El);
          const title = $h2.text().trim();
          if (!title) continue;

          // The <a> wrapping the h2 carries the product URL
          const $link = $h2.closest("a");
          const href = $link.attr("href") ?? "";
          const sourceUrl = href.startsWith("http") ? href : `${base}${href}`;

          // Walk up to the card root — the div that contains both the image and the price block
          const $card = $link.closest("div[class*='grid-cols']").parent().parent();

          // Current (outlet) price — bol.com puts the price in an accessible hidden span:
          // "De prijs van dit product is '44' euro en '99' cent"
          const priceSpanText = $card.find("span").filter((_, el) =>
            $(el).text().includes("euro en")
          ).first().text();
          const acquisitionCost = parseAccessiblePrice(priceSpanText);

          // Retail (was) price — in a <s aria-hidden="true"> strikethrough element
          const retailText = $card.find("s[aria-hidden='true']").first().text();
          const retailPrice = parseEuroPrice(retailText);

          if (!acquisitionCost || !retailPrice) continue;
          if (retailPrice <= acquisitionCost) continue;

          const discountPct = ((retailPrice - acquisitionCost) / retailPrice) * 100;
          if (discountPct < MIN_DISCOUNT_PCT) continue;

          const imgSrc = $card.find("img[src*='media.s-bol.com']").first().attr("src")
            ?? $card.find("img").first().attr("src");

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
      }

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
