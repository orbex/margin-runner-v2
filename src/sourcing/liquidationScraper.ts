/**
 * Liquidation.com Scraper
 *
 * Uses Puppeteer to load JS-rendered auction search pages.
 * URL format: /auction/search?flag=new&searchparam_dimension=XXXXX
 *
 * On first run with DEBUG_LIQUIDATION=true, dumps raw HTML to
 * liquidation-debug.html so you can inspect the real DOM selectors.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import { type RawDeal } from "./dealScorer.js";
import fs from "fs";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.liquidation.com";

// Category dimension IDs from the search URL (?searchparam_dimension=XXXXX)
// Add more by browsing the site and noting the dimension param in the URL
const AUCTION_CATEGORIES = [
  { dimension: "10901", label: "General Merchandise" },
  { dimension: "10902", label: "Electronics" },
  { dimension: "10903", label: "Home & Garden" },
  { dimension: "10904", label: "Apparel" },
];

const MIN_DISCOUNT_PCT = 40;
const MAX_PAGES = 2;
const DEBUG = process.env.DEBUG_LIQUIDATION === "true";

// ── Browser helpers ───────────────────────────────────────────────────────────

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

async function newStealthPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  await page.setViewport({ width: 1440, height: 900 });

  return page;
}

// ── Scraping logic ────────────────────────────────────────────────────────────

interface AuctionLot {
  id: string;
  title: string;
  currentBid: number;
  retailValue: number;
  imageUrl?: string;
  lotUrl: string;
  category: string;
}

async function extractLots(page: Page, category: string): Promise<AuctionLot[]> {
  if (DEBUG) {
    const html = await page.content();
    const debugPath = "web/dist/liquidation-debug.html";
    fs.writeFileSync(debugPath, html, "utf-8");
    console.log(`[liquidation] DEBUG: Saved page HTML to ${debugPath}`);
    console.log(`[liquidation] DEBUG: Page title: "${await page.title()}"`);
    console.log(`[liquidation] DEBUG: HTML length: ${html.length} chars`);
  }

  return page.evaluate(
    (cat: string, baseUrl: string) => {
      const lots: AuctionLot[] = [];

      // Liquidation.com search results — try multiple known container patterns
      const cards = document.querySelectorAll([
        ".auction-search-result",
        ".search-result-item",
        ".auction-card",
        "[class*='auction-item']",
        "[class*='result-item']",
        "[class*='lot-card']",
        // Fallback: any article or li with a link to /auction/
        "article",
        "li:has(a[href*='/auction/'])",
      ].join(", "));

      cards.forEach((card) => {
        try {
          // Lot URL — anchor pointing to an individual auction
          const linkEl = card.querySelector(
            "a[href*='/auction/view'], a[href*='/lot/'], a[href*='/auction/detail']"
          ) ?? card.closest("a[href*='/auction/']");

          const href = (linkEl as HTMLAnchorElement)?.href ?? "";
          if (!href) return;
          const lotUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;

          // ID from URL
          const idMatch = href.match(/\/(\d+)\/?(?:\?|$)/);
          const id = idMatch?.[1] ?? href;

          // Title
          const titleEl = card.querySelector(
            "h2, h3, h4, [class*='title'], [class*='name'], [class*='description']"
          );
          const title = titleEl?.textContent?.trim() ?? "";
          if (!title) return;

          // Current bid
          const bidEl = card.querySelector(
            "[class*='current-bid'], [class*='bid-amount'], [class*='current_bid'], " +
            "[class*='price']:not([class*='retail']):not([class*='msrp'])"
          );
          const bidText = bidEl?.textContent?.replace(/[^0-9.]/g, "") ?? "";
          const currentBid = parseFloat(bidText) || 0;

          // Retail / MSRP value
          const retailEl = card.querySelector(
            "[class*='retail'], [class*='msrp'], [class*='original-price'], " +
            "[class*='market-value'], [class*='manifest-value']"
          );
          const retailText = retailEl?.textContent?.replace(/[^0-9.]/g, "") ?? "";
          const retailValue = parseFloat(retailText) || 0;

          // Image
          const imgEl = card.querySelector("img");
          const imageUrl =
            (imgEl as HTMLImageElement)?.src ||
            imgEl?.getAttribute("data-src") ||
            undefined;

          lots.push({ id, title, currentBid, retailValue, imageUrl, lotUrl, category: cat });
        } catch {
          // Skip malformed cards
        }
      });

      return lots;
    },
    category,
    BASE_URL
  );
}

async function scrapeCategory(
  page: Page,
  dimension: string,
  label: string
): Promise<AuctionLot[]> {
  const lots: AuctionLot[] = [];

  for (let p = 1; p <= MAX_PAGES; p++) {
    const url =
      `${BASE_URL}/auction/search?flag=new&searchparam_dimension=${dimension}&page=${p}`;

    try {
      console.log(`[liquidation] Fetching ${label} page ${p}…`);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // Give JS time to render the auction grid
      await sleep(4000);

      const pageLots = await extractLots(page, label);

      if (pageLots.length === 0) {
        console.log(`[liquidation] No lots on ${label} page ${p}, stopping.`);
        break;
      }

      lots.push(...pageLots);
      console.log(`[liquidation] ${label} page ${p}: ${pageLots.length} lots found`);

      await sleep(2000 + Math.random() * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[liquidation] Error on ${label} page ${p}: ${msg}`);
      break;
    }
  }

  return lots;
}

// ── Converter ─────────────────────────────────────────────────────────────────

function lotToDeal(lot: AuctionLot): RawDeal | null {
  if (!lot.currentBid || !lot.retailValue) return null;
  if (lot.retailValue <= lot.currentBid) return null;

  const discountPct = Math.round(
    ((lot.retailValue - lot.currentBid) / lot.retailValue) * 100
  );
  if (discountPct < MIN_DISCOUNT_PCT) return null;

  return {
    title: lot.title,
    sourceUrl: lot.lotUrl,
    sourceType: "liquidation",
    acquisitionCost: lot.currentBid,
    retailPrice: lot.retailValue,
    imageUrl: lot.imageUrl,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function scrapeLiquidationDeals(): Promise<RawDeal[]> {
  const browser = await launchBrowser();
  const allDeals: RawDeal[] = [];

  try {
    const page = await newStealthPage(browser);

    // Dismiss cookie banner on homepage first
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await sleep(2000);
    const cookieBtn = await page.$("[id*=accept], [class*=accept-cookie], #onetrust-accept-btn-handler");
    if (cookieBtn) await cookieBtn.click();
    await sleep(1000);

    for (const { dimension, label } of AUCTION_CATEGORIES) {
      const lots = await scrapeCategory(page, dimension, label);

      for (const lot of lots) {
        const deal = lotToDeal(lot);
        if (deal) allDeals.push(deal);
      }

      console.log(`[liquidation] ${label}: ${allDeals.length} qualifying deals so far`);
      await sleep(2500 + Math.random() * 1500);
    }
  } finally {
    await browser.close();
  }

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
