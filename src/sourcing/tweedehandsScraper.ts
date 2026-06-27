/**
 * 2dehands.be / 2dehands.nl Scraper — Belgium & Netherlands
 *
 * 2dehands.be (Belgium) and 2dehands.nl (Netherlands) are the leading
 * classifieds / secondhand marketplaces in their respective countries,
 * operated by Adevinta (same group as Marktplaats). They use a shared
 * platform with JSON-LD structured data embedded in the HTML, making
 * price extraction reliable without a headless browser.
 *
 * Arbitrage angle: find new/near-new items listed well below retail
 * (sellers who don't know the value), then resell on bol.com or eBay.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { type RawDeal } from "./dealScorer.js";

const STOREFRONTS = [
  {
    base: "https://www.2dehands.be",
    searchUrl: "https://www.2dehands.be/q/",
    country: "BE",
    lang: "nl-BE",
  },
  {
    base: "https://www.2dehands.nl",
    searchUrl: "https://www.2dehands.nl/q/",
    country: "NL",
    lang: "nl-NL",
  },
];

// Search terms mapped to typical retail price for margin estimation.
// 2dehands doesn't have a "retail price" field, so we estimate retail
// from the known market value of the search category.
const SEARCH_TERMS: Array<{ query: string; estimatedRetail: number; category: string }> = [
  { query: "laptop nieuw",          estimatedRetail: 800,  category: "Electronics" },
  { query: "smartphone nieuw",      estimatedRetail: 600,  category: "Electronics" },
  { query: "spelcomputer nieuw",    estimatedRetail: 450,  category: "Gaming" },
  { query: "robot stofzuiger",      estimatedRetail: 300,  category: "Home" },
  { query: "espressomachine nieuw", estimatedRetail: 250,  category: "Home" },
  { query: "lego nieuw sealed",     estimatedRetail: 100,  category: "Toys" },
  { query: "airfryer nieuw",        estimatedRetail: 120,  category: "Home" },
];

const MIN_DISCOUNT_PCT = 35;
const MAX_PAGES = 1;

function parseEuroPrice(text: string): number {
  const m = text.match(/([\d.,]+)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

async function scrapeStorefront(
  base: string,
  searchUrl: string,
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

  for (const { query, estimatedRetail, category } of SEARCH_TERMS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url =
        `${searchUrl}${encodeURIComponent(query)}/` +
        (page > 1 ? `?currentPage=${page}` : "");

      try {
        console.log(`[2dehands] Fetching ${country} "${query}" page ${page}…`);
        const { data } = await axios.get(url, { headers, timeout: 15_000 });
        const $ = cheerio.load(data);

        // Try JSON-LD first (most reliable)
        const jsonLdBlocks = $('script[type="application/ld+json"]');
        let foundViaJsonLd = false;

        jsonLdBlocks.each((_, el) => {
          try {
            const json = JSON.parse($(el).html() ?? "{}");
            const items = json["@type"] === "ItemList"
              ? (json.itemListElement ?? [])
              : [];

            for (const item of items) {
              const offer = item?.item?.offers;
              if (!offer) continue;

              const title = item?.item?.name ?? "";
              const sourceUrl = item?.item?.url ?? base;
              const acquisitionCost = parseFloat(offer.price ?? "0");
              const retailPrice = estimatedRetail;

              if (!acquisitionCost || acquisitionCost >= retailPrice) continue;

              const discountPct = ((retailPrice - acquisitionCost) / retailPrice) * 100;
              if (discountPct < MIN_DISCOUNT_PCT) continue;

              const imageUrl = item?.item?.image?.[0] ?? item?.item?.image ?? undefined;

              deals.push({
                title,
                sourceUrl,
                sourceType: "other",
                acquisitionCost,
                retailPrice,
                imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
              });
              foundViaJsonLd = true;
            }
          } catch {
            // malformed JSON-LD
          }
        });

        // Fallback: HTML card parsing
        if (!foundViaJsonLd) {
          const cards = $(".mp-Listing, [data-listing-id], .listing-search-item");
          cards.each((_, el) => {
            try {
              const title = $(el).find(".mp-Listing-title, h3, .listing-title").first().text().trim();
              if (!title) return;

              const href = $(el).find("a").first().attr("href") ?? "";
              const sourceUrl = href.startsWith("http") ? href : `${base}${href}`;

              const priceText = $(el).find(".mp-Listing-price, .price, [class*='price']").first().text();
              const acquisitionCost = parseEuroPrice(priceText);

              if (!acquisitionCost || acquisitionCost >= estimatedRetail) return;

              const discountPct = ((estimatedRetail - acquisitionCost) / estimatedRetail) * 100;
              if (discountPct < MIN_DISCOUNT_PCT) return;

              const imgSrc = $(el).find("img").first().attr("src") ?? $(el).find("img").first().attr("data-src");

              deals.push({
                title,
                sourceUrl,
                sourceType: "other",
                acquisitionCost,
                retailPrice: estimatedRetail,
                imageUrl: imgSrc,
              });
            } catch {
              // skip
            }
          });
        }

        console.log(`[2dehands] ${country} "${query}" page ${page}: ${deals.length} deals so far`);
        await sleep(2000 + Math.random() * 1000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[2dehands] Error on ${country} "${query}": ${msg}`);
      }
    }
  }

  return deals;
}

export async function scrapeTweedehandsDeals(): Promise<RawDeal[]> {
  const all: RawDeal[] = [];

  for (const sf of STOREFRONTS) {
    const deals = await scrapeStorefront(sf.base, sf.searchUrl, sf.country, sf.lang);
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
