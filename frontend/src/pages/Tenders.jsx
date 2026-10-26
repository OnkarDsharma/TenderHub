/**
 * @file src/pages/Tenders.jsx
 * @description Official public procurement directory for Northern Region (J&K, HP, Punjab, Ladakh).
 * Redesigned to match the GeM tenders UI layout with Left Filter Sidebar,
 * verified metric counters, and unified View bid, AI analysis, and Download PDF actions.
 */
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Search, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Archive, 
  CalendarX,
  MapPin,
  Layers,
  Sparkles,
  Lock,
  Landmark,
  AlertCircle
} from 'lucide-react';

import { useTenders } from '@/hooks/useTenders';
import { useDebounce } from '@/hooks/useDebounce';
import { TenderCard } from '@/components/shared/TenderCard';
import { AuthPromptModal } from '@/components/shared/AuthPromptModal';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/Button';

// Northern Region State Options matching GeM portal
const STATE_OPTIONS = [
  { label: 'All Northern States', value: '' },
  { label: 'Jammu & Kashmir', value: 'Jammu & Kashmir' },
  { label: 'Himachal Pradesh', value: 'Himachal Pradesh' },
  { label: 'Punjab', value: 'Punjab' },
  { label: 'Ladakh', value: 'Ladakh' },
];

// District Options by State
const DISTRICTS_BY_STATE = {
  'Jammu & Kashmir': [
    { label: 'All J&K Locations', value: '' },
    { label: 'Jammu', value: 'Jammu' },
    { label: 'Srinagar', value: 'Srinagar' },
    { label: 'Anantnag', value: 'Anantnag' },
    { label: 'Baramulla', value: 'Baramulla' },
    { label: 'Budgam', value: 'Budgam' },
    { label: 'Pulwama', value: 'Pulwama' },
    { label: 'Kupwara', value: 'Kupwara' },
    { label: 'Doda', value: 'Doda' },
    { label: 'Rajouri', value: 'Rajouri' },
    { label: 'Poonch', value: 'Poonch' },
    { label: 'Kathua', value: 'Kathua' },
    { label: 'Udhampur', value: 'Udhampur' },
    { label: 'Samba', value: 'Samba' },
    { label: 'Ramban', value: 'Ramban' },
    { label: 'Reasi', value: 'Reasi' },
    { label: 'Kishtwar', value: 'Kishtwar' },
    { label: 'Ganderbal', value: 'Ganderbal' },
    { label: 'Bandipora', value: 'Bandipora' },
    { label: 'Kulgam', value: 'Kulgam' },
    { label: 'Shopian', value: 'Shopian' },
  ],
  'Himachal Pradesh': [
    { label: 'All Himachal Locations', value: '' },
    { label: 'Shimla', value: 'Shimla' },
    { label: 'Dharamshala', value: 'Dharamshala' },
    { label: 'Kangra', value: 'Kangra' },
    { label: 'Mandi', value: 'Mandi' },
    { label: 'Kullu', value: 'Kullu' },
    { label: 'Solan', value: 'Solan' },
    { label: 'Sirmaur', value: 'Sirmaur' },
    { label: 'Chamba', value: 'Chamba' },
    { label: 'Hamirpur', value: 'Hamirpur' },
    { label: 'Una', value: 'Una' },
    { label: 'Bilaspur', value: 'Bilaspur' },
  ],
  'Punjab': [
    { label: 'All Punjab Locations', value: '' },
    { label: 'Ludhiana', value: 'Ludhiana' },
    { label: 'Amritsar', value: 'Amritsar' },
    { label: 'Jalandhar', value: 'Jalandhar' },
    { label: 'Patiala', value: 'Patiala' },
    { label: 'Bathinda', value: 'Bathinda' },
    { label: 'Mohali', value: 'Mohali' },
    { label: 'Hoshiarpur', value: 'Hoshiarpur' },
    { label: 'Pathankot', value: 'Pathankot' },
    { label: 'Firozpur', value: 'Firozpur' },
    { label: 'Sangrur', value: 'Sangrur' },
  ],
  'Ladakh': [
    { label: 'All Ladakh Locations', value: '' },
    { label: 'Leh', value: 'Leh' },
    { label: 'Kargil', value: 'Kargil' },
  ],
};

const ALL_LOCATION_OPTIONS = [
  { label: 'All Northern Delivery Locations', value: '' },
  { label: 'Jammu', value: 'Jammu' },
  { label: 'Srinagar', value: 'Srinagar' },
  { label: 'Rajouri', value: 'Rajouri' },
  { label: 'Poonch', value: 'Poonch' },
  { label: 'Shimla', value: 'Shimla' },
  { label: 'Dharamshala', value: 'Dharamshala' },
  { label: 'Kangra', value: 'Kangra' },
  { label: 'Ludhiana', value: 'Ludhiana' },
  { label: 'Amritsar', value: 'Amritsar' },
  { label: 'Mohali', value: 'Mohali' },
  { label: 'Leh', value: 'Leh' },
  { label: 'Kargil', value: 'Kargil' },
];

const CATEGORY_OPTIONS = [
  { label: 'All Work Domains', value: '' },
  { label: 'Civil Works (Buildings, Roads & General)', value: 'Civil Works' },
  { label: 'Electrical Works', value: 'Electrical Works' },
  { label: 'Drilling Works & Boring', value: 'Drilling Works' },
  { label: 'Medical Equipments & Supplies', value: 'Medical Equipments' },
  { label: 'Machineries & Mechanical Engg Items', value: 'Machineries' },
  { label: 'Agricultural or Forestry Works', value: 'Agricultural or Forestry' },
  { label: 'Repair & Maintenance Works', value: 'Repair and Maintenance Works' },
  { label: 'Civil Works - Water Works & Distribution', value: 'Water Works' },
  { label: 'Supply of Materials & Aggregate', value: 'Supply of Materials' },
  { label: 'Consultancy & Technical Advisory', value: 'Consultancy' },
];

export default function Tenders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, isPro } = useAuthStore();

  // Auth Prompt Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    title: 'Sign In to View Full Tender Details',
    subtitle: 'Official tender documents, BOQs, and authority specifications are protected.',
    redirectUrl: '/tenders'
  });

  const handleRequestAuth = (config = {}) => {
    setAuthModalConfig((prev) => ({ ...prev, ...config }));
    setAuthModalOpen(true);
  };

  const handleViewDetails = (tender) => {
    const tenderId = tender._id || tender.sourceTenderId;
    navigate(`/tenders/${tenderId}`);
  };

  // Initial State from URL params
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('category') || '';
  const initialState = searchParams.get('state') || '';

  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const debouncedSearch = useDebounce(appliedSearch, 300);

  const [state, setState] = useState(initialState);
  const [category, setCategory] = useState(initialCategory);
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [closingDays, setClosingDays] = useState(searchParams.get('closingDays') || '');
  const [status, setStatus] = useState('active');
  const [sortBy, setSortBy] = useState('arrival');
  const [currentPage, setCurrentPage] = useState(1);

  // Dynamic District Options based on State
  const activeLocationOptions = state && DISTRICTS_BY_STATE[state]
    ? DISTRICTS_BY_STATE[state]
    : ALL_LOCATION_OPTIONS;

  // Standard query pagination limit for directory listings
  const queryLimit = 12;

  // Construct API Query
  const queryFilters = {
    search: debouncedSearch,
    state: state || undefined,
    category: category,
    location: location,
    closingDays: closingDays,
    status: status,
    sortBy: sortBy,
    page: currentPage,
    limit: queryLimit,
  };

  const { data, isLoading, isError, error } = useTenders(queryFilters);

  const tenders = data?.data || [];
  const totalCount = data?.meta?.total || 0;
  const activeCount = data?.meta?.activeCount ?? 0;
  const archivedCount = data?.meta?.archivedCount ?? 0;
  const expiredCount = data?.meta?.expiredCount ?? 0;
  const closingSoonCount = data?.meta?.closingSoonCount ?? 0;
  const totalPages = Math.ceil(totalCount / queryLimit) || 1;

  // Handlers
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const handleStateChange = (stateVal) => {
    setState(stateVal);
    setLocation('');
    setCurrentPage(1);
  };

  const handleReset = () => {
    setSearch('');
    setAppliedSearch('');
    setState('');
    setCategory('');
    setLocation('');
    setClosingDays('');
    setStatus('active');
    setSortBy('arrival');
    setCurrentPage(1);
    setSearchParams({});
  };

  const handlePageChange = (newPage) => {
    const targetPage = Math.min(totalPages, Math.max(1, Math.trunc(Number(newPage) || 1)));
    setCurrentPage(targetPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageJump = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedPage = Number(formData.get('page'));
    if (!Number.isInteger(requestedPage) || requestedPage < 1) return;
    handlePageChange(requestedPage);
  };

  return (
    <div className="gem-page flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-6 sm:py-8 transition-colors duration-200">
      <div className="gem-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* 1. Header Banner Card matching GeM Layout */}
        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
                <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
                <span>Public Procurement Portal • {state || 'Northern Region'}</span>
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
              Public procurement &amp; tender notices
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Live bids from Central Government, State Departments, PWD, Jal Shakti, and PSUs, with delivery locations across {state || 'Jammu & Kashmir, Himachal Pradesh, Punjab and Ladakh'}.
            </p>
          </div>

          {/* Metric Counters matching GeM tenders */}
          <div className="gem-summary shrink-0">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
              <span className="text-lg sm:text-xl font-mono font-bold text-slate-900 dark:text-white block">
                {totalCount.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                Matching bids
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
              <span className="text-lg sm:text-xl font-mono font-bold text-amber-700 dark:text-amber-400 block">
                {closingSoonCount || 0}
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                Closing within 48h
              </span>
            </div>
            <p className="gem-source-note text-[11px] text-slate-500 dark:text-slate-400">Source: State eProcurement Portals</p>
          </div>
        </div>

        {/* Search stays visible beneath the site navigation while browsing results. */}
        <div className="gem-search-sticky bg-white dark:bg-slate-900 rounded-xl p-3 sm:p-4 shadow-xs border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bid number, item, department…" className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-dalBlue" />
            </div>
            <button type="submit" className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-dalBlue hover:bg-dalBlue/90 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer"><span>Search Bids</span></button>
          </form>
        </div>

        {/* 2. Left Filter Panel (Sticky Sidebar) */}
        <div className="gem-filter-panel bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 shadow-xs border border-slate-200 dark:border-slate-800 space-y-4">
          {/* State Filter Navigation Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1 shrink-0 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-dalBlue" /> Region:
            </span>
            {STATE_OPTIONS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleStateChange(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  state === tab.value
                    ? 'bg-dalBlue text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Secondary Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            {/* Consignee / District Location */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                {state ? `Consignee Location (${state})` : 'Consignee Location'}
              </label>
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                {activeLocationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Submission Deadline */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Submission Deadline
              </label>
              <select
                value={closingDays}
                onChange={(e) => {
                  setClosingDays(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                <option value="">All Deadlines</option>
                <option value="2">Closing in 48 Hours</option>
                <option value="7">Closing in 7 Days</option>
                <option value="15">Closing in 15 Days</option>
                <option value="30">Closing in 30 Days</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Sort Order
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                <option value="arrival">Recently Published</option>
                <option value="closingAsc">Closing Soonest</option>
                <option value="closingDesc">Closing Latest</option>
                <option value="valueDesc">Highest Estimated Value</option>
                <option value="valueAsc">Lowest Estimated Value</option>
              </select>
            </div>

            {/* Work Category / Domain */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Work Category / Domain
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters */}
            <div className="flex items-end col-span-full">
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Results Column */}
        <div className="gem-results-column space-y-4">
          
          {/* Status Tabs: Active, Archived, Expired */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 sm:p-2.5 rounded-xl shadow-xs">
            <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setStatus('active');
                  setCurrentPage(1);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                  status === 'active'
                    ? 'bg-white dark:bg-slate-900 text-dalBlue dark:text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Active Notices</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold bg-blue-50 dark:bg-blue-950/60 text-dalBlue dark:text-blue-300">
                  {activeCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatus('archived');
                  setCurrentPage(1);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                  status === 'archived'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span>Archived</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  {archivedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatus('expired');
                  setCurrentPage(1);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                  status === 'expired'
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <CalendarX className="w-3.5 h-3.5 shrink-0" />
                <span>Expired</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {expiredCount}
                </span>
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 px-1">
              Showing <strong className="font-mono text-slate-900 dark:text-white">{totalCount.toLocaleString('en-IN')}</strong> bids
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-3 border-dalBlue border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading tender notices...</p>
            </div>
          )}

          {/* Error State */}
          {isError && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-6 text-center text-red-600 dark:text-red-400">
              <AlertCircle className="w-6 h-6 mx-auto mb-2" />
              <p className="text-sm font-semibold">{error?.message || 'Unable to connect to tender directory. Please try again.'}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !isError && tenders.length === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-3">
              <Layers className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                {status === 'archived' ? 'No Archived Notices Found' : status === 'expired' ? 'No Expired Notices Found' : 'No Matching Tender Notices'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No tender notices match your selected search criteria for {state || 'this region'}. Try clearing some filters or changing state.
              </p>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          )}

          {/* Tenders Bid List matching GeM Feed */}
          {!isLoading && !isError && tenders.length > 0 && (
            <div className="gem-bid-list">
              {tenders.map((tender) => (
                <TenderCard 
                  key={tender._id || tender.sourceTenderId}
                  tender={tender} 
                  isBlurred={false}
                  onViewDetails={() => handleViewDetails(tender)}
                />
              ))}
            </div>
          )}

          {/* 4. Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4 border-t border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500">
                Page <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span> of{' '}
                <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span> ({totalCount} total bids)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer hover:border-dalBlue dark:hover:border-blue-400 transition-colors shrink-0"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <form onSubmit={handlePageJump} className="flex items-center gap-1.5" aria-label="Jump to tender page">
                  <label htmlFor="tender-page-jump" className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Go to</label>
                  <input
                    key={currentPage}
                    id="tender-page-jump"
                    name="page"
                    type="number"
                    min="1"
                    max={totalPages}
                    step="1"
                    defaultValue={currentPage}
                    aria-label={`Page number, from 1 to ${totalPages}`}
                    className="!min-h-0 h-8 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 text-center text-xs font-mono font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-1.5 focus:ring-dalBlue shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button type="submit" className="!min-h-0 h-8 px-2.5 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-dalBlue dark:hover:border-blue-400 transition-colors shrink-0">Go</button>
                </form>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer hover:border-dalBlue dark:hover:border-blue-400 transition-colors shrink-0"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Auth Prompt Modal */}
      <AuthPromptModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        title={authModalConfig.title}
        subtitle={authModalConfig.subtitle}
        redirectUrl={authModalConfig.redirectUrl}
      />
    </div>
  );
}
