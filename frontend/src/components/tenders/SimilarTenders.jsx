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
import { Building2, MapPin } from 'lucide-react';

import { api } from '@/services/api';
import { tenderPath } from '@/utils/tenderUrl';
import { formatCurrencyINR, formatDateDisplay } from '@/utils/formatters';
import '@/components/tenders/detail/tender-details.css';

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
    <section aria-labelledby="similar-tenders-heading" className="td-scope td-panel">
      <header className="td-panel-head">
        <div className="min-w-0">
          <h2 id="similar-tenders-heading" className="td-panel-title">
            {isClosed ? 'Open tenders you can still bid on' : 'Similar open tenders'}
          </h2>
          <p className="td-panel-desc">Open tenders from the same department, state or category</p>
        </div>
      </header>
      <ul className="td-rows">
        {data.map((t) => {
          const closes = t.bidSubmissionEndDate || t.closingDate;
          const dept = t.departmentName || String(t.organisationChain || '').split('||')[0];
          return (
            <li key={t._id}>
              <Link to={tenderPath(t)} className="td-row">
                <span className={`td-row-value ${t.estimatedValue > 0 ? '' : 'td-blank'}`}>
                  {t.estimatedValue > 0 ? formatCurrencyINR(t.estimatedValue) : '—'}
                </span>
                <span className="td-row-main">
                  <span className="td-row-title">{cleanTitle(t.title) || t.sourceTenderId}</span>
                  {(dept || t.location) && (
                    <span className="td-row-meta">
                      {dept && <span><Building2 aria-hidden="true" />{dept}</span>}
                      {t.location && <span><MapPin aria-hidden="true" />{t.location}</span>}
                    </span>
                  )}
                </span>
                {closes && <span className="td-row-date">Closes {formatDateDisplay(closes)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
