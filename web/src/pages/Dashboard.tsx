import { useEffect, useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { dealsService, reportsService, agentsService } from '@/services/api';
import { onKPIUpdated } from '@/services/socket';
import { AlertCircle, TrendingUp, Package, DollarSign, Target, Zap } from 'lucide-react';

interface DashboardData {
  weeklyProfit: number;
  weeklyTarget: number;
  targetPercent: number;
  todaySales: number;
  todayProfit: number;
  avgMargin: number;
  dealsAvailable: number;
  channelBreakdown?: any;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadDashboard();

    const handleKPIUpdate = (newKpi: any) => {
      setData(prev => prev ? { ...prev, ...newKpi } : null);
    };

    onKPIUpdated(handleKPIUpdate);

    return () => {
      // Cleanup socket listener
    };
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await dealsService.getDashboard();
      setData(response.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentAction = async (action: 'source' | 'review' | 'reconcile') => {
    try {
      setActionLoading(true);
      if (action === 'source') {
        await agentsService.triggerSourcing();
      } else if (action === 'review') {
        await agentsService.triggerCEOReview();
      } else {
        await agentsService.triggerReconciliation();
      }
      setTimeout(loadDashboard, 2000);
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const targetAchieved = data && data.weeklyProfit >= data.weeklyTarget;

  return (
    <div className="space-y-6">
      {/* Agent Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => handleAgentAction('source')}
            disabled={actionLoading}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            {actionLoading ? '⏳ Running...' : '🔍 Run Sourcing'}
          </button>
          <button
            onClick={() => handleAgentAction('review')}
            disabled={actionLoading}
            className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            {actionLoading ? '⏳ Running...' : '👔 CEO Review'}
          </button>
          <button
            onClick={() => handleAgentAction('reconcile')}
            disabled={actionLoading}
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            {actionLoading ? '⏳ Running...' : '📊 Reconcile'}
          </button>
        </div>
      </div>

      {/* Target Achievement */}
      <div className={`rounded-lg shadow p-8 ${targetAchieved ? 'bg-green-50 border-2 border-green-500' : 'bg-white dark:bg-slate-800'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-600" />
            Weekly Target
          </h3>
          {targetAchieved && (
            <div className="text-green-600 font-bold text-lg flex items-center gap-2">
              ✅ Target Achieved!
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-2">PROFIT</p>
            <p className="text-4xl font-bold text-blue-600">{formatCurrency(data?.weeklyProfit ?? 0)}</p>
          </div>
          <div>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-2">TARGET</p>
            <p className="text-4xl font-bold text-gray-600">{formatCurrency(data?.weeklyTarget ?? 0)}</p>
          </div>
        </div>
        <div className="mt-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm font-bold text-blue-600">{formatPercent(data?.targetPercent ?? 0)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-500"
              style={{ width: `${Math.min(data?.targetPercent ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Today's Sales</p>
            <Package className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-3xl font-bold">{data?.todaySales ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">items sold</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Today's Profit</p>
            <DollarSign className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(data?.todayProfit ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">revenue</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Avg Margin</p>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-blue-600">{formatPercent(data?.avgMargin ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">profit margin</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Available Deals</p>
            <AlertCircle className="w-4 h-4 text-orange-600" />
          </div>
          <p className="text-3xl font-bold text-orange-600">{data?.dealsAvailable ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">waiting review</p>
        </div>
      </div>

      {/* Channel Breakdown */}
      {data?.channelBreakdown && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Channel Performance</h3>
          <div className="grid grid-cols-3 gap-6">
            {Object.entries(data.channelBreakdown).map(([channel, stats]: [string, any]) => (
              <div key={channel} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 capitalize">
                  {channel.replace(/([A-Z])/g, ' $1').trim()}
                </p>
                <p className="text-2xl font-bold mb-1">{formatCurrency(stats.profit)}</p>
                <p className="text-xs text-gray-500">{stats.itemsSold} items sold</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
