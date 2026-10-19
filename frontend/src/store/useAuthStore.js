/**
 * @file frontend/src/store/useAuthStore.js
 * @description Global Zustand authentication store managing session state,
 * Google OAuth redirection, and Email OTP verification.
 */
import { create } from 'zustand';
import { api } from '@/services/api';
import { useBookmarkStore } from './useBookmarkStore';

const PRODUCTION_API_URL = 'https://tenderhub-backend-jofq.onrender.com/api/v1';

const isTestMode = import.meta.env.VITE_TEST_MODE === 'true' || (typeof window !== 'undefined' && window.location.port === '5175');

const defaultTestUser = {
  id: '6abe2b7f4ec335668fdc702a',
  name: 'Test Reviewer (No Login)',
  email: 'tester@tenderhub.local',
  role: 'admin',
  dailyViews: {
    viewsUsed: 0,
    viewsLimit: 'Unlimited',
    viewsRemaining: 'Unlimited',
    resetsAt: null,
    resetsInMs: null,
  }
};

export const isProUser = (user) => {
  if (isTestMode) return true;
  if (!user) return false;
  return Boolean(
    user.isPro ||
    user.hasActiveSubscription ||
    user.subscription?.status === 'active' ||
    user.role === 'admin' ||
    user.role === 'superadmin' ||
    user.role === 'owner' ||
    user.dailyViews?.viewsLimit === 'Unlimited'
  );
};

export const extractTokenFromUrl = () => {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token && token.split('.').length === 3) {
      localStorage.setItem('token', token);
      url.searchParams.delete('token');
      url.searchParams.delete('auth');
      const newQuery = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
      window.history.replaceState({}, document.title, url.pathname + newQuery + url.hash);
      return token;
    }
  } catch {}
  return null;
};

// Immediate extraction on module load
extractTokenFromUrl();

const loadCachedUser = () => {
  if (isTestMode) return defaultTestUser;
  try {
    const raw = localStorage.getItem('tenderhub_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const initialCachedUser = loadCachedUser();

let checkAuthPromise = null;
let lastCheckAuthTime = 0;
const AUTH_CACHE_TTL = 30000; // 30 seconds memory cache

export const useAuthStore = create((set, get) => ({
  user: initialCachedUser,
  isAuthenticated: isTestMode ? true : Boolean(initialCachedUser || localStorage.getItem('token')),
  isPro: isTestMode ? true : isProUser(initialCachedUser),
  isLoading: isTestMode ? false : (!initialCachedUser && Boolean(localStorage.getItem('token'))),
  error: null,

  /**
   * Check session on application boot by calling /auth/me.
   * Extracts URL token if present and deduplicates concurrent calls.
   */
  checkAuth: async (force = false) => {
    if (isTestMode) {
      set({
        user: defaultTestUser,
        isAuthenticated: true,
        isPro: true,
        isLoading: false,
      });
      return defaultTestUser;
    }

    const urlToken = extractTokenFromUrl();
    const shouldForce = force || Boolean(urlToken);

    const now = Date.now();
    // Return cached user if checked recently and not forced
    if (!shouldForce && get().user && (now - lastCheckAuthTime < AUTH_CACHE_TTL)) {
      return get().user;
    }

    // Deduplicate concurrent in-flight requests
    if (checkAuthPromise) {
      return checkAuthPromise;
    }

    checkAuthPromise = (async () => {
      try {
        const res = await api.get('/auth/me');
        if (res.data?.success && res.data?.user) {
          const user = res.data.user;
          const isPro = isProUser(user);
          try {
            localStorage.setItem('tenderhub_user', JSON.stringify(user));
          } catch {}
          lastCheckAuthTime = Date.now();
          set({
            user,
            isAuthenticated: true,
            isPro,
            isLoading: false,
            error: null,
          });
          // Populate contractor-scoped bookmarks from MongoDB
          useBookmarkStore.getState().fetchSavedTenders();
          return user;
        } else {
          try {
            localStorage.removeItem('tenderhub_user');
          } catch {}
          set({ user: null, isAuthenticated: false, isPro: false, isLoading: false });
          return null;
        }
      } catch (err) {
        // 401 is normal for unauthenticated guests, do not treat as fatal error
        if (err.response?.status === 401) {
          try {
            localStorage.removeItem('tenderhub_user');
          } catch {}
          set({ user: null, isAuthenticated: false, isPro: false, isLoading: false });
        }
        return null;
      } finally {
        checkAuthPromise = null;
      }
    })();

    return checkAuthPromise;
  },

  /**
   * Optimistically / reactively update daily view counter state.
   */
  updateDailyViews: (dailyViews) => {
    if (!dailyViews) return;
    set((state) => {
      if (!state.user) return state;
      return {
        user: {
          ...state.user,
          dailyViews: {
            ...state.user.dailyViews,
            ...dailyViews,
          },
        },
      };
    });
  },

  /**
   * Request a 6-digit OTP code sent to user's email.
   * Supports type: 'login' | 'signup'
   */
  sendOtp: async (email, type = 'login') => {
    try {
      set({ error: null });
      const res = await api.post('/auth/send-otp', { email, type });
      return { success: true, data: res.data };
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to send verification code. Please try again.';
      const notFound = Boolean(err.response?.data?.notFound);
      const alreadyExists = Boolean(err.response?.data?.alreadyExists);
      set({ error: message });
      return { success: false, error: message, notFound, alreadyExists };
    }
  },

  /**
   * Verify the 6-digit OTP code, complete registration or sign-in, and establish session.
   * Supports optional contractor profileDetails during signup.
   */
  verifyOtp: async (email, otp, type = 'login', profileDetails = {}) => {
    try {
      set({ error: null });
      const res = await api.post('/auth/verify-otp', { email, otp, type, profileDetails });
      if (res.data?.success && res.data?.user) {
        if (res.data.accessToken) {
          localStorage.setItem('token', res.data.accessToken);
        }
        const user = res.data.user;
        const isPro = isProUser(user);
        try {
          localStorage.setItem('tenderhub_user', JSON.stringify(user));
        } catch {}
        lastCheckAuthTime = Date.now();
        set({
          user,
          isAuthenticated: true,
          isPro,
          isLoading: false,
        });
        // Sync any guest bookmarks and load contractor's persistent list
        useBookmarkStore.getState().syncWithBackend();
        return { success: true, user };
      }
      return { success: false, error: 'Verification failed.' };
    } catch (err) {
      const message = err.response?.data?.error || 'Verification failed. Please check your code.';
      set({ error: message });
      return { success: false, error: message };
    }
  },

  /**
   * Trigger the server-side Google OAuth 2.0 flow.
   * Supports mode: 'login' | 'signup'
   */
  loginWithGoogle: (mode = 'login', redirectPath = '') => {
    const frontendOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    // OAuth leaves the frontend and returns to the backend, so a localhost API
    // URL baked into an old or misconfigured production bundle would send mobile
    // users to localhost on their own device. Always use the deployed API for
    // hosted frontends; localhost remains available for local development.
    const isLocalFrontend = typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const configuredBackend = (api.defaults.baseURL || '').trim().replace(/\/+$/, '');
    const backendUrl = isLocalFrontend
      ? (configuredBackend || 'http://localhost:8000/api/v1')
      : (configuredBackend && !/localhost|127\.0\.0\.1/i.test(configuredBackend)
        ? configuredBackend
        : PRODUCTION_API_URL);
    const currentRedirect = redirectPath || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : '') || '';
    const originParam = frontendOrigin ? `&frontendUrl=${encodeURIComponent(frontendOrigin)}` : '';
    const redirectParam = currentRedirect ? `&redirect=${encodeURIComponent(currentRedirect)}` : '';
    window.location.href = `${backendUrl}/auth/google?mode=${mode}${originParam}${redirectParam}`;
  },

  /**
   * Terminate the session and clear cookies.
   */
  logout: async () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('tenderhub_user');
      lastCheckAuthTime = 0;
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout request failed:', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('tenderhub_user');
      lastCheckAuthTime = 0;
      // Clear contractor-scoped bookmarks from local memory
      useBookmarkStore.getState().clearBookmarks();
      set({
        user: null,
        isAuthenticated: false,
        isPro: false,
        isLoading: false,
        error: null,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
