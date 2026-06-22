import { useEffect, useState } from 'react';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';
import { salesService } from '@/services/api';

export default function SalesPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    loadSales();
  }, [days]);

  const loadSales = async () => {
    try {
      setLoading(true);
      const response = await salesService.getSales(days);
      setSales(response.data.sales);
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Failed to load sales:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 7, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              days === d
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            Last {d} day{d > 1 ? 's' : ''}
          </button>
        ))}
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Sales</p>
            <p className="text-3xl font-bold">{summary.totalSales}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Revenue</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(summary.totalRevenue)}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Profit</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalProfit)}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Margin</p>
            <p className="text-3xl font-bold text-purple-600">{formatPercent(summary.avgMargin)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading sales data...</div>
      ) : sales.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No sales recorded</div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Channel</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Fees</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Profit</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale, i) => (
                <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="px-6 py-4 text-sm">{formatDate(sale.saleDate)}</td>
                  <td className="px-6 py-4 text-sm capitalize">{sale.channel}</td>
                  <td className="px-6 py-4 text-sm font-medium">{formatCurrency(sale.finalPrice)}</td>
                  <td className="px-6 py-4 text-sm">{formatCurrency(sale.platformFees)}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-green-600">{formatCurrency(sale.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
