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

// Only scrape Packages (10901). Pallets/Truckloads/Large Items are bulk lots
// not suitable for individual resale. Add more package-level dimensions here
// by browsing liquidation.com and noting the searchparam_dimension in the URL.
const AUCTION_CATEGORIES = [
  { dimension: "10901", label: "Packages" },
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
    fs.writeFileSync("web/dist/liquidation-debug.html", html, "utf-8");
    console.log(`[liquidation] DEBUG: title="${await page.title()}" length=${html.length}`);
  }

  return page.evaluate((cat: string) => {
    const lots: AuctionLot[] = [];

    // Each auction card is a div.grid-group-item containing div.thumbnail[data-id]
    const cards = document.querySelectorAll("div.grid-group-item");

    cards.forEach((card) => {
      try {
        const thumbnail = card.querySelector(".thumbnail[data-id]");
        if (!thumbnail) return;

        const id = thumbnail.getAttribute("data-id") ?? "";
        if (!id) return;

        // Prefer the full-length title in the desktop-visible element
        const titleEl =
          card.querySelector(".auction-name.d-none.d-sm-block b.shortDesc") ??
          card.querySelector("b.shortDesc");
        const title = titleEl?.textContent?.trim() ?? "";
        if (!title) return;

        // URL
        const linkEl = card.querySelector("a[href*='/auction/view?id=']") as HTMLAnchorElement | null;
        const lotUrl = linkEl?.href ?? `https://www.liquidation.com/auction/view?id=${id}`;

        // Extract the first dollar amount from an element's text e.g. "$1,234.56" → 1234.56
        const parseDollar = (el: Element | null): number => {
          const m = el?.textContent?.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
          return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
        };

        // Parse MSRP/retail hints embedded in the title text
        // e.g. "Dog Bed - MSRP $119", "Furniture Kit - MSRP $1,300", "Retail Value $500"
        const parseMsrpFromTitle = (text: string): number => {
          const m = text.match(/(?:MSRP|Retail(?:\s+Value)?|RV|Est\.?\s+Retail)[:\s]+\$\s*([\d,]+(?:\.\d{1,2})?)/i);
          return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
        };

        const currentBid = parseDollar(card.querySelector("li.current-bid"));
        const listedRetail = parseDollar(card.querySelector("li.est-retail"));
        const titleRetail = listedRetail === 0 ? parseMsrpFromTitle(title) : 0;
        const retailValue = listedRetail || titleRetail;

        // Image
        const imgEl = card.querySelector("img.img-responsive") as HTMLImageElement | null;
        const imageUrl = imgEl?.src || imgEl?.getAttribute("data-src") || undefined;

        lots.push({ id, title, currentBid, retailValue, imageUrl, lotUrl, category: cat });
      } catch {
        // Skip malformed cards
      }
    });

    return lots;
  }, category);
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

      if (DEBUG && lots.length > 0) {
        console.log(`[liquidation] DEBUG: First 3 lots from ${label}:`);
        lots.slice(0, 3).forEach(l =>
          console.log(`  bid=$${l.currentBid} retail=$${l.retailValue} title="${l.title.slice(0, 60)}"`)
        );
      }

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

  if (DEBUG && allDeals.length === 0) {
    console.log("[liquidation] DEBUG: No qualifying deals. Run without head -30 to see full output.");
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
