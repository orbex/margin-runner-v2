/**
 * eBay Browse API — market price lookup for items with no known retail value.
 *
 * Setup (free eBay developer account):
 *   1. https://developer.ebay.com/my/keys → create a keyset for Production
 *   2. Copy App ID → EBAY_CLIENT_ID in .env
 *   3. Copy Cert ID → EBAY_CLIENT_SECRET in .env
 *
 * The client-credentials OAuth token is fetched automatically and cached
 * for its 2-hour lifetime. If credentials are missing the lookup is skipped.
 */

import axios from "axios";
import { config } from "../config.js";

// ── OAuth token cache ─────────────────────────────────────────────────────────

let _token: string | null = null;
let _tokenExpiry = 0;

async function getAppToken(): Promise<string | null> {
  if (!config.ebay.clientId || !config.ebay.clientSecret) return null;
  if (_token && Date.now() < _tokenExpiry) return _token;

  const credentials = Buffer.from(
    `${config.ebay.clientId}:${config.ebay.clientSecret}`
  ).toString("base64");

  try {
    const res = await axios.post(
      "https://api.ebay.com/identity/v1/oauth2/token",
      "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10_000,
      }
    );

    _token = res.data.access_token as string;
    // Expire 5 min early to avoid edge cases
    _tokenExpiry = Date.now() + (res.data.expires_in - 300) * 1000;
    return _token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ebayPrice] OAuth token fetch failed: ${msg}`);
    return null;
  }
}

// ── Price search ──────────────────────────────────────────────────────────────

/**
 * Shorten a title to the first 4–5 meaningful keywords for a better search hit.
 * Strips generic filler words and truncates to 80 chars (eBay API limit is 350).
 */
function buildSearchQuery(title: string): string {
  const stopWords = new Set([
    "new", "lot", "of", "and", "the", "with", "for", "a", "an",
    "in", "set", "pack", "pcs", "qty", "x", "bundle",
  ]);

  const words = title
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

  return words.slice(0, 5).join(" ").slice(0, 80);
}

/**
 * Returns the median price from active eBay listings for the given title,
 * or 0 if the lookup fails or no credentials are configured.
 */
export async function lookupEbayPrice(title: string): Promise<number> {
  const token = await getAppToken();
  if (!token) return 0;

  const q = buildSearchQuery(title);
  if (!q) return 0;

  try {
    const res = await axios.get(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        params: {
          q,
          limit: 10,
          // conditionIds: 1000=New, 1500=New other, 2000=Certified refurb, 2500=Seller refurb
          filter: "conditionIds:{1000|1500}",
          sort: "price",
        },
        timeout: 10_000,
      }
    );

    const items: Array<{ price?: { value?: string } }> =
      res.data?.itemSummaries ?? [];

    if (items.length === 0) return 0;

    const prices = items
      .map(i => parseFloat(i.price?.value ?? "0"))
      .filter(p => p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return 0;

    // Use median to avoid outlier skew
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0
        ? (prices[mid - 1]! + prices[mid]!) / 2
        : prices[mid]!;

    return Math.round(median * 100) / 100;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ebayPrice] Search failed for "${q}": ${msg}`);
    return 0;
  }
}
