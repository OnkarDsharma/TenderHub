/**
 * @file src/components/tenders/TenderFilterSidebar.jsx
 * @description Official filter sidebar matching the procurement portal interface,
 * featuring Keywords with Advanced Search, Published Date presets, Portal, State, City,
 * Procurement Type, Tender Amount, Category, Organisation, Fee Preferences, and Advanced Filters.
 */
import { useState } from 'react';
import { 
  Search, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  X, 
  LayoutGrid, 
  RotateCcw,
  Sliders,
  Check
} from 'lucide-react';
import { FilterSelectionModal } from './FilterSelectionModal';

// Portal Choices
export const PORTAL_OPTIONS = [
  { value: 'ALL', label: 'All Portals (Combined Public Directory)' },
  { value: 'JK_TENDERS', label: 'JK Tenders', description: 'jktenders.gov.in (Jammu & Kashmir e-Procurement)' },
  { value: 'GEM', label: 'Government e-Marketplace (GeM)', description: 'bidplus.gem.gov.in' },
  { value: 'CPPP', label: 'Central PPP (CPPP)', description: 'eprocure.gov.in (Central Public Procurement)' },
  { value: 'HP_TENDERS', label: 'Himachal Pradesh Tenders', description: 'hptenders.gov.in' },
  { value: 'PUNJAB_TENDERS', label: 'Punjab Tenders', description: 'eproc.punjab.gov.in' },
];

// State Options
export const STATE_OPTIONS = [
  { value: '', label: 'All Northern States' },
  { value: 'Jammu & Kashmir', label: 'Jammu & Kashmir' },
  { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
  { value: 'Punjab', label: 'Punjab' },
  { value: 'Ladakh', label: 'Ladakh' },
];

// Districts per State
export const DISTRICTS_BY_STATE = {
  'Jammu & Kashmir': [
    { value: '', label: 'All J&K Locations' },
    { value: 'Jammu', label: 'Jammu' },
    { value: 'Srinagar', label: 'Srinagar' },
    { value: 'Anantnag', label: 'Anantnag' },
    { value: 'Baramulla', label: 'Baramulla' },
    { value: 'Budgam', label: 'Budgam' },
    { value: 'Pulwama', label: 'Pulwama' },
    { value: 'Kupwara', label: 'Kupwara' },
    { value: 'Doda', label: 'Doda' },
    { value: 'Rajouri', label: 'Rajouri' },
    { value: 'Poonch', label: 'Poonch' },
    { value: 'Kathua', label: 'Kathua' },
    { value: 'Udhampur', label: 'Udhampur' },
    { value: 'Samba', label: 'Samba' },
    { value: 'Ramban', label: 'Ramban' },
    { value: 'Reasi', label: 'Reasi' },
    { value: 'Kishtwar', label: 'Kishtwar' },
    { value: 'Ganderbal', label: 'Ganderbal' },
    { value: 'Bandipora', label: 'Bandipora' },
    { value: 'Kulgam', label: 'Kulgam' },
    { value: 'Shopian', label: 'Shopian' },
  ],
  'Himachal Pradesh': [
    { value: '', label: 'All Himachal Locations' },
    { value: 'Shimla', label: 'Shimla' },
    { value: 'Dharamshala', label: 'Dharamshala' },
    { value: 'Kangra', label: 'Kangra' },
    { value: 'Mandi', label: 'Mandi' },
    { value: 'Kullu', label: 'Kullu' },
    { value: 'Solan', label: 'Solan' },
    { value: 'Sirmaur', label: 'Sirmaur' },
    { value: 'Chamba', label: 'Chamba' },
    { value: 'Hamirpur', label: 'Hamirpur' },
    { value: 'Una', label: 'Una' },
    { value: 'Bilaspur', label: 'Bilaspur' },
  ],
  'Punjab': [
    { value: '', label: 'All Punjab Locations' },
    { value: 'Ludhiana', label: 'Ludhiana' },
    { value: 'Amritsar', label: 'Amritsar' },
    { value: 'Jalandhar', label: 'Jalandhar' },
    { value: 'Patiala', label: 'Patiala' },
    { value: 'Bathinda', label: 'Bathinda' },
    { value: 'Mohali', label: 'Mohali' },
    { value: 'Hoshiarpur', label: 'Hoshiarpur' },
    { value: 'Pathankot', label: 'Pathankot' },
    { value: 'Firozpur', label: 'Firozpur' },
    { value: 'Sangrur', label: 'Sangrur' },
  ],
  'Ladakh': [
    { value: '', label: 'All Ladakh Locations' },
    { value: 'Leh', label: 'Leh' },
    { value: 'Kargil', label: 'Kargil' },
  ],
};

export const ALL_DISTRICTS = [
  { value: '', label: 'All Northern Delivery Locations' },
  { value: 'Jammu', label: 'Jammu' },
  { value: 'Srinagar', label: 'Srinagar' },
  { value: 'Anantnag', label: 'Anantnag' },
  { value: 'Baramulla', label: 'Baramulla' },
  { value: 'Budgam', label: 'Budgam' },
  { value: 'Pulwama', label: 'Pulwama' },
  { value: 'Rajouri', label: 'Rajouri' },
  { value: 'Poonch', label: 'Poonch' },
  { value: 'Shimla', label: 'Shimla' },
  { value: 'Dharamshala', label: 'Dharamshala' },
  { value: 'Kangra', label: 'Kangra' },
  { value: 'Ludhiana', label: 'Ludhiana' },
  { value: 'Amritsar', label: 'Amritsar' },
  { value: 'Mohali', label: 'Mohali' },
  { value: 'Leh', label: 'Leh' },
  { value: 'Kargil', label: 'Kargil' },
];

// Procurement Type Options
export const PROCUREMENT_TYPE_OPTIONS = [
  { value: '', label: 'All Procurement Types' },
  { value: 'Works', label: 'Works (Civil, Roadways, Buildings & Infrastructure)' },
  { value: 'Goods', label: 'Goods (Materials, Machinery & Medical Supplies)' },
  { value: 'Services', label: 'Services (Maintenance, Consultancy & Operations)' },
  { value: 'Open Tender', label: 'Open Tender (Competitive Bidding)' },
  { value: 'Limited Tender', label: 'Limited / Restricted Tender' },
  { value: 'Single Tender', label: 'Single / Nomination Tender' },
];

// Category Options
export const CATEGORY_OPTIONS = [
  { value: '', label: 'All Work Domains' },
  { value: 'Civil Works', label: 'Civil Works (Buildings, Roads & General)' },
  { value: 'Electrical Works', label: 'Electrical Works & Power Equipment' },
  { value: 'Water Works', label: 'Civil Works - Water Works & Distribution' },
  { value: 'Drilling Works', label: 'Drilling Works & Boring' },
  { value: 'Medical Equipments', label: 'Medical Equipments & Supplies' },
  { value: 'Machineries', label: 'Machineries & Mechanical Engg Items' },
  { value: 'Agricultural or Forestry', label: 'Agricultural or Forestry Works' },
  { value: 'Repair and Maintenance Works', label: 'Repair & Maintenance Works' },
  { value: 'Supply of Materials', label: 'Supply of Materials & Aggregate' },
  { value: 'Consultancy', label: 'Consultancy & Technical Advisory' },
  { value: 'Information Technology', label: 'Information Technology & Software' },
];

// Fee Preferences Options
export const FEE_PREFERENCES_OPTIONS = [
  { value: 'any', label: 'Any (No fee restriction)' },
  { value: 'freeFee', label: 'Free Tender Fee (₹0 Tender Fee)' },
  { value: 'feeExempted', label: 'Tender Fee Exemption Allowed (MSME / Startups)' },
  { value: 'freeEmd', label: 'No EMD Required (₹0 Earnest Money)' },
  { value: 'emdExempted', label: 'EMD Exemption Allowed' },
  { value: 'bothFree', label: 'Zero Cost Tender (Free Tender Fee & Zero EMD)' },
];

export function TenderFilterSidebar({
  // Filter States
  portal,
  setPortal,
  state,
  setState,
  city,
  setCity,
  procurementType,
  setProcurementType,
  tenderAmountRange,
  setTenderAmountRange,
  minAmount,
  setMinAmount,
  maxAmount,
  setMaxAmount,
  category,
  setCategory,
  organization,
  setOrganization,
  organizationsList = [],
  feePreference,
  setFeePreference,
  publishedRange,
  setPublishedRange,
  publishedFrom,
  setPublishedFrom,
  publishedTo,
  setPublishedTo,
  keywords = [],
  setKeywords,
  advancedFilters = {},
  setAdvancedFilters,
  advancedSearch = {},
  setAdvancedSearch,
  onResetFilters,
  totalResultsCount = 0,
}) {
  const [keywordInput, setKeywordInput] = useState('');
  const [publishedOpen, setPublishedOpen] = useState(true);
  const [activeModal, setActiveModal] = useState(null);

  // Compute Active Location Options based on selected State
  const activeLocationOptions = state && DISTRICTS_BY_STATE[state]
    ? DISTRICTS_BY_STATE[state]
    : ALL_DISTRICTS;

  // Keyword Handlers
  const handleAddKeyword = (e) => {
    e.preventDefault();
    const trimmed = keywordInput.trim();
    if (!trimmed) return;
    if (!keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
    }
    setKeywordInput('');
  };

  const handleRemoveKeyword = (kwToRemove) => {
    setKeywords(keywords.filter((k) => k !== kwToRemove));
  };

  // Published Date Preset Handler
  const handlePublishedSelect = (preset) => {
    setPublishedRange(preset);
    if (preset !== 'custom') {
      setPublishedFrom('');
      setPublishedTo('');
    }
  };

  // Helper labels for subtitle display
  const getPortalLabel = () => {
    if (!portal || portal === 'ALL') return 'All';
    const found = PORTAL_OPTIONS.find((p) => p.value === portal);
    return found ? found.label.split('(')[0].trim() : portal;
  };

  const getStateLabel = () => {
    return state || 'Jammu And Kashmir';
  };

  const getCityLabel = () => {
    return city || 'All';
  };

  const getProcurementLabel = () => {
    if (!procurementType) return 'All';
    const found = PROCUREMENT_TYPE_OPTIONS.find((p) => p.value === procurementType);
    return found ? found.label.split('(')[0].trim() : procurementType;
  };

  const getAmountLabel = () => {
    if (!tenderAmountRange || tenderAmountRange === 'any') return 'Any';
    if (tenderAmountRange === 'under_5l') return '< ₹5 Lakhs';
    if (tenderAmountRange === '5l_25l') return '₹5L - ₹25L';
    if (tenderAmountRange === '25l_1cr') return '₹25L - ₹1 Crore';
    if (tenderAmountRange === '1cr_5cr') return '₹1 Cr - ₹5 Cr';
    if (tenderAmountRange === 'above_5cr') return '> ₹5 Crores';
    if (tenderAmountRange === 'custom') {
      if (minAmount && maxAmount) return `₹${Number(minAmount).toLocaleString('en-IN')} - ₹${Number(maxAmount).toLocaleString('en-IN')}`;
      if (minAmount) return `> ₹${Number(minAmount).toLocaleString('en-IN')}`;
      if (maxAmount) return `< ₹${Number(maxAmount).toLocaleString('en-IN')}`;
      return 'Custom Range';
    }
    return 'Any';
  };

  const getCategoryLabel = () => {
    if (!category) return 'All';
    const found = CATEGORY_OPTIONS.find((c) => c.value === category);
    return found ? found.label.split('(')[0].trim() : category;
  };

  const getOrgLabel = () => {
    return organization || 'All';
  };

  const getFeeLabel = () => {
    if (!feePreference || feePreference === 'any') return 'Any';
    const found = FEE_PREFERENCES_OPTIONS.find((f) => f.value === feePreference);
    return found ? found.label.split('(')[0].trim() : feePreference;
  };

  const getAdvancedFiltersLabel = () => {
    const active = Object.entries(advancedFilters).filter(([, v]) => !!v).length;
    return active > 0 ? `${active} active` : 'None';
  };

  return (
    <>
      <aside className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-4">
        {/* Header: Title and Clear all */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Filters
            </h2>
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline cursor-pointer"
          >
            Clear all
          </button>
        </div>

        {/* 1. Keywords Section */}
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Keywords
            </label>
            <button
              type="button"
              onClick={() => setActiveModal('advancedSearch')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-dalBlue dark:text-blue-400 hover:underline cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
              <span>Advanced Search</span>
            </button>
          </div>

          <form onSubmit={handleAddKeyword} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="Add keyword..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-dalBlue"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-dalBlue hover:bg-dalBlue/90 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
            >
              Add
            </button>
          </form>

          {/* Active Keyword Chips */}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-dalBlue dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                >
                  <span className="truncate max-w-[120px]">{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(kw)}
                    className="hover:text-red-500 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 2. Published Section (Collapsible Accordion) */}
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={() => setPublishedOpen(!publishedOpen)}
            className="flex items-center justify-between w-full text-left cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
              <span>Published</span>
            </div>
            {publishedOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
            )}
          </button>

          {publishedOpen && (
            <div className="space-y-2 pt-1 animate-in fade-in duration-150">
              {/* Row 1: Today | Last 7 Days | Last 1 Month */}
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => handlePublishedSelect('today')}
                  className={`py-1.5 px-1 rounded-lg text-center font-semibold transition-all cursor-pointer ${
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
                  className={`py-1.5 px-1 rounded-lg text-center font-semibold transition-all cursor-pointer ${
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
                  className={`py-1.5 px-1 rounded-lg text-center font-semibold transition-all cursor-pointer ${
                    publishedRange === '1month'
                      ? 'bg-dalBlue text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Last 1 Month
                </button>
              </div>

              {/* Row 2: Pick Date | All */}
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => handlePublishedSelect('custom')}
                  className={`py-1.5 px-2 rounded-lg text-center font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    publishedRange === 'custom'
                      ? 'bg-dalBlue text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>Pick Date</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePublishedSelect('all')}
                  className={`py-1.5 px-2 rounded-lg text-center font-semibold transition-all cursor-pointer ${
                    publishedRange === 'all' || !publishedRange
                      ? 'bg-dalBlue text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All
                </button>
              </div>

              {/* Custom Date Pickers */}
              {publishedRange === 'custom' && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                      From Published Date
                    </label>
                    <input
                      type="date"
                      value={publishedFrom}
                      onChange={(e) => setPublishedFrom(e.target.value)}
                      className="w-full text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                      To Published Date
                    </label>
                    <input
                      type="date"
                      value={publishedTo}
                      onChange={(e) => setPublishedTo(e.target.value)}
                      className="w-full text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Portal Row */}
        <div
          onClick={() => setActiveModal('portal')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Portal</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getPortalLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 4. State Row */}
        <div
          onClick={() => setActiveModal('state')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">State</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getStateLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 5. City Row */}
        <div
          onClick={() => setActiveModal('city')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">City</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getCityLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 6. Procurement Type Row */}
        <div
          onClick={() => setActiveModal('procurementType')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Procurement Type
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getProcurementLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 7. Tender Amount Row */}
        <div
          onClick={() => setActiveModal('amount')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Tender Amount
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getAmountLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 8. Category Row */}
        <div
          onClick={() => setActiveModal('category')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Category</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getCategoryLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 9. Organisation Row */}
        <div
          onClick={() => setActiveModal('organization')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Organisation
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getOrgLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 10. Fee Preferences Row */}
        <div
          onClick={() => setActiveModal('fee')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Fee Preferences
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getFeeLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 11. Advanced Filters Row */}
        <div
          onClick={() => setActiveModal('advancedFilters')}
          className="flex items-center justify-between py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors group"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Advanced Filters
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
              {getAdvancedFiltersLabel()}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-dalBlue dark:text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0"
          >
            <span>Select</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Modal Dialog for each filter row */}
      {activeModal === 'portal' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="portal"
          title="Select Tender Portal"
          subtitle="Filter tenders by issuing electronic procurement portal"
          currentValue={portal}
          options={PORTAL_OPTIONS}
          onApply={(val) => setPortal(val)}
        />
      )}

      {activeModal === 'state' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="state"
          title="Select State / Region"
          subtitle="Northern Region e-Procurement Portals"
          currentValue={state}
          options={STATE_OPTIONS}
          onApply={(val) => {
            setState(val);
            setCity('');
            setOrganization('');
          }}
        />
      )}

      {activeModal === 'city' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="city"
          title={state ? `Select City / District in ${state}` : 'Select City / District'}
          subtitle="Location of tender execution and consignee delivery"
          currentValue={city}
          options={activeLocationOptions}
          onApply={(val) => setCity(val)}
        />
      )}

      {activeModal === 'procurementType' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="procurementType"
          title="Select Procurement Type"
          subtitle="Nature of contract: Works, Goods, Services, or Bidding Type"
          currentValue={procurementType}
          options={PROCUREMENT_TYPE_OPTIONS}
          onApply={(val) => setProcurementType(val)}
        />
      )}

      {activeModal === 'amount' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="amount"
          title="Select Tender Amount"
          subtitle="Filter by estimated contract value in Indian Rupees"
          currentValue={tenderAmountRange}
          extraState={{ tenderAmountRange, minAmount, maxAmount }}
          onApply={({ tenderAmountRange: range, minAmount: min, maxAmount: max }) => {
            setTenderAmountRange(range);
            setMinAmount(min);
            setMaxAmount(max);
          }}
        />
      )}

      {activeModal === 'category' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="category"
          title="Select Work Category / Domain"
          subtitle="Product and work trade classifications"
          currentValue={category}
          options={CATEGORY_OPTIONS}
          onApply={(val) => setCategory(val)}
        />
      )}

      {activeModal === 'organization' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="organization"
          title="Select Issuing Organisation"
          subtitle={state ? `Government Departments in ${state}` : 'Government Authorities & PSUs'}
          currentValue={organization}
          options={[
            { value: '', label: 'All Organisations' },
            ...organizationsList.map((org) => ({ value: org, label: org }))
          ]}
          onApply={(val) => setOrganization(val)}
        />
      )}

      {activeModal === 'fee' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="fee"
          title="Select Fee Preferences"
          subtitle="Exemption from tender document fees and earnest money deposit"
          currentValue={feePreference}
          options={FEE_PREFERENCES_OPTIONS}
          onApply={(val) => setFeePreference(val)}
        />
      )}

      {activeModal === 'advancedFilters' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="advancedFilters"
          title="Advanced Filters"
          subtitle="Eligibility criteria, pre-bid meetings, and contractual rules"
          extraState={advancedFilters}
          onApply={(filters) => setAdvancedFilters(filters)}
        />
      )}

      {activeModal === 'advancedSearch' && (
        <FilterSelectionModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          modalType="advancedSearch"
          title="Advanced Keyword Search"
          subtitle="Find precise tender notices with exact phrases and reference numbers"
          extraState={advancedSearch}
          onApply={(advSearch) => setAdvancedSearch(advSearch)}
        />
      )}
    </>
  );
}
