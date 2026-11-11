import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Landmark,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { useTender } from '@/hooks/useTenders';
import { gemApi } from '@/services/gemApi';
import { formatCurrencyINR, formatDateTimeDisplay } from '@/utils/formatters';
import { Button } from '@/components/ui/Button';
import { Tile } from '@/components/shared/BentoTile';
import { useSeo, isStaleTender } from '@/hooks/useSeo';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { cleanGemText, parseConsigneeRows } from '@/utils/gemDelivery';
import { tenderPath, idFromParam } from '@/utils/tenderUrl';
import { SimilarTenders } from '@/components/tenders/SimilarTenders';

const display = (value, fallback = 'Not specified') => {
  const cleaned = String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
};
const formatDateTimeIST = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'date unavailable';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) + ' IST';
};

const parseGemDescription = (value) => {
  const raw = String(value || '').replace(/^\[GeM Procurement\]\s*/i, '').trim();
  const match = (label, nextLabels) => {
    const next = nextLabels.map((item) => `\\n${item}:`).join('|');
    const expression = new RegExp(`${label}:\\s*([^]*?)(?=${next || '$'})`, 'i');
    return raw.match(expression)?.[1]?.trim() || '';
  };
  return {
    categories: match('Category', ['Total Quantity', 'Consignee', 'Delivery Stations'])
      .replace(/,\s*$/, '').split(',').map((item) => item.trim()).filter(Boolean),
    quantity: match('Total Quantity', ['Consignee', 'Delivery Stations']),
    consignee: match('Consignee', ['Delivery Stations']),
    stations: match('Delivery Stations', []),
    raw,
  };
};

const Field = ({ label, children, big = false, wide = false }) => (
  <div className={`ai-field ${wide ? 'ai-field--wide' : ''}`}>
    <dt>{label}</dt>
    <dd className={big ? 'big' : undefined}>{children}</dd>
  </div>
);


export default function GeMBidDetails() {
  const { id: routeParam } = useParams();
  const id = idFromParam(routeParam);
  const routerLocation = useLocation();
  const [nowMs] = useState(() => Date.now());
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [reportField, setReportField] = useState('officialState');
  const [reportNote, setReportNote] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const { data: bid, isLoading, isError, error } = useTender(id);

  // Per-bid SEO tags: called before any early return so hook order stays stable.
  const is404 = isError && error?.response?.status === 404;
  const seoBidTitle = bid?.title?.replace(/\s+/g, ' ').trim();
  const seoBidState = bid?.officialState || bid?.state;
  useSeo(bid ? {
    title: [seoBidTitle, seoBidState && `GeM Bid ${seoBidState}`].filter(Boolean).join(' | '),
    description: [
      'GeM bid',
      bid.sourceTenderId && bid.sourceTenderId,
      bid.departmentName && `by ${bid.departmentName}`,
      seoBidState && `in ${seoBidState}`,
      `· ${bid.productCategory || seoBidTitle || ''}. View delivery locations, EMD, and bid documents on tndrr.`,
    ].filter(Boolean).join(' '),
    // Canonical always uses the database id, matching the sitemap and crawler HTML.
    path: tenderPath(bid),
    type: 'article',
    noindex: isStaleTender(bid),
  } : {
    // Only a real 404 is noindexed; a transient API error (e.g. backend cold start)
    // must never tell Google to drop a valid page.
    title: is404 ? 'GeM Bid Not Found' : 'GeM Bid Details',
    path: `/gem-tenders/${encodeURIComponent(routeParam)}`,
    noindex: is404,
  });

  // Keep one official URL per tender: an old id-only link, an outdated slug, a
  // tender number, or a GeM bid opened under /tenders/ is swapped in place
  // (no extra history entry) for the canonical readable URL.
  const canonicalPath = bid ? tenderPath(bid) : null;
  useEffect(() => {
    if (canonicalPath && decodeURIComponent(routerLocation.pathname) !== decodeURIComponent(canonicalPath)) {
      navigate(`${canonicalPath}${routerLocation.search}${routerLocation.hash}`, { replace: true });
    }
  }, [canonicalPath, routerLocation.pathname, routerLocation.search, routerLocation.hash, navigate]);
  const { toggleBookmark, isBookmarked } = useBookmarkStore();

  if (isLoading) {
    return <div className="flex-1 min-h-[60vh] flex items-center justify-center text-sm text-slate-500">Loading GeM bid details…</div>;
  }

  if (isError || !bid) {
    return (
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">GeM bid details unavailable</h1>
        <p className="text-sm text-slate-500">This bid could not be loaded. It may have been removed or the link may be out of date.</p>
        <Button onClick={() => navigate('/gem-tenders')}><ArrowLeft className="w-4 h-4 mr-2" />Back to GeM bids</Button>
      </div>
    );
  }

  const bidId = bid.sourceTenderId || '';
  const fallbackDocumentUrl = `https://bidplus.gem.gov.in/showbidDocument/${bidId.replace(/^GEM\/\d+\/[A-Z]\//i, '')}`;
  const officialDocumentUrl = bid.detailsUrl || bid.pdfUrls?.[0] || fallbackDocumentUrl;
  const downloadUrl = gemApi.getPdfDownloadUrl(bidId || bid._id, officialDocumentUrl);
  const parsed = parseGemDescription(bid.workDescription);
  const itemCategories = parsed.categories.length ? parsed.categories : [bid.productCategory].filter(Boolean);
  const rawConsignee = bid.rawDeliverySection || parsed.consignee;
  const consigneeRows = parseConsigneeRows(rawConsignee);
  const cleanedConsignee = cleanGemText(rawConsignee);
  const documentLinks = [...new Set([
    ...(bid.nitDocuments || []).map((document) => document.fileUrl),
    ...(bid.pdfUrls || []),
    bid.detailsUrl,
  ].filter(Boolean))];
  const bookmarked = isBookmarked(bid._id || bid.sourceTenderId);
  const checkedAt = bid.lastCheckedAt ? new Date(bid.lastCheckedAt) : null;
  // Matches the API's 26h listing freshness window.
  const isStale = !checkedAt || nowMs - checkedAt.getTime() > 26 * 3600000;
  const stateLabel = bid.consigneeStates?.length ? bid.consigneeStates.join(', ') : 'Not in a northern-state GeM list';
  const locationLabel = bid.location
    ? display(bid.location)
    : (bid.pdfParseStatus === 'COMPLETED' ? 'City not stated in bid document' : 'Bid document not read yet');

  const submitDataReport = async (event) => {
    event.preventDefault();
    try {
      await gemApi.reportIncorrectData(bidId, { field: reportField, displayedValue: reportField === 'location' ? (bid.location || '') : (reportField === 'officialState' ? (bid.officialState || bid.state || '') : String(bid[reportField] || '')), note: reportNote });
      setReportMessage('Thanks. Your report was recorded for review.');
      setReportNote('');
    } catch {
      setReportMessage('Could not submit the report. Please try again later.');
    }
  };

  const handleCopyBidId = async () => {
    try {
      await navigator.clipboard.writeText(bidId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="gem-detail-page flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-6 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        <Link to="/gem-tenders" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-dalBlue dark:hover:text-blue-400">
          <ArrowLeft className="w-4 h-4" /> Back to GeM Bids
        </Link>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  <Landmark className="w-3.5 h-3.5" /> Government e-Marketplace (GeM)
                </span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">{stateLabel}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${bid.gemStatus === 'ACTIVE' && !isStale ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>{isStale ? 'STALE / UNCONFIRMED' : (bid.gemStatus || 'UNKNOWN')}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-slate-900 dark:text-white">{display(bid.title, 'Untitled GeM bid')}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" />{display(bid.departmentName || bid.organisationChain)}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-techCoral" />{locationLabel}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold text-dalBlue dark:bg-slate-800 dark:text-blue-300">
                Bid Number: {bidId}
                <button type="button" onClick={handleCopyBidId} className="rounded p-1 hover:bg-white dark:hover:bg-slate-700" title="Copy GeM bid number" aria-label="Copy GeM bid number">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
              <button type="button" onClick={() => toggleBookmark(bid)} className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${bookmarked ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                <Heart className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />{bookmarked ? 'Saved Bid' : 'Save Bid'}
              </button>
              <a href="https://bidplus.gem.gov.in/all-bids" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-semibold text-dalBlue hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40">
                <ExternalLink className="w-4 h-4" /> Open GeM Portal
              </a>
              <a href={officialDocumentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-semibold text-dalBlue hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40">
                <FileText className="w-4 h-4" /> Official Bid Document
              </a>
              <a href={downloadUrl} download className="inline-flex items-center justify-center gap-2 rounded-lg bg-dalBlue px-4 py-2.5 text-sm font-semibold text-white hover:bg-dalBlue/90">
                <Download className="w-4 h-4" /> Download Bid Document
              </a>
              <button type="button" onClick={() => navigate(`/services?tenderId=${encodeURIComponent(bidId)}`)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Sparkles className="w-4 h-4" /> Analyze with AI
              </button>
            </div>
          </div>
        </section>

        {/* Important dates — horizontal timeline */}
        <Tile tone="light" order={0} className="ai-tile--full mb-2">
          <p className="ai-tile-kicker">Important dates</p>
          <ol className="ai-timeline filter-scrollbar">
            {[
              { label: 'Published', raw: bid.publishedDate || bid.publishedDateOnly, str: bid.publishedDateStr },
              { label: 'Download Start', raw: bid.documentDownloadStartDate, str: bid.documentDownloadStartDateStr, optional: true },
              { label: 'Download End', raw: bid.documentDownloadEndDate, str: bid.documentDownloadEndDateStr, optional: true },
              { label: 'Bid Closing', raw: bid.closingDate, str: bid.closingDateStr, tone: 'is-end' },
              { label: 'Bid Opening', raw: bid.bidOpeningDate, str: bid.bidOpeningDateStr, tone: 'is-open' },
            ]
              .filter((d) => !d.optional || d.str || d.raw)
              .map((d) => {
                const value = d.str || d.raw;
                const formatted = value ? formatDateTimeDisplay(value) : 'N/A';
                const [datePart, timePart] = formatted === 'N/A' ? ['Not specified'] : formatted.split(', ');
                const when = d.raw ? new Date(d.raw?.$date || d.raw) : null;
                const passed = when && !isNaN(when.getTime()) && when.getTime() <= nowMs;
                return (
                  <li key={d.label} className={`ai-timeline-item ${d.tone || ''} ${passed ? 'is-passed' : ''}`}>
                    <span className="ai-timeline-label">{d.label}</span>
                    <span className="ai-timeline-dot" aria-hidden="true" />
                    <span className="ai-timeline-date">{datePart}</span>
                    {timePart && <span className="ai-timeline-time">{timePart}</span>}
                  </li>
                );
              })}
          </ol>
        </Tile>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div className="lg:col-span-2 space-y-2">
            <Tile tone="light" order={0}>
              <p className="ai-tile-kicker">Bid details</p>
              <dl className="ai-fields">
                <Field label="Issuing Department">{display(bid.departmentName)}</Field>
                <Field label="Organisation Chain">{display(bid.organisationChain)}</Field>
                <Field label="Bid Number"><span className="font-mono">{display(bidId)}</span></Field>
                <Field label="Contract Type">{display(bid.formOfContract, 'Standard GeM Contract')}</Field>
                <Field label="Product Category">{display(bid.productCategory)}</Field>
                <Field label="Buyer ministry / state (GeM PDF)">{display(bid.officialState, bid.pdfParseStatus === 'COMPLETED' ? 'Not stated' : 'Bid document not read yet')}</Field>
                <Field label="Delivery state (GeM consignee search)">{stateLabel}</Field>
                <Field label="GeM status evidence">{display(bid.gemStatus, 'UNKNOWN')}</Field>
                <Field label="Bid Validity">{bid.bidValidityDays ? `${bid.bidValidityDays} days` : 'Not specified'}</Field>
              </dl>
            </Tile>

            <Tile tone="blue" order={1}>
              <div className="ai-tile-head">
                <p className="ai-tile-kicker">Items & specifications</p>
                {parsed.quantity && <span className="ai-tag"><span className="font-mono">Total Qty: {parsed.quantity}</span></span>}
              </div>
              {itemCategories.length > 0 && (
                <div className="ai-chip-list">
                  {itemCategories.map((item, index) => <span key={`${item}-${index}`}>{display(item)}</span>)}
                </div>
              )}
              {(bid.rawDeliverySection || parsed.consignee || parsed.stations) && (
                <dl className="ai-fields">
                  {consigneeRows.length > 0 ? (
                    <Field label="Consignees & delivery" wide>
                      <div className="gem-consignee-table-wrap">
                        <table className="gem-consignee-table">
                          <thead>
                            <tr><th>Item</th><th>Delivery address</th><th className="num">Qty</th><th className="num">Delivery days</th></tr>
                          </thead>
                          <tbody>
                            {consigneeRows.map((row, index) => (
                              <tr key={`${row.serial}-${row.address}-${index}`}>
                                <td>{row.item || (index === 0 && itemCategories[0]) || `Item ${index + 1}`}</td>
                                <td>{row.address}</td>
                                <td className="num">{row.quantity}</td>
                                <td className="num">{row.days}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Field>
                  ) : (cleanedConsignee && <Field label="Consignee / delivery details" wide>{cleanedConsignee}</Field>)}
                  {(bid.deliveryStations?.length || parsed.stations) && <Field label="Recognized delivery stations">{display(bid.deliveryStations?.join(', ') || parsed.stations)}</Field>}
                </dl>
              )}
              {parsed.raw && <div className="ai-tile-raw">{parsed.raw}</div>}
            </Tile>

            {documentLinks.length > 0 && (
              <Tile tone="light" order={2}>
                <h2 className="ai-tile-heading">Bid documents</h2>
                <div className="ai-link-rows">
                  {documentLinks.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <span>Official GeM document {index + 1}</span>
                      <ExternalLink className="w-4 h-4 shrink-0" />
                    </a>
                  ))}
                </div>
              </Tile>
            )}
          </div>

          <aside className="space-y-2">
            <Tile tone="dark" order={3}>
              <p className="ai-tile-kicker">Fee & EMD</p>
              <dl className="ai-fields">
                <Field label="EMD Deposit" big wide>{bid.emdAmount === null || bid.emdAmount === undefined ? 'Not confirmed' : (bid.emdAmount > 0 ? formatCurrencyINR(bid.emdAmount) : 'Exempted / Zero')}</Field>
                <Field label="Tender Fee" big wide>{bid.tenderFee > 0 ? formatCurrencyINR(bid.tenderFee) : 'Not specified / Zero'}</Field>
                <Field label="Fee Payable To">{display(bid.feePayableTo)}</Field>
                <Field label="Fee Payable At">{display(bid.feePayableAt)}</Field>
                <Field label="EMD Payable To">{display(bid.emdPayableTo)}</Field>
                <Field label="EMD Payable At">{display(bid.emdPayableAt)}</Field>
              </dl>
            </Tile>

            <Tile tone="blue" order={5}>
              <p className="ai-tile-kicker">Delivery location</p>
              <p className="ai-tile-big ai-tile-big--sm">{locationLabel}</p>
              <p className="ai-tile-note"><span>Delivery state (GeM consignee search)</span>{stateLabel}</p>
              <p className="ai-tile-note">Per official GeM document, fetched {formatDateTimeIST(bid.gemPdfFetchedAt)} · Last checked {formatDateTimeIST(bid.lastCheckedAt)}{isStale ? ' · Stale' : ''}</p>
              <p className="ai-tile-note">Status: {bid.gemStatus === 'NOT_LISTED' ? 'No longer listed on GeM (closed, cancelled or withdrawn)' : (bid.gemStatus || 'UNKNOWN')}</p>
            </Tile>

            <Tile tone="light" order={6}>
              <p className="ai-tile-kicker">Report incorrect data</p>
              <form className="space-y-2" onSubmit={submitDataReport}>
                <select aria-label="Field to report" value={reportField} onChange={(event) => setReportField(event.target.value)} className="w-full rounded border p-2 text-sm">
                  <option value="officialState">Official state</option><option value="location">Delivery location</option><option value="departmentName">Department</option><option value="title">Title</option><option value="closingDate">Closing date</option><option value="status">Status</option><option value="other">Other</option>
                </select>
                <textarea aria-label="Report note" value={reportNote} onChange={(event) => setReportNote(event.target.value)} maxLength={1000} rows={3} placeholder="What looks incorrect? (optional)" className="w-full rounded border p-2 text-sm" />
                <Button type="submit">Submit report</Button>
                {reportMessage && <p role="status" className="text-xs text-slate-600">{reportMessage}</p>}
              </form>
            </Tile>
          </aside>
        </div>

        {/* Related open bids: internal links for visitors and crawlers */}
        <SimilarTenders tender={bid} isClosed={Boolean(bid.closingDate && new Date(bid.closingDate).getTime() < nowMs)} />
      </div>
    </div>
  );
}
