import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { inventoryService } from '@/services/api';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const response = await inventoryService.getInventory();
      setInventory(response.data);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading inventory...</div>;
  }

  const locations = Object.entries(inventory || {});
  const totalValue = locations.reduce((sum, [_, items]: any) => {
    return sum + (items?.reduce((s: number, item: any) => s + item.acquisitionCost, 0) || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Inventory Value</p>
        <p className="text-3xl font-bold text-blue-600">{formatCurrency(totalValue)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {locations.map(([location, items]: any) => (
          <div key={location} className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 capitalize">{location.replace(/-/g, ' ')}</h3>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Items: <span className="font-bold text-lg">{items?.length || 0}</span></p>
              <p className="text-sm text-gray-600">Value: <span className="font-bold text-lg">{formatCurrency(
                items?.reduce((sum: number, item: any) => sum + item.acquisitionCost, 0) || 0
              )}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
