import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '../settings.json');

export interface AppSettings {
  llm: {
    provider: 'claude' | 'ollama';
    claudeModel: string;
    claudeApiKey: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
  };
  business: {
    targetWeeklyRevenue: number;
    minMarginPercent: number;
  };
  scraping: {
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
    retryAttempts: number;
  };
}

const DEFAULTS: AppSettings = {
  llm: {
    provider: 'claude',
    claudeModel: 'claude-opus-4-7',
    claudeApiKey: '',
    ollamaBaseUrl: 'http://rig1.clsystems.nl:11434',
    ollamaModel: 'llama3.2',
  },
  business: {
    targetWeeklyRevenue: 2000,
    minMarginPercent: 20,
  },
  scraping: {
    maxConcurrentRequests: 5,
    requestTimeoutMs: 15000,
    retryAttempts: 3,
  },
};

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: AppSettings): void {
  // Never write the API key to disk in plaintext — caller strips it before saving
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getPublicSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    llm: {
      ...settings.llm,
      // Mask the key so it's never sent to the browser in full
      claudeApiKey: settings.llm.claudeApiKey ? '••••••••' : '',
    },
  };
}
