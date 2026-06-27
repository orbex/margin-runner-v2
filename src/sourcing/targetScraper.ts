/**
 * Target Clearance Scraper
 *
 * Strategy: Target's product pages are rendered by their internal "Redsky" API.
 * The clearance browse pages call https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2
 * with query params. This endpoint returns structured JSON with full price/discount data.
 * No headless browser needed — pure HTTP with axios.
 *
 * Returns RawDeal[] matching the existing project interface.
 */

import axios, { type AxiosResponse } from "axios";
import { type RawDeal } from "./dealScorer.js";

// ── Redsky API response types (partial) ───────────────────────────────────────

interface RedskyPriceBlock {
  formatted_current_price: string;
  formatted_comparison_price?: string;
  current_retail: number;
  reg_retail?: number;
  is_clearance?: boolean;
}

interface RedskyItem {
  tcin: string;
  item?: {
    product_description?: { title?: string };
    primary_image_url?: string;
    enrichment?: { buy_url?: string };
    dpci?: string;
  };
  price?: RedskyPriceBlock;
  availability_status?: string;
}

interface RedskyResponse {
  data?: {
    search?: {
      products?: RedskyItem[];
      total_results?: number;
    };
  };
}

// ── Config ────────────────────────────────────────────────────────────────────

// Target department IDs for clearance categories
// These are the "category" query values used by Redsky
const CLEARANCE_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "5xtg6", label: "Electronics" },       // Electronics
  { id: "5xsxe", label: "Home" },               // Home
  { id: "5xtdd", label: "Toys" },               // Toys
  { id: "5xtg9", label: "Clothing" },           // Clothing & Accessories
  { id: "5xszt", label: "Kitchen" },            // Kitchen & Dining
];

const REDSKY_API =
  "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2";

// Visitor ID is required by Redsky; a static UUID-like value works for unauthenticated requests
const VISITOR_ID = "0196C8D4E1B8020191B9BC8A3E6A9F34";
const CHANNEL = "WEB";
const RESULTS_PER_PAGE = 24;
const MAX_PAGES = 4;
const MIN_DISCOUNT_PCT = 20;

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.target.com",
  Referer: "https://www.target.com/",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePrice(formatted: string | undefined): number {
  if (!formatted) return 0;
  const n = parseFloat(formatted.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchPage(
  categoryId: string,
  page: number
): Promise<RedskyResponse> {
  const offset = (page - 1) * RESULTS_PER_PAGE;

  const params = new URLSearchParams({
    key: "9f36aeafbe60771e321a7cc95a78140772ab3e96", // public key embedded in Target's JS bundle
    category: `${categoryId}+filter=4834`,             // +filter=4834 = clearance flag
    channel: CHANNEL,
    count: String(RESULTS_PER_PAGE),
    default_purchasability_filter: "true",
    include_sponsored: "false",
    offset: String(offset),
    page: `/c/${categoryId}`,
    platform: "desktop",
    pricing_store_id: "3991",  // generic store; prices are national
    visitor_id: VISITOR_ID,
    scheduled_delivery_store_id: "3991",
    store_ids: "3991",
  });

  const response: AxiosResponse<RedskyResponse> = await axios.get(
    `${REDSKY_API}?${params.toString()}`,
    {
      headers: BASE_HEADERS,
      timeout: 15_000,
    }
  );

  return response.data;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseDeals(
  items: RedskyItem[],
  category: string
): RawDeal[] {
  const deals: RawDeal[] = [];

  for (const item of items) {
    try {
      if (!item.tcin) continue;

      const title =
        item.item?.product_description?.title ?? "";
      if (!title) continue;

      const price = item.price;
      if (!price) continue;

      // Only include items explicitly flagged as clearance
      if (!price.is_clearance) continue;

      const clearancePrice =
        price.current_retail || parsePrice(price.formatted_current_price);
      const retailPrice =
        price.reg_retail || parsePrice(price.formatted_comparison_price);

      if (!clearancePrice || !retailPrice || retailPrice <= clearancePrice) continue;

      const discountPct = Math.round(
        ((retailPrice - clearancePrice) / retailPrice) * 100
      );
      if (discountPct < MIN_DISCOUNT_PCT) continue;

      const sku = item.tcin;
      const productUrl =
        item.item?.enrichment?.buy_url ??
        `https://www.target.com/p/-/A-${sku}`;

      deals.push({
        title,
        sourceUrl: productUrl,
        sourceType: "target",
        acquisitionCost: clearancePrice,
        retailPrice,
        imageUrl: item.item?.primary_image_url ?? undefined,
      });
    } catch {
      // Skip malformed items
    }
  }

  return deals;
}

// ── Main scraper function ─────────────────────────────────────────────────────

export async function scrapeTargetClearance(): Promise<RawDeal[]> {
  const allDeals: RawDeal[] = [];

  for (const { id, label } of CLEARANCE_CATEGORIES) {
    let totalResults = Infinity;
    let page = 1;

    while (
      page <= MAX_PAGES &&
      (page - 1) * RESULTS_PER_PAGE < totalResults
    ) {
      try {
        console.log(`[target] Fetching ${label} page ${page}…`);

        const data = await fetchPage(id, page);
        const search = data.data?.search;

        if (!search) {
          console.warn(`[target] Empty search response for ${label}`);
          break;
        }

        totalResults = search.total_results ?? 0;
        const items = search.products ?? [];

        if (items.length === 0) break;

        const pageDeals = parseDeals(items, label);
        allDeals.push(...pageDeals);

        console.log(
          `[target] ${label} page ${page}: ${items.length} items, ${pageDeals.length} clearance deals`
        );

        page++;
        await sleep(1200 + Math.random() * 800);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[target] Error on ${label} page ${page}: ${msg}`);
        break;
      }
    }

    await sleep(2000 + Math.random() * 1000);
  }

  // Deduplicate by TCIN
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
