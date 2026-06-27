import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../margin-runner.db');

export const db: DatabaseType = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      sourceUrl TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      acquisitionCost REAL NOT NULL,
      retailPrice REAL NOT NULL,
      estimatedMarketPrice REAL NOT NULL,
      marginPercent REAL NOT NULL,
      profitEstimate REAL NOT NULL,
      shippingCost REAL NOT NULL,
      weight REAL,
      dimensions TEXT,
      imageUrl TEXT,
      demandScore REAL NOT NULL DEFAULT 0.5,
      feasibilityScore REAL NOT NULL DEFAULT 0.5,
      opportunityScore REAL NOT NULL DEFAULT 0.25,
      status TEXT NOT NULL DEFAULT 'discovered',
      discoveredAt DATETIME NOT NULL,
      approvedAt DATETIME,
      purchasedAt DATETIME,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      dealId TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      acquisitionCost REAL NOT NULL,
      purchaseDate DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      expiryDate DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dealId) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      inventoryId TEXT NOT NULL,
      channel TEXT NOT NULL,
      channelListingId TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      listedPrice REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      listedDate DATETIME NOT NULL,
      soldDate DATETIME,
      status TEXT NOT NULL DEFAULT 'active',
      views INTEGER DEFAULT 0,
      watchers INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inventoryId) REFERENCES inventory(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      listingId TEXT NOT NULL,
      finalPrice REAL NOT NULL,
      platformFees REAL NOT NULL DEFAULT 0,
      shippingCost REAL NOT NULL DEFAULT 0,
      profit REAL NOT NULL,
      saleDate DATETIME NOT NULL,
      channel TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (listingId) REFERENCES listings(id)
    );

    CREATE TABLE IF NOT EXISTS agentDecisions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      reasoning TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
    CREATE INDEX IF NOT EXISTS idx_deals_discoveredAt ON deals(discoveredAt);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location);
    CREATE INDEX IF NOT EXISTS idx_listings_channel ON listings(channel);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
    CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(channel);
    CREATE INDEX IF NOT EXISTS idx_sales_saleDate ON sales(saleDate);
  `);

  console.log('✓ Database schema initialized');
}
