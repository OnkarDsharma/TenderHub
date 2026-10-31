/**
 * @file src/pages/GeMTenders.jsx
 * @description Government e-Marketplace (GeM) Jammu & Kashmir procurement portal page.
 * Displays live GeM bids & reverse auctions filtered for J&K buyers and delivery stations,
 * with parsed specifications from official GeM Bid Document PDFs.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  RotateCcw, 
  ExternalLink, 
  Building2, 
  Clock, 
  MapPin, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  Sparkles,
  Download,
  Landmark,
  Heart,
  Calendar,
  SlidersHorizontal,
} from 'lucide-react';

import { gemApi } from '@/services/gemApi';
import { formatCurrencyINR, formatDateDisplay } from '@/utils/formatters';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { FilterSelectionModal } from '@/components/tenders/FilterSelectionModal';

const STATE_TABS = [
  { label: 'All Northern States', value: '' },
  { label: 'Jammu & Kashmir', value: 'Jammu & Kashmir' },
  { label: 'Himachal Pradesh', value: 'Himachal Pradesh' },
  { label: 'Punjab', value: 'Punjab' },
  { label: 'Ladakh', value: 'Ladakh' },
];

const DISTRICTS_BY_STATE = {
  'Jammu & Kashmir': [
    { label: 'All J&K Locations', value: '' },
    { label: 'Jammu', value: 'Jammu' },
    { label: 'Srinagar', value: 'Srinagar' },
    { label: 'Rajouri', value: 'Rajouri' },
    { label: 'Poonch', value: 'Poonch' },
    { label: 'Baramulla', value: 'Baramulla' },
    { label: 'Anantnag', value: 'Anantnag' },
    { label: 'Udhampur', value: 'Udhampur' },
    { label: 'Kathua', value: 'Kathua' },
    { label: 'Samba', value: 'Samba' },
    { label: 'Pulwama', value: 'Pulwama' },
    { label: 'Budgam', value: 'Budgam' },
    { label: 'Doda', value: 'Doda' },
    { label: 'Ramban', value: 'Ramban' },
    { label: 'Kupwara', value: 'Kupwara' },
    { label: 'Akhnoor', value: 'Akhnoor' }
  ],
  'Himachal Pradesh': [
    { label: 'All Himachal Locations', value: '' },
    { label: 'Shimla', value: 'Shimla' },
    { label: 'Dharamshala', value: 'Dharamshala' },
    { label: 'Kangra', value: 'Kangra' },
    { label: 'Mandi', value: 'Mandi' },
    { label: 'Kullu', value: 'Kullu' },
    { label: 'Solan', value: 'Solan' },
    { label: 'Chamba', value: 'Chamba' },
    { label: 'Hamirpur', value: 'Hamirpur' },
    { label: 'Una', value: 'Una' },
    { label: 'Bilaspur', value: 'Bilaspur' }
  ],
  'Punjab': [
    { label: 'All Punjab Locations', value: '' },
    { label: 'Ludhiana', value: 'Ludhiana' },
    { label: 'Amritsar', value: 'Amritsar' },
    { label: 'Jalandhar', value: 'Jalandhar' },
    { label: 'Patiala', value: 'Patiala' },
    { label: 'Bathinda', value: 'Bathinda' },
    { label: 'Mohali / SAS Nagar', value: 'Mohali' },
    { label: 'Hoshiarpur', value: 'Hoshiarpur' },
    { label: 'Pathankot', value: 'Pathankot' },
    { label: 'Firozpur', value: 'Firozpur' },
    { label: 'Sangrur', value: 'Sangrur' }
  ],
  'Ladakh': [
    { label: 'All Ladakh Locations', value: '' },
    { label: 'Leh', value: 'Leh' },
    { label: 'Kargil', value: 'Kargil' }
  ]
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
  { label: 'Kargil', value: 'Kargil' }
];

const PROCUREMENT_TYPE_OPTIONS = [
  { label: 'All Procurement Types', value: '' },
  { label: 'Works (Civil, Infrastructure)', value: 'Works' },
  { label: 'Goods (Materials, Machinery)', value: 'Goods' },
  { label: 'Services (Maintenance, Operations)', value: 'Services' },
  { label: 'Open Tender (Competitive)', value: 'Open Tender' },
  { label: 'Limited Tender', value: 'Limited Tender' },
  { label: 'Single Tender', value: 'Single Tender' },
];

const TENDER_AMOUNT_OPTIONS = [
  { label: 'Any Tender Amount', value: 'any' },
  { label: 'Under ₹5 Lakhs', value: 'under_5l' },
  { label: '₹5L - ₹25 Lakhs', value: '5l_25l' },
  { label: '₹25L - ₹1 Crore', value: '25l_1cr' },
  { label: '₹1 Cr - ₹5 Crores', value: '1cr_5cr' },
  { label: 'Above ₹5 Crores', value: 'above_5cr' },
  { label: 'Custom Range…', value: 'custom' },
];

const FEE_PREFERENCES_OPTIONS = [
  { label: 'Any Fee Preference', value: 'any' },
  { label: 'Free Tender Fee (₹0)', value: 'freeFee' },
  { label: 'Fee Exemption Allowed (MSME)', value: 'feeExempted' },
  { label: 'No EMD Required (₹0)', value: 'freeEmd' },
  { label: 'EMD Exemption Allowed', value: 'emdExempted' },
  { label: 'Zero Cost (Free Fee & EMD)', value: 'bothFree' },
];

const cleanDisplayText = (value, fallback = '—') =>
  String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() || fallback;

export default function GeMTenders() {
  const navigate = useNavigate();
  const { toggleBookmark, isBookmarked } = useBookmarkStore();
  const [tenders, setTenders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Pagination State
  const [selectedState, setSelectedState] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [sortBy, setSortBy] = useState('arrival');
  const [closingDays, setClosingDays] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, totalCount: 0 });

  // New Filter States
  const [procurementType, setProcurementType] = useState('');
  const [tenderAmountRange, setTenderAmountRange] = useState('any');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [feePreference, setFeePreference] = useState('any');
  const [publishedRange, setPublishedRange] = useState('all');
  const [publishedFrom, setPublishedFrom] = useState('');
  const [publishedTo, setPublishedTo] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({
    hasPreBid: false,
    withdrawalAllowed: false,
    twoStageBidding: false,
    preferentialBidder: false,
    tendererClass: '',
  });

  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [amountModalOpen, setAmountModalOpen] = useState(false);

  // Count active advanced filters
  const activeAdvancedCount = 
    (advancedFilters.hasPreBid ? 1 : 0) +
    (advancedFilters.withdrawalAllowed ? 1 : 0) +
    (advancedFilters.twoStageBidding ? 1 : 0) +
    (advancedFilters.preferentialBidder ? 1 : 0) +
    (advancedFilters.tendererClass ? 1 : 0);

  // Determine active location options based on state
  const activeLocationOptions = selectedState && DISTRICTS_BY_STATE[selectedState]
    ? DISTRICTS_BY_STATE[selectedState]
    : ALL_LOCATION_OPTIONS;

  // Fetch Bids from Backend
  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const data = await gemApi.getStats({ state: selectedState || undefined });
        if (!cancelled && data) setStats(data);
      } catch {
        // Non-blocking
      }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, [selectedState]);

  useEffect(() => {
    let cancelled = false;
    const fetchTenders = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await gemApi.getTenders({
          page: currentPage,
          limit: 12,
          state: selectedState || undefined,
          search: appliedSearch,
          location: selectedLocation,
          procurementType: procurementType || undefined,
          tenderAmountRange: tenderAmountRange !== 'any' ? tenderAmountRange : undefined,
          minAmount: tenderAmountRange === 'custom' && minAmount ? minAmount : undefined,
          maxAmount: tenderAmountRange === 'custom' && maxAmount ? maxAmount : undefined,
          feePreference: feePreference !== 'any' ? feePreference : undefined,
          publishedRange: publishedRange !== 'all' ? publishedRange : undefined,
          publishedFrom: publishedRange === 'custom' && publishedFrom ? publishedFrom : undefined,
          publishedTo: publishedRange === 'custom' && publishedTo ? publishedTo : undefined,
          hasPreBid: advancedFilters.hasPreBid ? 'true' : undefined,
          withdrawalAllowed: advancedFilters.withdrawalAllowed ? 'true' : undefined,
          twoStageBidding: advancedFilters.twoStageBidding ? 'true' : undefined,
          preferentialBidder: advancedFilters.preferentialBidder ? 'true' : undefined,
          tendererClass: advancedFilters.tendererClass || undefined,
          sortBy,
          closingDays: closingDays || undefined
        });

        if (!cancelled && res?.success) {
          const fetchedAt = Date.now();
          setTenders((res.data || []).map((item) => {
            const closingTime = item.closingDate ? new Date(item.closingDate).getTime() : null;
            return {
              ...item,
              _isClosingSoon: closingTime !== null && closingTime >= fetchedAt && closingTime - fetchedAt < 48 * 60 * 60 * 1000,
            };
          }));
          setPagination(res.pagination || { totalPages: 1, totalCount: 0 });
        }
      } catch (err) {
        console.error('[GeM Page] Failed to fetch tenders:', err);
        if (!cancelled) setError('Unable to connect to GeM tenders index. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTenders();
    return () => { cancelled = true; };
  }, [appliedSearch, closingDays, currentPage, selectedLocation, selectedState, sortBy, procurementType, tenderAmountRange, minAmount, maxAmount, feePreference, publishedRange, publishedFrom, publishedTo, advancedFilters]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    setAppliedSearch(search);
  };

  const handleStateChange = (stateVal) => {
    setSelectedState(stateVal);
    setSelectedLocation('');
    setCurrentPage(1);
  };

  const handlePublishedSelect = (preset) => {
    setPublishedRange(preset);
    if (preset !== 'custom') {
      setPublishedFrom('');
      setPublishedTo('');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSelectedState('');
    setSearch('');
    setAppliedSearch('');
    setSelectedLocation('');
    setProcurementType('');
    setTenderAmountRange('any');
    setMinAmount('');
    setMaxAmount('');
    setFeePreference('any');
    setPublishedRange('all');
    setPublishedFrom('');
    setPublishedTo('');
    setAdvancedFilters({
      hasPreBid: false,
      withdrawalAllowed: false,
      twoStageBidding: false,
      preferentialBidder: false,
      tendererClass: '',
    });
    setSortBy('arrival');
    setClosingDays('');
    setCurrentPage(1);
  };

  const handlePageJump = (event) => {
    event.preventDefault();
    const requestedPage = Number(new FormData(event.currentTarget).get('page'));
    if (!Number.isInteger(requestedPage) || requestedPage < 1) return;
    setCurrentPage(Math.min(requestedPage, pagination.totalPages));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="gem-page flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-6 sm:py-8 transition-colors duration-200">
      <div className="gem-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* 1. Refined Regional Header & Verified Metric Counters */}
        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
              <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
              <span>Government e-Marketplace (GeM) • {selectedState || 'Northern Region'}</span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
              Government e-Marketplace (GeM) tenders
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Live bids from Central Government, Defence, PSUs and departments, with delivery locations across {selectedState || 'Jammu & Kashmir, Himachal Pradesh, Punjab and Ladakh'}.
            </p>
          </div>

          {/* Comparable bid metrics and a separate source note */}
          <div className="gem-summary shrink-0">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
              <span className="text-lg sm:text-xl font-mono font-bold text-slate-900 dark:text-white block">
                {pagination.totalCount}
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                Matching bids
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
              <span className="text-lg sm:text-xl font-mono font-bold text-amber-700 dark:text-amber-400 block">
                {stats?.closingSoon || 0}
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                Closing within 48h
              </span>
            </div>
            <p className="gem-source-note text-[11px] text-slate-500 dark:text-slate-400">Source: bidplus.gem.gov.in</p>
          </div>
        </div>

        {/* Search stays visible beneath the site navigation while browsing results. */}
        <div className="gem-search-sticky bg-white dark:bg-slate-900 rounded-xl p-3 sm:p-4 shadow-xs border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bid number, item, ministry or department…" className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-dalBlue" />
            </div>
            <button type="submit" className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-dalBlue hover:bg-dalBlue/90 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer"><span>Search Bids</span></button>
          </form>
        </div>

        {/* 2. Interactive Filter Bar */}
        <div className="gem-filter-panel bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 shadow-xs border border-slate-200 dark:border-slate-800 space-y-3.5">
          
          {/* State Filter Navigation Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1 shrink-0 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-dalBlue" /> Region:
            </span>
            {STATE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleStateChange(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedState === tab.value
                    ? 'bg-dalBlue text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Published Date Filter Navigation Pills (Pick Date / All) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1 shrink-0 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-dalBlue" /> Published:
            </span>
            <button
              type="button"
              onClick={() => handlePublishedSelect('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                publishedRange === 'all' || (!publishedRange && !publishedFrom && !publishedTo)
                  ? 'bg-dalBlue text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handlePublishedSelect('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                publishedRange === 'today'
                  ? 'bg-dalBlue text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePublishedSelect('7days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                publishedRange === '7days'
                  ? 'bg-dalBlue text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => handlePublishedSelect('1month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                publishedRange === '1month'
                  ? 'bg-dalBlue text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Last 1 Month
            </button>
            <button
              type="button"
              onClick={() => handlePublishedSelect('custom')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                publishedRange === 'custom'
                  ? 'bg-dalBlue text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Pick Date</span>
            </button>
          </div>

          {/* Custom Date Range Picker (when Pick Date is active) */}
          {publishedRange === 'custom' && (
            <div className="flex flex-wrap items-center gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Published Dates:</span>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-slate-500 font-semibold">From</label>
                <input
                  type="date"
                  value={publishedFrom}
                  onChange={(e) => {
                    setPublishedFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-slate-500 font-semibold">To</label>
                <input
                  type="date"
                  value={publishedTo}
                  onChange={(e) => {
                    setPublishedTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
                />
              </div>
              {(publishedFrom || publishedTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setPublishedFrom('');
                    setPublishedTo('');
                    setCurrentPage(1);
                  }}
                  className="text-xs text-red-500 hover:underline font-semibold ml-auto cursor-pointer"
                >
                  Clear dates
                </button>
              )}
            </div>
          )}

          {/* Secondary Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            {/* District / Consignee Location */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                {selectedState ? `Consignee Location (${selectedState})` : 'Consignee Location'}
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => {
                  setSelectedLocation(e.target.value);
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

            {/* Procurement Type */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Procurement Type
              </label>
              <select
                value={procurementType}
                onChange={(e) => {
                  setProcurementType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                {PROCUREMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tender Amount */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Tender Amount
              </label>
              <select
                value={tenderAmountRange}
                onChange={(e) => {
                  const val = e.target.value;
                  setTenderAmountRange(val);
                  if (val === 'custom') {
                    setAmountModalOpen(true);
                  } else {
                    setMinAmount('');
                    setMaxAmount('');
                  }
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                {TENDER_AMOUNT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === 'custom' && (minAmount || maxAmount)
                      ? `Custom (${minAmount ? `>₹${Number(minAmount).toLocaleString('en-IN')}` : ''}${minAmount && maxAmount ? ' - ' : ''}${maxAmount ? `<₹${Number(maxAmount).toLocaleString('en-IN')}` : ''})`
                      : opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Fee Preferences */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Fee Preferences
              </label>
              <select
                value={feePreference}
                onChange={(e) => {
                  setFeePreference(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                {FEE_PREFERENCES_OPTIONS.map((opt) => (
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

            {/* Sorting */}
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
                <option value="emdDesc">Highest EMD Amount</option>
                <option value="valueDesc">Highest Estimated Value</option>
              </select>
            </div>

            {/* Advanced Filters */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Advanced Filters
              </label>
              <button
                type="button"
                onClick={() => setAdvancedModalOpen(true)}
                className={`w-full py-1.5 px-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                  activeAdvancedCount > 0
                    ? 'border-dalBlue bg-blue-50/60 dark:bg-blue-950/40 text-dalBlue dark:text-blue-300 font-semibold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span>
                    {activeAdvancedCount > 0 ? `${activeAdvancedCount} active` : 'Select rules…'}
                  </span>
                </span>
                {activeAdvancedCount > 0 && (
                  <span className="h-4 min-w-[16px] px-1 rounded-full bg-dalBlue text-white text-[10px] flex items-center justify-center font-bold">
                    {activeAdvancedCount}
                  </span>
                )}
              </button>
            </div>

            {/* Reset Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleResetFilters}
                className="w-full py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>
        </div>

        <div className="gem-results-column">
        {/* 3. Tenders Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-8 h-8 border-3 border-dalBlue border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading GeM bids...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-6 text-center text-red-600 dark:text-red-400">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : tenders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-3">
            <Layers className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No GeM Bids Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No live bids match your selected search criteria for {selectedState || 'this region'}. Try clearing some filters or changing state.
            </p>
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="gem-bid-list">
            {tenders.map((item) => {
              const isUrgent = item._isClosingSoon;
              const cleanTitle = cleanDisplayText(item.title, 'Untitled GeM bid');
              const cleanDepartment = cleanDisplayText(item.departmentName || item.organisationChain);
              const fullOrganisation = cleanDisplayText(item.organisationChain, cleanDepartment);
              const bookmarked = isBookmarked(item._id || item.sourceTenderId);
              const rawDocUrl = item.pdfUrls?.[0] || item.detailsUrl || `https://bidplus.gem.gov.in/showbidDocument/${(item.sourceTenderId || '').replace(/^GEM\/\d+\/[A-Z]\//i, '')}`;
              const docUrl = gemApi.getPdfDownloadUrl(item.sourceTenderId || item._id, rawDocUrl);

              return (
                <div
                  key={item._id || item.sourceTenderId}
                  className="gem-bid-row bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
                >
                  <div className="gem-bid-content">
                    {/* Top Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.state && (
                          <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-dalBlue dark:text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                            <span>{item.state}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isUrgent && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[10px] font-bold shrink-0">
                            <Clock className="w-3 h-3" />
                            <span>Closing Soon</span>
                          </div>
                        )}
                        <button type="button" onClick={() => toggleBookmark(item)} className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${bookmarked ? 'bg-red-50 border-red-200 text-chinarRed dark:bg-red-950/40 dark:border-red-800 shadow-xs' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-chinarRed hover:border-red-200 hover:bg-red-50/50 dark:hover:bg-red-950/20 bg-white dark:bg-slate-800'}`} title={bookmarked ? 'Remove from Saved' : 'Save this GeM bid'} aria-label={bookmarked ? 'Remove GeM bid from favorites' : 'Add GeM bid to favorites'}>
                          <Heart className={`w-3.5 h-3.5 transition-transform active:scale-125 ${bookmarked ? 'fill-current text-chinarRed' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Bid Number */}
                    <div>
                      <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-tight block">
                        Bid Number
                      </span>
                      <a
                        href={docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono font-black text-dalBlue dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        title="Click to open official GeM PDF document"
                      >
                        <span>{item.sourceTenderId}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>

                    {/* Title / Item Category */}
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug group-hover:text-dalBlue dark:group-hover:text-blue-300 transition-colors break-words">
                      {cleanTitle}
                    </h2>

                    {/* Ministry / Organisation */}
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-start gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="break-words" title={fullOrganisation}>{cleanDepartment}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-techCoral shrink-0 mt-0.5" />
                        <span className="font-semibold text-slate-700 dark:text-slate-200 break-words">
                          {cleanDisplayText(item.location, 'Location not specified')}
                        </span>
                      </div>
                    </div>

                    {/* Key Technical & Financial Parameters */}
                    <div className="gem-bid-financials grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <div className="p-2">
                        <span className="text-slate-400 block font-medium">EMD Amount</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {item.emdAmount > 0 ? formatCurrencyINR(item.emdAmount) : 'Exempted / Zero'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/25">
                        <span className="text-blue-700 dark:text-blue-300 block font-semibold">Published</span>
                        <span className="font-mono font-bold text-blue-900 dark:text-blue-100">
                          {formatDateDisplay(item.publishedDateStr || item.publishedDate || item.publishedDateOnly)}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 ring-1 ring-inset ring-rose-100 dark:ring-rose-900/50">
                        <span className="text-rose-600 dark:text-rose-300 block font-semibold">Bid Closing</span>
                        <span className="font-mono font-bold text-rose-700 dark:text-rose-200">
                          {formatDateDisplay(item.closingDateStr || item.closingDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar: View Specs dominant, AI and PDF secondary */}
                  <div className="gem-bid-actions flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => navigate(`/gem-tenders/${item._id || encodeURIComponent(item.sourceTenderId)}`)}
                      className="py-2 px-3 bg-dalBlue hover:bg-dalBlue/90 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center"
                    >
                      Full Details
                    </button>
                    <button
                      onClick={() => navigate(`/services?tenderId=${encodeURIComponent(item.sourceTenderId)}`)}
                      className="inline-flex items-center gap-1 py-1.5 px-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      title="Analyze with AI Estimator"
                    >
                      <Sparkles className="w-3 h-3 text-dalBlue dark:text-blue-400" />
                      <span>AI analysis</span>
                    </button>
                    <a
                      href={docUrl}
                      download
                      className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      title="Download official GeM Bid PDF"
                    >
                      <Download className="w-3 h-3" />
                      <span>PDF</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between py-4 border-t border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500">
              Page <span className="font-bold text-slate-800 dark:text-slate-200">{currentPage}</span> of{' '}
              <span className="font-bold text-slate-800 dark:text-slate-200">{pagination.totalPages}</span> ({pagination.totalCount} total bids)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer hover:border-dalBlue dark:hover:border-blue-400 transition-colors shrink-0"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <form onSubmit={handlePageJump} className="flex items-center gap-1.5" aria-label="Jump to GeM bids page">
                <label htmlFor="gem-page-jump" className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Go to</label>
                <input
                  key={currentPage}
                  id="gem-page-jump"
                  name="page"
                  type="number"
                  min="1"
                  max={pagination.totalPages}
                  step="1"
                  defaultValue={currentPage}
                  aria-label={`Page number, from 1 to ${pagination.totalPages}`}
                  className="!min-h-0 h-8 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 text-center text-xs font-mono font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-1.5 focus:ring-dalBlue shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="submit" className="!min-h-0 h-8 px-2.5 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-dalBlue dark:hover:border-blue-400 transition-colors shrink-0">Go</button>
              </form>
              <button
                disabled={currentPage >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
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

      {/* Advanced Filters Modal */}
      <FilterSelectionModal
        isOpen={advancedModalOpen}
        onClose={() => setAdvancedModalOpen(false)}
        modalType="advancedFilters"
        title="Advanced Filters"
        subtitle="Filter by meeting conditions, bidding models, and eligibility"
        extraState={advancedFilters}
        onApply={(newState) => {
          setAdvancedFilters(newState);
          setCurrentPage(1);
        }}
      />

      {/* Tender Amount Modal (for Custom Range) */}
      <FilterSelectionModal
        isOpen={amountModalOpen}
        onClose={() => setAmountModalOpen(false)}
        modalType="amount"
        title="Select Tender Amount"
        subtitle="Filter GeM bids by estimated contract value"
        currentValue={tenderAmountRange}
        extraState={{ tenderAmountRange, minAmount, maxAmount }}
        onApply={(data) => {
          setTenderAmountRange(data.tenderAmountRange || 'any');
          setMinAmount(data.minAmount || '');
          setMaxAmount(data.maxAmount || '');
          setCurrentPage(1);
        }}
      />
    </div>
  );
}
