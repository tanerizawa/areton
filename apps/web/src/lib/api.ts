import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Paths that definitely require an authenticated session on the client. Used
// only to decide *auto-redirect* behaviour (e.g. when a refresh attempt fails,
// users on these routes should be sent to /login). The Authorization header
// itself is attached unconditionally whenever a token is available.
const PROTECTED_PATH_PREFIXES = ['/user/', '/escort/'];

function isOnProtectedPage(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return PROTECTED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// Request interceptor — always attach the access token if we have one. The
// previous implementation only attached the token when the current pathname
// happened to start with `/user/` or `/escort/`, which silently broke requests
// from shared components (navbar, presence provider, etc.) rendered on public
// routes, and made it too easy to introduce regressions by adding new route
// prefixes.
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Shared refresh state to prevent concurrent refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

// Response interceptor — auto-refresh token on 401 (deduplicated). A failed
// refresh clears local credentials; a redirect to /login only happens when the
// user is currently on a protected page (public pages keep rendering anonymous
// content instead of being forcibly redirected).
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If a refresh is already in flight, queue this request for the new token.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject: (err: any) => reject(err),
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = typeof window !== 'undefined'
        ? localStorage.getItem('refreshToken')
        : null;
      if (!refreshToken) {
        throw new Error('No refresh token');
      }

      const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = response.data.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefreshToken);

      processQueue(null, accessToken);

      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        try {
          const { useAuthStore } = await import('@/stores/auth.store');
          useAuthStore.getState().setUser(null);
        } catch {
          /* ignore */
        }
        // Only force a redirect when we were actually on a protected page.
        if (isOnProtectedPage() && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
