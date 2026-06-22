import { useEffect, useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { dealsService, onDealApproved, onDealDiscovered } from '@/services/api';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';

interface Deal {
  id: string;
  title: string;
  sourceType: string;
  acquisitionCost: number;
  estimatedMarketPrice: number;
  marginPercent: number;
  profitEstimate: number;
  opportunityScore: number;
  status: string;
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [filter, setFilter] = useState('discovered');

  useEffect(() => {
    loadDeals();
  }, [filter]);

  const loadDeals = async () => {
    try {
      setLoading(true);
      const response = await dealsService.getDeals(filter);
      setDeals(response.data);
    } catch (error) {
      console.error('Failed to load deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (dealId: string) => {
    try {
      setApproving(dealId);
      await dealsService.approveDeal(dealId);
      setDeals(deals.filter(d => d.id !== dealId));
    } catch (error) {
      console.error('Failed to approve deal:', error);
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (dealId: string) => {
    try {
      setApproving(dealId);
      await dealsService.rejectDeal(dealId);
      setDeals(deals.filter(d => d.id !== dealId));
    } catch (error) {
      console.error('Failed to reject deal:', error);
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-6">
        {['discovered', 'approved', 'purchased', 'sold'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors capitalize ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : deals.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No deals found</div>
      ) : (
        <div className="grid gap-4">
          {deals.map(deal => (
            <div key={deal.id} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{deal.title}</h3>
                  <p className="text-sm text-gray-500">Source: {deal.sourceType}</p>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  Score: {deal.opportunityScore.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-4 mb-4 py-4 border-y">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Cost</p>
                  <p className="font-semibold">{formatCurrency(deal.acquisitionCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Market Price</p>
                  <p className="font-semibold">{formatCurrency(deal.estimatedMarketPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Profit</p>
                  <p className="font-semibold text-green-600">{formatCurrency(deal.profitEstimate)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Margin</p>
                  <p className="font-semibold text-blue-600">{formatPercent(deal.marginPercent)}</p>
                </div>
              </div>

              {filter === 'discovered' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(deal.id)}
                    disabled={approving === deal.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(deal.id)}
                    disabled={approving === deal.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
