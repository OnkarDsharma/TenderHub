/**
 * @file src/components/tenders/SimilarTenders.jsx
 * @description "Similar open tenders" on detail pages: up to six open tenders
 * from the same department (or state / GeM category). Helps visitors on a
 * closed tender find one they can still bid on, and gives search engines
 * crawlable links between related tenders. Same data as the crawler HTML
 * (GET /seo/similar/:id).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Clock } from 'lucide-react';

import { api } from '@/services/api';
import { tenderPath } from '@/utils/tenderUrl';
import { formatCurrencyINR, formatDateDisplay } from '@/utils/formatters';

const cleanTitle = (t) => String(t || '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();

export function SimilarTenders({ tender, isClosed = false }) {
  const id = tender?._id;
  const { data } = useQuery({
    queryKey: ['similar-tenders', id],
    queryFn: async () => (await api.get(`/seo/similar/${id}`, { timeout: 30000 })).data.data,
    enabled: Boolean(id),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (!data?.length) return null;

  return (
    <section aria-labelledby="similar-tenders-heading" className="bg-white dark:bg-slate-900 rounded-lg p-5 sm:p-6 border border-slate-200 dark:border-slate-800">
      <h2 id="similar-tenders-heading" className="text-base font-display font-bold text-slate-900 dark:text-white">
        {isClosed ? 'Open tenders you can still bid on' : 'Similar open tenders'}
      </h2>
      <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.map((t) => {
          const closes = t.bidSubmissionEndDate || t.closingDate;
          const dept = t.departmentName || String(t.organisationChain || '').split('||')[0];
          return (
            <li key={t._id}>
              <Link
                to={tenderPath(t)}
                className="group block h-full p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-dalBlue dark:hover:border-blue-400 transition-colors"
              >
                <span className="block text-sm font-semibold leading-snug text-slate-900 dark:text-white line-clamp-2 group-hover:text-dalBlue dark:group-hover:text-blue-300">
                  {cleanTitle(t.title) || t.sourceTenderId}
                </span>
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {dept && <span className="inline-flex items-center gap-1 min-w-0"><Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{dept}</span></span>}
                  {t.location && <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{t.location}</span></span>}
                  {closes && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />Closes {formatDateDisplay(closes)}</span>}
                  {t.estimatedValue > 0 && <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrencyINR(t.estimatedValue)}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
