import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const dealsService = {
  getDashboard: () => api.get('/dashboard'),
  getDeals: (status?: string) => api.get('/deals', { params: { status } }),
  approveDeal: (id: string) => api.post(`/deals/${id}/approve`),
  rejectDeal: (id: string) => api.post(`/deals/${id}/reject`),
};

export const inventoryService = {
  getInventory: () => api.get('/inventory'),
  createListing: (id: string, channel: string, price: number) =>
    api.post(`/inventory/${id}/list`, { channel, price }),
};

export const listingsService = {
  getListings: () => api.get('/listings'),
};

export const salesService = {
  getSales: (days?: number) => api.get('/sales', { params: { days } }),
};

export const reportsService = {
  getWeeklyKPI: () => api.get('/weekly-kpi'),
};

export const agentsService = {
  triggerSourcing: () => api.post('/agents/source'),
  triggerCEOReview: () => api.post('/agents/ceo-review'),
  triggerReconciliation: () => api.post('/agents/reconcile'),
};

export const settingsService = {
  getSettings: () => api.get('/settings'),
  saveSettings: (settings: any) => api.post('/settings', settings),
};

export default api;
