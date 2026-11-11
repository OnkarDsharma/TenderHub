/**
 * @file src/components/shared/TenderCard.jsx
 * @description Modern tender notice card modeled after GeM tender bids layout,
 * featuring View bid, AI analysis, and Download PDF options at one place.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, 
  MapPin, 
  ExternalLink, 
  Clock, 
  Heart, 
  Sparkles, 
  Download,
  Check
} from 'lucide-react';

import { formatCurrencyINR, formatDateDisplay, extractFamousLocation } from '@/utils/formatters';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useAuthStore } from '@/store/useAuthStore';
import { gemApi } from '@/services/gemApi';
import { API_BASE_URL } from '@/services/api';

const cleanDisplayText = (value, fallback = '—') =>
  String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() || fallback;

// Each state's NIC eProcurement portal. The Advanced Search page takes the
// Tender ID directly, so users can paste the copied bid number there.
const NIC_SEARCH_PATH = '/nicgep/app?page=FrontEndAdvancedSearch&service=page';
const STATE_PORTALS = {
  JK_TENDERS: `https://jktenders.gov.in${NIC_SEARCH_PATH}`,
  HP_TENDERS: `https://hptenders.gov.in${NIC_SEARCH_PATH}`,
  PB_TENDERS: `https://eproc.punjab.gov.in${NIC_SEARCH_PATH}`,
  LADAKH_TENDERS: `https://tenders.ladakh.gov.in${NIC_SEARCH_PATH}`,
  HR_TENDERS: `https://etenders.hry.nic.in${NIC_SEARCH_PATH}`,
  DL_TENDERS: `https://govtprocurement.delhi.gov.in${NIC_SEARCH_PATH}`,
  GEM: 'https://bidplus.gem.gov.in/all-bids',
};

const resolvePortalUrl = (tender, isGeM) => {
  if (isGeM) return STATE_PORTALS.GEM;
  if (STATE_PORTALS[tender.sourcePortal]) return STATE_PORTALS[tender.sourcePortal];
  const state = String(tender.state || '').toLowerCase();
  if (state.includes('ladakh')) return STATE_PORTALS.LADAKH_TENDERS;
  if (state.includes('punjab')) return STATE_PORTALS.PB_TENDERS;
  if (state.includes('himachal')) return STATE_PORTALS.HP_TENDERS;
  if (state.includes('haryana')) return STATE_PORTALS.HR_TENDERS;
  if (state.includes('delhi')) return STATE_PORTALS.DL_TENDERS;
  return STATE_PORTALS.JK_TENDERS;
};

// Synchronous copy so it completes before window.open moves focus away
// (navigator.clipboard rejects once the document loses focus).
const copyText = (text) => {
  let copied = false;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    copied = document.execCommand('copy');
    document.body.removeChild(el);
  } catch {
    // Fall through to the async Clipboard API below.
  }
  if (!copied && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    copied = true;
  }
  return copied;
};

export function TenderCard({ tender, onViewDetails, isBlurred = false, locationLabel }) {
  const { toggleBookmark, isBookmarked } = useBookmarkStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);
  
  const tenderId = tender._id || tender.sourceTenderId;
  const bookmarked = isBookmarked(tenderId);
  const isGeM = tender.sourcePortal === 'GEM' || tender.departmentCode === 'GEM' || String(tender.sourceTenderId || '').startsWith('GEM/');
  // GeM geography = delivery state(s) from GeM's consignee-state search.
  const stateLabel = isGeM
    ? (tender.consigneeStates?.length ? tender.consigneeStates.join(' · ') : null)
    : tender.state;

  // Real URL for the detail page. Rendered as <a href> so search engines can
  // follow it and users can open it in a new tab.
  const detailHref = isGeM
    ? `/gem-tenders/${tender._id || encodeURIComponent(tender.sourceTenderId || '')}`
    : `/tenders/${encodeURIComponent(tenderId || '')}`;

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails(tender);
      return;
    }
    navigate(detailHref);
  };

  // Plain left-clicks go through onViewDetails when a page supplies one; modified
  // clicks (Ctrl/Cmd/Shift/middle) keep the browser's default new-tab behaviour.
  const handleDetailLinkClick = (e) => {
    if (!onViewDetails) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onViewDetails(tender);
  };

  const handleAiAnalysis = (e) => {
    e.stopPropagation();
    navigate(`/services?tenderId=${encodeURIComponent(tender.sourceTenderId || tenderId)}`);
  };

  // Extract department hierarchy
  const orgParts = (tender.organisationChain || '').split('||').map((p) => p.trim());
  const cleanDepartment = cleanDisplayText(tender.departmentName || orgParts[0] || tender.department || 'Government Authority');
  const fullOrganisation = cleanDisplayText(tender.organisationChain, cleanDepartment);
  const cleanTitle = cleanDisplayText(tender.title?.replace(/[[\]]/g, ''), 'Untitled Tender Notice');
  const famousLoc = isGeM ? null : extractFamousLocation(tender);
  const locationText = locationLabel || (isGeM
    ? (tender.location ? `${tender.location}${tender.locationVerificationStatus === 'VERIFIED' ? '' : ' (unverified)'}` : 'Location not confirmed')
    : cleanDisplayText(famousLoc || tender.location, 'Location not specified'));

  // Calculate days remaining to bid submission deadline
  const calculateDaysLeft = (closingDateStr) => {
    if (!closingDateStr) return null;
    const diff = new Date(closingDateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const daysLeft = calculateDaysLeft(tender.bidSubmissionEndDate?.$date || tender.closingDateStr || tender.closingDate);
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

  const rawDocUrl = tender.pdfUrls?.[0] || tender.nitDocuments?.[0]?.fileUrl || tender.detailsUrl
    || (isGeM && tender.sourceTenderId
      ? `https://bidplus.gem.gov.in/showbidDocument/${tender.sourceTenderId.replace(/^GEM\/\d+\/[A-Z]\//i, '')}`
      : undefined);
  const isArchivedR2Document = !isGeM && (() => {
    try {
      return new URL(rawDocUrl).hostname.endsWith('.r2.dev');
    } catch {
      return false;
    }
  })();
  const docUrl = isGeM
    ? gemApi.getPdfDownloadUrl(tender.sourceTenderId || tenderId, rawDocUrl)
    : isArchivedR2Document && tender._id
      ? `${API_BASE_URL}/tenders/${tender._id}/documents/notice/0?download=1`
      : rawDocUrl;

  const bidNumber = tender.sourceTenderId || tender.tenderReferenceNumber || '';
  const portalUrl = resolvePortalUrl(tender, isGeM);
  const portalName = isGeM ? 'GeM' : (tender.state || 'state');

  const handleBidNumberClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bidNumber && copyText(bidNumber)) {
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2500);
    }
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePdfClick = (e) => {
    e.stopPropagation();
    if (!docUrl) {
      e.preventDefault();
      handleCardClick();
    }
  };

  const closingText = daysLeft === null
    ? null
    : daysLeft < 0 ? 'Closed' : daysLeft === 0 ? 'Closes today' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  const valueLabel = tender.estimatedValue ? 'Estimated value' : 'EMD';
  const valueText = tender.estimatedValue
    ? formatCurrencyINR(tender.estimatedValue)
    : (tender.emdAmount > 0 ? formatCurrencyINR(tender.emdAmount) : 'Exempted');

  const metaItems = [stateLabel, tender.productCategory].filter(Boolean);
  const secondaryBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-600 active:scale-[0.98] transition-[background-color,border-color,transform] duration-150 cursor-pointer';

  return (
    <article
      className={`gem-bid-row tender-card group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 ${
        isBlurred ? 'filter blur-[4px] select-none pointer-events-none opacity-45' : ''
      }`}
    >
      {/* Meta line: state, category, deadline urgency, save */}
      <div className="flex items-center justify-between gap-3 min-h-[28px]">
        <div className="flex items-center gap-2 min-w-0 text-xs text-slate-500 dark:text-slate-400">
          {metaItems.map((item, i) => (
            <span key={item} className={`flex items-center gap-2 min-w-0 ${i === 0 ? 'font-medium text-dalBlue dark:text-blue-400 shrink-0' : 'truncate'}`}>
              {i > 0 && <span aria-hidden="true" className="w-0.5 h-0.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />}
              <span className="truncate">{item}</span>
            </span>
          ))}
          {tender.isMultiTender && (
            <span className="shrink-0 px-1.5 py-px rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10">
              Multi-work NIT
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isUrgent && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
              <Clock className="w-3.5 h-3.5" />
              {closingText}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleBookmark(tender);
            }}
            className={`grid place-items-center w-8 h-8 rounded-lg transition-colors cursor-pointer active:scale-95 ${
              bookmarked
                ? 'text-chinarRed bg-red-50 dark:bg-red-950/40'
                : 'text-slate-400 hover:text-chinarRed hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={bookmarked ? 'Remove from saved' : 'Save this tender'}
            aria-label={bookmarked ? 'Remove from saved' : 'Save this tender'}
            aria-pressed={bookmarked}
          >
            <Heart className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Title */}
      <h2
        className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white line-clamp-2 break-words group-hover:text-dalBlue dark:group-hover:text-blue-300 transition-colors"
        title={cleanTitle}
      >
        <Link to={detailHref} onClick={handleDetailLinkClick} className="cursor-pointer">
          {cleanTitle}
        </Link>
      </h2>

      {/* Department and location */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 min-w-0" title={fullOrganisation}>
          <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{cleanDepartment}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 min-w-0 text-slate-700 dark:text-slate-200">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-dalBlue dark:text-blue-400" />
          <span className="truncate">{locationText}</span>
        </span>
      </div>

      {/* Facts and actions */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-end gap-4">
        <dl className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-3 flex-1 min-w-0">
          <div className="min-w-0 col-span-2 sm:col-span-1">
            <dt className="text-[11px] text-slate-400 dark:text-slate-500">Bid number</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleBidNumberClick}
                className="inline-flex items-center gap-1 min-w-0 font-mono text-[13px] font-medium text-dalBlue dark:text-blue-400 hover:underline underline-offset-2"
                title={`Copy bid number and open the ${portalName} tender portal`}
              >
                <span className="truncate">{bidNumber || 'NIT-ACTIVE'}</span>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
              </a>
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 transition-opacity ${copied ? 'opacity-100' : 'opacity-0'}`}
              >
                {copied && (<><Check className="w-3 h-3" /> Copied</>)}
              </span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-slate-400 dark:text-slate-500">{valueLabel}</dt>
            <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{valueText}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-slate-400 dark:text-slate-500">Published</dt>
            <dd className="mt-0.5 text-[13px] tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
              {formatDateDisplay(tender.publishedDateStr || tender.publishedDate || tender.publishedDateOnly)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-slate-400 dark:text-slate-500">Bid closing</dt>
            <dd className={`mt-0.5 text-[13px] tabular-nums whitespace-nowrap ${isUrgent ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-medium text-slate-900 dark:text-slate-100'}`}>
              {formatDateDisplay(tender.closingDateStr || tender.bidSubmissionEndDateStr || tender.closingDate)}
              {closingText && !isUrgent && daysLeft > 0 && (
                <span className="block text-[11px] font-normal text-slate-400 dark:text-slate-500">{closingText}</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={detailHref}
            onClick={handleDetailLinkClick}
            aria-label={`View bid: ${cleanTitle}`}
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-[13px] font-semibold text-white bg-dalBlue hover:bg-dalBlue-700 active:scale-[0.98] transition-[background-color,transform] duration-150 cursor-pointer"
          >
            View bid
          </Link>
          <button
            type="button"
            onClick={handleAiAnalysis}
            className={secondaryBtn}
            title="Analyse with AI Estimator"
          >
            <Sparkles className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
            AI analysis
          </button>
          <a
            href={docUrl || detailHref}
            target={isGeM || !isArchivedR2Document ? (docUrl ? "_blank" : undefined) : undefined}
            download={isGeM || isArchivedR2Document ? true : undefined}
            rel="noopener noreferrer"
            onClick={handlePdfClick}
            className={secondaryBtn}
            title="Download tender PDF"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </a>
        </div>
      </div>
    </article>
  );
}
