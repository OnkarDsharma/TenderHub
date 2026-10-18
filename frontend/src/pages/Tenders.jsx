/**
 * @file src/pages/Tenders.jsx
 * @description Official public procurement directory for Jammu & Kashmir.
 * Features structured dropdown filters (Districts, Categories, Authorities, Divisions),
 * prominent interactive focus and selection states, and live notice analytics.
 */
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Search, 
  RotateCcw, 
  Filter, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Clock, 
  Archive, 
  CalendarX,
  ArrowUpDown,
  MapPin,
  Globe,
  Layers,
  Building2,
  Calendar,
  X,
  Sparkles,
  Briefcase,
  FileCheck,
  Lock,
  Rows3,
  Grid2X2
} from 'lucide-react';

import { useTenders } from '@/hooks/useTenders';
import { useDebounce } from '@/hooks/useDebounce';
import { TenderCard } from '@/components/shared/TenderCard';
import { AuthPromptModal } from '@/components/shared/AuthPromptModal';
import { DailyAccessMeter } from '@/components/shared/DailyAccessMeter';
import { useAuthStore } from '@/store/useAuthStore';
import { Input } from '@/components/ui/Input';
import { Select, SelectTrigger, SelectItem } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

// =============================================================================
// Comprehensive Filter Datasets Verified Against MongoDB Aggregation
// =============================================================================

// 0. Northern Region State Options
const STATE_OPTIONS = [
  { label: 'All Northern States', value: '' },
  { label: 'Jammu & Kashmir', value: 'Jammu & Kashmir' },
  { label: 'Himachal Pradesh', value: 'Himachal Pradesh' },
  { label: 'Punjab', value: 'Punjab' },
];

// 1. All 20 Verified Administrative Districts of Jammu & Kashmir
const DISTRICT_OPTIONS = [
  { label: 'All Districts & Regions', value: '' },
  { label: 'Anantnag', value: 'Anantnag' },
  { label: 'Bandipora', value: 'Bandipora' },
  { label: 'Baramulla', value: 'Baramulla' },
  { label: 'Budgam', value: 'Budgam' },
  { label: 'Doda', value: 'Doda' },
  { label: 'Ganderbal', value: 'Ganderbal' },
  { label: 'Jammu', value: 'Jammu' },
  { label: 'Kathua', value: 'Kathua' },
  { label: 'Kishtwar', value: 'Kishtwar' },
  { label: 'Kulgam', value: 'Kulgam' },
  { label: 'Kupwara', value: 'Kupwara' },
  { label: 'Poonch', value: 'Poonch' },
  { label: 'Pulwama', value: 'Pulwama' },
  { label: 'Rajouri', value: 'Rajouri' },
  { label: 'Ramban', value: 'Ramban' },
  { label: 'Reasi', value: 'Reasi' },
  { label: 'Samba', value: 'Samba' },
  { label: 'Shopian', value: 'Shopian' },
  { label: 'Srinagar', value: 'Srinagar' },
  { label: 'Udhampur', value: 'Udhampur' },
];

const STATE_DISTRICT_OPTIONS = {
  'Jammu & Kashmir': DISTRICT_OPTIONS,
  'Himachal Pradesh': [
    { label: 'All Himachal Districts', value: '' },
    { label: 'Shimla', value: 'Shimla' },
    { label: 'Kangra / Dharamshala', value: 'Kangra' },
    { label: 'Mandi', value: 'Mandi' },
    { label: 'Kullu', value: 'Kullu' },
    { label: 'Solan', value: 'Solan' },
    { label: 'Sirmaur', value: 'Sirmaur' },
    { label: 'Chamba', value: 'Chamba' },
    { label: 'Hamirpur', value: 'Hamirpur' },
    { label: 'Una', value: 'Una' },
    { label: 'Bilaspur', value: 'Bilaspur' },
    { label: 'Kinnaur', value: 'Kinnaur' },
    { label: 'Lahaul & Spiti', value: 'Lahaul' },
  ],
  'Punjab': [
    { label: 'All Punjab Districts', value: '' },
    { label: 'Amritsar', value: 'Amritsar' },
    { label: 'Bathinda', value: 'Bathinda' },
    { label: 'Faridkot', value: 'Faridkot' },
    { label: 'Fatehgarh Sahib', value: 'Fatehgarh' },
    { label: 'Fazilka', value: 'Fazilka' },
    { label: 'Firozpur', value: 'Firozpur' },
    { label: 'Gurdaspur', value: 'Gurdaspur' },
    { label: 'Hoshiarpur', value: 'Hoshiarpur' },
    { label: 'Jalandhar', value: 'Jalandhar' },
    { label: 'Kapurthala', value: 'Kapurthala' },
    { label: 'Ludhiana', value: 'Ludhiana' },
    { label: 'Mansi / Mansa', value: 'Mansa' },
    { label: 'Moga', value: 'Moga' },
    { label: 'Mohali (SAS Nagar)', value: 'Mohali' },
    { label: 'Muktsar', value: 'Muktsar' },
    { label: 'Pathankot', value: 'Pathankot' },
    { label: 'Patiala', value: 'Patiala' },
    { label: 'Rupnagar (Ropar)', value: 'Rupnagar' },
    { label: 'Sangrur', value: 'Sangrur' },
    { label: 'Tarn Taran', value: 'Tarn Taran' },
  ]
};

// 2. Nature of Procurement / Tender Category (Works, Goods, Services)
const PROCUREMENT_TYPE_OPTIONS = [
  { label: 'All Procurement Types', value: '' },
  { label: 'Works Contracts (Civil / Engineering)', value: 'Works' },
  { label: 'Goods & Equipment Supplies', value: 'Goods' },
  { label: 'Services & Operations', value: 'Services' },
];

// 3. All 38 Distinct Work Categories / Product Domains in MongoDB
const CATEGORY_OPTIONS = [
  { label: 'All Work Categories', value: '' },
  { label: 'Civil Works (Buildings, Roads & General)', value: 'Civil Works' },
  { label: 'Electrical Works', value: 'Electrical Works' },
  { label: 'Drilling Works & Boring', value: 'Drilling Works' },
  { label: 'Medical Equipments & Bio-Waste', value: 'Medical Equipments/Waste' },
  { label: 'Machineries & Mechanical Engg Items', value: 'Machineries/ Mechanical Engg Items' },
  { label: 'Agricultural or Forestry Works', value: 'Agricultural or Forestry' },
  { label: 'Miscellaneous Services', value: 'Miscellaneous Services' },
  { label: 'Repair & Maintenance Works', value: 'Repair and Maintenance Works' },
  { label: 'Civil Works - Others', value: 'Civil Works - Others' },
  { label: 'Miscellaneous Works', value: 'Miscellaneous Works' },
  { label: 'Civil Works - Canal & Irrigation', value: 'Civil Works - Canal' },
  { label: 'Electrical and Maintenance Works', value: 'Electrical and Maintenance Works' },
  { label: 'Supply of Materials & Aggregate', value: 'Supply of Materials' },
  { label: 'Civil Works - Roads & Macadamization', value: 'Civil Works - Roads' },
  { label: 'Miscellaneous Goods & Hardware', value: 'Miscellaneous Goods' },
  { label: 'Consultancy & Technical Advisory', value: 'Consultancy' },
  { label: 'Repair and Maintenance Services', value: 'Repair and Maintenance Services' },
  { label: 'Civil Works - Water Works & Distribution', value: 'Civil Works - Water Works' },
  { label: 'Civil Construction Goods', value: 'Civil Construction Goods' },
  { label: 'Suture & Surgical Products', value: 'Suture and related products' },
  { label: 'Shipping / Transportation / Vehicles', value: 'Shipping/ Transportation/ Vehicle' },
  { label: 'Electrical Goods & Equipments', value: 'Electrical Goods/Equipments' },
  { label: 'Land & Building Infrastructure', value: 'Land/Building' },
  { label: 'Medicines & Pharmaceuticals', value: 'Medicines' },
  { label: 'Food Products & Ration Supply', value: 'Food Products' },
  { label: 'Water Equipments / Meters / Boring', value: 'Water Equipments/ Meter/ Drilling/ Boring' },
  { label: 'Hotel & Catering Services', value: 'Hotel/ Catering' },
  { label: 'Audio-Visual & Studio Equipment', value: 'Audio-Visual Equipment' },
  { label: 'Network & Communication Equipments', value: 'Network /Communication Equipments' },
  { label: 'Consumables (Hospital / Lab)', value: 'Consumables (Hospital / Lab)' },
  { label: 'Topographical & Land Survey', value: 'Survey' },
  { label: 'Pumps & Electric Motors', value: 'Pumps/Motors' },
  { label: 'Electronics & Computing Equipment', value: 'Electronics Equipment' },
  { label: 'Machineries & Mechanical Engg Works', value: 'Machineries/ Mechanical Engg Works' },
  { label: 'Support & Maintenance Services', value: 'Support/Maintenance Service' },
  { label: 'Furniture & Fixture', value: 'Furniture/ Fixture' },
  { label: 'Printing & Stationery', value: 'Stationery' },
  { label: 'Lift Irrigation Schemes', value: 'Civil Works - Lift Irrigation Schemes' },
  { label: 'Housekeeping & Sanitation', value: 'Housekeeping/ Cleaning' },
  { label: 'Mechanical Engineering Items', value: 'Mechanical Engineering Items' },
  { label: 'Chemicals & Minerals', value: 'Chemicals/Minerals' },
];

// 4. All 33 Verified Government Authorities & Departments in MongoDB
const AUTHORITY_OPTIONS = [
  { label: 'All Government Authorities', value: '' },
  { label: 'Rural Development & Panchayati Raj (RDPR)', value: 'Rural Development' },
  { label: 'Public Works Department (PWD / R&B)', value: 'PWD' },
  { label: 'Irrigation & Flood Control (I and FC)', value: 'I and FC' },
  { label: 'Housing & Urban Development (HAUDD / SMC / JMC)', value: 'HAUDD' },
  { label: 'Jal Shakti / PHE Department', value: 'PHE' },
  { label: 'Forest Department', value: 'FOREST DEPARTMENT' },
  { label: 'Power Development Dept (DC-PDD / KPDCL / JPDCL)', value: 'DC-PDD' },
  { label: 'Soil & Water Conservation Dept', value: 'Soil and Water Conservation' },
  { label: 'Health & Medical Education (HME / JKMSCL)', value: 'Health and Medical Education' },
  { label: 'Power Development Corp (JKSPDC)', value: 'JKSPDC' },
  { label: 'Police Headquarters (DGP-JK)', value: 'DGP-JK' },
  { label: 'Forest Development Corp (JKSFC)', value: 'JKSFC' },
  { label: 'Agriculture Production Department (HADP / JKCIP)', value: 'AGRICULTURE PRODUCTION' },
  { label: 'Shri Mata Vaishno Devi Shrine Board (SMVDSB)', value: 'SHRI MATA VAISHNO DEVI' },
  { label: 'SKUAST Agriculture University', value: 'SKUAST' },
  { label: 'Universities & Higher Education', value: 'University Department' },
  { label: 'J&K Sports Council', value: 'Sports Council' },
  { label: 'Tourism Department', value: 'Tourism' },
  { label: 'SKIMS (Medical Institute Soura)', value: 'SKIMS' },
  { label: 'Horticulture Production Dept', value: 'Horticulture' },
  { label: 'Small Scale Industries Development Corp (SICOP)', value: 'SICOP' },
  { label: 'Jammu Smart City Limited', value: 'Jammu Smart City' },
  { label: 'J&K AGRO Industries', value: 'J and K AGRO' },
  { label: 'Shri Mata Vaishno Devi University (SMVDU)', value: 'SMVDU' },
  { label: 'State Industrial Development Corp (SIDCO)', value: 'SIDCO' },
  { label: 'Floriculture Department', value: 'Floriculture' },
  { label: 'J&K Services Selection Board (JKSSB)', value: 'Selection Board' },
  { label: 'DG Prisons J&K', value: 'DG-PRISONS' },
  { label: 'Higher Education Department', value: 'HIGHER EDUCATION' },
  { label: 'Srinagar Smart City Limited', value: 'Srinagar Smart City' },
  { label: 'J&K State Cable Car Corp', value: 'CABLE CAR' },
  { label: 'Animal & Sheep Husbandry (ASH)', value: 'ASH' },
  { label: 'State Procurement & Supplies Agency (SPSA)', value: 'State Procurement' },
];

// 5. Verified Engineering & Administrative Divisions from MongoDB
const DIVISION_OPTIONS = [
  { label: 'All Divisions & Wings', value: '' },
  { label: 'XEN REW Baramulla', value: 'REW Baramulla' },
  { label: 'XEN REW Budgam', value: 'REW Budgam' },
  { label: 'XEN REW Poonch', value: 'REW POONCH' },
  { label: 'XEN REW Anantnag', value: 'REW Anantnag' },
  { label: 'XEN REW Jammu', value: 'REW JAMMU' },
  { label: 'XEN REW Pulwama', value: 'REW Pulwama' },
  { label: 'XEN REW Doda', value: 'REW DODA' },
  { label: 'XEN REW Kishtwar', value: 'REW KISHTWAR' },
  { label: 'XEN REW Reasi', value: 'REW REASI' },
  { label: 'XEN REW Udhampur', value: 'REW UDHAMPUR' },
  { label: 'XEN REW Samba', value: 'REW SAMBA' },
  { label: 'XEN REW Bandipora', value: 'REW Bandipora' },
  { label: 'XEN REW Ramban', value: 'REW RAMBAN' },
  { label: 'XEN REW Kathua', value: 'REW KATHUA' },
  { label: 'XEN REW Kupwara', value: 'REW Kupwara' },
  { label: 'XEN REW Kulgam', value: 'REW Kulgam' },
  { label: 'XEN REW Srinagar', value: 'REW Srinagar' },
  { label: 'JK Medical Supplies Corp (JKMSCL)', value: 'JK MEDICAL SUPPLIES' },
  { label: 'City Roads Division Srinagar', value: 'City Roads Division' },
  { label: 'Srinagar Municipal Corporation (SMC)', value: 'SMC' },
  { label: 'Jammu Municipal Corporation (JMC)', value: 'Jammu Municipal' },
  { label: 'Ground Water Division (GWD)', value: 'Ground Water' },
  { label: 'Mechanical GWD Division Jammu', value: 'Mech GWD' },
  { label: 'EE R&B Provincial Division 3rd Srinagar', value: 'PD 3rd' },
  { label: 'SE R&B Circle Poonch', value: 'SE RandB Poonch' },
  { label: 'EE R&B Ramban', value: 'RandB Ramban' },
  { label: 'EE R&B Satwari', value: 'RandB Satwari' },
  { label: 'EE R&B Surankote', value: 'RandB Surankote' },
  { label: 'EE R&B Thanamandi', value: 'RandB Thanamandi' },
  { label: 'EE R&B Doda', value: 'RandB Doda' },
  { label: 'EE R&B Bhaderwah', value: 'RandB Bhaderwah' },
  { label: 'PWD R&B Rajouri Division', value: 'Rajouri Division' },
  { label: 'PWD R&B Anantnag Division', value: 'Anantnag Division' },
  { label: 'PWD R&B Budgam Division', value: 'Budgam Division' },
  { label: 'PWD R&B Pulwama Division', value: 'Pulwama Division' },
  { label: 'PWD R&B Kulgam Division', value: 'Kulgam Division' },
  { label: 'PWD R&B Baramulla Division', value: 'Baramulla Division' },
  { label: 'PWD R&B Dooru Division', value: 'Dooru Division' },
  { label: 'PWD R&B Lolab Division', value: 'Lolab Division' },
  { label: 'PWD R&B Gurez Division', value: 'Gurez Division' },
  { label: 'PWD R&B Pahalgam Division', value: 'Pahalgam Division' },
  { label: 'R&B Electric Division Kashmir', value: 'Electric Division Kashmir' },
  { label: 'PW R&B Electric Division Jammu', value: 'Electric Div Jammu' },
  { label: 'DSCO Poonch (Soil Conservation)', value: 'DSCO Poonch' },
  { label: 'DSCO Kathua (Soil Conservation)', value: 'DSCO Kathua' },
  { label: 'DSCO Jammu (Soil Conservation)', value: 'DSCO Jammu' },
  { label: 'Director Soil & Water Conservation', value: 'Director soil and water' },
  { label: 'Irrigation Division 1 Jammu', value: 'ID-1 Jammu' },
  { label: 'Irrigation Division 2 Jammu', value: 'ID-2 Jammu' },
  { label: 'Irrigation Division Kulgam', value: 'Irrigation Divn Kulgam' },
  { label: 'Tube Well Irrigation Div (T.W.I.D) Jammu', value: 'T.W.I.D Jammu' },
  { label: 'Irrigation Kangan Division', value: 'Kangan Division' },
  { label: 'Electric Division (ED) Kupwara', value: 'ED Kupwara' },
  { label: 'CE-M & RE Wing Kashmir (PDD)', value: 'CE-M and RE Wing Kashmir' },
  { label: 'Lidder Forest Division (DFO Lidder)', value: 'DFO Lidder' },
  { label: 'Rajouri Forest Division', value: 'Rajouri Forest' },
  { label: 'Jammu Hospital & Central Heating Div', value: 'Jammu Hospital and Central Heating' },
  { label: 'Directorate Urban Local Bodies Jammu', value: 'Urban Local Bodies Jammu' },
  { label: 'Rural Division Jammu', value: 'Rural Division Jammu' },
];

// 6. Contract Agreement Types
const CONTRACT_TYPE_OPTIONS = [
  { label: 'All Contract Forms', value: '' },
  { label: 'Item Rate / Turnkey Tender', value: 'Tender' },
  { label: 'Rate Contract (Annual / Bulk)', value: 'Rate Contract' },
  { label: 'Empanelment / Vendor Roster', value: 'Empanelment' },
];

// 7. Closing Submission Windows
const DEADLINE_OPTIONS = [
  { label: 'All Closing Deadlines', value: '' },
  { label: 'Closing in 3 Days (Urgent)', value: '3' },
  { label: 'Closing in 7 Days (Within 1 Week)', value: '7' },
  { label: 'Closing in 15 Days (Fortnightly)', value: '15' },
  { label: 'Closing in 30 Days (Monthly Window)', value: '30' },
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
    if (!isAuthenticated) {
      handleRequestAuth({
        title: 'Sign In to View Full Tender Details',
        subtitle: `Notice ${tender.sourceTenderId || tender.tenderReferenceNumber || 'NIT'}: ${tender.title?.slice(0, 80) || ''}...`,
        redirectUrl: `/tenders/${tenderId}`
      });
      return;
    }
    navigate(`/tenders/${tenderId}`);
  };

  // 1. Initial State from URL params
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('category') || '';
  const initialTenderCategory = searchParams.get('tenderCategory') || '';
  const initialContractType = searchParams.get('contractType') || '';
  const initialState = searchParams.get('state') || '';

  const [advancedSearch, setAdvancedSearch] = useState(initialSearch);
  const debouncedSearch = useDebounce(advancedSearch, 500);

  const [state, setState] = useState(initialState);
  const [tenderCategory, setTenderCategory] = useState(initialTenderCategory);
  const [category, setCategory] = useState(initialCategory);
  const [contractType, setContractType] = useState(initialContractType);
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [organisation, setOrganisation] = useState(searchParams.get('organisation') || '');
  const [department, setDepartment] = useState(searchParams.get('department') || '');
  const [closingDate, setClosingDate] = useState(searchParams.get('closingDays') || '');
  
  // Tab State: Latest vs Archived Tenders
  const [status, setStatus] = useState('active');
  const [sortBy, setSortBy] = useState('arrival');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list');

  // Dynamic District Options based on State
  const activeDistrictOptions = state && STATE_DISTRICT_OPTIONS[state]
    ? STATE_DISTRICT_OPTIONS[state]
    : DISTRICT_OPTIONS;

  // Active filter count for badge
  const activeFilterCount = [
    Boolean(advancedSearch),
    Boolean(state),
    Boolean(tenderCategory),
    Boolean(category),
    Boolean(contractType),
    Boolean(location),
    Boolean(organisation),
    Boolean(department),
    Boolean(closingDate),
  ].filter(Boolean).length;

  // Unauthenticated guests get up to 25 items on page 1 so 15 are visible and remaining are blurred
  const queryLimit = isAuthenticated ? 10 : 25;

  // 2. Construct API Query
  const queryFilters = {
    search: debouncedSearch,
    state: state || undefined,
    tenderCategory: tenderCategory,
    category: category,
    contractType: contractType,
    organisation: organisation,
    department: department,
    location: location,
    closingDays: closingDate,
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
  const totalPages = Math.ceil(totalCount / (isAuthenticated ? 10 : 25)) || 1;

  // 3. Handlers
  const handleReset = () => {
    setAdvancedSearch('');
    setState('');
    setTenderCategory('');
    setCategory('');
    setContractType('');
    setOrganisation('');
    setDepartment('');
    setLocation('');
    setClosingDate('');
    setStatus('active');
    setSortBy('arrival');
    setCurrentPage(1);
    setSearchParams({});
  };

  const handlePageChange = (newPage) => {
    const targetPage = Math.min(totalPages, Math.max(1, Math.trunc(Number(newPage) || 1)));
    if (!isAuthenticated && targetPage > 1) {
      handleRequestAuth({
        title: 'Sign In to View More Tenders',
        subtitle: 'Guests are limited to previewing the 15 latest tender notices. Sign in to browse all pages and view details.',
        redirectUrl: '/tenders'
      });
      return;
    }
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
    <div className="tenders-page min-h-screen bg-paper dark:bg-slate-900 py-6 sm:py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Page Title & Reset Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white tracking-tight">
                Tender Notice Directory
              </h1>
              {(import.meta.env.VITE_TEST_MODE === 'true' || (typeof window !== 'undefined' && window.location.port === '5175')) ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-xs">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>Testing Port 5175: All Content &amp; Full Details Unlocked (No Login Required)</span>
                </span>
              ) : !isAuthenticated ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>Guest Preview (15 Latest Notices)</span>
                </span>
              ) : isPro ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700 shadow-xs">
                  Pro Unlimited Access
                </span>
              ) : (
                <DailyAccessMeter 
                  viewsUsed={user?.dailyViews?.viewsUsed ?? 0}
                  viewsLimit={typeof user?.dailyViews?.viewsLimit === 'number' ? user.dailyViews.viewsLimit : 5}
                  resetsAt={user?.dailyViews?.resetsAt}
                  isPro={isPro}
                />
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Official public works, civil contracts, and procurement notices published across {state || 'Jammu & Kashmir, Himachal Pradesh, and Punjab'}.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleReset} 
            className="gap-1.5 text-xs self-start sm:self-auto hover:border-chinarRed hover:text-chinarRed transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
          </Button>
        </div>

        {/* Quick Regional State Selection Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 shrink-0 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-dalBlue" /> State / Region:
          </span>
          {STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setState(opt.value);
                setLocation('');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                state === opt.value
                  ? 'bg-dalBlue text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Mobile/Tablet Filter Accordion Toggle (< lg) */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs text-xs font-bold text-dalBlue dark:text-blue-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-dalBlue dark:text-blue-400 shrink-0" />
              <span>{mobileFiltersOpen ? 'Hide Search Filters' : 'Show Search Filters'}</span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-dalBlue text-white dark:bg-blue-600">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span 
                  onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  className="text-[11px] text-chinarRed hover:underline font-semibold"
                >
                  Reset
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 items-start">
          
          {/* ---------------- FILTER SIDEBAR ---------------- */}
          <aside className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs flex flex-col overflow-hidden transition-all ${
            mobileFiltersOpen ? 'flex mb-1' : 'hidden'
          }`}>
            {/* Pinned Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/80 text-dalBlue dark:text-blue-400 bg-white dark:bg-slate-800 shrink-0 select-none">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <h2 className="text-xs font-bold uppercase tracking-wider">Search Filters</h2>
              </div>
              {activeFilterCount > 0 && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-dalBlue text-white dark:bg-blue-600 shadow-xs animate-in fade-in">
                  {activeFilterCount} active
                </span>
              )}
            </div>

            {/* Scrollable Filters Body with Dedicated Vertical Scrollbar */}
            <div className="filter-grid flex-1 px-4 sm:px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-4">
              {/* Keyword Search Input */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Keyword / NIT No.</span>
                  {advancedSearch && (
                    <button 
                      onClick={() => { setAdvancedSearch(''); setCurrentPage(1); }}
                      className="text-[10px] text-slate-400 hover:text-chinarRed"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 sm:top-3" />
                  <Input
                    type="text"
                    value={advancedSearch}
                    onChange={(e) => {
                      setAdvancedSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="e.g. Borewell, NIT No, Road..."
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              {/* Procurement Nature (Works, Goods, Services) */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" /> Procurement Type
                  </span>
                  {tenderCategory && (
                    <button 
                      onClick={() => { setTenderCategory(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={tenderCategory} onValueChange={(val) => { setTenderCategory(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {PROCUREMENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* State / UT Selector */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" /> State / Region
                  </span>
                  {state && (
                    <button 
                      onClick={() => { setState(''); setLocation(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={state} onValueChange={(val) => { setState(val); setLocation(''); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {STATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* District / Location Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-chinarRed" /> {state ? `District (${state})` : 'District / Region'}
                  </span>
                  {location && (
                    <button 
                      onClick={() => { setLocation(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={location} onValueChange={(val) => { setLocation(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {activeDistrictOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Work Category Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" /> Work Domain / Category
                  </span>
                  {category && (
                    <button 
                      onClick={() => { setCategory(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={category} onValueChange={(val) => { setCategory(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Government Authority Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Procuring Authority
                  </span>
                  {organisation && (
                    <button 
                      onClick={() => { setOrganisation(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={organisation} onValueChange={(val) => { setOrganisation(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {AUTHORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Division / Sub-Department Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Executive Division / Wing</span>
                  {department && (
                    <button 
                      onClick={() => { setDepartment(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={department} onValueChange={(val) => { setDepartment(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {DIVISION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Form of Contract Dropdown */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Form of Contract
                  </span>
                  {contractType && (
                    <button 
                      onClick={() => { setContractType(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={contractType} onValueChange={(val) => { setContractType(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {CONTRACT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>

              {/* Closing Date Window */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Submission Deadline
                  </span>
                  {closingDate && (
                    <button 
                      onClick={() => { setClosingDate(''); setCurrentPage(1); }}
                      className="text-[10px] text-chinarRed font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </label>
                <Select value={closingDate} onValueChange={(val) => { setClosingDate(val); setCurrentPage(1); }}>
                  <SelectTrigger className="text-xs">
                    {DEADLINE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
            </div>

            {/* Pinned Quick Reset in Sidebar Footer */}
            {activeFilterCount > 0 && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/60 shrink-0">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleReset}
                  className="w-full text-xs text-chinarRed border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold"
                >
                  Clear All Filters ({activeFilterCount})
                </Button>
              </div>
            )}
          </aside>

          {/* ---------------- MAIN RESULTS FEED ---------------- */}
          <main className="space-y-4">
            
            {/* Top Tab Bar: Latest vs Archived Notices + Sorting */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-2 sm:p-2.5 rounded-lg shadow-xs">
              {/* Menu Tabs with Clean Active States */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-md border border-slate-200/80 dark:border-slate-800 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setStatus('active');
                    setCurrentPage(1);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue ${
                    status === 'active'
                      ? 'bg-white dark:bg-slate-800 text-dalBlue dark:text-white font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Active Notices</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    status === 'active' 
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-dalBlue dark:text-blue-300' 
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {activeCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatus('archived');
                    setCurrentPage(1);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue ${
                    status === 'archived'
                      ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                  title="Tenders whose download closed or awaiting bid opening"
                >
                  <Archive className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Archived</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    status === 'archived' 
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' 
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {archivedCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatus('expired');
                    setCurrentPage(1);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue ${
                    status === 'expired'
                      ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                  title="Tenders whose bid submission deadline has elapsed"
                >
                  <CalendarX className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Expired</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    status === 'expired' 
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300' 
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {expiredCount}
                  </span>
                </button>
              </div>

              {/* Compact results count, view, and sorting controls */}
              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 px-1 sm:px-2 w-full sm:w-auto">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-auto sm:mr-1">
                  <strong className="font-mono text-slate-900 dark:text-white">{totalCount.toLocaleString('en-IN')}</strong> {status === 'archived' ? 'archived notices' : status === 'expired' ? 'expired notices' : 'active notices'}
                </span>
                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5" role="group" aria-label="Tender view">
                  <button type="button" onClick={() => setViewMode('list')} aria-label="List view" title="List view" aria-pressed={viewMode === 'list'} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-slate-100 dark:bg-slate-800 text-dalBlue dark:text-blue-300' : 'text-slate-500'}`}>
                    <Rows3 className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setViewMode('card')} aria-label="Card view" title="Card view" aria-pressed={viewMode === 'card'} className={`p-1.5 rounded-md ${viewMode === 'card' ? 'bg-slate-100 dark:bg-slate-800 text-dalBlue dark:text-blue-300' : 'text-slate-500'}`}>
                    <Grid2X2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Sort:</span>
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 sm:flex-none bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-white hover:border-dalBlue dark:hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-dalBlue/30 focus:border-dalBlue cursor-pointer shadow-xs transition-all truncate"
                >
                  <option value="arrival">Latest Published (Newest First)</option>
                  <option value="publishedAsc">Oldest Published First</option>
                  <option value="closingAsc">Closing Deadline (Soonest First)</option>
                  <option value="closingDesc">Closing Deadline (Furthest First)</option>
                  <option value="valueDesc">Estimated Value (High to Low)</option>
                  <option value="valueAsc">Estimated Value (Low to High)</option>
                </select>
              </div>
            </div>

            {/* Active Filter Chips Bar */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs shadow-xs">
                <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase text-[10px] mr-1">Active:</span>
                
                {advancedSearch && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <span>Search: &quot;{advancedSearch}&quot;</span>
                    <button onClick={() => setAdvancedSearch('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {tenderCategory && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Briefcase className="w-3 h-3" />
                    <span>Type: {tenderCategory}</span>
                    <button onClick={() => setTenderCategory('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {location && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <MapPin className="w-3 h-3 text-chinarRed" />
                    <span>District: {location}</span>
                    <button onClick={() => setLocation('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {category && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Layers className="w-3 h-3" />
                    <span>Category: {category}</span>
                    <button onClick={() => setCategory('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {organisation && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Building2 className="w-3 h-3" />
                    <span className="truncate max-w-[160px]">Authority: {organisation}</span>
                    <button onClick={() => setOrganisation('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {department && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <span className="truncate max-w-[160px]">Division: {department}</span>
                    <button onClick={() => setDepartment('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {contractType && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <FileCheck className="w-3 h-3" />
                    <span>Contract: {contractType}</span>
                    <button onClick={() => setContractType('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {closingDate && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-dalBlue dark:text-blue-200 border border-dalBlue/20 font-medium">
                    <Calendar className="w-3 h-3" />
                    <span>Deadline: &le; {closingDate} days</span>
                    <button onClick={() => setClosingDate('')} className="hover:text-chinarRed font-bold ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  onClick={handleReset}
                  className="text-chinarRed font-bold hover:underline text-xs ml-auto cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-8 h-8 rounded-full border-3 border-dalBlue border-t-transparent animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Loading tender notices...</p>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-6 text-center text-red-700 dark:text-red-300 text-xs space-y-1">
                <p className="font-bold text-sm">Unable to load tender directory.</p>
                <p>{error?.message || 'Please verify database connection.'}</p>
              </div>
            )}

            {/* Tender Feed */}
            {!isLoading && !isError && tenders.length > 0 && (
              <div className={viewMode === 'list' ? 'tender-results-list' : 'tender-results-cards'}>
                {tenders.map((tender, index) => {
                  const isBlurredCard = !isPro && index >= 15;
                  return (
                    <div key={tender._id || tender.sourceTenderId} className="space-y-4">
                      {/* Banner injected before first blurred tender card (index 15) */}
                      {!isPro && index === 15 && (
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-dalBlue to-slate-950 text-white p-5 sm:p-7 shadow-xl border border-dalBlue/50 my-6">
                          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
                                <Lock className="w-6 h-6 text-chinarRed" />
                              </div>
                              <div>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-mono font-bold text-blue-200 mb-1.5">
                                  <span>Viewing 15 of {totalCount} Active Notices</span>
                                </div>
                                <h3 className="text-base sm:text-lg font-display font-bold">
                                  {isAuthenticated ? 'Upgrade to TenderHub Pro' : 'Unlock All Tender Notices & Technical Details'}
                                </h3>
                                <p className="text-xs text-blue-100/80 mt-1 max-w-xl leading-relaxed">
                                  {isAuthenticated 
                                    ? 'Get unlimited tender views, 1-click BOQ Excel downloads, and automated WhatsApp alerts for your preferred J&K departments & districts.'
                                    : 'Cards below are blurred for preview. Log in or create a free contractor account to unlock all active tenders, search across 20 districts, and download BOQs.'}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto shrink-0">
                              {isAuthenticated ? (
                                <Button
                                  type="button"
                                  onClick={() => navigate('/pricing')}
                                  className="w-full sm:w-auto bg-chinarRed hover:bg-chinarRed/90 text-white font-semibold text-xs py-2 px-5 rounded-lg shadow-sm cursor-pointer"
                                >
                                  View Pro Plans
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  onClick={() => handleRequestAuth({
                                    title: 'Sign In to View More Tenders',
                                    subtitle: 'Sign in to unlock all tender notices and view full details (5 views/24 hours).',
                                    redirectUrl: '/tenders'
                                  })}
                                  className="w-full sm:w-auto bg-chinarRed hover:bg-chinarRed/90 text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-lg cursor-pointer"
                                >
                                  Log In to View More Tenders
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div 
                        onClick={() => {
                          if (isBlurredCard) {
                            if (!isAuthenticated) {
                              handleRequestAuth({
                                title: 'Sign In to View More Tenders',
                                subtitle: 'Sign in to unlock all tender notices and view full details.',
                                redirectUrl: '/tenders'
                              });
                            } else {
                              navigate('/pricing');
                            }
                            return;
                          }
                        }}
                        className={isBlurredCard ? 'cursor-pointer' : ''}
                      >
                        <TenderCard 
                          tender={tender} 
                          isBlurred={isBlurredCard}
                          onViewDetails={() => handleViewDetails(tender)}
                          variant={viewMode === 'list' ? 'row' : 'card'}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Standard Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl mt-6 shadow-xs gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Page <strong className="text-slate-800 dark:text-white font-mono">{currentPage}</strong> of <strong className="text-slate-800 dark:text-white font-mono">{totalPages}</strong>
                    {!isAuthenticated && <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">(Sign in for all pages)</span>}
                  </span>

                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => handlePageChange(Math.max(currentPage - 1, 1))} disabled={currentPage === 1}
                      className="px-2.5 text-xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
                    </Button>
                    
                    <div className="h-8 px-3 flex items-center justify-center bg-dalBlue text-white dark:bg-blue-600 rounded-lg text-xs font-mono font-bold shadow-xs border border-dalBlue dark:border-blue-500">
                      {currentPage}
                    </div>

                    <form onSubmit={handlePageJump} className="flex items-center gap-1.5" aria-label="Jump to tender page">
                      <label htmlFor="tender-page-jump" className="text-xs text-slate-500 dark:text-slate-400">Go to</label>
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
                        className="h-8 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-center text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:ring-1.5 focus:ring-dalBlue [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <Button type="submit" variant="outline" size="sm" className="px-2.5 text-xs">Go</Button>
                    </form>

                    <Button
                      variant="outline" size="sm"
                      onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))} disabled={currentPage === totalPages}
                      className="px-2.5 text-xs"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isError && tenders.length === 0 && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <h4 className="text-base font-bold text-slate-800 dark:text-white">
                  {status === 'archived' ? 'No Archived Notices Found' : status === 'expired' ? 'No Expired Notices Found' : 'No Matching Tender Notices'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {status === 'archived'
                    ? 'No notices currently awaiting bid opening or with download concluded match your filters.'
                    : status === 'expired'
                    ? 'No expired notices match your current filters.'
                    : 'Try clearing specific department, category, or district filters to broaden your search results.'}
                </p>
                <div className="pt-2">
                  <Button variant="outline" onClick={handleReset} className="text-xs hover:border-dalBlue">
                    Reset All Filters
                  </Button>
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
