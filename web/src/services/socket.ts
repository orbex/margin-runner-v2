import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initializeSocket = () => {
  if (socket) return socket;

  socket = io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('✅ Connected to WebSocket');
    socket?.emit('subscribe:kpi');
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from WebSocket');
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

export const onDealDiscovered = (callback: (deal: any) => void) => {
  getSocket().on('deal:discovered', callback);
};

export const onDealApproved = (callback: (data: any) => void) => {
  getSocket().on('deal:approved', callback);
};

export const onListingCreated = (callback: (listing: any) => void) => {
  getSocket().on('listing:created', callback);
};

export const onSaleRecorded = (callback: (sale: any) => void) => {
  getSocket().on('sale:recorded', callback);
};

export const onKPIUpdated = (callback: (kpi: any) => void) => {
  getSocket().on('kpi:updated', callback);
};

export const offDealDiscovered = (callback: (deal: any) => void) => {
  getSocket().off('deal:discovered', callback);
};
