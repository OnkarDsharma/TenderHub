/**
 * @file src/components/shared/TenderCard.jsx
 * @description Modern tender notice card modeled after GeM tender bids layout,
 * featuring View bid, AI analysis, and Download PDF options at one place.
 */
import { useNavigate } from 'react-router-dom';
import { 
  Building2, 
  MapPin, 
  ExternalLink, 
  Clock, 
  Heart, 
  Sparkles, 
  Download 
} from 'lucide-react';

import { formatCurrencyINR, formatDateDisplay, extractFamousLocation } from '@/utils/formatters';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useAuthStore } from '@/store/useAuthStore';
import { gemApi } from '@/services/gemApi';

const cleanDisplayText = (value, fallback = '—') =>
  String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() || fallback;

export function TenderCard({ tender, onViewDetails, isBlurred = false }) {
  const { toggleBookmark, isBookmarked } = useBookmarkStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();
  
  const tenderId = tender._id || tender.sourceTenderId;
  const bookmarked = isBookmarked(tenderId);

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails(tender);
      return;
    }
    navigate(`/tenders/${tenderId}`);
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
  const famousLoc = extractFamousLocation(tender);
  const locationText = cleanDisplayText(famousLoc || tender.location, 'Location not specified');

  // Calculate days remaining to bid submission deadline
  const calculateDaysLeft = (closingDateStr) => {
    if (!closingDateStr) return null;
    const diff = new Date(closingDateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const daysLeft = calculateDaysLeft(tender.bidSubmissionEndDate?.$date || tender.closingDateStr || tender.closingDate);
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

  const isGeM = tender.sourcePortal === 'GEM' || tender.departmentCode === 'GEM' || String(tender.sourceTenderId || '').startsWith('GEM/');
  const rawDocUrl = tender.pdfUrls?.[0] || tender.nitDocuments?.[0]?.fileUrl || tender.detailsUrl;
  const docUrl = isGeM
    ? gemApi.getPdfDownloadUrl(tender.sourceTenderId || tenderId, rawDocUrl)
    : rawDocUrl;

  const handlePdfClick = (e) => {
    e.stopPropagation();
    if (!docUrl) {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <article
      className={`gem-bid-row bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors group ${
        isBlurred ? 'filter blur-[4px] select-none pointer-events-none opacity-45' : ''
      }`}
    >
      <div className="gem-bid-content">
        {/* Top Badges & Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {tender.state && (
              <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-dalBlue dark:text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                <span>{tender.state}</span>
              </div>
            )}
            {tender.productCategory && (
              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium truncate max-w-[170px]">
                {tender.productCategory}
              </span>
            )}
            {tender.isMultiTender && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                Multi-Work NIT
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isUrgent && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[10px] font-bold">
                <Clock className="w-3 h-3" />
                <span>Closing Soon</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleBookmark(tender);
              }}
              className={`p-1.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                bookmarked
                  ? 'bg-red-50 border-red-200 text-chinarRed dark:bg-red-950/40 dark:border-red-800 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-chinarRed hover:border-red-200 hover:bg-red-50/50 dark:hover:bg-red-950/20 bg-white dark:bg-slate-800'
              }`}
              title={bookmarked ? 'Remove from Saved' : 'Save this Tender'}
              aria-label="Bookmark Tender"
            >
              <Heart className={`w-3.5 h-3.5 transition-transform active:scale-125 ${bookmarked ? 'fill-current text-chinarRed' : ''}`} />
            </button>
          </div>
        </div>

        {/* Bid / NIT Number */}
        <div>
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-tight block">
            Bid Number
          </span>
          <a
            href={docUrl || `/tenders/${tenderId}`}
            target={docUrl ? "_blank" : undefined}
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!docUrl) {
                e.preventDefault();
                handleCardClick();
              }
            }}
            className="text-sm font-mono font-black text-dalBlue dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            title="Click to view tender"
          >
            <span>{tender.sourceTenderId || tender.tenderReferenceNumber || 'NIT-ACTIVE'}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>

        {/* Title / Item Category */}
        <h2
          onClick={handleCardClick}
          className="text-sm font-semibold text-slate-900 dark:text-white leading-snug group-hover:text-dalBlue dark:group-hover:text-blue-300 transition-colors break-words cursor-pointer"
        >
          {cleanTitle}
        </h2>

        {/* Ministry / Organisation & Location */}
        <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="break-words" title={fullOrganisation}>{cleanDepartment}</span>
          </div>
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-techCoral shrink-0 mt-0.5" />
            <span className="font-semibold text-slate-700 dark:text-slate-200 break-words">
              {locationText}
            </span>
          </div>
        </div>

        {/* Financials & Dates */}
        <div className="gem-bid-financials grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
          <div className="p-2">
            <span className="text-slate-400 block font-medium">
              {tender.estimatedValue ? 'Estimated Value' : 'EMD Amount'}
            </span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
              {tender.estimatedValue 
                ? formatCurrencyINR(tender.estimatedValue) 
                : (tender.emdAmount > 0 ? formatCurrencyINR(tender.emdAmount) : 'Exempted / Zero')}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/25">
            <span className="text-blue-700 dark:text-blue-300 block font-semibold">Published</span>
            <span className="font-mono font-bold text-blue-900 dark:text-blue-100">
              {formatDateDisplay(tender.publishedDateStr || tender.publishedDate || tender.publishedDateOnly)}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 ring-1 ring-inset ring-rose-100 dark:ring-rose-900/50">
            <span className="text-rose-600 dark:text-rose-300 block font-semibold">Bid Closing</span>
            <span className="font-mono font-bold text-rose-700 dark:text-rose-200">
              {formatDateDisplay(tender.closingDateStr || tender.bidSubmissionEndDateStr || tender.closingDate)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions Bar: View bid, AI analysis, Download PDF all at one place */}
      <div className="gem-bid-actions flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCardClick}
          className="py-2 px-3 bg-dalBlue hover:bg-dalBlue/90 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center"
        >
          View bid
        </button>
        <button
          type="button"
          onClick={handleAiAnalysis}
          className="inline-flex items-center gap-1 py-1.5 px-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          title="Analyze with AI Estimator"
        >
          <Sparkles className="w-3 h-3 text-dalBlue dark:text-blue-400" />
          <span>AI analysis</span>
        </button>
        <a
          href={docUrl || `/tenders/${tenderId}`}
          target={isGeM ? undefined : (docUrl ? "_blank" : undefined)}
          download={isGeM ? true : undefined}
          rel="noopener noreferrer"
          onClick={handlePdfClick}
          className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          title="Download Tender PDF"
        >
          <Download className="w-3 h-3" />
          <span>PDF</span>
        </a>
      </div>
    </article>
  );
}
