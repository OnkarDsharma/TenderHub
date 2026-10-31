/**
 * @file frontend/src/mocks/mockApi.js
 * @description Dev-only, frontend-side mock of the backend API. When enabled it
 * answers the axios client with fixture data so the whole UI can be browsed
 * while the real backend is offline. Never active in production builds.
 *
 * Enable:  open any page with `?mock=1`  (or `localStorage.tndrr_mock = '1'`)
 * Disable: open any page with `?mock=0`  (or remove the key)
 * Sign in: any email, OTP 123456
 */
import axios from 'axios';
import { buildHandlers } from './handlers';

export const MOCK_FLAG = 'tndrr_mock';
export const MOCK_OTP = '123456';

export function isMockEnabled() {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(MOCK_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Reads `?mock=1|0` from the URL, persists it, and strips the param. */
export function applyMockQueryToggle() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('mock');
    if (value === null) return;
    if (['1', 'on', 'true', 'yes'].includes(value.toLowerCase())) {
      localStorage.setItem(MOCK_FLAG, '1');
    } else {
      localStorage.removeItem(MOCK_FLAG);
    }
    url.searchParams.delete('mock');
    const search = url.searchParams.toString();
    window.history.replaceState({}, document.title, url.pathname + (search ? `?${search}` : '') + url.hash);
  } catch {
    /* ignore */
  }
}

export function setMockEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(MOCK_FLAG, '1');
    else localStorage.removeItem(MOCK_FLAG);
  } catch {
    /* ignore */
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseRequest(config) {
  const base = (config.baseURL || '').replace(/\/+$/, '');
  let raw = config.url || '';
  if (base && raw.startsWith(base)) raw = raw.slice(base.length);
  const url = new URL(raw, 'http://mock.local');
  const query = Object.fromEntries(url.searchParams.entries());
  if (config.params && typeof config.params === 'object') {
    for (const [k, v] of Object.entries(config.params)) {
      if (v !== undefined && v !== null && v !== '') query[k] = String(v);
    }
  }
  let body = config.data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep raw */ }
  }
  return {
    method: (config.method || 'get').toLowerCase(),
    path: url.pathname.replace(/\/+$/, '') || '/',
    query,
    body: body || {},
    headers: config.headers || {},
  };
}

function compile(pattern) {
  const keys = [];
  const source = pattern
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, key) => { keys.push(key); return '/([^/]+)'; })
    .replace(/\//g, '\\/');
  return { regex: new RegExp(`^${source}$`), keys };
}

/**
 * Installs the mock adapter on an axios instance. Unknown routes fall through
 * to the real network adapter so nothing is silently swallowed.
 */
export function installMockApi(api) {
  const realAdapter = axios.getAdapter(api.defaults.adapter);
  const handlers = buildHandlers();
  const table = handlers.map(([method, pattern, fn]) => ({ method, ...compile(pattern), fn }));

  api.defaults.adapter = async (config) => {
    const req = parseRequest(config);
    const match = table.find((r) => r.method === req.method && r.regex.test(req.path));
    if (!match) return realAdapter(config);

    const m = req.path.match(match.regex);
    const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));

    await delay(120 + Math.random() * 260);

    const respond = (data, status = 200) => ({
      data,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'x-mock': '1' },
      config,
      request: {},
    });

    try {
      const result = await match.fn({ ...req, params, respond, config });
      if (result && result.__mockResponse) return result;
      return respond(result);
    } catch (err) {
      if (err && err.__mockError) {
        const response = respond(err.data, err.status);
        throw new axios.AxiosError(err.data?.error || err.data?.message || 'Mock error', 'ERR_BAD_RESPONSE', config, {}, response);
      }
      throw err;
    }
  };

  if (typeof console !== 'undefined') {
    console.info('%c[tndrr] Mock API active — any email + OTP 123456 signs in. Add ?mock=0 to disable.', 'color:#2563eb;font-weight:600');
  }
}

/** Helper for handlers: throw an HTTP-style error. */
export function httpError(status, data) {
  return { __mockError: true, status, data };
}
