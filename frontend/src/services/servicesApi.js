/**
 * @file frontend/src/services/servicesApi.js
 * @description API client for Personalized Contractor AI Agent, Tender Dossier, and Services Plans.
 */
import { api } from './api';

export const servicesApi = {
  // Fetch AI Plans with cost breakdown and features
  getPlans: async () => {
    const res = await api.get('/services/plans');
    return res.data?.plans || [];
  },

  // Get current contractor AI memory and profile
  getContractorProfile: async () => {
    const res = await api.get('/services/contractor-profile');
    return res.data?.profile;
  },

  // Update contractor profile & machinery
  updateContractorProfile: async (profileData) => {
    const res = await api.put('/services/contractor-profile', profileData);
    return res.data?.profile;
  },

  // Trigger or retrieve full AI Dossier for a tender
  analyzeTender: async (tenderId) => {
    const res = await api.post('/services/analyze', { tenderId });
    return res.data;
  },

  // Get existing AI Dossier for tender
  getTenderDossier: async (tenderId) => {
    const res = await api.get('/services/dossier', { params: { tenderId } });
    return res.data;
  },

  // Ask question to Personalized Copilot
  askCopilot: async (tenderId, message) => {
    const res = await api.post('/services/chat', { tenderId, message });
    return res.data;
  },

  // List all tenders analyzed for this contractor
  getMyDossiers: async () => {
    const res = await api.get('/services/my-dossiers');
    return res.data?.dossiers || [];
  },
};
