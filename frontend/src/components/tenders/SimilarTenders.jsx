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
import { Building2, MapPin, Clock, Sparkles } from 'lucide-react';

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
    <section aria-labelledby="similar-tenders-heading" className="td-scope td-card">
      <header className="td-card-head">
        <div className="td-card-heading">
          <span className="td-card-icon" aria-hidden="true"><Sparkles /></span>
          <div className="min-w-0">
          <h2 id="similar-tenders-heading" className="td-card-title">
            {isClosed ? 'Open tenders you can still bid on' : 'Similar open tenders'}
          </h2>
            <p className="td-card-desc">Open tenders from the same department, state or category</p>
          </div>
        </div>
      </header>
      <ul className="td-similar">
        {data.map((t) => {
          const closes = t.bidSubmissionEndDate || t.closingDate;
          const dept = t.departmentName || String(t.organisationChain || '').split('||')[0];
          return (
            <li key={t._id}>
              <Link to={tenderPath(t)} className="td-similar-card">
                {(t.estimatedValue > 0 || closes) && (
                  <span className="td-similar-top">
                    <span className="td-similar-value">{t.estimatedValue > 0 ? formatCurrencyINR(t.estimatedValue) : ''}</span>
                    {closes && <span className="td-similar-close"><Clock />Closes {formatDateDisplay(closes)}</span>}
                  </span>
                )}
                <span className="td-similar-title">{cleanTitle(t.title) || t.sourceTenderId}</span>
                {(dept || t.location) && (
                  <span className="td-similar-meta">
                    {dept && <span><Building2 />{dept}</span>}
                    {t.location && <span><MapPin />{t.location}</span>}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
