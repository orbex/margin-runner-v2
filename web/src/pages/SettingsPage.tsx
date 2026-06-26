import { useEffect, useState } from 'react';
import { settingsService } from '@/services/api';
import { Settings, Cpu, DollarSign, Globe, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface AppSettings {
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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getSettings();
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaveState('saving');
      const response = await settingsService.saveSettings(settings);
      setSettings(response.data.settings);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 4000);
    }
  };

  const update = (section: keyof AppSettings, field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [section]: { ...settings[section], [field]: value },
    });
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* LLM Provider */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-blue-600" />
          LLM Provider
        </h3>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Provider</label>
          <div className="grid grid-cols-2 gap-3">
            {(['claude', 'ollama'] as const).map(p => (
              <button
                key={p}
                onClick={() => update('llm', 'provider', p)}
                className={`py-3 px-4 rounded-lg border-2 font-medium text-sm transition-colors ${
                  settings.llm.provider === p
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                {p === 'claude' ? '☁️ Claude (Anthropic)' : '🖥️ Ollama (Local)'}
              </button>
            ))}
          </div>
        </div>

        {settings.llm.provider === 'claude' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
              <input
                type="password"
                value={settings.llm.claudeApiKey}
                onChange={e => update('llm', 'claudeApiKey', e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Stored server-side only, never exposed to the browser.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
              <select
                value={settings.llm.claudeModel}
                onChange={e => update('llm', 'claudeModel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="claude-opus-4-7">claude-opus-4-7 (most capable)</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (faster)</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fastest)</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ollama Base URL</label>
              <input
                type="text"
                value={settings.llm.ollamaBaseUrl}
                onChange={e => update('llm', 'ollamaBaseUrl', e.target.value)}
                placeholder="http://rig1.clsystems.nl:11434"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model Name</label>
              <input
                type="text"
                value={settings.llm.ollamaModel}
                onChange={e => update('llm', 'ollamaModel', e.target.value)}
                placeholder="llama3.2"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Run <code className="bg-gray-100 dark:bg-slate-600 px-1 rounded">curl {settings.llm.ollamaBaseUrl}/api/tags</code> to list available models.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Business Targets */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Business Targets
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Weekly Revenue Target ($)
            </label>
            <input
              type="number"
              value={settings.business.targetWeeklyRevenue}
              onChange={e => update('business', 'targetWeeklyRevenue', e.target.value)}
              min={0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Minimum Margin (%)
            </label>
            <input
              type="number"
              value={settings.business.minMarginPercent}
              onChange={e => update('business', 'minMarginPercent', e.target.value)}
              min={0}
              max={100}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Scraping Config */}
      <section className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
          <Globe className="w-5 h-5 text-orange-600" />
          Scraping
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Concurrent Requests
            </label>
            <input
              type="number"
              value={settings.scraping.maxConcurrentRequests}
              onChange={e => update('scraping', 'maxConcurrentRequests', e.target.value)}
              min={1}
              max={20}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={settings.scraping.requestTimeoutMs}
              onChange={e => update('scraping', 'requestTimeoutMs', e.target.value)}
              min={1000}
              step={1000}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Retry Attempts
            </label>
            <input
              type="number"
              value={settings.scraping.retryAttempts}
              onChange={e => update('scraping', 'retryAttempts', e.target.value)}
              min={0}
              max={10}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors"
        >
          {saveState === 'saving' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <><Settings className="w-4 h-4" /> Save Settings</>
          )}
        </button>

        {saveState === 'saved' && (
          <span className="flex items-center gap-2 text-green-600 font-medium">
            <CheckCircle className="w-4 h-4" /> Saved — changes applied immediately
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-2 text-red-600 font-medium">
            <AlertCircle className="w-4 h-4" /> Failed to save — check server logs
          </span>
        )}
      </div>
    </div>
  );
}
