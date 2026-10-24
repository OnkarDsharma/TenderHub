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
    if (!tender) return;
    const tenderId = tender._id || tender.id || '';
    if (!isAuthenticated) {
      setAuthModalConfig({
        title: 'Sign In to View Full Tender Details',
        subtitle: `Notice ${tender.sourceTenderId || ''}: ${tender.title?.slice(0, 80) || ''}...`,
        redirectUrl: `/tenders/${tenderId}`
      });
      setAuthModalOpen(true);
      return;
    }
    navigate(`/tenders/${tenderId}`);
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

  // Construct dynamic department cards from real live database metrics safely
  const departmentCards = Array.isArray(stats?.departmentBreakdown)
    ? stats.departmentBreakdown
        .filter((dept) => dept && typeof dept === 'object')
        .map((dept) => {
          const rawName = String(dept.shortName || dept.fullName || dept.rootOrg || 'Department');
          const cleanTitle = rawName.replace(/^(District\s+|Department\s+of\s+)/i, '');
          const root = String(dept.rootOrg || dept.fullName || '');

          let subtitle = root || 'Govt Department';
          if (root.includes('AGRICULTURE')) subtitle = 'Department of Agricult...';
          else if (root.includes('DC-PDD') || root.includes('PDD')) subtitle = 'Power Dept (PDD)';
          else if (root.includes('PWD') || root.includes('R&B')) subtitle = 'PWD';
          else if (root.includes('HAUDD') || root.includes('MUNICIPAL')) subtitle = 'HAUDD';
          else if (root.includes('IRRIGATION') || root.includes('IFCD')) subtitle = 'I and FC';
          else if (root.includes('HEALTH') || root.includes('MEDICAL')) subtitle = 'Health and Medical Educ...';

          return {
            title: cleanTitle,
            subtitle,
            count: `${dept.count || 0} Active Notices`,
            value: formatCurrencyINR(dept.totalValue),
            type: 'department',
            query: { organisation: dept.rootOrg, department: dept.shortName }
          };
        })
    : [];

  // Construct dynamic domain/category cards from real live database metrics safely
  const domainCards = Array.isArray(stats?.domainBreakdown)
    ? stats.domainBreakdown
        .filter((domain) => domain && typeof domain === 'object')
        .map((domain) => ({
          title: String(domain.name || 'Work Domain'),
          subtitle: 'Classified Work Sector',
          count: `${domain.count || 0} Active Notices`,
          value: formatCurrencyINR(domain.totalValue),
          type: 'category',
          query: { category: domain.name }
        }))
    : [];

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
      <AuthPromptModal 
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        title={authModalConfig.title}
        subtitle={authModalConfig.subtitle}
        redirectUrl={authModalConfig.redirectUrl}
      />

      {/* =========================================================================
          SECTION 1: PRODUCT-STYLE HERO WITH LIVE PROCUREMENT SNAPSHOT
          ========================================================================= */}
      <section className="home-hero relative overflow-hidden select-none">
        <div
          aria-hidden="true"
          className="home-hero-art absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "url('/images/TenderHUB1.jpg')" }}
        />
        <div className="home-hero-main max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="relative z-10 max-w-2xl">
            
            {/* Official Procurement Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold tracking-wide mb-5 shadow-sm">
              <Landmark className="w-3.5 h-3.5 text-techCoral shrink-0" />
              <span>Northern States Public Works &amp; Procurement</span>
            </div>

            {/* Primary Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-[1.04] font-display">
              Government tenders across J&amp;K, Punjab &amp; Himachal
            </h1>

            {/* Subtitle */}
            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-slate-600 font-normal leading-relaxed max-w-xl">
              Active civil, road, water and electrical contracts — synced daily from official portals.
            </p>

            {/* Search Console & CTA */}
            <div className="mt-7 sm:mt-8 space-y-4">
              <form 
                onSubmit={handleSearch}
                className="flex flex-col sm:flex-row items-stretch sm:items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-lg shadow-slate-900/5 focus-within:border-techCoral transition-colors max-w-2xl gap-2"
              >
                <div className="flex items-center flex-1 px-3 py-1.5 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by tender, department or district…"
                    className="w-full text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none truncate"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-techCoral hover:bg-techCoral-dark text-white font-bold text-xs sm:text-sm rounded-lg transition-colors shrink-0 shadow-sm cursor-pointer"
                >
                  Search Tenders
                </button>
              </form>

              {/* Popular Quick Filter Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Popular:</span>
                {quickLocations.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickClick(item.query)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white hover:bg-techCoral hover:text-white text-slate-700 transition-colors cursor-pointer border border-slate-200"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* AI Estimator Link */}
              <div className="flex items-center gap-4 text-xs pt-1">
                <Link 
                  to="/services" 
                  className="inline-flex items-center gap-1.5 font-bold text-techCoral hover:text-techCoral-dark transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Need AI BOQ analysis?</span>
                </Link>
              </div>

            </div>
          </div>

          <div className="home-hero-preview relative mx-auto w-full max-w-[540px]">
            <div className="home-preview-document rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl shadow-slate-900/10">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] uppercase tracking-[.16em] text-slate-500">tndrr intelligence</span>
                  <h2 className="mt-1 text-base font-bold text-slate-900">Regional opportunity brief</h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Updated daily</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-100 py-4 text-center">
                <div className="px-2"><span className="block text-2xl font-bold text-slate-900">{isStatsLoading ? '—' : (stats?.activeTendersCount ?? 29)}</span><span className="text-[10px] uppercase tracking-wide text-slate-500">Active notices</span></div>
                <div className="px-2"><span className="block text-2xl font-bold text-slate-900">{isStatsLoading ? '—' : (stats?.authoritiesCount ?? 13)}</span><span className="text-[10px] uppercase tracking-wide text-slate-500">Authorities</span></div>
                <div className="px-2"><span className="block text-lg sm:text-xl font-bold text-techCoral">{isStatsLoading ? '—' : formatCurrencyINR(stats?.totalValue ?? 30146323)}</span><span className="text-[10px] uppercase tracking-wide text-slate-500">Estimated value</span></div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Active authorities</span><span>Live pipeline</span></div>
                <div className="space-y-3">
                  {activeSectorCards.slice(0, 3).map((item, index) => (
                    <div key={`${item.title}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,.9fr)_auto] items-center gap-3 text-xs">
                      <span className="truncate font-medium text-slate-700" title={item.title}>{item.title}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-techCoral" style={{ width: `${100 - index * 22}%` }} /></span>
                      <span className="font-mono text-slate-500">{item.count.replace(' Active Notices', '')}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link to="/tenders" className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-techCoral hover:text-techCoral-dark">
                <span>Explore the live pipeline</span><ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="home-preview-float absolute -bottom-5 -left-5 hidden sm:flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-techCoral/10 text-techCoral"><ShieldCheck className="h-4 w-4" /></span>
              <span><strong className="block text-xs text-slate-800">Official sources</strong><small className="text-[10px] text-slate-500">Portals + GeM, synced daily</small></span>
            </div>
          </div>
        </div>

        {/* Bottom Hero Stats Bar */}
        <div className="home-statbar relative z-10 bg-white dark:bg-[#18191E] border-t border-slate-200 dark:border-slate-800 w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            
            {/* Real Procurement Counters */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-10">
              {/* Stat 1: Active Notices */}
              <div className="flex items-center gap-3">
                <span className="text-2xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                  + {isStatsLoading ? '—' : (stats?.activeTendersCount ?? 29)}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[120px] leading-tight">
                Active Notices
                </span>
              </div>

              {/* Stat 2: Total Estimated Value (with circular outline badge) */}
              <div className="flex items-center gap-3">
                <div className="px-3.5 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 text-base sm:text-xl font-black font-mono text-techCoral">
                  {isStatsLoading ? '—' : formatCurrencyINR(stats?.totalValue ?? 30146323)}
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[110px] leading-tight">
                Estimated Value
                </span>
              </div>

              {/* Stat 3: Authorities Count */}
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                  {isStatsLoading ? '—' : (stats?.authoritiesCount ?? 13)}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[100px] leading-tight">
                Authorities
                </span>
              </div>

              {/* Stat 4: Districts Covered */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-black font-display text-slate-900 dark:text-white">
                  50+
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[90px] leading-tight">
                  Districts
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
                Live opportunities by authority
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Active notices, estimated values and issuing departments.
              </p>
            </div>

            <Link
              to="/tenders"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-techCoral hover:underline uppercase tracking-wider shrink-0"
            >
                <span>Explore more</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 8 Department Cards (Screenshot 1) */}
          <div className="home-pipeline-marquee" aria-label="Live opportunities by authority">
            <div className="home-pipeline-track">
              {[0, 1].map((copy) => (
                <div className="home-pipeline-group" key={copy} aria-hidden={copy === 1}>
                  {activeSectorCards.map((item, idx) => (
                    <button
                      key={`${copy}-${idx}`}
                      type="button"
                      tabIndex={copy === 1 ? -1 : 0}
                      onClick={() => {
                        const params = new URLSearchParams();
                        if (item.query?.category) params.set('category', item.query.category);
                        if (item.query?.organisation) params.set('organisation', item.query.organisation);
                        if (item.query?.department) params.set('department', item.query.department);
                        navigate(`/tenders?${params.toString()}`);
                      }}
                      className="home-pipeline-card relative bg-white dark:bg-[#1A1B22] border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between text-left"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate">
                            {item.count}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 text-right leading-snug" title={item.subtitle}>
                            {item.subtitle}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white group-hover:text-techCoral transition-colors leading-snug">
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
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION 3: "BROWSE TENDERS BY WORK DOMAIN" (User Image 3)
          Styled in the Techbyte "WHAT WE DO" aesthetic with peach corner indicators
          ========================================================================= */}
      <section className="home-domains relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#121316] border-b border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          
          {/* Centered Pill Badge & Heading */}
          <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-[11px] font-bold tracking-widest text-slate-700 dark:text-slate-300 uppercase mb-4 bg-white dark:bg-slate-800 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-techCoral"></span>
              <span>CLASSIFIED SECTORS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-techCoral"></span>
            </div>

            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white font-display tracking-tight leading-tight">
              Browse by work domain
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Explore active opportunities across six public works domains.
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
                Official data. Permanent archives. Clear locations.
              </h2>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm lg:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Synced directly from state eProcurement portals and GeM, for contractors, engineering firms and suppliers who need accurate official bidding data.
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
                      Live sync with <span className="font-mono">jktenders.gov.in</span>, <span className="font-mono">eproc.punjab.gov.in</span>, <span className="font-mono">hptenders.gov.in</span> and GeM keeps notices aligned with official publications.
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
                      NIT PDFs and corrigenda are securely archived, even when government links time out.
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
                      District-level mapping helps assess proximity, terrain and logistics.
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
            {(stats?.latestTenders || []).slice(0, 6).filter(Boolean).map((tender, index) => {
              const cleanTitle = tender?.title?.replace(/[[\]]/g, '') || 'Tender Notice';
              const orgParts = String(tender?.organisationChain || '').split('||').map((p) => p.trim());
              const primaryDept = orgParts[orgParts.length - 1] || orgParts[0] || 'Govt Authority';
              const tenderKey = tender?._id || `tender-${index}`;

              return (
                <div
                  key={tenderKey}
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
