import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../lib/api';
import { User } from '../constants/types';
import { connectSocket, disconnectSocket } from '../lib/socket';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role?: 'CLIENT' | 'ESCORT';
  }) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken').catch(() => null);
      if (token) {
        await get().fetchProfile();
      }
    } catch {
      await SecureStore.deleteItemAsync('accessToken').catch(() => {});
      await SecureStore.deleteItemAsync('refreshToken').catch(() => {});
    } finally {
      set({ isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = data.data;
      await SecureStore.setItemAsync('accessToken', accessToken).catch(() => {});
      await SecureStore.setItemAsync('refreshToken', refreshToken).catch(() => {});
      set({ user, isAuthenticated: true });
      connectSocket();
    } catch (err: any) {
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (payload) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/register', payload);
      const { user, accessToken, refreshToken } = data.data;
      await SecureStore.setItemAsync('accessToken', accessToken).catch(() => {});
      await SecureStore.setItemAsync('refreshToken', refreshToken).catch(() => {});
      set({ user, isAuthenticated: true });
      connectSocket();
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    await SecureStore.deleteItemAsync('accessToken').catch(() => {});
    await SecureStore.deleteItemAsync('refreshToken').catch(() => {});
    disconnectSocket();
    set({ user: null, isAuthenticated: false });
  },

  fetchProfile: async () => {
    const { data } = await api.get('/auth/profile');
    set({ user: data.data, isAuthenticated: true });
    connectSocket();
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
