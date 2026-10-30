/**
 * @file src/pages/Tenders.jsx
 * @description Official public procurement directory for Northern Region (J&K, HP, Punjab, Ladakh).
 * Redesigned with a Left Filter Sidebar matching the procurement portal interface,
 * comprehensive filters (Keywords, Published Dates, Portal, State, City, Procurement Type,
 * Tender Amount, Category, Organisation, Fee Preferences, Advanced Filters), verified metric counters,
 * and unified View bid, AI analysis, and Download PDF actions.
 */
import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Search, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Archive, 
  CalendarX,
  Layers,
  Landmark,
  AlertCircle,
  Filter,
  X,
  SlidersHorizontal,
  ArrowUpDown
} from 'lucide-react';

import { useTenders, useTenderOrganizations } from '@/hooks/useTenders';
import { useDebounce } from '@/hooks/useDebounce';
import { TenderCard } from '@/components/shared/TenderCard';
import { AuthPromptModal } from '@/components/shared/AuthPromptModal';
import { useAuthStore } from '@/store/useAuthStore';
import { TenderFilterSidebar } from '@/components/tenders/TenderFilterSidebar';

export default function Tenders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, isPro } = useAuthStore();

  // Mobile Filter Drawer Toggle
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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

  // --- Filter States (Initialized from URL parameters) ---
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [appliedSearch, setAppliedSearch] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(appliedSearch, 300);

  const [portal, setPortal] = useState(searchParams.get('portal') || 'ALL');
  const [state, setState] = useState(searchParams.get('state') || '');
  const [city, setCity] = useState(searchParams.get('city') || searchParams.get('location') || '');
  const [procurementType, setProcurementType] = useState(searchParams.get('procurementType') || '');
  const [tenderAmountRange, setTenderAmountRange] = useState(searchParams.get('tenderAmountRange') || 'any');
  const [minAmount, setMinAmount] = useState(searchParams.get('minAmount') || '');
  const [maxAmount, setMaxAmount] = useState(searchParams.get('maxAmount') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [organization, setOrganization] = useState(searchParams.get('organization') || '');
  const [feePreference, setFeePreference] = useState(searchParams.get('feePreference') || 'any');
  const [publishedRange, setPublishedRange] = useState(searchParams.get('publishedRange') || 'all');
  const [publishedFrom, setPublishedFrom] = useState(searchParams.get('publishedFrom') || '');
  const [publishedTo, setPublishedTo] = useState(searchParams.get('publishedTo') || '');
  
  const [keywords, setKeywords] = useState(
    searchParams.get('keywords') ? searchParams.get('keywords').split(',').map(k => k.trim()).filter(Boolean) : []
  );

  const [advancedFilters, setAdvancedFilters] = useState({
    hasPreBid: searchParams.get('hasPreBid') === 'true',
    withdrawalAllowed: searchParams.get('withdrawalAllowed') === 'true',
    twoStageBidding: searchParams.get('twoStageBidding') === 'true',
    preferentialBidder: searchParams.get('preferentialBidder') === 'true',
    tendererClass: searchParams.get('tendererClass') || '',
  });

  const [advancedSearch, setAdvancedSearch] = useState({
    exactPhrase: searchParams.get('exactPhrase') || '',
    anyWords: searchParams.get('anyWords') || '',
    excludeWords: searchParams.get('excludeWords') || '',
    referenceNumber: searchParams.get('referenceNumber') || '',
  });

  const [closingDays, setClosingDays] = useState(searchParams.get('closingDays') || '');
  const [status, setStatus] = useState('active');
  const [sortBy, setSortBy] = useState('arrival');
  const [currentPage, setCurrentPage] = useState(1);

  // Standard query pagination limit for directory listings
  const queryLimit = 12;
  const { data: organizations = [] } = useTenderOrganizations(state);

  // Construct API Query
  const queryFilters = useMemo(() => {
    return {
      search: debouncedSearch || undefined,
      portal: portal && portal !== 'ALL' ? portal : undefined,
      state: state || undefined,
      city: city || undefined,
      location: city || undefined,
      category: category || undefined,
      procurementType: procurementType || undefined,
      tenderAmountRange: tenderAmountRange && tenderAmountRange !== 'any' ? tenderAmountRange : undefined,
      minAmount: minAmount || undefined,
      maxAmount: maxAmount || undefined,
      organisation: organization || undefined,
      feePreference: feePreference && feePreference !== 'any' ? feePreference : undefined,
      publishedRange: publishedRange && publishedRange !== 'all' ? publishedRange : undefined,
      publishedFrom: publishedFrom || undefined,
      publishedTo: publishedTo || undefined,
      keywords: keywords.length > 0 ? keywords.join(',') : undefined,
      hasPreBid: advancedFilters.hasPreBid ? 'true' : undefined,
      withdrawalAllowed: advancedFilters.withdrawalAllowed ? 'true' : undefined,
      twoStageBidding: advancedFilters.twoStageBidding ? 'true' : undefined,
      preferentialBidder: advancedFilters.preferentialBidder ? 'true' : undefined,
      tendererClass: advancedFilters.tendererClass || undefined,
      exactPhrase: advancedSearch.exactPhrase || undefined,
      anyWords: advancedSearch.anyWords || undefined,
      excludeWords: advancedSearch.excludeWords || undefined,
      referenceNumber: advancedSearch.referenceNumber || undefined,
      closingDays: closingDays || undefined,
      status: status,
      sortBy: sortBy,
      page: currentPage,
      limit: queryLimit,
    };
  }, [
    debouncedSearch,
    portal,
    state,
    city,
    category,
    procurementType,
    tenderAmountRange,
    minAmount,
    maxAmount,
    organization,
    feePreference,
    publishedRange,
    publishedFrom,
    publishedTo,
    keywords,
    advancedFilters,
    advancedSearch,
    closingDays,
    status,
    sortBy,
    currentPage,
    queryLimit,
  ]);

  const { data, isLoading, isError, error } = useTenders(queryFilters);

  const tenders = data?.data || [];
  const totalCount = data?.meta?.total || 0;
  const activeCount = data?.meta?.activeCount ?? 0;
  const archivedCount = data?.meta?.archivedCount ?? 0;
  const expiredCount = data?.meta?.expiredCount ?? 0;
  const closingSoonCount = data?.meta?.closingSoonCount ?? 0;
  const totalPages = Math.ceil(totalCount / queryLimit) || 1;

  // Search Handler
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  // Reset All Filters
  const handleReset = () => {
    setSearch('');
    setAppliedSearch('');
    setPortal('ALL');
    setState('');
    setCity('');
    setProcurementType('');
    setTenderAmountRange('any');
    setMinAmount('');
    setMaxAmount('');
    setCategory('');
    setOrganization('');
    setFeePreference('any');
    setPublishedRange('all');
    setPublishedFrom('');
    setPublishedTo('');
    setKeywords([]);
    setAdvancedFilters({
      hasPreBid: false,
      withdrawalAllowed: false,
      twoStageBidding: false,
      preferentialBidder: false,
      tendererClass: '',
    });
    setAdvancedSearch({
      exactPhrase: '',
      anyWords: '',
      excludeWords: '',
      referenceNumber: '',
    });
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

  // Count active non-default filters for display
  const activeFiltersList = useMemo(() => {
    const list = [];
    if (portal && portal !== 'ALL') list.push({ key: 'portal', label: `Portal: ${portal}`, onRemove: () => setPortal('ALL') });
    if (state) list.push({ key: 'state', label: `State: ${state}`, onRemove: () => { setState(''); setCity(''); setOrganization(''); } });
    if (city) list.push({ key: 'city', label: `City: ${city}`, onRemove: () => setCity('') });
    if (procurementType) list.push({ key: 'procurementType', label: `Type: ${procurementType}`, onRemove: () => setProcurementType('') });
    if (tenderAmountRange && tenderAmountRange !== 'any') {
      const label = tenderAmountRange === 'custom' ? `₹${minAmount || 0} - ₹${maxAmount || '∞'}` : `Amount: ${tenderAmountRange}`;
      list.push({ key: 'amount', label, onRemove: () => { setTenderAmountRange('any'); setMinAmount(''); setMaxAmount(''); } });
    }
    if (category) list.push({ key: 'category', label: `Category: ${category}`, onRemove: () => setCategory('') });
    if (organization) list.push({ key: 'organization', label: `Org: ${organization}`, onRemove: () => setOrganization('') });
    if (feePreference && feePreference !== 'any') list.push({ key: 'fee', label: `Fee: ${feePreference}`, onRemove: () => setFeePreference('any') });
    if (publishedRange && publishedRange !== 'all') {
      const label = publishedRange === 'custom' ? `Published: ${publishedFrom || 'Start'} to ${publishedTo || 'Now'}` : `Published: ${publishedRange}`;
      list.push({ key: 'published', label, onRemove: () => { setPublishedRange('all'); setPublishedFrom(''); setPublishedTo(''); } });
    }
    keywords.forEach((kw) => {
      list.push({ key: `kw-${kw}`, label: `Keyword: ${kw}`, onRemove: () => setKeywords(keywords.filter(k => k !== kw)) });
    });
    if (advancedFilters.hasPreBid) list.push({ key: 'adv-prebid', label: 'Pre-Bid Meeting', onRemove: () => setAdvancedFilters(p => ({ ...p, hasPreBid: false })) });
    if (advancedFilters.withdrawalAllowed) list.push({ key: 'adv-withdraw', label: 'Withdrawal Allowed', onRemove: () => setAdvancedFilters(p => ({ ...p, withdrawalAllowed: false })) });
    if (advancedFilters.twoStageBidding) list.push({ key: 'adv-twostage', label: 'Two-Stage Bidding', onRemove: () => setAdvancedFilters(p => ({ ...p, twoStageBidding: false })) });
    if (advancedFilters.preferentialBidder) list.push({ key: 'adv-pref', label: 'Preferential Bidder', onRemove: () => setAdvancedFilters(p => ({ ...p, preferentialBidder: false })) });
    if (advancedFilters.tendererClass) list.push({ key: 'adv-class', label: `Class: ${advancedFilters.tendererClass}`, onRemove: () => setAdvancedFilters(p => ({ ...p, tendererClass: '' })) });
    if (advancedSearch.exactPhrase) list.push({ key: 'adv-exact', label: `Phrase: "${advancedSearch.exactPhrase}"`, onRemove: () => setAdvancedSearch(p => ({ ...p, exactPhrase: '' })) });
    if (advancedSearch.referenceNumber) list.push({ key: 'adv-ref', label: `Ref: ${advancedSearch.referenceNumber}`, onRemove: () => setAdvancedSearch(p => ({ ...p, referenceNumber: '' })) });
    return list;
  }, [
    portal, state, city, procurementType, tenderAmountRange, minAmount, maxAmount,
    category, organization, feePreference, publishedRange, publishedFrom, publishedTo,
    keywords, advancedFilters, advancedSearch
  ]);

  return (
    <div className="gem-page flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-5 sm:py-7 transition-colors duration-200">
      <div className="gem-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">

        {/* 1. Header Banner Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
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
              Live bids from Central Government, State Departments, PWD, Jal Shakti, and PSUs across {state || 'Jammu & Kashmir, Himachal Pradesh, Punjab and Ladakh'}.
            </p>
          </div>

          {/* Metric Counters */}
          <div className="gem-summary shrink-0">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
              <span className="text-lg sm:text-xl font-mono font-bold text-slate-900 dark:text-white block">
                {totalCount.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                Matching bids
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
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

        {/* 2. Top Search Bar & Mobile Filter Trigger */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 sm:p-3.5 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 flex items-center">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search by tender title, bid number, department, keyword…" 
              className="w-full pl-10 pr-24 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-dalBlue" 
            />
            <button 
              type="submit" 
              className="absolute right-1 px-4 py-1.5 bg-dalBlue hover:bg-dalBlue/90 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Mobile Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
            className="lg:hidden flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer hover:bg-slate-100"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-dalBlue" />
            <span>Filters</span>
            {activeFiltersList.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-dalBlue text-white text-[10px] flex items-center justify-center font-bold">
                {activeFiltersList.length}
              </span>
            )}
          </button>
        </div>

        {/* 3. Main Workspace Layout: Filter Sidebar (Left) + Results List (Right) */}
        <div className="flex flex-col lg:flex-row items-start gap-6">

          {/* Left Filter Sidebar (Sticky on Desktop, Collapsible on Mobile) */}
          <div className={`w-full lg:w-[320px] shrink-0 lg:sticky lg:top-20 z-10 ${mobileFilterOpen ? 'block' : 'hidden lg:block'}`}>
            <TenderFilterSidebar
              portal={portal}
              setPortal={(v) => { setPortal(v); setCurrentPage(1); }}
              state={state}
              setState={(v) => { setState(v); setCity(''); setOrganization(''); setCurrentPage(1); }}
              city={city}
              setCity={(v) => { setCity(v); setCurrentPage(1); }}
              procurementType={procurementType}
              setProcurementType={(v) => { setProcurementType(v); setCurrentPage(1); }}
              tenderAmountRange={tenderAmountRange}
              setTenderAmountRange={(v) => { setTenderAmountRange(v); setCurrentPage(1); }}
              minAmount={minAmount}
              setMinAmount={(v) => { setMinAmount(v); setCurrentPage(1); }}
              maxAmount={maxAmount}
              setMaxAmount={(v) => { setMaxAmount(v); setCurrentPage(1); }}
              category={category}
              setCategory={(v) => { setCategory(v); setCurrentPage(1); }}
              organization={organization}
              setOrganization={(v) => { setOrganization(v); setCurrentPage(1); }}
              organizationsList={organizations}
              feePreference={feePreference}
              setFeePreference={(v) => { setFeePreference(v); setCurrentPage(1); }}
              publishedRange={publishedRange}
              setPublishedRange={(v) => { setPublishedRange(v); setCurrentPage(1); }}
              publishedFrom={publishedFrom}
              setPublishedFrom={(v) => { setPublishedFrom(v); setCurrentPage(1); }}
              publishedTo={publishedTo}
              setPublishedTo={(v) => { setPublishedTo(v); setCurrentPage(1); }}
              keywords={keywords}
              setKeywords={(v) => { setKeywords(v); setCurrentPage(1); }}
              advancedFilters={advancedFilters}
              setAdvancedFilters={(v) => { setAdvancedFilters(v); setCurrentPage(1); }}
              advancedSearch={advancedSearch}
              setAdvancedSearch={(v) => { setAdvancedSearch(v); setCurrentPage(1); }}
              onResetFilters={handleReset}
              totalResultsCount={totalCount}
            />
          </div>

          {/* Right Main Results Column */}
          <main className="flex-1 w-full min-w-0 space-y-4">
            
            {/* Active Filters Summary Chips Bar */}
            {activeFiltersList.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1 shrink-0">
                    Active Filters:
                  </span>
                  {activeFiltersList.map((item) => (
                    <span
                      key={item.key}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-dalBlue dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                    >
                      <span className="truncate max-w-[180px]">{item.label}</span>
                      <button
                        type="button"
                        onClick={item.onRemove}
                        className="hover:text-red-500 cursor-pointer ml-0.5"
                        title="Remove filter"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-bold text-dalBlue hover:underline shrink-0 cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Status Tabs (Active, Archived, Expired) & Sort Order Control */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 sm:p-2.5 rounded-xl shadow-xs">
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
                  <span>Active</span>
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

              {/* Sort Order Selector */}
              <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 text-xs hidden md:inline">
                  Showing <strong className="font-mono text-slate-900 dark:text-white">{totalCount.toLocaleString('en-IN')}</strong> bids
                </span>
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="arrival">Recently Published</option>
                    <option value="closingAsc">Closing Soonest</option>
                    <option value="closingDesc">Closing Latest</option>
                    <option value="valueDesc">Highest Tender Value</option>
                    <option value="valueAsc">Lowest Tender Value</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="w-8 h-8 border-3 border-dalBlue border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-medium">Loading matching tender notices...</p>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-2xl p-6 text-center text-red-600 dark:text-red-400">
                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                <p className="text-sm font-semibold">{error?.message || 'Unable to connect to tender directory. Please try again.'}</p>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isError && tenders.length === 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <Layers className="w-10 h-10 text-slate-400 mx-auto" />
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  {status === 'archived' ? 'No Archived Notices Found' : status === 'expired' ? 'No Expired Notices Found' : 'No Matching Tender Notices'}
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No tender notices match your selected filter criteria. Try clearing some filters or choosing a different state or portal.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-dalBlue text-white rounded-lg text-xs font-bold hover:bg-dalBlue/90 transition-colors shadow-xs cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            )}

            {/* Tender Bid Cards List */}
            {!isLoading && !isError && tenders.length > 0 && (
              <div className="gem-bid-list space-y-3">
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-xs">
                <span className="text-slate-500">
                  Page <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span> of{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span> ({totalCount.toLocaleString('en-IN')} total bids)
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
          </main>
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
