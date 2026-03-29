import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../constants/theme';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const wsUrl = API_URL.replace('/api', '');
    socket = io(wsUrl, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
    });

    // When connected, announce presence and request initial online list
    socket.on('connect', () => {
      if (__DEV__) console.log('[Socket] connected');
      socket?.emit('go_online');
      socket?.emit('get_online_users');
    });

    // Handle connection errors gracefully
    socket.on('connect_error', (err) => {
      if (__DEV__) console.warn('[Socket] connect_error:', err.message);
    });

    socket.io.on('reconnect_failed', () => {
      if (__DEV__) console.warn('[Socket] reconnect_failed — giving up');
      socket?.disconnect();
    });
  }
  return socket;
}

export async function connectSocket() {
  try {
    const s = getSocket();
    const token = await SecureStore.getItemAsync('accessToken');
    if (token) {
      s.auth = { token };
      if (!s.connected) s.connect();
    }
  } catch {
    // SecureStore or socket init failure — non-critical
  }
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}
