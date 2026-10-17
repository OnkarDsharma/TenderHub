/**
 * @file src/components/shared/TenderCard.jsx
 * @description Clean, human-crafted tender notice card with high legibility,
 * clear submission timeline, financial metrics, and district location tag.
 */
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Heart, ArrowRight, FileSpreadsheet, Building2, Calendar, FileText, Layers } from 'lucide-react';

import { formatCurrencyINR, formatDateDisplay, formatDateTimeDisplay, extractFamousLocation } from '@/utils/formatters';
import { useBookmarkStore } from '@/store/useBookmarkStore';

import { useAuthStore } from '@/store/useAuthStore';

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
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/tenders/${tenderId}`)}`);
      return;
    }
    navigate(`/tenders/${tenderId}`);
  };
  
  // Extract department hierarchy
  const orgParts = (tender.organisationChain || '').split('||').map((p) => p.trim());
  const issuingDept = orgParts[0] || tender.department || 'Government Authority';
  const subDept = orgParts.length > 1 ? orgParts[orgParts.length - 1] : '';

  // Calculate days remaining to bid submission deadline
  const calculateDaysLeft = (closingDateStr) => {
    if (!closingDateStr) return null;
    const diff = new Date(closingDateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const daysLeft = calculateDaysLeft(tender.bidSubmissionEndDate?.$date || tender.closingDate);

  const isCritical = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
  const isWarning = daysLeft !== null && daysLeft > 3 && daysLeft <= 7;
  const bidOpeningTime = tender.bidOpeningDate ? new Date(tender.bidOpeningDate).getTime() : 0;
  const isAwaitingOpening = daysLeft !== null && daysLeft < 0 && bidOpeningTime >= new Date().getTime();

  return (
    <article className={`group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-xs transition-all duration-150 flex flex-col justify-between ${
      isBlurred 
        ? 'filter blur-[4px] select-none pointer-events-none opacity-45' 
        : 'hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm focus-within:border-dalBlue dark:focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-dalBlue dark:focus-within:ring-blue-400'
    }`}>
      
      {/* Header Row: Tender ID, Authority & Save Heart */}
      <div>
        <div className="flex items-start justify-between gap-2.5 mb-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="font-mono text-[11px] sm:text-xs font-semibold text-dalBlue dark:text-blue-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 shrink-0">
              {tender.sourceTenderId || tender.tenderReferenceNumber || 'NIT-ACTIVE'}
            </span>

            {tender.isMultiTender && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 shrink-0" title="Part of a Multi-Work Notice">
                <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Multi-Work NIT</span>
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-[280px]" title={issuingDept}>
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{issuingDept}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => toggleBookmark(tender)}
            className={`p-1.5 rounded-lg border transition-colors shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue ${
              bookmarked
                ? 'bg-red-50 border-red-200 text-chinarRed dark:bg-red-950/40 dark:border-red-800 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-chinarRed hover:border-red-200 hover:bg-red-50/50 dark:hover:bg-red-950/20 bg-white dark:bg-slate-800'
            }`}
            title={bookmarked ? 'Remove from Saved' : 'Save this Tender'}
            aria-label="Bookmark Tender"
          >
            <Heart className={`w-4 h-4 transition-transform active:scale-125 ${bookmarked ? 'fill-current text-chinarRed' : ''}`} />
          </button>
        </div>

        {/* Title */}
        <h3 
          onClick={handleCardClick}
          className="text-sm sm:text-base font-display font-bold text-slate-900 dark:text-white group-hover:text-dalBlue dark:group-hover:text-blue-300 transition-colors leading-snug line-clamp-2 cursor-pointer mb-1.5"
        >
          {tender.title?.replace(/[[\]]/g, '') || 'Tender Notice'}
        </h3>

        {/* Sub-header: Division & Published Time */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-2 sm:mb-2.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
          {subDept && (
            <span className="truncate max-w-[260px] font-normal">
              Division: <span className="font-medium text-slate-700 dark:text-slate-300">{subDept}</span>
            </span>
          )}
          {subDept && (tender.publishedDateStr || tender.publishedDate) && (
            <span className="text-slate-300 dark:text-slate-600 hidden xs:inline">•</span>
          )}
          {(tender.publishedDateStr || tender.publishedDate) && (
            <span className="inline-flex items-center gap-1 font-normal text-slate-600 dark:text-slate-300 shrink-0">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Published:</span>
              <strong className="font-semibold text-slate-700 dark:text-slate-200 font-mono">
                {formatDateTimeDisplay(tender.publishedDateStr || tender.publishedDate)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Middle Financials & Timeline Strip (4 Balanced Columns) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 py-2.5 my-2 border-y border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/40 rounded-lg px-3">
        <div>
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider truncate">
            Estimated Value
          </span>
          <span className="font-mono text-xs sm:text-sm font-bold text-dalBlue dark:text-blue-300 truncate block mt-0.5">
            {formatCurrencyINR(tender.estimatedValue)}
          </span>
        </div>

        <div>
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider truncate">
            EMD Deposit
          </span>
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
            <span className="truncate">{formatCurrencyINR(tender.emdAmount)}</span>
            {tender.emdExemptionAllowed === 'Yes' && (
              <span className="text-[9px] font-sans text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800 shrink-0" title="Exemption Allowed">
                Exempt
              </span>
            )}
          </div>
        </div>

        <div>
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider truncate">
            Closing Date
          </span>
          <span className="font-mono text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate mt-0.5">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{formatDateDisplay(tender.closingDateStr || tender.bidSubmissionEndDateStr || tender.closingDate)}</span>
          </span>
        </div>

        <div>
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider truncate">
            Deadline Status
          </span>
          <div className="mt-0.5">
            {daysLeft !== null && daysLeft >= 0 ? (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded truncate ${
                isCritical
                  ? 'text-red-700 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
                  : isWarning
                  ? 'text-amber-800 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'
                  : 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
              }`}>
                <Clock className="w-3 h-3 shrink-0" />
                <span className="truncate">{daysLeft === 0 ? 'Closes Today' : `${daysLeft} days left`}</span>
              </span>
            ) : isAwaitingOpening ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 px-2 py-0.5 rounded truncate" title="Bid submission deadline has ended. Technical opening / evaluation in progress.">
                <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">Awaiting Opening</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate">
                Closed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Location, Category & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* State Badge */}
          {tender.state && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded text-[10px] sm:text-[11px] font-semibold border border-slate-200 dark:border-slate-700 shrink-0">
              {tender.state}
            </span>
          )}

          {/* Location */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded text-[11px] font-medium border border-slate-200 dark:border-slate-700">
            <MapPin className="w-3 h-3 text-chinarRed shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[170px]" title={extractFamousLocation(tender)}>
              {extractFamousLocation(tender)}
            </span>
          </span>

          {/* Category */}
          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded text-[11px] font-medium truncate max-w-[130px] sm:max-w-[180px]">
            {tender.productCategory || tender.tenderCategory || 'Works'}
          </span>

          {/* Multiple Notices Tag */}
          {((tender.nitDocuments?.length > 1) || (tender.pdfUrls?.length > 1)) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[10px] font-mono font-medium rounded border border-slate-200 dark:border-slate-700" title={`${tender.nitDocuments?.length || tender.pdfUrls?.length} Official Notices Available`}>
              <FileText className="w-3 h-3 shrink-0" />
              <span>{tender.nitDocuments?.length || tender.pdfUrls?.length} Notices</span>
            </span>
          )}

          {/* BOQ Document Badge */}
          {(tender.boqZipUrl || tender.boqFileUrl || tender.workItemDocuments?.length > 0 || tender.coversInfo?.some((c) => c.documentType === '.xls')) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-semibold rounded border border-emerald-200 dark:border-emerald-800" title="BOQ & Work Documents Archive">
              <FileSpreadsheet className="w-3 h-3 shrink-0" />
              <span>{tender.boqZipUrl ? 'BOQ ZIP' : (tender.workItemDocuments?.length > 1 ? `${tender.workItemDocuments.length} Work Docs` : 'BOQ')}</span>
            </span>
          )}
        </div>

        <div className="w-full sm:w-auto">
          <button
            type="button"
            onClick={handleCardClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-dalBlue hover:bg-dalBlue/90 text-white rounded-lg transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue cursor-pointer group/btn"
          >
            <span>View Notice</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
          </button>
        </div>
      </div>

    </article>
  );
}