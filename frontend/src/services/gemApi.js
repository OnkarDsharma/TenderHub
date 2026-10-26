/**
 * @file src/services/gemApi.js
 * @description Frontend API service for interacting with GeM (Government e-Marketplace) endpoints.
 */

import { api, API_BASE_URL } from './api';

export const gemApi = {
  /**
   * Fetch paginated list of GeM bids for Jammu & Kashmir
   * @param {Object} params Search and filter parameters
   */
  async getTenders(params = {}) {
    const response = await api.get('/gem/tenders', { params });
    return response.data;
  },

  /**
   * Fetch a single GeM bid details by ID or Bid Number
   * @param {string} id MongoDB _id or sourceTenderId
   */
  async getTenderById(id) {
    const response = await api.get(`/gem/tenders/${id}`);
    return response.data?.data;
  },

  /**
   * Fetch key GeM portal statistics
   * @param {Object} params Filter parameters (e.g. { state: 'Punjab' })
   */
  async getStats(params = {}) {
    const response = await api.get('/gem/stats', { params });
    return response.data?.stats;
  },

  /**
   * Trigger an on-demand GeM portal crawl
   */
  async triggerSync(options = {}) {
    const response = await api.post('/gem/sync', options);
    return response.data;
  },

  /**
   * Get direct PDF download URL proxied via backend with official session tokens
   * @param {string} idOrBidNumber Tender ID or sourceTenderId
   * @param {string} docUrl Optional direct document URL from GeM
   */
  getPdfDownloadUrl(idOrBidNumber, docUrl) {
    const base = API_BASE_URL;
    const cleanId = encodeURIComponent(idOrBidNumber || '');
    if (cleanId) {
      const query = docUrl ? `?url=${encodeURIComponent(docUrl)}` : '';
      return `${base}/gem/tenders/${cleanId}/pdf${query}`;
    }
    if (docUrl) {
      return `${base}/gem/pdf?url=${encodeURIComponent(docUrl)}`;
    }
    return '#';
  }
};
