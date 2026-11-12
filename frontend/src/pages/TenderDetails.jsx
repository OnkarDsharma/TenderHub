/**
 * @file src/pages/TenderDetails.jsx
 * @description Comprehensive view of a single tender, directly mirroring the J&K eProcurement 
 * portal data structure with clean typography, high-contrast light mode, and official portal helper.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, 
  ArrowRight, 
  Building2, 
  FileText, 
  FileSpreadsheet, 
  Heart, 
  ExternalLink, 
  AlertCircle, 
  Download, 
  Layers, 
  MapPin, 
  Map, 
  Compass, 
  Copy, 
  Check, 
  X, 
  Info, 
  FileClock, 
  Eye, 
  FolderArchive, 
  Loader2, 
  Sparkles,
  IndianRupee,
  Wallet,
  CalendarClock,
  CalendarDays,
  Timer,
  ScrollText,
  Hash,
  Scale,
  ClipboardList,
  CreditCard,
  Navigation,
  Briefcase,
  ShieldCheck,
  Landmark,
  Files
} from 'lucide-react';

import { useTender } from '@/hooks/useTenders';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useAuthStore } from '@/store/useAuthStore';
import { formatCurrencyINR, formatDateDisplay, formatDateTimeDisplay, extractDetailedWorkLocation } from '@/utils/formatters';
import { Button } from '@/components/ui/Button';
import { Section, SheetGroup, Fields, Field, Stat, Badge, DocRow } from '@/components/tenders/detail/TenderDetailUI';
import { formatSizeKb, toDate, relativeDays, noticeCategory } from '@/components/tenders/detail/detailFormat';
import '@/components/tenders/detail/tender-details.css';
import { useSeo, isStaleTender } from '@/hooks/useSeo';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Modal';
import { api } from '@/services/api';
import { tenderPath, idFromParam } from '@/utils/tenderUrl';
import { SimilarTenders } from '@/components/tenders/SimilarTenders';
import { TenderProgress } from '@/components/tenders/TenderProgress';

// Helper to handle MongoDB's {"$date": "..."} format, raw strings, and "NA" fallbacks
const parseDate = (dateField) => {
  if (!dateField || dateField === 'NA' || dateField === 'N/A') return null;
  const dateStr = typeof dateField === 'object' && dateField.$date ? dateField.$date : dateField;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null; 
  return dateStr;
};

const OFFICIAL_TENDER_PORTALS = {
  'Jammu & Kashmir': {
    name: 'JK eProcurement',
    host: 'jktenders.gov.in',
    government: 'Government of Jammu and Kashmir',
  },
  Punjab: {
    name: 'Punjab eProcurement',
    host: 'eproc.punjab.gov.in',
    government: 'Government of Punjab',
  },
  'Himachal Pradesh': {
    name: 'Himachal Pradesh eProcurement',
    host: 'hptenders.gov.in',
    government: 'Government of Himachal Pradesh',
  },
  Ladakh: {
    name: 'Ladakh eProcurement',
    host: 'tenders.ladakh.gov.in',
    government: 'Administration of Ladakh',
  },
  Haryana: {
    name: 'Haryana eProcurement',
    host: 'etenders.hry.nic.in',
    government: 'Government of Haryana',
  },
  Delhi: {
    name: 'Delhi eProcurement',
    host: 'govtprocurement.delhi.gov.in',
    government: 'Government of NCT of Delhi',
  },
};

const PORTAL_STATE_BY_SOURCE = {
  JK_TENDERS: 'Jammu & Kashmir',
  PB_TENDERS: 'Punjab',
  HP_TENDERS: 'Himachal Pradesh',
  LADAKH_TENDERS: 'Ladakh',
  HR_TENDERS: 'Haryana',
  DL_TENDERS: 'Delhi',
};

const PMGSY_PORTAL = {
  name: 'PMGSY eProcurement',
  host: 'pmgsytendersjk.gov.in',
  government: 'National Rural Infrastructure Development Agency',
};

const getOfficialPortal = (tender) => {
  if (tender?.scheme === 'PMGSY' || tender?.sourcePortal === 'PMGSY') {
    const baseUrl = `https://${PMGSY_PORTAL.host}`;
    return { ...PMGSY_PORTAL, searchUrl: `${baseUrl}/nicgep/app?page=FrontEndAdvancedSearch&service=page`, homeUrl: baseUrl };
  }
  const normalizedState = String(tender?.state || '').trim().toLowerCase();
  const stateEntry = Object.entries(OFFICIAL_TENDER_PORTALS)
    .find(([state]) => state.toLowerCase() === normalizedState);
  const portalState = stateEntry?.[0] || PORTAL_STATE_BY_SOURCE[tender?.sourcePortal];
  const portal = OFFICIAL_TENDER_PORTALS[portalState] || OFFICIAL_TENDER_PORTALS['Jammu & Kashmir'];
  const baseUrl = `https://${portal.host}`;

  return {
    ...portal,
    searchUrl: `${baseUrl}/nicgep/app?page=FrontEndAdvancedSearch&service=page`,
    homeUrl: baseUrl,
  };
};

export default function TenderDetails() {
  const { id: routeParam } = useParams();
  const id = idFromParam(routeParam);
  const routerLocation = useLocation();
  const [nowMs] = useState(() => Date.now());
  const navigate = useNavigate();
  const { isAuthenticated, isPro, isLoading: authLoading, updateDailyViews } = useAuthStore();
  const { data: tender, isLoading, isError, error } = useTender(id);

  // Per-tender SEO tags: called before any early return so hook order stays stable.
  const is404 = isError && error?.response?.status === 404;
  const seoTitle = tender?.title?.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
  const seoOrg = (tender?.organisationChain || '').split('||')[0]?.trim() || tender?.department;
  useSeo(tender ? {
    title: [seoTitle, seoOrg && `${seoOrg} Tender`].filter(Boolean).join(' | '),
    description: [
      seoOrg && `${seoOrg} tender`,
      (tender.location || tender.state) && `in ${tender.location || tender.state}`,
      tender.estimatedValue ? `· Value ${formatCurrencyINR(tender.estimatedValue)}` : '',
      tender.bidSubmissionEndDate ? `· Closes ${formatDateDisplay(tender.bidSubmissionEndDate)}` : '',
      `· ${seoTitle || ''}. View documents, BOQ, and eligibility on tndrr.`,
    ].filter(Boolean).join(' '),
    // Canonical always uses the database id, matching the sitemap and crawler HTML,
    // even when the page was opened by its tender number.
    path: tenderPath(tender),
    type: 'article',
    noindex: isStaleTender(tender),
  } : {
    // Only a real 404 is noindexed; a transient API error (e.g. backend cold start)
    // must never tell Google to drop a valid page.
    title: is404 ? 'Tender Not Found' : 'Tender Details',
    path: `/tenders/${encodeURIComponent(routeParam)}`,
    noindex: is404,
  });

  // Keep one official URL per tender: an old id-only link, an outdated slug, a
  // tender number, or a GeM bid opened under /tenders/ is swapped in place
  // (no extra history entry) for the canonical readable URL.
  const canonicalPath = tender ? tenderPath(tender) : null;
  useEffect(() => {
    if (canonicalPath && decodeURIComponent(routerLocation.pathname) !== decodeURIComponent(canonicalPath)) {
      navigate(`${canonicalPath}${routerLocation.search}${routerLocation.hash}`, { replace: true });
    }
  }, [canonicalPath, routerLocation.pathname, routerLocation.search, routerLocation.hash, navigate]);
  const { toggleBookmark, isBookmarked } = useBookmarkStore();
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const officialPortal = getOfficialPortal(tender);

  // Sync latest viewsInfo with global auth store immediately upon viewing tender
  useEffect(() => {
    if (tender?.viewsInfo) {
      updateDailyViews(tender.viewsInfo);
    }
  }, [tender?.viewsInfo, updateDailyViews]);

  // In-browser ZIP extraction state
  const [isUnzipping, setIsUnzipping] = useState(false);
  const [extractedFiles, setExtractedFiles] = useState(null);
  const [unzipError, setUnzipError] = useState(null);

  const handleUnzip = async () => {
    if (extractedFiles) return;
    setIsUnzipping(true);
    setUnzipError(null);
    try {
      const tenderId = tender?._id || id;
      const response = await api.get(`/tenders/${tenderId}/zip`, { responseType: 'blob' });
      const blob = response.data;
      // jszip is only needed when someone unzips documents, so load it on demand.
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(blob);
      const files = [];

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const fileName = relativePath.split('/').pop();
        if (!fileName || fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue;

        const fileBlob = await zipEntry.async('blob');
        const fileUrl = URL.createObjectURL(fileBlob);
        const sizeKb = Math.round(fileBlob.size / 1024);

        const lowerName = fileName.toLowerCase();
        let fileType = 'ATTACHMENT';
        if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) fileType = 'BOQ';
        else if (lowerName.endsWith('.pdf')) fileType = 'PDF';
        else if (lowerName.endsWith('.dwg') || lowerName.endsWith('.dxf')) fileType = 'DRAWING';
        else if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) fileType = 'DOC';

        files.push({
          name: fileName,
          path: relativePath,
          sizeKb,
          url: fileUrl,
          type: fileType
        });
      }

      setExtractedFiles(files);
    } catch (err) {
      setUnzipError(err.message || 'Failed to extract zip archive.');
    } finally {
      setIsUnzipping(false);
    }
  };

  const handleDownloadZip = async () => {
    try {
      const response = await api.get(`/tenders/${tender?._id || id}/zip`, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = tender.zipFileName || 'Work_Documents_and_BOQ.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setUnzipError(downloadError.response?.data?.message || 'Could not download the tender ZIP. Please try again.');
    }
  };

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleOpenPortalModal = () => {
    if (tender?.sourceTenderId) {
      copyToClipboard(tender.sourceTenderId, 'tenderId');
    }
    setIsPortalModalOpen(true);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-dalBlue border-t-transparent animate-spin" />
    </div>
  );

  // 3. Fallback error / 404 handling
  if (isError || !tender) {
    const isNotFound = error?.response?.status === 404;
    return (
      <div className="min-h-screen bg-paper dark:bg-slate-900 flex flex-col items-center justify-center text-center p-4">
        <AlertCircle className="w-12 h-12 text-chinarRed mb-3" />
        <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white">
          {isNotFound ? 'Tender Not Found' : 'Unable to Load Tender Details'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">
          {error?.response?.data?.error || (isNotFound ? 'The requested tender does not exist or has been removed.' : 'A network error occurred while loading this tender. Please try again.')}
        </p>
        <div className="flex items-center gap-2">
          {!isNotFound && (
            <Button onClick={() => window.location.reload()} variant="outline" className="text-xs">
              Retry
            </Button>
          )}
          <Button onClick={() => navigate('/tenders')} className="text-xs">
            Back to Directory
          </Button>
        </div>
      </div>
    );
  }

  const bookmarked = isBookmarked(tender._id || tender.sourceTenderId);
  const orgParts = (tender.organisationChain || '').split('||').map(p => p.trim());
  const primaryOrg = orgParts[0] || tender.department;
  const workLoc = extractDetailedWorkLocation(tender);

  // Consolidate all official NIT / Tender Notice documents
  const nitDocs = (tender.nitDocuments && tender.nitDocuments.length > 0)
    ? tender.nitDocuments
    : (tender.pdfUrls || []).map((url, idx) => ({
        documentName: `Tendernotice_${idx + 1}.pdf`,
        description: `Official Tender Notice Document ${idx + 1}`,
        documentSizeKb: null,
        fileUrl: url,
      }));

  // Consolidate all work item documents extracted from Zip archives (legacy support)
  const workDocs = [...(tender.workItemDocuments || [])];
  const hasLegacyBoqDocument = tender.boqFileUrl && !tender.boqZipUrl && !tender.boqFileUrl.toLowerCase().endsWith('.zip') && !workDocs.some(d => d.fileUrl === tender.boqFileUrl);
  if (hasLegacyBoqDocument) {
    workDocs.unshift({
      documentType: 'BOQ',
      documentName: 'BOQ_Schedule.xls',
      description: 'BOQ Work Schedule (Extracted from Zip Archive)',
      documentSizeKb: null,
      fileUrl: tender.boqFileUrl,
      isLegacyDocument: true,
    });
  }

  const zipUrl = tender.boqZipUrl || (tender.boqFileUrl && tender.boqFileUrl.toLowerCase().endsWith('.zip') ? tender.boqFileUrl : null);
  const totalDocsCount = nitDocs.length + (zipUrl ? (extractedFiles ? extractedFiles.length : 1) : workDocs.length);

  // Filter out any leaked documents, notices, dates or navbar elements from offline payment instruments
  const genuineInstruments = (tender.offlineInstruments || []).filter(inst => {
    if (!inst || !inst.instrumentType) return false;
    const name = String(inst.instrumentType).trim();
    if (name.length < 3) return false;
    // Exclude dates (e.g. 20-Sep-2026)
    if (/\d{1,2}-[a-z]{3}-\d{4}/i.test(name)) return false;
    // Exclude navbar, notice, corrigendum, boq, drawing keywords
    if (name.includes('Search') || name.includes('Active Tenders') || name.includes('Results of Tenders') || name.includes('Corrigendum')) return false;
    if (/^(tendernotice|notice|nit|boq|corrigendum|tender documents|work item|drawing|sbd|other document)/i.test(name)) return false;
    if (name.toLowerCase().includes('other document') || name.toLowerCase().includes('tendernotice') || name.toLowerCase().includes('.pdf') || name.toLowerCase().includes('.xls')) return false;
    return true;
  });

  // Filter out leaked navbar items from covers information
  const genuineCovers = (tender.coversInfo || []).filter(cover => {
    if (!cover) return false;
    const type = String(cover.coverType || '').trim();
    const desc = String(cover.description || '').trim();
    // Exclude dates and navbar
    if (/\d{1,2}-[a-z]{3}-\d{4}/i.test(type) || /\d{1,2}-[a-z]{3}-\d{4}/i.test(desc)) return false;
    if (type.includes('Search') || type.includes('Active Tenders') || desc.includes('Search') || desc.includes('Active Tenders') || desc.includes('Corrigendum')) return false;
    if (type.toLowerCase().includes('other document') && !desc) return false;
    return true;
  });

  const docsPending = totalDocsCount === 0 || tender.isDocumentAvailable === false;
  const docsAvailableAt = tender.documentDownloadStartDateStr || tender.documentDownloadStartDate;
  const docBase = `${api.defaults.baseURL}/tenders/${tender._id || id}/documents`;
  const workDocPath = (doc, index) => `${docBase}/${doc.isLegacyDocument ? 'legacy/0' : `work/${index - (hasLegacyBoqDocument ? 1 : 0)}`}`;
  const zipName = tender.zipFileName || 'Work_Documents_and_BOQ.zip';

  const criticalDates = [
    { label: 'Published', raw: tender.publishedDate, str: tender.publishedDateStr },
    { label: 'Download Start', raw: tender.documentDownloadStartDate, str: tender.documentDownloadStartDateStr },
    { label: 'Download End', raw: tender.documentDownloadEndDate, str: tender.documentDownloadEndDateStr },
    { label: 'Clarification Start', raw: tender.clarificationStartDate, str: tender.clarificationStartDateStr, optional: true },
    { label: 'Clarification End', raw: tender.clarificationEndDate, str: tender.clarificationEndDateStr, optional: true },
    { label: 'Bid Start', raw: tender.bidSubmissionStartDate, str: tender.bidSubmissionStartDateStr, tone: 'is-start' },
    { label: 'Bid End', raw: tender.bidSubmissionEndDate, str: tender.bidSubmissionEndDateStr, tone: 'is-end' },
    { label: 'Bid Opening', raw: tender.bidOpeningDate, str: tender.bidOpeningDateStr, tone: 'is-open' },
  ]
    .filter((d) => !d.optional || ((d.str || d.raw) && d.raw !== 'NA'))
    .map((d) => {
      const [datePart, timePart] = formatDateTimeDisplay(d.str || d.raw).split(', ');
      const when = toDate(d.raw);
      return { ...d, datePart, timePart, when, passed: Boolean(when && when.getTime() <= nowMs) };
    });
  // Next milestone = earliest upcoming one. Portal milestones are not always in time order
  // (Bid Start can fall before Download End), and on a tie the later, bid-side milestone wins.
  const nextIndex = criticalDates.reduce((best, d, i) => {
    if (!d.when || d.passed) return best;
    if (best < 0) return i;
    return d.when.getTime() <= criticalDates[best].when.getTime() ? i : best;
  }, -1);
  const nextDate = nextIndex >= 0 ? criticalDates[nextIndex] : null;

  // Headline facts for the header strip (all derived from fields shown in full below)
  const bidEnd = criticalDates.find((d) => d.label === 'Bid End');
  const bidClosed = Boolean(bidEnd?.passed);
  const orgChain = (tender.organisationChain || '').split('||').map((p) => p.trim()).filter(Boolean);

  return (
    <div className="td-page min-h-screen py-6 sm:py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">

        <button type="button" onClick={() => navigate(-1)} className="td-back cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back to Directory
        </button>

        {/* ── Tender summary ─────────────────────────────────────────── */}
        <header className="td-card td-hero">
          <div className="td-hero-body">
            <div className="min-w-0">
              <div className="td-hero-top">
                <span className={`td-status ${bidClosed ? 'td-status--closed' : ''}`}>{tender.status || 'Active'}</span>
                <Badge tone="id"><b>ID</b>{tender.sourceTenderId}</Badge>
                {tender.tenderCategory && <Badge tone="neutral">{tender.tenderCategory}</Badge>}
                {docsPending && (
                  <Badge tone="warning" title={docsAvailableAt ? `Documents available on ${formatDateTimeDisplay(docsAvailableAt)}` : 'Pending portal release'}>
                    <FileClock />
                    Docs Available: {docsAvailableAt ? formatDateTimeDisplay(docsAvailableAt) : 'Pending Release'}
                  </Badge>
                )}
              </div>

              <h1 className="td-hero-title">{tender.title?.replace(/[[\]]/g, '')}</h1>

              <div className="td-hero-meta">
                <span><Building2 />{primaryOrg}</span>
                <span>
                  <MapPin />
                  <span>Site: <strong>{workLoc.famousLocation}</strong>
                    {workLoc.pincode && workLoc.pincode !== 'N/A' && <span className="td-mono"> · PIN {workLoc.pincode}</span>}
                  </span>
                </span>
              </div>

              <dl className="td-hero-authority">
                <div>
                  <dt>Inviting officer</dt>
                  <dd>{tender.invitingAuthorityName || 'Competent Authority / Executive Engineer'}</dd>
                </div>
                <div>
                  <dt>Office address</dt>
                  <dd>{tender.invitingAuthorityAddress || tender.location || 'As specified in tender notice'}</dd>
                </div>
              </dl>
            </div>

            <div className="td-hero-side">
              <p className="td-hero-side-label">Actions</p>
              <button
                type="button"
                onClick={() => toggleBookmark(tender)}
                aria-pressed={bookmarked}
                className={`td-btn ${bookmarked ? 'td-btn--saved' : 'td-btn--primary'}`}
              >
                <Heart className={bookmarked ? 'fill-current' : ''} />
                {bookmarked ? 'Saved in Watchlist' : 'Save Tender'}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/services/${tender._id || tender.sourceTenderId}`)}
                className="td-btn td-btn--accent"
              >
                <Sparkles /> Contractor AI Dossier
              </button>
              <button type="button" onClick={handleOpenPortalModal} className="td-btn td-btn--secondary">
                Original Portal <ExternalLink />
              </button>
            </div>
          </div>

          <dl className="td-facts">
            <div className="td-fact td-fact--accent">
              <dt><IndianRupee /> Tender value</dt>
              <dd>{formatCurrencyINR(tender.estimatedValue)}</dd>
            </div>
            <div className="td-fact">
              <dt><Wallet /> EMD deposit</dt>
              <dd>{formatCurrencyINR(tender.emdAmount)}</dd>
              <dd className="td-fact-hint">Tender fee {formatCurrencyINR(tender.tenderFee)}</dd>
            </div>
            <div className={`td-fact ${bidClosed ? '' : 'td-fact--danger'}`}>
              <dt><CalendarClock /> Bid submission closes</dt>
              <dd>{bidEnd?.datePart || 'N/A'}</dd>
              {bidEnd?.timePart && <dd className="td-fact-hint">{bidEnd.timePart}</dd>}
            </div>
            <div className="td-fact">
              <dt><Timer /> Time to close</dt>
              <dd>{bidEnd?.when ? (bidClosed ? 'Closed' : relativeDays(bidEnd.when, nowMs)) : 'N/A'}</dd>
              {bidEnd?.when && bidClosed && <dd className="td-fact-hint">{relativeDays(bidEnd.when, nowMs)}</dd>}
              {!bidClosed && nextDate && <dd className="td-fact-hint">Next: {nextDate.label}</dd>}
            </div>
          </dl>
        </header>

        {/* ── Multi-work NIT notice ──────────────────────────────────── */}
        {tender.relatedTenders && tender.relatedTenders.length > 0 && (
          <section className="td-notice" aria-labelledby="multi-work-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Layers className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                <h2 id="multi-work-heading" className="td-card-title">Multiple Works Detected for this NIT</h2>
                <Badge tone="warning">{tender.relatedTenders.length + 1} Total Works</Badge>
              </div>
              {(tender.tenderReferenceNumber || tender.baseTenderId) && (
                <Badge tone="id"><b>Ref</b>{tender.tenderReferenceNumber || tender.baseTenderId}</Badge>
              )}
            </div>
            <p className="td-card-desc mt-2 mb-4 max-w-3xl">
              This tender is part of a multi-work contract notice issued by the department. Each work item has its own distinct scope, BOQ, and estimated budget. Explore the other works under this notice below:
            </p>
            <ul className="td-similar">
              {tender.relatedTenders.map((sibling) => (
                <li key={sibling._id || sibling.sourceTenderId}>
                  <button type="button" onClick={() => navigate(tenderPath(sibling))} className="td-similar-card w-full text-left cursor-pointer">
                    <span className="td-similar-top">
                      <span className="td-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{sibling.sourceTenderId}</span>
                      <span className="td-similar-value">{sibling.estimatedValue ? formatCurrencyINR(sibling.estimatedValue) : 'Value N/A'}</span>
                    </span>
                    <span className="td-similar-title">{sibling.title}</span>
                    <span className="td-similar-meta justify-between">
                      <span>Pub: {formatDateDisplay(sibling.publishedDate || sibling.publishedDateStr)}</span>
                      <span className="font-semibold text-dalBlue dark:text-blue-300">View Work <ArrowRight /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Critical dates ─────────────────────────────────────────── */}
        <Section
          id="critical-dates"
          variant="tint"
          icon={<CalendarDays />}
          title="Critical dates"
          description="Portal milestones from publication to bid opening"
          action={nextDate && (
            <span className="td-next">
              <Timer />
              Next: <strong>{nextDate.label}</strong>
              <span className="td-mono">{nextDate.datePart}{nextDate.timePart ? `, ${nextDate.timePart}` : ''}</span>
              <em>{relativeDays(nextDate.when, nowMs)}</em>
            </span>
          )}
        >
          <ol className="td-dates" style={{ '--td-date-count': criticalDates.length }}>
            {criticalDates.map((d, i) => {
              const trackDone = Boolean(criticalDates[i + 1]?.passed);
              const isNext = i === nextIndex;
              return (
                <li
                  key={d.label}
                  className={`td-date ${d.tone || ''} ${d.passed ? 'is-passed' : ''} ${isNext ? 'is-next' : ''} ${trackDone ? 'is-track-done' : ''}`}
                  aria-current={isNext ? 'step' : undefined}
                >
                  <span className="td-date-dot" aria-hidden="true">{d.passed && <Check />}</span>
                  <span className="td-date-body">
                    <span className="td-date-label">{d.label}</span>
                    <span className="td-date-day">{d.datePart}</span>
                    {d.timePart && <span className="td-date-time">{d.timePart}</span>}
                    {d.when && (isNext || !d.passed) && <span className="td-date-rel">{isNext ? `Next · ${relativeDays(d.when, nowMs)}` : relativeDays(d.when, nowMs)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </Section>

        {/* Post-closing progress: bid opening → evaluation → award, from the portal's Tenders Status page */}
        <TenderProgress tender={tender} nowMs={nowMs} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-start">

          {/* ── Main column ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5 sm:space-y-6 min-w-0">

            <Section id="basic-details" icon={<ScrollText />} title="Basic details" description="Tender identity, contract form and bidding rules">
              <SheetGroup title="Identification" icon={<Hash />}>
                <Fields>
                  <Field
                    wide
                    label="Organisation Chain"
                    value={orgChain.length ? <span className="td-chain">{orgChain.map((p, i) => <span key={i}>{p}</span>)}</span> : undefined}
                  />
                  <Field label="Tender Reference Number" value={tender.tenderReferenceNumber} mono />
                  <Field label="Tender ID" value={tender.sourceTenderId} mono />
                  <Field label="Tender Type" value={tender.tenderType} />
                  <Field label="Tender Category" value={tender.tenderCategory} />
                </Fields>
              </SheetGroup>
              <SheetGroup title="Contract & bidding" icon={<Scale />}>
                <Fields>
                  <Field label="Form Of Contract" value={tender.formOfContract} />
                  <Field label="No. of Covers" value={tender.noOfCovers} />
                  <Field label="Two Stage Bidding" value={tender.allowTwoStageBidding} />
                  <Field label="Withdrawal Allowed" value={tender.withdrawalAllowed} />
                </Fields>
              </SheetGroup>
              <SheetGroup title="Evaluation" icon={<ClipboardList />}>
                <Fields>
                  <Field label="Technical Evaluation" value={tender.generalTechnicalEvaluationAllowed} />
                  <Field label="ItemWise Tech Eval" value={tender.itemWiseTechnicalEvaluationAllowed} />
                </Fields>
              </SheetGroup>
              <SheetGroup title="Payment" icon={<CreditCard />}>
                <Fields>
                  <Field wide label="Payment Mode" value={tender.paymentMode} />
                  <Field label="Multi Currency BOQ" value={tender.isMultiCurrencyAllowedForBOQ} />
                  <Field label="Multi Currency Fee" value={tender.isMultiCurrencyAllowedForFee} />
                </Fields>
              </SheetGroup>
            </Section>

            <Section
              id="work-location"
              icon={<Navigation />}
              title="Work execution location"
              description="Geographic execution site and administrative jurisdiction"
              action={(
                <a href={workLoc.mapSearchUrl} target="_blank" rel="noreferrer" className="ai-tile-link glass-btn">
                  <Map className="w-3.5 h-3.5" />
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
            >
              <div className="td-loc-hero">
                <span className="td-loc-pin" aria-hidden="true"><MapPin /></span>
                <div className="min-w-0">
                  <span className="td-loc-label"><Compass /> Project Site / Area Description</span>
                  <p className="td-loc-site">{workLoc.specificSite || 'Execution site as specified in tender document.'}</p>
                  <dl className="td-loc-chips">
                    <div className="td-loc-chip">
                      <dt>District / City</dt>
                      <dd>{workLoc.famousLocation}{tender.state ? `, ${tender.state}` : ''}</dd>
                    </div>
                    <div className="td-loc-chip">
                      <dt>Postal Pincode</dt>
                      <dd className="td-mono">{workLoc.pincode}</dd>
                    </div>
                    <div className="td-loc-chip">
                      <dt>Portal Location</dt>
                      <dd>{workLoc.rawLocation || 'Refer to Notice'}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="td-group">
                <Fields>
                  <Field wide label="Portal Location (NIT)" value={tender.location || 'As specified in NIT'} />
                  <Field label="Bid Opening Office" value={tender.bidOpeningPlace && tender.bidOpeningPlace !== 'NA' ? tender.bidOpeningPlace : 'N/A'} />
                  <Field
                    label="Pre-Bid Meeting"
                    value={tender.preBidMeetingAddress && tender.preBidMeetingAddress !== 'NA'
                      ? tender.preBidMeetingAddress
                      : (tender.preBidMeetingPlace && tender.preBidMeetingPlace !== 'NA'
                          ? tender.preBidMeetingPlace
                          : 'No Pre-Bid Meeting Scheduled')}
                  />
                </Fields>
              </div>
            </Section>

            <Section id="work-item" icon={<Briefcase />} title="Work item details" description="Scope, commercial terms, timelines and eligibility">
              <SheetGroup title="Work description" icon={<FileText />}>
                <div className="pt-2">
                  <div className="td-quote">
                    <p className="td-prose-label">Title</p>
                    <p className="td-prose td-prose--strong">{tender.title}</p>
                  </div>
                  {tender.workDescription && tender.workDescription !== tender.title && (
                    <div className="td-quote">
                      <p className="td-prose-label">Work Description</p>
                      <p className="td-prose">{tender.workDescription}</p>
                    </div>
                  )}
                </div>
              </SheetGroup>

              <SheetGroup title="Financial & contract" icon={<IndianRupee />}>
                <dl className="td-stats">
                  <Stat
                    tone="accent"
                    label="Tender Value in ₹"
                    value={formatCurrencyINR(tender.estimatedValue)}
                    hint={tender.estimatedValue ? `(${tender.estimatedValue.toLocaleString('en-IN')})` : null}
                  />
                </dl>
                <Fields>
                  <Field label="Product Category" value={tender.productCategory} />
                  <Field label="Sub category" value={tender.subCategory} />
                  <Field label="Contract Type" value={tender.contractType} />
                  <Field label="Tenderer Class" value={tender.tendererClass} />
                </Fields>
              </SheetGroup>

              <SheetGroup title="Location" icon={<MapPin />}>
                <Fields>
                  <Field label="Location" value={tender.location || 'As specified in NIT'} />
                  <Field label="Pincode" value={tender.pincode || 'N/A'} mono />
                </Fields>
              </SheetGroup>

              <SheetGroup title="Timeline & bid conditions" icon={<CalendarClock />}>
                <dl className="td-stats">
                  <Stat label="Bid Validity(Days)" value={tender.bidValidityDays ? `${tender.bidValidityDays}` : 'N/A'} />
                  <Stat label="Period Of Work(Days)" value={tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A'} />
                </dl>
                <Fields>
                  <Field
                    label="Pre Bid Meeting Date"
                    value={tender.preBidMeetingPlace === 'NA' || !tender.preBidMeetingDate ? 'NA' : formatDateTimeDisplay(parseDate(tender.preBidMeetingDate))}
                    mono
                  />
                  <Field label="Pre Bid Meeting Place" value={tender.preBidMeetingPlace} />
                  <Field label="Pre Bid Meeting Address" value={tender.preBidMeetingAddress} />
                  <Field label="Bid Opening Place" value={tender.bidOpeningPlace} />
                </Fields>
              </SheetGroup>

              <SheetGroup title="Eligibility & conditions" icon={<ShieldCheck />}>
                <Fields>
                  <Field label="NDA/Pre Qualification" value={tender.ndaPreQualification} />
                  <Field label="Should Allow NDA Tender" value={tender.shouldAllowNDATender} />
                  <Field label="Allow Preferential Bidder" value={tender.allowPreferentialBidder} />
                  <Field wide label="Independent External Monitor/Remarks" value={tender.independentExternalMonitorRemarks} />
                </Fields>
              </SheetGroup>
            </Section>

            <Section
              id="covers"
              icon={<Layers />}
              title="Covers information"
              description={`No. of Covers: ${tender.noOfCovers || 2}`}
            >
              {genuineCovers.length > 0 ? (
                <div className="td-table-wrap">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th className="td-col-num">Cover</th>
                        <th>Cover Type</th>
                        <th>Description</th>
                        <th>Doc Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genuineCovers.map((cover, idx) => {
                        const docType = String(cover.documentType || '');
                        const isSheet = /xls/i.test(docType);
                        return (
                          <tr key={idx}>
                            <td data-label="Cover" className="td-col-num"><span className="td-index">{cover.coverNo || idx + 1}</span></td>
                            <td data-label="Cover Type" className="td-strong">{cover.coverType || 'Fee/PreQual/Technical'}</td>
                            <td data-label="Description">{cover.description || 'Document requirement as per NIT'}</td>
                            <td data-label="Doc Type">
                              {docType ? <Badge tone={isSheet ? 'xls' : 'pdf'} className="uppercase">{docType}</Badge> : <span className="text-slate-400">N/A</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
                  <p>Standard {tender.noOfCovers || 2}-cover bidding system:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Cover 1: Fee / Pre-Qualification / Technical (.pdf)</li>
                    <li>Cover 2: Finance / BOQ Schedule (.xls)</li>
                  </ul>
                </div>
              )}
            </Section>

            {/* Mandatory bidder checklist */}
            {tender.otherImportantDocuments && tender.otherImportantDocuments.length > 0 && (
              <Section
                id="other-documents"
                icon={<ClipboardList />}
                title="Other important documents"
                description={`${tender.otherImportantDocuments.length} mandatory document(s)`}
              >
                <div className="td-table-wrap">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th className="td-col-num">S.No</th>
                        <th>Category</th>
                        <th>Sub Category</th>
                        <th>Sub Category Description</th>
                        <th>Format/File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tender.otherImportantDocuments.map((doc, idx) => (
                        <tr key={idx}>
                          <td data-label="S.No" className="td-col-num"><span className="td-index">{doc.sNo || idx + 1}</span></td>
                          <td data-label="Category">{doc.category}</td>
                          <td data-label="Sub Category" className="td-strong">{doc.subCategory}</td>
                          <td data-label="Description">{doc.description}</td>
                          <td data-label="Format/File" className="td-mono text-xs">{doc.format || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>

          {/* ── Side column: money first ─────────────────────────────── */}
          <aside className="order-first lg:order-none space-y-5 sm:space-y-6 min-w-0 lg:sticky lg:top-24">
            <Section id="fees" variant="navy" icon={<Landmark />} title="Fee & EMD details" description="Payable before bid submission">
              <div className="td-money-block td-money-block--lead">
                <p className="td-money-label">
                  EMD Deposit
                  <span className="td-money-tag">{tender.emdFeeType || 'Fixed'}</span>
                </p>
                <p className="td-money-amount">{formatCurrencyINR(tender.emdAmount)}</p>
                <dl className="td-money-list">
                  <div><dt>Payable To</dt><dd>{tender.emdPayableTo || 'N/A'}</dd></div>
                  <div><dt>Payable At</dt><dd>{tender.emdPayableAt || 'N/A'}</dd></div>
                  <div><dt>Exemption</dt><dd>{tender.emdExemptionAllowed || 'No'}</dd></div>
                </dl>
              </div>
              <div className="td-money-block">
                <p className="td-money-label">Tender Fee</p>
                <p className="td-money-amount">{formatCurrencyINR(tender.tenderFee)}</p>
                <dl className="td-money-list">
                  <div><dt>Payable To</dt><dd>{tender.feePayableTo || 'N/A'}</dd></div>
                  <div><dt>Payable At</dt><dd>{tender.feePayableAt || 'N/A'}</dd></div>
                  <div><dt>Fee Exemption</dt><dd>{tender.tenderFeeExemptionAllowed || 'No'}</dd></div>
                </dl>
              </div>
            </Section>

            <Section id="payment-instruments" variant="tint" icon={<CreditCard />} title="Payment instruments">
              {genuineInstruments.length > 0 ? (
                <div className="td-table-wrap bg-white dark:bg-transparent">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th className="td-col-num">S.No</th>
                        <th>Instrument Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genuineInstruments.map((inst, idx) => (
                        <tr key={idx}>
                          <td data-label="S.No" className="td-col-num"><span className="td-index">{inst.sNo || idx + 1}</span></td>
                          <td data-label="Instrument" className="td-strong">{inst.instrumentType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="td-prose">
                  {tender.paymentMode === 'Offline'
                    ? 'Offline payment mode (acceptable instruments: Demand Draft / Bank Guarantee / CDR / FDR as per NIT).'
                    : 'Online payment mode (e-Payment / Net Banking / RTGS / NEFT).'}
                </p>
              )}
            </Section>
          </aside>
        </div>

        {/* ── Documents ──────────────────────────────────────────────── */}
        <Section
          id="documents"
          icon={<Files />}
          title="Tender documents & attachments"
          description="Official notices, corrigenda, BOQ and work documents from the portal"
          action={totalDocsCount > 0
            ? <Badge tone="accent">{totalDocsCount} {totalDocsCount === 1 ? 'file' : 'files'}</Badge>
            : <Badge tone="warning">Pending Release</Badge>}
        >
          <div className="td-fm">
            {/* 1. Official tender notices & corrigenda */}
            {nitDocs.length > 0 && (
              <div className="td-fm-group">
                <div className="td-fm-head">
                  <h3 className="td-fm-title">
                    <FileText className="text-rose-600 dark:text-rose-300" /> Tender Notices &amp; Corrigenda
                    <span className="td-fm-count">{nitDocs.length}</span>
                  </h3>
                  <span className="td-fm-note">PDF Format</span>
                </div>
                <ul className="td-docs">
                  {nitDocs.map((doc, index) => {
                    const category = noticeCategory(doc);
                    return (
                      <DocRow
                        key={index}
                        icon={<FileText />}
                        tone={category.tone}
                        weight={category.weight}
                        name={doc.documentName || `Tendernotice_${index + 1}.pdf`}
                        typeLabel="PDF"
                        description={doc.description || `Notice Inviting Tender #${index + 1}`}
                        size={formatSizeKb(doc.documentSizeKb)}
                        actions={(
                          <>
                            <a href={`${docBase}/notice/${index}`} target="_blank" rel="noopener noreferrer" className={`td-btn td-btn--sm ${category.weight === 'strong' ? 'td-btn--primary' : 'td-btn--accent'}`}>
                              <Eye /> View Notice
                            </a>
                            <a href={`${docBase}/notice/${index}?download=1`} className="td-btn td-btn--secondary td-btn--icon" title="Download Notice" aria-label="Download Notice">
                              <Download />
                            </a>
                          </>
                        )}
                      />
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 2. Work item documents & BOQ archive (.zip) */}
            {zipUrl && (
              <div className="td-fm-group td-fm-group--package">
                <div className="td-fm-head">
                  <h3 className="td-fm-title"><FolderArchive className="text-emerald-600 dark:text-emerald-400" /> Work Item Documents &amp; BOQ Package</h3>
                  <span className="td-fm-note">Direct ZIP Archive</span>
                </div>

                <ul className="td-docs">
                  <DocRow
                    icon={<FolderArchive />}
                    tone="zip"
                    weight="strong"
                    name={zipName}
                    typeLabel="ZIP Archive"
                    description="Contains official BOQ spreadsheets (.xls/.xlsx), technical drawings, and work specifications."
                    size={formatSizeKb(tender.zipFileSizeKb)}
                    actions={(
                      <>
                        <button type="button" onClick={handleDownloadZip} className="td-btn td-btn--success td-btn--sm" title="Directly download the complete .zip file">
                          <Download /> Download ZIP
                        </button>
                        <button type="button" onClick={handleUnzip} disabled={isUnzipping} className="td-btn td-btn--secondary td-btn--sm">
                          {isUnzipping ? (
                            <><Loader2 className="animate-spin text-emerald-600" /> Unpacking...</>
                          ) : extractedFiles ? (
                            <><Check className="text-emerald-600" /> Unpacked ({extractedFiles.length} files)</>
                          ) : (
                            <><FolderArchive className="text-emerald-600" /> Inspect &amp; Unzip Files</>
                          )}
                        </button>
                      </>
                    )}
                  />
                </ul>

                {!extractedFiles && !isUnzipping && (
                  <div className="td-callout">
                    <Info />
                    <span>
                      Looking for individual files without downloading the full archive? Click <strong>&quot;Inspect &amp; Unzip Files&quot;</strong> to unpack and download specific BOQ sheets (as the original Excel file or as CSV) or PDFs directly in your browser. (Note: Extraction may take a few moments depending on archive size).
                    </span>
                  </div>
                )}

                {isUnzipping && (
                  <div className="td-callout">
                    <Loader2 className="animate-spin" />
                    <span>Unpacking archive contents in your browser... Please wait a moment.</span>
                  </div>
                )}

                {unzipError && (
                  <div className="td-callout td-callout--error" role="alert">
                    <span className="flex items-center gap-2"><AlertCircle />{unzipError}</span>
                    <button type="button" onClick={() => { setExtractedFiles(null); handleUnzip(); }} className="underline font-semibold cursor-pointer">
                      Retry
                    </button>
                  </div>
                )}

                {extractedFiles && extractedFiles.length > 0 && (
                  <div className="td-fm-sub">
                    <div className="td-fm-sub-head">
                      <span><Check /> Extracted Files Available for Download ({extractedFiles.length})</span>
                      <Badge tone="success">Ready in Browser</Badge>
                    </div>
                    <ul className="td-docs">
                      {extractedFiles.map((file, idx) => {
                        const isXls = file.type === 'BOQ';
                        const isPdf = file.type === 'PDF';
                        return (
                          <DocRow
                            key={idx}
                            icon={isXls ? <FileSpreadsheet /> : <FileText />}
                            tone={isXls ? 'xls' : isPdf ? 'pdf' : 'neutral'}
                            weight={isXls ? 'strong' : 'normal'}
                            name={file.name}
                            typeLabel={file.type}
                            size={file.sizeKb > 0 ? formatSizeKb(file.sizeKb) : null}
                            actions={(
                              <>
                                {isPdf && (
                                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="td-btn td-btn--primary td-btn--sm">
                                    <Eye /> View
                                  </a>
                                )}
                                <a href={file.url} download={file.name} className={`td-btn td-btn--sm ${isXls ? 'td-btn--success' : 'td-btn--secondary'}`}>
                                  <Download /> {isXls ? 'Excel' : 'Download'}
                                </a>
                                {isXls && (
                                  <a
                                    href={`${api.defaults.baseURL}/tenders/${tender._id || id}/zip/csv?entry=${encodeURIComponent(file.path || file.name)}`}
                                    download
                                    aria-label={`Download ${file.name} as CSV`}
                                    title="Cell values only, opens in any app. Bid with the Excel file."
                                    className="td-btn td-btn--secondary td-btn--sm"
                                  >
                                    <Download /> CSV
                                  </a>
                                )}
                              </>
                            )}
                          />
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Legacy extracted work item documents (older data without a ZIP) */}
            {!zipUrl && workDocs.length > 0 && (
              <div className="td-fm-group">
                <div className="td-fm-head">
                  <h3 className="td-fm-title">
                    <FolderArchive className="text-emerald-600 dark:text-emerald-400" /> Work Item Documents &amp; Attachments
                    <span className="td-fm-count">{workDocs.length}</span>
                  </h3>
                  <span className="td-fm-note">Extracted Files</span>
                </div>
                <ul className="td-docs">
                  {workDocs.map((doc, index) => {
                    const docName = doc.documentName || `Document_${index + 1}`;
                    const lowerName = docName.toLowerCase();
                    const isXls = lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx') || doc.documentType === 'BOQ';
                    const isPdf = lowerName.endsWith('.pdf') || doc.documentType === 'TECHNICAL_DOCUMENT';
                    const path = workDocPath(doc, index);
                    return (
                      <DocRow
                        key={index}
                        icon={isXls ? <FileSpreadsheet /> : <FileText />}
                        tone={isXls ? 'xls' : isPdf ? 'pdf' : 'neutral'}
                        weight={isXls ? 'strong' : 'normal'}
                        name={docName}
                        typeLabel={doc.documentType || (isXls ? 'BOQ' : isPdf ? 'Drawing/Spec' : 'Attachment')}
                        description={doc.description || (isXls ? 'BOQ Work Schedule' : 'Enclosed Document from Zip Archive')}
                        size={formatSizeKb(doc.documentSizeKb)}
                        actions={isPdf ? (
                          <>
                            <a href={path} target="_blank" rel="noopener noreferrer" className="td-btn td-btn--primary td-btn--sm">
                              <Eye /> View Document
                            </a>
                            <a href={`${path}?download=1`} download={docName} className="td-btn td-btn--secondary td-btn--icon" title="Download File" aria-label="Download File">
                              <Download />
                            </a>
                          </>
                        ) : isXls ? (
                          <>
                            <a href={path} target="_blank" rel="noopener noreferrer" download={docName} className="td-btn td-btn--success td-btn--sm">
                              <FileSpreadsheet /> Excel
                            </a>
                            <a
                              href={`${path}?format=csv`}
                              download
                              aria-label={`Download ${docName} as CSV`}
                              title="Cell values only, opens in any app. Bid with the Excel file."
                              className="td-btn td-btn--secondary td-btn--sm"
                            >
                              <Download /> CSV
                            </a>
                          </>
                        ) : (
                          <a href={`${path}?download=1`} target="_blank" rel="noopener noreferrer" download={docName} className="td-btn td-btn--secondary td-btn--sm">
                            <Download /> Download File
                          </a>
                        )}
                      />
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 3. Nothing released yet */}
            {totalDocsCount === 0 && (
              <div className="td-notice">
                <div className="flex items-start gap-3">
                  <FileClock className="w-5 h-5 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Tender Documents Not Available Yet</h3>
                    <p className="td-card-desc mt-1">
                      Official tender documents (NIT notice, drawings, specifications, and BOQ schedule) have not been released by the department on the portal yet.
                    </p>
                    <p className="td-prose-label mt-4">Document Availability Schedule</p>
                    <p className="td-prose">
                      {tender.documentDownloadStartDate ? (
                        <>
                          The documents will be available on{' '}
                          <strong className="td-mono text-dalBlue dark:text-blue-300">
                            {formatDateTimeDisplay(parseDate(tender.documentDownloadStartDate))}
                          </strong>
                        </>
                      ) : (
                        'The documents will be available as soon as released on the official portal.'
                      )}
                    </p>
                    <button type="button" onClick={handleOpenPortalModal} className="td-btn td-btn--primary mt-4">
                      Check Status on Official Portal <ExternalLink />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Related open tenders: internal links for visitors and crawlers */}
        <SimilarTenders tender={tender} isClosed={Boolean((tender.bidSubmissionEndDate || tender.closingDate) && new Date(tender.bidSubmissionEndDate || tender.closingDate).getTime() < nowMs)} />
      </div>

      {/* Official Portal Helper Dialog */}
      <Dialog open={isPortalModalOpen} onClose={() => setIsPortalModalOpen(false)}>
        <DialogContent className="p-0 overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl">
          <div className="bg-dalBlue p-4 sm:p-5 text-white relative shrink-0">
            <button
              onClick={() => setIsPortalModalOpen(false)}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 mb-1 text-amber-300 text-xs font-bold uppercase">
              <ExternalLink className="w-3.5 h-3.5" /> Official Government Portal
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold text-white">
              Access Notice on {officialPortal.name}
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs mt-0.5">
              {officialPortal.host} ({officialPortal.government})
            </DialogDescription>
          </div>

          <div className="p-4 sm:p-5 space-y-3.5 text-xs overflow-y-auto filter-scrollbar flex-1">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="text-amber-900 dark:text-amber-300 block mb-0.5">Direct Session Timeout Note</strong>
                Direct GePNIC links time out after 10–15 minutes on NIC servers. Using the pre-copied Tender ID below guarantees access.
              </div>
            </div>

            {/* Pre-copied Tender ID Card */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="overflow-hidden">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Tender ID (Copied to Clipboard)
                </span>
                <span className="font-mono text-xs sm:text-sm font-bold text-dalBlue dark:text-blue-400 select-all truncate block">
                  {tender.sourceTenderId}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(tender.sourceTenderId, 'tenderId')}
                className="gap-1 text-xs shrink-0"
              >
                {copiedField === 'tenderId' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>

            {/* Quick 3-step Instructions */}
            <div className="py-1">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-1.5">
                Instructions
              </span>
              <ol className="space-y-1 text-slate-600 dark:text-slate-300 list-decimal list-inside">
                <li>Tender ID is already in your clipboard.</li>
                <li>Click <strong>&quot;Open Portal Search&quot;</strong> below.</li>
                <li>Paste into <strong>Tender ID</strong> field and click Search.</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <a
                href={officialPortal.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full gap-1.5 bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2 text-xs">
                  Open Portal Search <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>

              <div className="text-center">
                <a
                  href={officialPortal.homeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-dalBlue text-xs underline"
                >
                  Visit {officialPortal.name} Homepage
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
