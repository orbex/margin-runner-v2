/**
 * Liquidation.com Scraper
 *
 * Strategy: Liquidation.com is a fully JS-rendered SPA. We use Puppeteer in
 * headless mode to load auction/manifest listing pages, wait for the React
 * grid to hydrate, then extract auction data.
 *
 * Key differences from the retail scrapers:
 *  - Prices are "current bid" + "retail value", not static clearance prices
 *  - We map auction lots to RawDeal[] with clearancePrice = current bid
 *    and retailPrice = manifest retail value
 *  - The scraper skips lots with < 5 items (too small for resale)
 *
 * Returns RawDeal[] matching the existing project interface.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import { type RawDeal } from "./dealScorer.js";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.liquidation.com";

// Category listing pages to scrape
const AUCTION_CATEGORIES = [
  { path: "/auction/electronics", label: "Electronics" },
  { path: "/auction/home", label: "Home" },
  { path: "/auction/toys-games", label: "Toys" },
  { path: "/auction/general-merchandise", label: "General Merchandise" },
];

// Only surface lots where bid is at least this % below retail
const MIN_DISCOUNT_PCT = 40; // liquidation lots are cheap; raise bar higher
const MIN_LOT_SIZE = 5;      // units in lot
const MAX_PAGES = 2;         // pages per category

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

  // Spoof navigator.webdriver to pass basic bot checks
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  await page.setViewport({ width: 1280, height: 900 });

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
  endsAt?: string;
  lotSize?: number;
  category: string;
}

/**
 * Extracts auction lot data from the current listing page.
 * Liquidation renders lots inside `.auction-list-item` cards.
 * This selector has been stable since 2023 but may need updating.
 */
async function extractLots(page: Page, category: string): Promise<AuctionLot[]> {
  return page.evaluate(
    (cat: string, baseUrl: string) => {
      const lots: AuctionLot[] = [];

      // Attempt to find lot cards — the site uses a few different containers
      const cards = document.querySelectorAll(
        ".auction-item, .lot-card, [data-lot-id], .product-item"
      );

      cards.forEach((card) => {
        try {
          // ID
          const id =
            card.getAttribute("data-lot-id") ??
            card.getAttribute("data-auction-id") ??
            card.querySelector("[data-lot-id]")?.getAttribute("data-lot-id") ??
            "";

          if (!id) return;

          // Title
          const titleEl = card.querySelector(
            ".lot-title, .auction-title, h2, h3, .title"
          );
          const title = titleEl?.textContent?.trim() ?? "";
          if (!title) return;

          // Current bid
          const bidEl = card.querySelector(
            ".current-bid .price, .bid-amount, [data-current-bid], .current-bid"
          );
          const bidText = bidEl?.textContent?.replace(/[^0-9.]/g, "") ?? "0";
          const currentBid = parseFloat(bidText);

          // Retail value
          const retailEl = card.querySelector(
            ".retail-value .price, .retail-price, [data-retail-value], .msrp"
          );
          const retailText = retailEl?.textContent?.replace(/[^0-9.]/g, "") ?? "0";
          const retailValue = parseFloat(retailText);

          // Image
          const imgEl = card.querySelector("img.lot-image, img.product-image, img");
          const imageUrl =
            (imgEl as HTMLImageElement)?.src ||
            imgEl?.getAttribute("data-src") ||
            undefined;

          // Lot URL
          const linkEl = card.querySelector("a.lot-link, a.title-link, a[href*='/lot/'], a[href*='/auction/']");
          const href = (linkEl as HTMLAnchorElement)?.href ?? "";
          const lotUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;

          // Ends-at
          const timerEl = card.querySelector(
            "[data-ends-at], .auction-ends, .time-remaining"
          );
          const endsAt =
            timerEl?.getAttribute("data-ends-at") ??
            timerEl?.getAttribute("datetime") ??
            undefined;

          // Lot size (number of units)
          const sizeEl = card.querySelector(
            "[data-qty], .lot-size, .qty, .unit-count"
          );
          const sizeText = sizeEl?.textContent?.replace(/[^0-9]/g, "") ?? "";
          const lotSize = sizeText ? parseInt(sizeText, 10) : undefined;

          lots.push({
            id,
            title,
            currentBid,
            retailValue,
            imageUrl,
            lotUrl,
            endsAt,
            lotSize,
            category: cat,
          });
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

/**
 * Navigate to a category page and collect lots across multiple pages.
 */
async function scrapeCategoryPage(
  page: Page,
  path: string,
  label: string
): Promise<AuctionLot[]> {
  const lots: AuctionLot[] = [];

  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = `${BASE_URL}${path}?page=${p}&sort=ending_soon`;

    try {
      console.log(`[liquidation] Fetching ${label} page ${p}…`);

      await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });

      // Wait for lot cards to appear
      await page
        .waitForSelector(".auction-item, .lot-card, .product-item", {
          timeout: 10_000,
        })
        .catch(() => {
          console.warn(`[liquidation] No lot cards found on ${url}`);
        });

      // Brief extra settle time for lazy-loaded images / bid prices
      await sleep(1500);

      const pageLots = await extractLots(page, label);

      if (pageLots.length === 0) {
        console.log(`[liquidation] No lots on ${label} page ${p}, stopping.`);
        break;
      }

      lots.push(...pageLots);
      console.log(`[liquidation] ${label} page ${p}: ${pageLots.length} lots`);

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

  if (lot.lotSize !== undefined && lot.lotSize < MIN_LOT_SIZE) return null;

  return {
    title: lot.title,
    sourceUrl: lot.lotUrl,
    sourceType: "liquidation",
    acquisitionCost: lot.currentBid,
    retailPrice: lot.retailValue,
    imageUrl: lot.imageUrl,
  };
}

// ── Main scraper function ─────────────────────────────────────────────────────

export async function scrapeLiquidationDeals(): Promise<RawDeal[]> {
  const browser = await launchBrowser();
  const allDeals: RawDeal[] = [];

  try {
    const page = await newStealthPage(browser);

    // Accept cookies / dismiss modals on first load
    await page.goto(`${BASE_URL}/`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    const cookieBtn = await page.$("[id*=accept], [class*=accept-cookie], #onetrust-accept-btn-handler");
    if (cookieBtn) await cookieBtn.click();
    await sleep(1000);

    for (const { path, label } of AUCTION_CATEGORIES) {
      const lots = await scrapeCategoryPage(page, path, label);

      for (const lot of lots) {
        const deal = lotToDeal(lot);
        if (deal) allDeals.push(deal);
      }

      console.log(
        `[liquidation] ${label}: ${allDeals.length} total deals so far`
      );

      await sleep(3000 + Math.random() * 2000);
    }
  } finally {
    await browser.close();
  }

  // Deduplicate by lot ID
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
