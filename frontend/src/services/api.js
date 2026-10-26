import axios from 'axios';

const PRODUCTION_RENDER_URL = 'https://tenderhub-4nbc.onrender.com/api/v1';
const LOCAL_DEV_URL = 'http://localhost:8000/api/v1';

const isProductionDomain = typeof window !== 'undefined' && 
  window.location.hostname !== 'localhost' && 
  window.location.hostname !== '127.0.0.1';

let rawUrl;
if (isProductionDomain) {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    rawUrl = envUrl;
  } else {
    rawUrl = PRODUCTION_RENDER_URL;
  }
} else {
  rawUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PRODUCTION_RENDER_URL : LOCAL_DEV_URL);
}

rawUrl = rawUrl.trim().replace(/\/+$/, '');
if (!rawUrl.endsWith('/api/v1')) {
  rawUrl = `${rawUrl}/api/v1`;
}

export const API_BASE_URL = rawUrl;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor for JWT tokens (filter out any dummy/mock strings)
api.interceptors.request.use((config) => {
  const isTestMode = import.meta.env.VITE_TEST_MODE === 'true' || (typeof window !== 'undefined' && window.location.port === '5175');
  if (isTestMode) {
    config.headers['x-bypass-auth'] = 'true';
    return config;
  }

  const token = localStorage.getItem('token');
  if (token && typeof token === 'string' && token.split('.').length === 3) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (token) {
    localStorage.removeItem('token');
  }
  return config;
}, (error) => Promise.reject(error));

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor: automatically attempt refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 && 
      originalRequest && 
      !originalRequest._retry && 
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/verify-otp') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await api.post('/auth/refresh');
        const newToken = res.data?.accessToken;
        if (newToken) {
          localStorage.setItem('token', newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem('token');
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
