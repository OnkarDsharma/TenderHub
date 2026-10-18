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
  X,
  Landmark
} from 'lucide-react';

import { gemApi } from '@/services/gemApi';
import { formatCurrencyINR, formatDateDisplay } from '@/utils/formatters';

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

export default function GeMTenders() {
  const navigate = useNavigate();
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

  // Modal State for Viewing Detailed Parsed PDF Specs
  const [selectedBid, setSelectedBid] = useState(null);

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
  }, [appliedSearch, closingDays, currentPage, selectedLocation, selectedState, sortBy]);

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

  const handleResetFilters = () => {
    setSelectedState('');
    setSearch('');
    setAppliedSearch('');
    setSelectedLocation('');
    setSortBy('arrival');
    setClosingDays('');
    setCurrentPage(1);
  };

  return (
    <div className="gem-page flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-6 sm:py-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* 1. Refined Regional Header & Verified Metric Counters */}
        <div className="bg-white dark:bg-slate-900 rounded-lg p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
              <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
              <span>Government e-Marketplace (GeM) • {selectedState || 'Northern Region'}</span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
              GeM Bid Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Central Government, Defence, PSU, and departmental procurement bids with consignee delivery stations in {selectedState || 'Jammu & Kashmir, Himachal Pradesh, Punjab, and Ladakh'}.
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
                Closing &lt; 48h
              </span>
            </div>
            <p className="gem-source-note text-[11px] text-slate-500 dark:text-slate-400">Source: Government e-Marketplace (GeM)</p>
          </div>
        </div>

        {/* 2. Search & Interactive Filter Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 shadow-xs border border-slate-200 dark:border-slate-800 space-y-4">
          
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

          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Bid Number (GEM/2026/B/...), Item Category, Ministry..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-dalBlue"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-dalBlue hover:bg-dalBlue/90 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            >
              <span>Search Bids</span>
            </button>
          </form>

          {/* Secondary Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
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

            {/* Closing Deadline */}
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
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              >
                <option value="arrival">Recently Published</option>
                <option value="closingAsc">Closing Soonest</option>
                <option value="closingDesc">Closing Latest</option>
                <option value="emdDesc">Highest EMD Amount</option>
              </select>
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
              const docUrl = item.pdfUrls?.[0] || item.detailsUrl || `https://bidplus.gem.gov.in/showbidDocument/${(item.sourceTenderId || '').replace(/^GEM\/\d+\/[A-Z]\//i, '')}`;

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
                      {isUrgent && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[10px] font-bold shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>Closing Soon</span>
                        </div>
                      )}
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
                      {item.title}
                    </h2>

                    {/* Ministry / Organisation */}
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-start gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="break-words">{item.organisationChain || item.departmentName || '—'}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-chinarRed shrink-0 mt-0.5" />
                        <span className="font-semibold text-slate-700 dark:text-slate-200 break-words">
                          {item.location || 'Jammu & Kashmir'}
                        </span>
                      </div>
                    </div>

                    {/* Key Technical & Financial Parameters */}
                    <div className="gem-bid-financials grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <div className="p-2">
                        <span className="text-slate-400 block font-medium">EMD Amount</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {item.emdAmount > 0 ? formatCurrencyINR(item.emdAmount) : 'Exempted / Zero'}
                        </span>
                      </div>
                      <div className="p-2">
                        <span className="text-slate-400 block font-medium">Bid Closing</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {formatDateDisplay(item.closingDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar: View Specs dominant, AI and PDF secondary */}
                  <div className="gem-bid-actions flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setSelectedBid(item)}
                      className="py-2 px-3 bg-dalBlue hover:bg-dalBlue/90 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center"
                    >
                      View bid
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
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                      title="Open official GeM Bid PDF"
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
              Page <span className="font-bold text-slate-800 dark:text-slate-200">{pagination.currentPage}</span> of{' '}
              <span className="font-bold text-slate-800 dark:text-slate-200">{pagination.totalPages}</span> ({pagination.totalCount} total bids)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 5. Interactive Specifications Modal */}
      {selectedBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-widest block">
                  Government e-Marketplace (GeM)
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedBid.title}
                </h3>
                <span className="text-xs font-mono font-bold text-dalBlue dark:text-blue-400">
                  {selectedBid.sourceTenderId}
                </span>
              </div>
              <button
                onClick={() => setSelectedBid(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Specifications Table */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-750">
                <div>
                  <span className="text-slate-400 block font-medium">Department</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedBid.departmentName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Organisation</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedBid.organisationChain}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">EMD Deposit</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedBid.emdAmount > 0 ? formatCurrencyINR(selectedBid.emdAmount) : 'Exempted / Zero'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Fee Payable At</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedBid.feePayableAt || 'J&K'}</span>
                </div>
              </div>

              {/* Delivery Stations in J&K */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  J&amp;K Consignee Stations
                </span>
                <p className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-dalBlue dark:text-blue-300 font-medium">
                  {selectedBid.location}
                </p>
              </div>

              {/* Critical Dates */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="border border-slate-200 dark:border-slate-750 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Published</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {formatDateDisplay(selectedBid.publishedDate)}
                  </span>
                </div>
                <div className="border border-slate-200 dark:border-slate-750 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Bid Closing</span>
                  <span className="font-mono font-bold text-red-600 dark:text-red-400">
                    {formatDateDisplay(selectedBid.closingDate)}
                  </span>
                </div>
                <div className="border border-slate-200 dark:border-slate-750 p-2.5 rounded-xl col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block">Bid Opening</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {selectedBid.bidOpeningDate ? formatDateDisplay(selectedBid.bidOpeningDate) : 'Standard GeM Cycle'}
                  </span>
                </div>
              </div>

              {/* Work Scope & Extracted Details */}
              <div className="space-y-1">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Procurement Summary
                </span>
                <pre className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap border border-slate-100 dark:border-slate-750">
                  {selectedBid.workDescription}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setSelectedBid(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const id = selectedBid.sourceTenderId;
                  setSelectedBid(null);
                  navigate(`/services?tenderId=${encodeURIComponent(id)}`);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Analyze with AI ✨</span>
              </button>
              <a
                href={selectedBid.pdfUrls?.[0] || selectedBid.detailsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-dalBlue hover:bg-dalBlue/90 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Open Full GeM PDF Document ↗</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
