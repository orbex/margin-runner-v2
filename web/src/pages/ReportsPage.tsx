import { useEffect, useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { reportsService } from '@/services/api';

export default function ReportsPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await reportsService.getWeeklyKPI();
      setKpi(response.data);
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !kpi) {
    return <div className="text-center py-12 text-gray-500">Loading report...</div>;
  }

  const targetPercent = (kpi.totalProfit / 2000) * 100;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg shadow p-8">
        <h2 className="text-3xl font-bold mb-2">Weekly Performance Report</h2>
        <p className="text-blue-100">
          Week of {new Date(kpi.weekStart).toLocaleDateString()} - {new Date(kpi.weekEnd).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Revenue</p>
          <p className="text-3xl font-bold text-blue-600">{formatCurrency(kpi.totalRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Profit</p>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(kpi.totalProfit)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Items Sold</p>
          <p className="text-3xl font-bold">{kpi.itemsSold}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8">
        <h3 className="text-xl font-semibold mb-6">Target Achievement</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">$2,000 Weekly Goal</span>
            <span className="text-2xl font-bold text-blue-600">{formatPercent(Math.min(targetPercent, 100))}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                targetPercent >= 100 ? 'bg-green-600' : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(targetPercent, 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded">
              <p className="text-xs text-gray-600 dark:text-gray-400">Target</p>
              <p className="text-2xl font-bold">$2,000</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded">
              <p className="text-xs text-gray-600 dark:text-gray-400">Actual</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(kpi.totalProfit)}</p>
            </div>
          </div>
        </div>
      </div>

      {kpi.channelBreakdown && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8">
          <h3 className="text-xl font-semibold mb-6">Channel Breakdown</h3>
          <div className="grid grid-cols-3 gap-6">
            {Object.entries(kpi.channelBreakdown).map(([channel, stats]: [string, any]) => (
              <div key={channel} className="p-6 bg-gray-50 dark:bg-slate-700 rounded-lg border">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 capitalize">
                  {channel.replace(/([A-Z])/g, ' $1').trim()}
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Revenue</p>
                    <p className="text-xl font-bold">{formatCurrency(stats.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Profit</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(stats.profit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Items Sold</p>
                    <p className="text-lg font-bold">{stats.itemsSold}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-6">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-100">
          {kpi.targetAchieved ? '✅ Target Achieved!' : '⚠️ Continue sourcing to reach target'}
        </p>
      </div>
    </div>
  );
}
