import { useEffect, useState, useCallback } from 'react';
import { scrapersService } from '@/services/api';
import { Play, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ScraperDef {
  id: string;
  name: string;
  description: string;
  url: string;
  type: 'clearance' | 'liquidation' | 'classifieds';
}

interface CountryGroup {
  country: string;
  flag: string;
  scrapers: ScraperDef[];
}

const GROUPS: CountryGroup[] = [
  {
    country: 'United States',
    flag: '🇺🇸',
    scrapers: [
      {
        id: 'walmart',
        name: 'Walmart',
        description: 'Clearance items across Electronics, Home, Toys and Clothing departments.',
        url: 'walmart.com',
        type: 'clearance',
      },
      {
        id: 'target',
        name: 'Target',
        description: 'Target clearance via the Redsky internal API — no headless browser needed.',
        url: 'target.com',
        type: 'clearance',
      },
      {
        id: 'liquidation',
        name: 'Liquidation.com',
        description: 'Package-level liquidation auctions. Uses Puppeteer for JS-rendered pages.',
        url: 'liquidation.com',
        type: 'liquidation',
      },
    ],
  },
  {
    country: 'Germany',
    flag: '🇩🇪',
    scrapers: [
      {
        id: 'restposten',
        name: 'Restposten.de',
        description: 'DACH-region surplus & remainder stock marketplace with original retail prices listed.',
        url: 'restposten.de',
        type: 'liquidation',
      },
    ],
  },
  {
    country: 'Netherlands & Belgium',
    flag: '🇳🇱🇧🇪',
    scrapers: [
      {
        id: 'bolcom',
        name: 'Bol.com',
        description: 'Deals & sale section for both the NL and BE storefronts of the dominant Benelux retailer.',
        url: 'bol.com',
        type: 'clearance',
      },
      {
        id: 'tweedehands',
        name: '2dehands.be / 2dehands.nl',
        description: 'Classifieds marketplace — finds new/near-new items priced below market value for arbitrage.',
        url: '2dehands.be',
        type: 'classifieds',
      },
    ],
  },
];

const TYPE_BADGE: Record<string, string> = {
  clearance:   'bg-blue-100 text-blue-700',
  liquidation: 'bg-orange-100 text-orange-700',
  classifieds: 'bg-purple-100 text-purple-700',
};

type RunState = 'idle' | 'running' | 'done' | 'error';

export default function ScrapersPage() {
  const [states, setStates] = useState<Record<string, boolean>>({});
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [runResults, setRunResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadStates = useCallback(async () => {
    try {
      const res = await scrapersService.getStates();
      setStates(res.data.scrapers ?? {});
    } catch {
      // keep current
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  const handleToggle = async (id: string) => {
    // Optimistic update
    setStates(s => ({ ...s, [id]: !s[id] }));
    try {
      const res = await scrapersService.toggle(id);
      setStates(s => ({ ...s, [id]: res.data.enabled }));
    } catch {
      // Revert on error
      setStates(s => ({ ...s, [id]: !s[id] }));
    }
  };

  const handleRun = async (id: string) => {
    setRunStates(s => ({ ...s, [id]: 'running' }));
    setRunResults(s => ({ ...s, [id]: '' }));
    try {
      await scrapersService.run(id);
      // The server fires-and-forgets; we poll for completion via a short timeout
      // In production this would use the Socket.io 'scraper-done' event
      setRunResults(s => ({ ...s, [id]: 'Started — check the Deals page for results.' }));
      setRunStates(s => ({ ...s, [id]: 'done' }));
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Failed to start';
      setRunResults(s => ({ ...s, [id]: msg }));
      setRunStates(s => ({ ...s, [id]: 'error' }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scrapers</h1>
        <p className="text-gray-500 mt-1">
          Enable or disable individual scrapers. Disabled scrapers are skipped during scheduled runs.
        </p>
      </div>

      {GROUPS.map(group => (
        <section key={group.country}>
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="text-2xl leading-none">{group.flag}</span>
            {group.country}
          </h2>

          <div className="space-y-3">
            {group.scrapers.map(scraper => {
              const enabled = states[scraper.id] ?? true;
              const runState = runStates[scraper.id] ?? 'idle';
              const result = runResults[scraper.id];

              return (
                <div
                  key={scraper.id}
                  className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors ${
                    enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(scraper.id)}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none ${
                      enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                    aria-label={enabled ? 'Disable' : 'Enable'}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{scraper.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[scraper.type]}`}>
                        {scraper.type}
                      </span>
                      <a
                        href={`https://${scraper.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        {scraper.url} ↗
                      </a>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{scraper.description}</p>

                    {result && (
                      <div className={`flex items-center gap-1.5 mt-1.5 text-sm ${
                        runState === 'error' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {runState === 'done'  && <CheckCircle className="w-4 h-4" />}
                        {runState === 'error' && <XCircle className="w-4 h-4" />}
                        {result}
                      </div>
                    )}
                  </div>

                  {/* Run now */}
                  <button
                    onClick={() => handleRun(scraper.id)}
                    disabled={!enabled || runState === 'running'}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                      bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {runState === 'running' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    {runState === 'running' ? 'Running…' : 'Run now'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Note on new scrapers:</strong> Restposten.de, Bol.com and 2dehands selectors may need
          adjustment after the first run — their page structures can differ from what was observed at
          build time. Check the server logs after running and open a GitHub issue if a scraper returns 0 items.
        </div>
      </div>
    </div>
  );
}
