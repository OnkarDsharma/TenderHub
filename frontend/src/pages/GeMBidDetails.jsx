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
import { Section, SheetGroup, Fields, Field, Chip } from '@/components/tenders/detail/TenderDetailUI';
import { CriticalDatesTrack } from '@/components/tenders/detail/CriticalDatesTrack';
import { BidBar, ScrollSentinel } from '@/components/tenders/detail/BidBar';
import { toDate, relativeDays } from '@/components/tenders/detail/detailFormat';
import '@/components/tenders/detail/tender-details.css';
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
  const [showBidBar, setShowBidBar] = useState(false);
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

  // Important dates, in the shape the shared time-scaled track expects.
  const criticalDates = [
    { label: 'Published', raw: bid.publishedDate || bid.publishedDateOnly, str: bid.publishedDateStr },
    { label: 'Download Start', raw: bid.documentDownloadStartDate, str: bid.documentDownloadStartDateStr, optional: true },
    { label: 'Download End', raw: bid.documentDownloadEndDate, str: bid.documentDownloadEndDateStr, optional: true },
    { label: 'Bid Closing', raw: bid.closingDate, str: bid.closingDateStr },
    { label: 'Bid Opening', raw: bid.bidOpeningDate, str: bid.bidOpeningDateStr },
  ]
    .filter((d) => !d.optional || d.str || d.raw)
    .map((d) => {
      const value = d.str || d.raw;
      const formatted = value ? formatDateTimeDisplay(value) : 'N/A';
      const [datePart, timePart] = formatted === 'N/A' ? ['Not specified'] : formatted.split(', ');
      const when = toDate(d.raw);
      return { ...d, datePart, timePart, when, passed: Boolean(when && when.getTime() <= nowMs) };
    });
  // Next milestone = earliest upcoming one; on a tie the later one in the list wins.
  const nextIndex = criticalDates.reduce((best, d, i) => {
    if (!d.when || d.passed) return best;
    if (best < 0) return i;
    return d.when.getTime() <= criticalDates[best].when.getTime() ? i : best;
  }, -1);
  const nextDate = nextIndex >= 0 ? criticalDates[nextIndex] : null;
  const closing = criticalDates.find((d) => d.label === 'Bid Closing');
  const bidClosed = Boolean(closing?.passed);
  const timeToClose = closing?.when ? (bidClosed ? 'Closed' : relativeDays(closing.when, nowMs)) : 'N/A';

  const emdText = bid.emdAmount === null || bid.emdAmount === undefined ? 'Not confirmed' : (bid.emdAmount > 0 ? formatCurrencyINR(bid.emdAmount) : 'Exempted / Zero');
  const feeText = bid.tenderFee > 0 ? formatCurrencyINR(bid.tenderFee) : 'Not specified / Zero';
  const statusText = isStale ? 'STALE / UNCONFIRMED' : (bid.gemStatus || 'UNKNOWN');
  const statusFresh = bid.gemStatus === 'ACTIVE' && !isStale;

  return (
    <div className="td-page flex-1 w-full min-h-screen py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <BidBar
        show={showBidBar}
        idLabel="Bid Number"
        tenderId={bidId}
        emd={emdText}
        timeToClose={timeToClose}
        closed={bidClosed || !closing?.when}
        bookmarked={bookmarked}
        onSave={() => toggleBookmark(bid)}
        saveLabel="Save Bid"
        savedLabel="Saved Bid"
      />

      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        <Link to="/gem-tenders" className="td-back">
          <ArrowLeft className="w-4 h-4" /> Back to GeM Bids
        </Link>

        {/* ── Header: straight on the page ───────────────────────────── */}
        <header>
          <div className="td-head">
            <div className="min-w-0">
              <div className="td-head-chips">
                <Chip tone={statusFresh ? 'cobalt' : 'neutral'} className="td-chip--status">{statusText}</Chip>
                <Chip><Landmark /> Government e-Marketplace (GeM)</Chip>
                <Chip>{stateLabel}</Chip>
              </div>

              <h1 className="td-title">{display(bid.title, 'Untitled GeM bid')}</h1>

              <div className="td-head-meta">
                <span><Building2 />{display(bid.departmentName || bid.organisationChain)}</span>
                <span><MapPin />{locationLabel}</span>
              </div>

              <div className="td-bidno">
                <Chip tone="code"><b>Bid Number:</b>{bidId}</Chip>
                <button type="button" onClick={handleCopyBidId} className="td-btn td-btn--quiet td-btn--icon" title="Copy GeM bid number" aria-label="Copy GeM bid number">
                  {copied ? <Check style={{ color: 'var(--td-green)' }} /> : <Copy />}
                </button>
              </div>
            </div>

            <div className="td-actions">
              <button
                type="button"
                onClick={() => toggleBookmark(bid)}
                aria-pressed={bookmarked}
                className={`td-btn ${bookmarked ? 'td-btn--saved' : 'td-btn--primary'}`}
              >
                <Heart className={bookmarked ? 'fill-current' : ''} />
                {bookmarked ? 'Saved Bid' : 'Save Bid'}
              </button>
              <a href={downloadUrl} download className="td-btn td-btn--quiet">
                <Download /> Download Bid Document
              </a>
              <a href={officialDocumentUrl} target="_blank" rel="noopener noreferrer" className="td-btn td-btn--quiet">
                <FileText /> Official Bid Document
              </a>
              <a href="https://bidplus.gem.gov.in/all-bids" target="_blank" rel="noopener noreferrer" className="td-btn td-btn--quiet">
                Open GeM Portal <ExternalLink />
              </a>
              <button type="button" onClick={() => navigate(`/services?tenderId=${encodeURIComponent(bidId)}`)} className="td-btn td-btn--quiet">
                <Sparkles /> Analyze with AI
              </button>
            </div>
          </div>

          {/* Key figures: EMD and deadline wide, validity and time-to-close narrow */}
          <dl className="td-figures">
            <div className="td-figure td-figure--wide">
              <dt>EMD Deposit</dt>
              <dd>{emdText}</dd>
              <dd className="td-figure-sub">Tender Fee {feeText}</dd>
            </div>
            <div className="td-figure">
              <dt>Bid Validity</dt>
              <dd>{bid.bidValidityDays ? `${bid.bidValidityDays} days` : 'Not specified'}</dd>
            </div>
            <div className={`td-figure td-figure--wide ${bidClosed || !closing?.when ? '' : 'td-figure--deadline'}`}>
              <dt>Bid Closing</dt>
              <dd>{closing?.datePart || 'Not specified'}</dd>
              {closing?.timePart && <dd className="td-figure-sub">{closing.timePart}</dd>}
            </div>
            <div className="td-figure">
              <dt>Time to close</dt>
              <dd>{timeToClose}</dd>
              {closing?.when && bidClosed && <dd className="td-figure-sub">{relativeDays(closing.when, nowMs)}</dd>}
              {!bidClosed && nextDate && <dd className="td-figure-sub">Next: {nextDate.label}</dd>}
            </div>
          </dl>
          <ScrollSentinel onChange={setShowBidBar} />
        </header>

        {/* ── Important dates ────────────────────────────────────────── */}
        <Section
          id="important-dates"
          title="Important dates"
          action={nextDate && (
            <span className="td-next">
              Next: <strong>{nextDate.label}</strong>
              <span className="td-tnum">{nextDate.datePart}{nextDate.timePart ? `, ${nextDate.timePart}` : ''}</span>
              <em>{relativeDays(nextDate.when, nowMs)}</em>
            </span>
          )}
        >
          <CriticalDatesTrack dates={criticalDates} nowMs={nowMs} />
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Main column ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6 min-w-0">

            <Section id="bid-details" title="Bid details">
              <SheetGroup title="Identification">
                <Fields>
                  <Field label="Issuing Department" value={display(bid.departmentName)} />
                  <Field label="Organisation Chain" value={display(bid.organisationChain)} />
                  <Field label="Bid Number" value={display(bidId)} mono />
                  <Field label="Contract Type" value={display(bid.formOfContract, 'Standard GeM Contract')} />
                  <Field wide label="Product Category" value={display(bid.productCategory)} />
                </Fields>
              </SheetGroup>
              <SheetGroup title="Buyer & delivery">
                <Fields>
                  <Field label="Buyer ministry / state (GeM PDF)" value={display(bid.officialState, bid.pdfParseStatus === 'COMPLETED' ? 'Not stated' : 'Bid document not read yet')} />
                  <Field label="Delivery state (GeM consignee search)" value={stateLabel} />
                </Fields>
              </SheetGroup>
              <SheetGroup title="Status & validity">
                <Fields>
                  <Field label="GeM status evidence" value={display(bid.gemStatus, 'UNKNOWN')} />
                  <Field label="Bid Validity" value={bid.bidValidityDays ? `${bid.bidValidityDays} days` : 'Not specified'} />
                </Fields>
              </SheetGroup>
            </Section>

            <Section
              id="items"
              title="Items & specifications"
              action={parsed.quantity && <Chip tone="code"><b>Total Qty:</b>{parsed.quantity}</Chip>}
            >
              {itemCategories.length > 0 && (
                <ul className="td-tags">
                  {itemCategories.map((item, index) => <li key={`${item}-${index}`}>{display(item)}</li>)}
                </ul>
              )}
              {(bid.rawDeliverySection || parsed.consignee || parsed.stations) && (
                <Fields>
                  {consigneeRows.length > 0 ? (
                    <Field label="Consignees & delivery" wide>
                      <table className="td-table td-consignees">
                        <thead>
                          <tr><th>Item</th><th>Delivery address</th><th className="td-c-qty">Qty</th><th className="td-c-qty">Delivery days</th></tr>
                        </thead>
                        <tbody>
                          {consigneeRows.map((row, index) => (
                            <tr key={`${row.serial}-${row.address}-${index}`}>
                              <td data-label="Item" style={{ fontWeight: 600 }}>{row.item || (index === 0 && itemCategories[0]) || `Item ${index + 1}`}</td>
                              <td data-label="Delivery address">{row.address}</td>
                              <td data-label="Qty" className="td-c-qty">{row.quantity}</td>
                              <td data-label="Delivery days" className="td-c-qty">{row.days}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Field>
                  ) : (cleanedConsignee && <Field label="Consignee / delivery details" wide value={cleanedConsignee} variant="prose" />)}
                  {(bid.deliveryStations?.length || parsed.stations) && <Field wide label="Recognized delivery stations" value={display(bid.deliveryStations?.join(', ') || parsed.stations)} />}
                </Fields>
              )}
              {parsed.raw && <div className="td-raw">{parsed.raw}</div>}
            </Section>

            <Section id="delivery-location" title="Delivery location">
              <div className="td-place">
                <div className="min-w-0">
                  <p className="td-place-site"><MapPin aria-hidden="true" />{locationLabel}</p>
                </div>
                <div className="min-w-0">
                  <dl className="td-facts td-facts--2">
                    <div><dt>Delivery state (GeM consignee search)</dt><dd>{stateLabel}</dd></div>
                    <div><dt>Status</dt><dd>{bid.gemStatus === 'NOT_LISTED' ? 'No longer listed on GeM (closed, cancelled or withdrawn)' : (bid.gemStatus || 'UNKNOWN')}</dd></div>
                  </dl>
                  <p className="td-provenance">
                    Per official GeM document, fetched {formatDateTimeIST(bid.gemPdfFetchedAt)} · Last checked {formatDateTimeIST(bid.lastCheckedAt)}
                    {isStale && <> · <strong>Stale</strong></>}
                  </p>
                </div>
              </div>
            </Section>

            {documentLinks.length > 0 && (
              <Section id="documents" title="Bid documents" action={<Chip tone="cobalt">{documentLinks.length} {documentLinks.length === 1 ? 'file' : 'files'}</Chip>}>
                <ul className="td-links">
                  {documentLinks.map((url, index) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <span className="td-file"><FileText aria-hidden="true" /><span className="td-file-name is-strong">Official GeM document {index + 1}</span></span>
                        <ExternalLink className="td-links-go" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          {/* ── Right rail: payment slip + report ─────────────────────── */}
          <aside className="min-w-0 space-y-6">
            <section id="fees" aria-labelledby="fees-heading" className="td-slip">
              <h2 id="fees-heading" className="td-slip-title">Fee &amp; EMD</h2>

              <div className="td-slip-item">
                <div className="td-slip-line">
                  <span className="td-slip-name">EMD Deposit</span>
                  <span className={`td-slip-amount ${bid.emdAmount > 0 ? '' : 'td-slip-amount--text'}`}>{emdText}</span>
                </div>
                <dl className="td-slip-sub">
                  <div><dt>EMD Payable To</dt><dd>{display(bid.emdPayableTo)}</dd></div>
                  <div><dt>EMD Payable At</dt><dd>{display(bid.emdPayableAt)}</dd></div>
                </dl>
              </div>
              <hr className="td-slip-cut" />
              <div className="td-slip-item td-slip-item--last">
                <div className="td-slip-line">
                  <span className="td-slip-name">Tender Fee</span>
                  <span className={`td-slip-amount ${bid.tenderFee > 0 ? '' : 'td-slip-amount--text'}`}>{feeText}</span>
                </div>
                <dl className="td-slip-sub">
                  <div><dt>Fee Payable To</dt><dd>{display(bid.feePayableTo)}</dd></div>
                  <div><dt>Fee Payable At</dt><dd>{display(bid.feePayableAt)}</dd></div>
                </dl>
              </div>
            </section>

            <Section id="report" title="Report incorrect data">
              <form className="td-form" onSubmit={submitDataReport}>
                <select aria-label="Field to report" value={reportField} onChange={(event) => setReportField(event.target.value)} className="td-input">
                  <option value="officialState">Official state</option><option value="location">Delivery location</option><option value="departmentName">Department</option><option value="title">Title</option><option value="closingDate">Closing date</option><option value="status">Status</option><option value="other">Other</option>
                </select>
                <textarea aria-label="Report note" value={reportNote} onChange={(event) => setReportNote(event.target.value)} maxLength={1000} rows={3} placeholder="What looks incorrect? (optional)" className="td-input" />
                <button type="submit" className="td-btn td-btn--quiet">Submit report</button>
                {reportMessage && <p role="status" className="td-panel-desc">{reportMessage}</p>}
              </form>
            </Section>
          </aside>
        </div>

        {/* Related open bids: internal links for visitors and crawlers */}
        <SimilarTenders tender={bid} isClosed={Boolean(bid.closingDate && new Date(bid.closingDate).getTime() < nowMs)} />
      </div>
    </div>
  );
}
