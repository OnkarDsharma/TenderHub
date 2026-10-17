/**
 * @file src/hooks/useTenders.js
 * @description React Query hook to fetch and cache paginated/filtered tenders.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export const useTenders = (filters = {}) => {
  return useQuery({
    // The queryKey ensures React Query caches data uniquely per filter combination
    queryKey: ['tenders', filters],
    
    queryFn: async () => {
      // Clean up filters to remove empty strings or undefined values
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v != null && v !== '')
      );
      
      const response = await api.get('/tenders', { params: cleanFilters });
      return response.data;
    },
    
    // Keep data fresh for 5 minutes to avoid redundant network requests
    staleTime: 1000 * 60 * 5, 
    keepPreviousData: true, // Prevents UI flickering during pagination
  });
};

// Add this below your existing useTenders hook in src/hooks/useTenders.js

export const useTender = (id) => {
  return useQuery({
    queryKey: ['tender', id],
    queryFn: async () => {
      const response = await api.get(`/tenders/${id}`);
      return response.data;
    },
    enabled: !!id, // Only run the query if an ID is provided
    staleTime: 1000 * 60 * 5,
  });
};

export const useTenderStats = (params = {}) => {
  return useQuery({
    queryKey: ['tenderStats', params],
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      );
      const response = await api.get('/tenders/stats', { params: cleanParams });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};