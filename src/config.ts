import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  database: {
    url: process.env.DATABASE_URL || './margin-runner.db',
  },
  ebay: {
    clientId: process.env.EBAY_CLIENT_ID || '',
    clientSecret: process.env.EBAY_CLIENT_SECRET || '',
    redirectUri: process.env.EBAY_REDIRECT_URI || 'http://localhost:3000',
  },
  amazon: {
    accessKeyId: process.env.AMAZON_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AMAZON_SECRET_ACCESS_KEY || '',
    sellerId: process.env.AMAZON_SELLER_ID || '',
    region: process.env.AMAZON_REGION || 'US',
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || '',
  },
  keepa: {
    apiKey: process.env.KEEPA_API_KEY || '',
  },
  business: {
    targetWeeklyRevenue: parseInt(process.env.TARGET_WEEKLY_REVENUE || '2000'),
    minMarginPercent: parseInt(process.env.MIN_MARGIN_PERCENT || '20'),
    maxDaysInventory: 30,
    platformFeePercent: {
      ebay: 0.15,
      amazonFba: 0.35,
      b2b: 0.05,
    },
    shippingCostEstimate: {
      light: 5,
      medium: 8,
      heavy: 15,
    },
  },
  scraping: {
    maxConcurrentRequests: 5,
    requestTimeoutMs: 15000,
    retryAttempts: 3,
  },
  scheduling: {
    sourcingCheckIntervalMinutes: 240,
    ceoReviewHour: 9,
    operationsReconcileHour: 20,
  },
};

export function validateConfig() {
  const required = [
    'claude.apiKey',
  ];

  const missingVars = required.filter(key => {
    const [section, field] = key.split('.');
    return !config[section as keyof typeof config]?.[field as any];
  });

  if (missingVars.length > 0) {
    console.warn('⚠️ Missing environment variables:', missingVars);
    console.warn('Set them in .env file. eBay/Amazon keys optional for initial demo.');
  }
}
