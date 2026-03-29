import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import api from '../lib/api';

interface PresenceState {
  /** Set of user IDs currently online */
  onlineUsers: Set<string>;
  isOnline: (userId: string) => boolean;
  /** Fetch a single user's online status from API (fallback) */
  checkOnline: (userId: string) => Promise<boolean>;
  subscribe: () => () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set<string>(),

  isOnline: (userId: string) => get().onlineUsers.has(userId),

  checkOnline: async (userId: string) => {
    try {
      const { data } = await api.get(`/users/${userId}/status`);
      const online = data.data?.isOnline ?? data.data?.online ?? false;
      set((state) => {
        const next = new Set(state.onlineUsers);
        if (online) next.add(userId);
        else next.delete(userId);
        return { onlineUsers: next };
      });
      return online;
    } catch {
      return false;
    }
  },

  subscribe: () => {
    try {
      const socket = getSocket();
      if (!socket) return () => {};

      const handleOnline = ({ userId }: { userId: string }) => {
        set((state) => {
          const next = new Set(state.onlineUsers);
          next.add(userId);
          return { onlineUsers: next };
        });
      };

      const handleOffline = ({ userId }: { userId: string }) => {
        set((state) => {
          const next = new Set(state.onlineUsers);
          next.delete(userId);
          return { onlineUsers: next };
        });
      };

      // Handle initial bulk online users list from server
      const handleOnlineUsers = (userIds: string[]) => {
        if (Array.isArray(userIds)) {
          set({ onlineUsers: new Set(userIds) });
        }
      };

      socket.on('user:online', handleOnline);
      socket.on('user:offline', handleOffline);
      socket.on('online_users', handleOnlineUsers);

      // Request the initial list if already connected
      if (socket.connected) {
        socket.emit('get_online_users');
      }

      return () => {
        socket.off('user:online', handleOnline);
        socket.off('user:offline', handleOffline);
        socket.off('online_users', handleOnlineUsers);
      };
    } catch {
      // Socket not available — return no-op unsubscribe
      return () => {};
    }
  },
}));
