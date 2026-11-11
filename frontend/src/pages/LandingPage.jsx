/**
 * @file src/pages/LandingPage.jsx
 * @description SEO landing pages for searches like "J&K tenders",
 * "Jal Shakti Department tenders Jammu & Kashmir" or "GeM bids Punjab":
 *
 *   /tenders/in/:state           open tenders in a state, with department links
 *   /tenders/in/:state/:dept     open tenders from one department in a state
 *   /gem-tenders/in/:state       open GeM bids delivered to a state
 *
 * Data, title and description come from GET /seo/landing/... so the page and
 * the crawler HTML (backend prerender) always say the same thing.
 */
import { useEffect } from 'react';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Landmark, ArrowRight, AlertCircle } from 'lucide-react';

import { api } from '@/services/api';
import { useSeo } from '@/hooks/useSeo';
import { TenderCard } from '@/components/shared/TenderCard';
import { LANDING_STATES } from '@/utils/landingStates';


const fetchLanding = async (kind, state, dept) => {
  const path = `/seo/landing/${kind}/${encodeURIComponent(state)}${dept ? `/${encodeURIComponent(dept)}` : ''}`;
  const res = await api.get(path, { timeout: 60000 });
  return res.data;
};

export default function LandingPage({ kind = 'tenders' }) {
  const { state, dept } = useParams();
  const gem = kind === 'gem';
  const sectionPath = gem ? '/gem-tenders' : '/tenders';
  const sectionName = gem ? 'GeM Bids' : 'Tenders';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['landing', kind, state, dept || ''],
    queryFn: () => fetchLanding(kind, state, dept),
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => err?.response?.status !== 404 && count < 2,
  });

  // Earlier or alternative department URLs (e.g. /haudd) swap in place for the readable one.
  const routerLocation = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (data?.path && routerLocation.pathname.toLowerCase() !== data.path) {
      navigate(`${data.path}${routerLocation.search}`, { replace: true });
    }
  }, [data?.path, routerLocation.pathname, routerLocation.search, navigate]);

  const is404 = isError && error?.response?.status === 404;
  useSeo(data ? {
    title: data.seo.title,
    description: data.seo.description,
    path: data.path,
  } : {
    title: is404 ? 'Page Not Found' : `${sectionName}`,
    path: `${sectionPath}/in/${state}${dept ? `/${dept}` : ''}`,
    noindex: is404,
  });

  const searchHref = data
    ? `${sectionPath}?state=${encodeURIComponent(data.state.name)}${data.department ? `&organization=${encodeURIComponent(data.department.name)}` : ''}`
    : sectionPath;

  return (
    <div className="gem-page flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-6 sm:py-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
          <Link to="/" className="hover:text-dalBlue dark:hover:text-blue-300">Home</Link>
          <span aria-hidden="true">›</span>
          <Link to={sectionPath} className="hover:text-dalBlue dark:hover:text-blue-300">{sectionName}</Link>
          {data && (
            <>
              <span aria-hidden="true">›</span>
              {data.department
                ? <Link to={`${sectionPath}/in/${data.state.slug}`} className="hover:text-dalBlue dark:hover:text-blue-300">{data.state.name}</Link>
                : <span className="text-slate-700 dark:text-slate-200">{data.state.name}</span>}
              {data.department && (
                <>
                  <span aria-hidden="true">›</span>
                  <span className="text-slate-700 dark:text-slate-200">{data.department.name}</span>
                </>
              )}
            </>
          )}
        </nav>

        {isLoading && (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-3 border-dalBlue border-t-transparent animate-spin" />
          </div>
        )}

        {isError && (
          <div className="bg-white dark:bg-slate-900 rounded-lg p-8 border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-chinarRed mx-auto" />
            <h1 className="text-lg font-display font-bold text-slate-900 dark:text-white">
              {is404 ? 'This page does not exist' : 'Could not load tenders'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {is404 ? 'There are no open tenders for this state or department right now.' : 'Please try again in a moment.'}
            </p>
            <Link to={sectionPath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-dalBlue dark:text-blue-300 hover:underline">
              Browse all {sectionName.toLowerCase()} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 rounded-lg p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-1.5 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
                  <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
                  <span>{gem ? 'Government e-Marketplace' : 'State e-Procurement'} • {data.state.name}</span>
                </div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                  {data.seo.heading}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {gem
                    ? `${data.total.toLocaleString('en-IN')} GeM bids are open for delivery in ${data.state.name}, listed by closing date.`
                    : data.department
                      ? `${data.total.toLocaleString('en-IN')} tenders from ${data.department.name} in ${data.state.name} are open for bidding, listed by closing date.`
                      : `${data.total.toLocaleString('en-IN')} government tenders are open in ${data.state.name}, listed by closing date. Pick a department below to narrow down.`}
                </p>
              </div>
              <div className="shrink-0">
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-200 dark:border-slate-700/80 text-center min-w-[100px]">
                  <span className="text-lg sm:text-xl font-mono font-bold text-slate-900 dark:text-white block">
                    {data.total.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                    Open now
                  </span>
                </div>
              </div>
            </div>

            {/* Department links (state pages) or sibling departments (department pages) */}
            {data.departments?.length > 0 && (
              <section className="bg-white dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                  {data.department ? `Other departments in ${data.state.name}` : `Tenders by department in ${data.state.name}`}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {data.departments.map((d) => (
                    <li key={d.slug}>
                      <Link
                        to={`/tenders/in/${data.state.slug}/${d.slug}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-dalBlue hover:text-dalBlue dark:hover:text-blue-300 transition-colors"
                      >
                        {d.name}
                        <span className="text-slate-400 tabular-nums">{d.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* GeM categories */}
            {gem && data.categories?.length > 0 && (
              <section className="bg-white dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Popular categories in {data.state.name}</h2>
                <ul className="flex flex-wrap gap-2">
                  {data.categories.map((c) => (
                    <li key={c.name}>
                      <Link
                        to={`/gem-tenders?search=${encodeURIComponent(c.name)}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-dalBlue hover:text-dalBlue dark:hover:text-blue-300 transition-colors"
                      >
                        {c.name}
                        <span className="text-slate-400 tabular-nums">{c.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Tender list */}
            <section aria-labelledby="landing-list-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 id="landing-list-heading" className="text-sm font-semibold text-slate-900 dark:text-white">
                  {data.tenders.length < data.total ? `Closing soonest (${data.tenders.length} of ${data.total.toLocaleString('en-IN')})` : `All open ${gem ? 'bids' : 'tenders'}`}
                </h2>
                <Link to={searchHref} className="inline-flex items-center gap-1 text-xs font-semibold text-dalBlue dark:text-blue-300 hover:underline">
                  Filter and search all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {data.tenders.length > 0 ? (
                // gem-results-column gives the cards the same layout as the /tenders list
                <div className="gem-results-column">
                  <div className="gem-bid-list">
                    {data.tenders.map((t) => <TenderCard key={t._id} tender={t} />)}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No open {gem ? 'bids' : 'tenders'} right now. New ones are added daily.</p>
              )}
            </section>

            {/* Other states */}
            <section className="bg-white dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{sectionName} in other states</h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {LANDING_STATES.filter((s) => s.slug !== data.state.slug).map((s) => (
                  <li key={s.slug}>
                    <Link to={`${sectionPath}/in/${s.slug}`} className="text-dalBlue dark:text-blue-300 hover:underline">{s.name}</Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
