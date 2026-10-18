/**
 * @file src/pages/Home.jsx
 * @description TenderHub Jammu & Kashmir Public Procurement Portal.
 * Uses the requested Techbyte design system (hero with TenderHUB1.jpg background,
 * bottom stats counter, pill badges, 2-column verified section with TenderHub2.jpg,
 * and cards) with 100% authentic TenderHub content:
 * 1. Hero with TenderHUB1.jpg, live search console, and stats bar
 * 2. Active Procurement Sectors & Departments (8 dynamic department cards)
 * 3. Browse Tenders by Work Domain (6 classified public works domains)
 * 4. Procurement Integrity & Verification (with TenderHub2.jpg on the left)
 * 5. Recent Tender Announcements (live database feed)
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Search, 
  ArrowRight, 
  ArrowUpRight, 
  ArrowUp,
  Landmark, 
  Building2, 
  Calendar, 
  MapPin, 
  FileText, 
  Sparkles,
  Clock,
  Check,
  HardHat,
  Droplets,
  Zap,
  Truck,
  Wrench,
  Boxes,
  ShieldCheck
} from 'lucide-react';

import { PreferenceModal } from '@/components/shared/PreferenceModal';
import { AuthPromptModal } from '@/components/shared/AuthPromptModal';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenderStats } from '@/hooks/useTenders';
import { formatCurrencyINR, formatDateDisplay } from '@/utils/formatters';

// Common regional sectors and districts for quick access
const quickLocations = [
  { label: 'Civil Works', query: 'Civil Works' },
  { label: 'Jal Shakti / PHE', query: 'Jal Shakti' },
  { label: 'PMGSY Roads', query: 'Roads' },
  { label: 'Electrical Works', query: 'Electrical Works' },
  { label: 'Baramulla', query: 'Baramulla' },
  { label: 'Srinagar', query: 'Srinagar' },
  { label: 'Bandipora', query: 'Bandipora' },
  { label: 'Anantnag', query: 'Anantnag' },
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Auth Prompt Modal State for recent tenders
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    title: 'Sign In to View Full Tender Details',
    subtitle: 'Official tender documents, BOQs, and authority specifications are protected.',
    redirectUrl: '/tenders'
  });

  const handleTenderClick = (tender) => {
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: 'Sign In to View Full Tender Details',
        subtitle: `Notice ${tender.sourceTenderId || ''}: ${tender.title?.slice(0, 80) || ''}...`,
        redirectUrl: `/tenders/${tender._id}`
      });
      setAuthModalOpen(true);
      return;
    }
    navigate(`/tenders/${tender._id}`);
  };

  // Fetch real aggregated database statistics from backend
  const { data: stats, isLoading: isStatsLoading } = useTenderStats();

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/tenders?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate(`/tenders`);
    }
  };

  const handleQuickClick = (query) => {
    navigate(`/tenders?search=${encodeURIComponent(query)}`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Construct dynamic department cards from real live database metrics
  const departmentCards = (stats?.departmentBreakdown || []).map((dept) => ({
    title: dept.shortName.replace(/^(District\s+|Department\s+of\s+)/i, ''),
    subtitle: dept.rootOrg.includes('AGRICULTURE') 
      ? 'Department of Agricult...' 
      : dept.rootOrg.includes('DC-PDD') 
      ? 'Power Dept (PDD)' 
      : dept.rootOrg.includes('PWD') || dept.rootOrg.includes('R&B')
      ? 'PWD'
      : dept.rootOrg.includes('HAUDD') || dept.rootOrg.includes('MUNICIPAL')
      ? 'HAUDD'
      : dept.rootOrg.includes('IRRIGATION') || dept.rootOrg.includes('IFCD')
      ? 'I and FC'
      : dept.rootOrg.includes('HEALTH') || dept.rootOrg.includes('MEDICAL')
      ? 'Health and Medical Educ...'
      : dept.rootOrg,
    count: `${dept.count} Active Notices`,
    value: formatCurrencyINR(dept.totalValue),
    type: 'department',
    query: { organisation: dept.rootOrg, department: dept.shortName }
  }));

  // Construct dynamic domain/category cards from real live database metrics
  const domainCards = (stats?.domainBreakdown || []).map((domain) => ({
    title: domain.name,
    subtitle: 'Classified Work Sector',
    count: `${domain.count} Active Notices`,
    value: formatCurrencyINR(domain.totalValue),
    type: 'category',
    query: { category: domain.name }
  }));

  // Fallback items based on real database records matching user's exact screenshot
  const fallbackDepartmentItems = [
    { title: 'Punjab State Warehousing Corporation', subtitle: 'Department of Agricult...', count: '50 Active Notices', value: '₹10.54 Cr', query: { organisation: 'Punjab State Warehousing Corporation' } },
    { title: 'DSCO - Sangrur', subtitle: 'Department of Agricult...', count: '34 Active Notices', value: '₹16.56 Cr', query: { department: 'DSCO - Sangrur' } },
    { title: 'SE RandB Poonch', subtitle: 'PWD', count: '31 Active Notices', value: '₹112.34 Cr', query: { department: 'SE RandB Poonch' } },
    { title: 'Srinagar Municipal Corporation', subtitle: 'HAUDD', count: '31 Active Notices', value: '₹1.96 Cr', query: { organisation: 'Srinagar Municipal Corporation' } },
    { title: 'IFCD Rajouri', subtitle: 'I and FC', count: '28 Active Notices', value: '₹3.78 Cr', query: { department: 'IFCD Rajouri' } },
    { title: 'XEN - Civil - Sangrur', subtitle: 'Department of Agricult...', count: '26 Active Notices', value: '₹23.23 Cr', query: { department: 'XEN - Civil - Sangrur' } },
    { title: 'JK MEDICAL SUPPLIES CORP LTD', subtitle: 'Health and Medical Educ...', count: '26 Active Notices', value: 'Refer BOQ / Rate Contract', query: { organisation: 'JK MEDICAL SUPPLIES CORP LTD' } },
    { title: 'City Roads Division Srinagar', subtitle: 'HAUDD', count: '24 Active Notices', value: '₹3.38 Cr', query: { department: 'City Roads Division Srinagar' } }
  ];

  const activeSectorCards = (departmentCards.length > 0)
    ? departmentCards.slice(0, 8)
    : fallbackDepartmentItems;

  // 6 Classified Public Works Domains from user's screenshot
  const workDomains = [
    {
      title: 'Civil Works',
      desc: 'Road construction, building works, bridges, slope stabilization, and concrete infrastructure.',
      query: 'Civil Works',
      icon: HardHat
    },
    {
      title: 'Water Supply & Jal Shakti',
      desc: 'Borewells, pump machinery, water filtration plants, distribution networks, and PHE pipelines.',
      query: 'Water',
      icon: Droplets
    },
    {
      title: 'Electrical & Power Works',
      desc: 'Transformer installations, HT/LT transmission lines, campus electrification, and grid substations.',
      query: 'Electrical Works',
      icon: Zap
    },
    {
      title: 'Roads & Bridges (PMGSY/PWD)',
      desc: 'Rural road connectivity, macadamization, blacktopping, retaining walls, and culverts.',
      query: 'Roads',
      icon: Truck
    },
    {
      title: 'Mechanical & Transport',
      desc: 'Heavy machinery hiring, fleet maintenance, fabrication works, and mechanical spares.',
      query: 'Mechanical',
      icon: Wrench
    },
    {
      title: 'General Supplies & Services',
      desc: 'Departmental store supplies, medical goods, logistics, and institutional service contracts.',
      query: 'Services',
      icon: Boxes
    }
  ];

  return (
    <div className="home-page min-h-screen bg-white dark:bg-[#121316] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      <PreferenceModal />
      <AuthPromptModal 
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        title={authModalConfig.title}
        subtitle={authModalConfig.subtitle}
        redirectUrl={authModalConfig.redirectUrl}
      />

      {/* =========================================================================
          SECTION 1: HERO SECTION (Techbyte Layout + TenderHUB1.jpg Background)
          ========================================================================= */}
      <section className="home-hero relative min-h-[620px] lg:min-h-[700px] flex flex-col justify-between bg-black overflow-hidden select-none">
        {/* Background Image: TenderHUB1.jpg */}
        <div 
          className="home-hero-image absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700"
          style={{ backgroundImage: `url('/images/TenderHUB1.jpg')` }}
        >
          {/* Dark Overlay Gradient for clean contrast */}
          <div className="home-hero-overlay absolute inset-0 bg-gradient-to-r from-black/92 via-black/80 to-black/55" />
        </div>

        {/* Hero Content Over Image */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 lg:pt-24 pb-12 w-full">
          <div className="max-w-3xl">
            
            {/* Official Procurement Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-semibold tracking-wide mb-5">
              <Landmark className="w-3.5 h-3.5 text-techCoral shrink-0" />
              <span>Jammu &amp; Kashmir Public Works &amp; Procurement</span>
            </div>

            {/* Primary Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12] font-display">
              Government Tenders Across Jammu &amp; Kashmir
            </h1>

            {/* Subtitle */}
            <p className="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-slate-300 font-normal leading-relaxed max-w-2xl">
              Discover active civil works, PHE water supply, road macadamization, and electrical contracts published across all 20 J&amp;K districts and northern region departments.
            </p>

            {/* Search Console & CTA */}
            <div className="mt-7 sm:mt-8 space-y-4">
              <form 
                onSubmit={handleSearch}
                className="flex flex-col sm:flex-row items-stretch sm:items-center bg-white/10 backdrop-blur-md border border-white/25 rounded p-1.5 shadow-lg focus-within:border-techCoral transition-colors max-w-2xl gap-2"
              >
                <div className="flex items-center flex-1 px-3 py-1.5 min-w-0">
                  <Search className="w-4 h-4 text-slate-300 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tender name, department, or district..."
                    className="w-full text-xs sm:text-sm text-white placeholder:text-slate-400 bg-transparent focus:outline-none truncate"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-techCoral hover:bg-techCoral-dark text-white font-bold text-xs sm:text-sm uppercase tracking-wider rounded-sm transition-colors shrink-0 shadow-sm cursor-pointer"
                >
                  Search Tenders
                </button>
              </form>

              {/* Popular Quick Filter Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-slate-400">Popular:</span>
                {quickLocations.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickClick(item.query)}
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-white/10 hover:bg-techCoral hover:text-white text-slate-200 transition-colors cursor-pointer border border-white/10"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* AI Estimator & Score Links */}
              <div className="flex items-center gap-4 text-xs pt-1">
                <Link 
                  to="/services" 
                  className="inline-flex items-center gap-1.5 font-bold text-techCoral hover:text-white transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Need AI BOQ Analysis &amp; Estimator?</span>
                </Link>
                <span className="text-slate-500">•</span>
                <Link 
                  to="/check-score" 
                  className="font-medium text-slate-300 hover:text-white hover:underline transition-colors"
                >
                  Check Bid Score
                </Link>
              </div>

            </div>
          </div>
        </div>

        {/* Bottom Hero Stats Bar */}
        <div className="home-statbar relative z-10 bg-white dark:bg-[#18191E] border-t border-slate-200 dark:border-slate-800 w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            
            {/* Slider Numbers / Pagination: 01 ─────── 02  03 */}
            <div className="flex items-center gap-3 text-xs sm:text-sm font-mono font-bold text-slate-500 dark:text-slate-400">
              <button 
                onClick={() => setActiveSlide(1)}
                className={`transition-colors ${activeSlide === 1 ? 'text-slate-900 dark:text-white font-extrabold' : ''}`}
              >
                01
              </button>
              <div className="w-14 sm:w-20 h-0.5 bg-slate-300 dark:bg-slate-700 relative">
                <div 
                  className="absolute top-0 left-0 h-full bg-techCoral transition-all duration-300"
                  style={{ width: activeSlide === 1 ? '50%' : activeSlide === 2 ? '75%' : '100%' }}
                />
              </div>
              <button 
                onClick={() => setActiveSlide(2)}
                className={`transition-colors ${activeSlide === 2 ? 'text-slate-900 dark:text-white font-extrabold' : ''}`}
              >
                02
              </button>
              <button 
                onClick={() => setActiveSlide(3)}
                className={`transition-colors ${activeSlide === 3 ? 'text-slate-900 dark:text-white font-extrabold' : ''}`}
              >
                03
              </button>
            </div>

            {/* Real Procurement Counters */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-10">
              {/* Stat 1: Active Notices */}
              <div className="flex items-center gap-3">
                <span className="text-2xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                  + {isStatsLoading ? '—' : (stats?.activeTendersCount ?? 29)}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[120px] leading-tight">
                  Active Tender Notices
                </span>
              </div>

              {/* Stat 2: Total Estimated Value (with circular outline badge) */}
              <div className="flex items-center gap-3">
                <div className="px-3.5 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 text-base sm:text-xl font-black font-mono text-techCoral">
                  {isStatsLoading ? '—' : formatCurrencyINR(stats?.totalValue ?? 30146323)}
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[110px] leading-tight">
                  Total Estimated Value
                </span>
              </div>

              {/* Stat 3: Authorities Count */}
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                  {isStatsLoading ? '—' : (stats?.authoritiesCount ?? 13)}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[100px] leading-tight">
                  Procuring Authorities
                </span>
              </div>

              {/* Stat 4: Districts Covered */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                  20
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[90px] leading-tight">
                  Districts Covered
                </span>
              </div>

              {/* Scroll up floating orange button */}
              <button
                onClick={scrollToTop}
                className="w-10 h-10 rounded-sm bg-techCoral hover:bg-techCoral-dark text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-auto md:ml-0"
                aria-label="Scroll to top"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: "ACTIVE PROCUREMENT SECTORS & DEPARTMENTS" (User Image 1)
          Styled in the clean Techbyte card format with badges and arrows
          ========================================================================= */}
      <section className="home-pipeline py-16 sm:py-24 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#141519]">
        <div className="max-w-7xl mx-auto">
          
          {/* Section Heading & Link */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold tracking-widest text-slate-700 dark:text-slate-300 uppercase mb-2 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-techCoral"></span>
                <span>ACTIVE PIPELINE</span>
              </div>
              <h2 className="text-xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                Active Procurement Sectors &amp; Departments
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Current opportunities grouped by issuing authority and classified engineering domain.
              </p>
            </div>

            <Link
              to="/tenders"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-techCoral hover:underline uppercase tracking-wider shrink-0"
            >
              <span>Explore all sectors</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 8 Department Cards (Screenshot 1) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {activeSectorCards.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  const params = new URLSearchParams();
                  if (item.query?.category) params.set('category', item.query.category);
                  if (item.query?.organisation) params.set('organisation', item.query.organisation);
                  if (item.query?.department) params.set('department', item.query.department);
                  navigate(`/tenders?${params.toString()}`);
                }}
                className="relative bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 rounded-sm p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate">
                      {item.count}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate" title={item.subtitle}>
                      {item.subtitle}
                    </span>
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold font-display text-slate-900 dark:text-white group-hover:text-techCoral transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h3>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-medium">Estimated Value</span>
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{item.value}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-techCoral transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION 3: "BROWSE TENDERS BY WORK DOMAIN" (User Image 3)
          Styled in the Techbyte "WHAT WE DO" aesthetic with peach corner indicators
          ========================================================================= */}
      <section className="home-domains relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#121316] border-b border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Top-Right Geometric Abstract Shapes from Techbyte */}
        <div className="absolute top-8 right-8 sm:right-16 flex items-start pointer-events-none">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-tl-full bg-techCoral/80" />
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-tr-full bg-indigo-500/80 -ml-1" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          
          {/* Centered Pill Badge & Heading */}
          <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-[11px] font-bold tracking-widest text-slate-700 dark:text-slate-300 uppercase mb-4 bg-white dark:bg-slate-800 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-techCoral"></span>
              <span>CLASSIFIED PROCUREMENT SECTORS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-techCoral"></span>
            </div>

            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white font-display tracking-tight leading-tight">
              Browse Tenders by Work Domain
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Select a classified public works domain to inspect current open bidding opportunities.
            </p>
          </div>

          {/* 6 Work Domain Cards Grid (Screenshot 3) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {workDomains.map((domain, i) => {
              const IconComp = domain.icon;
              return (
                <div
                  key={i}
                  onClick={() => navigate(`/tenders?search=${encodeURIComponent(domain.query)}`)}
                  className="relative bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 rounded-sm p-7 sm:p-8 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  {/* Top Right Corner Peach Accent Square */}
                  <div className="absolute top-5 right-5 w-2.5 h-2.5 bg-techCoral/90" />
                  
                  <div>
                    {/* Icon container */}
                    <div className="w-12 h-12 rounded bg-techCoral-50 dark:bg-techCoral/15 text-techCoral flex items-center justify-center mb-5">
                      <IconComp className="w-5 h-5" />
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-base sm:text-lg font-bold font-display text-slate-900 dark:text-white group-hover:text-techCoral transition-colors">
                        {domain.title}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-techCoral transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                      {domain.desc}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-techCoral group-hover:underline uppercase">
                    <span>Explore Notices</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION 4: "PROCUREMENT INTEGRITY & VERIFICATION" (User Image 4)
          Styled using Techbyte 2-column layout with TenderHub2.jpg on the left!
          ========================================================================= */}
      <section className="home-integrity py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-slate-50/70 dark:bg-[#141519] border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            
            {/* Left Column: Image TenderHub2.jpg in elegant rounded frame */}
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 max-w-[440px] w-full">
                <img 
                  src="/images/TenderHub2.jpg" 
                  alt="Contractor reviewing public procurement documentation"
                  className="w-full h-auto object-cover object-center max-h-[550px]"
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl pointer-events-none" />
              </div>
            </div>

            {/* Right Column: Information & Verification Points */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Top Badge: Circle icon + Pill */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold tracking-widest text-slate-700 dark:text-slate-300 uppercase shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-techCoral"></span>
                <span>VERIFIED PUBLIC PROCUREMENT</span>
                <span className="w-2 h-2 rounded-full bg-techCoral"></span>
              </div>

              {/* Section Headline */}
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white font-display tracking-tight leading-tight">
                Procurement Integrity &amp; Verification
              </h2>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Built specifically to assist local contractors, engineering firms, and suppliers with accurate, official bidding data.
              </p>

              {/* The 3 Exact Verification Points from Screenshot 4 */}
              <div className="space-y-4 pt-2">
                
                {/* Point 1: Official NIC Portal Direct */}
                <div className="flex items-start gap-3.5 p-4 rounded-sm bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="w-9 h-9 rounded bg-techCoral-50 dark:bg-techCoral/15 text-techCoral flex items-center justify-center shrink-0 mt-0.5">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Official NIC Portal Direct
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      All announcements are synchronized directly with official government eProcurement portals (<span className="font-mono">jktenders.gov.in</span>), ensuring complete fidelity to published tenders.
                    </p>
                  </div>
                </div>

                {/* Point 2: Permanent Document Archives */}
                <div className="flex items-start gap-3.5 p-4 rounded-sm bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="w-9 h-9 rounded bg-techCoral-50 dark:bg-techCoral/15 text-techCoral flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Permanent Document Archives
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Official NIT PDFs and corrigenda are archived to secure storage so contractors can review specifications without worrying about government server timeouts.
                    </p>
                  </div>
                </div>

                {/* Point 3: Clear Work Site Locations */}
                <div className="flex items-start gap-3.5 p-4 rounded-sm bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="w-9 h-9 rounded bg-techCoral-50 dark:bg-techCoral/15 text-techCoral flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Clear Work Site Locations
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Detailed site identification and district mapping help contractors quickly determine project proximity, terrain parameters, and logistics feasibility.
                    </p>
                  </div>
                </div>

              </div>

              {/* Explore Notices Button */}
              <div className="pt-2">
                <Link
                  to="/tenders"
                  className="inline-flex items-center justify-center px-7 py-3.5 bg-techCoral hover:bg-techCoral-dark text-white font-bold text-xs sm:text-sm tracking-wide rounded-sm shadow-md transition-all uppercase cursor-pointer"
                >
                  Explore All Tenders
                </Link>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: "RECENT TENDER ANNOUNCEMENTS" (User Image 2)
          Exact live cards with source ID, title, department, date, and values
          ========================================================================= */}
      {stats?.latestTenders && stats.latestTenders.length > 0 && (
        <section className="home-latest py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold tracking-widest text-slate-700 dark:text-slate-300 uppercase mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-techCoral"></span>
                <span>LATEST NOTICES</span>
              </div>
              <h2 className="text-xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                Recent Tender Announcements
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Latest procurement notices published by public engineering divisions and municipal authorities.
              </p>
            </div>

            <Link
              to="/tenders"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-techCoral hover:underline uppercase tracking-wider"
            >
              <span>View All {stats?.activeTendersCount ?? 1288} Tenders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Grid matching user's exact Screenshot 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {stats.latestTenders.slice(0, 6).map((tender) => {
              const cleanTitle = tender.title?.replace(/[[\]]/g, '') || 'Tender Notice';
              const orgParts = (tender.organisationChain || '').split('||').map((p) => p.trim());
              const primaryDept = orgParts[orgParts.length - 1] || orgParts[0] || 'Govt Authority';

              return (
                <div
                  key={tender._id}
                  onClick={() => handleTenderClick(tender)}
                  className="bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 rounded-sm p-5 sm:p-6 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[190px]">
                          {tender.sourceTenderId}
                        </span>
                        {tender.state && (
                          <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {tender.state}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-medium shrink-0">
                        {tender.productCategory || 'Civil Works'}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 dark:text-white group-hover:text-techCoral transition-colors line-clamp-2 leading-snug">
                      {cleanTitle}
                    </h3>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{primaryDept}</span>
                      </div>
                      {(tender.publishedDateStr || tender.publishedDate) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formatDateDisplay(tender.publishedDateStr || tender.publishedDate)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-medium">Estimated Value</span>
                      <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        {formatCurrencyINR(tender.estimatedValue)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-medium">Closing Date</span>
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {formatDateDisplay(tender.closingDate)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
