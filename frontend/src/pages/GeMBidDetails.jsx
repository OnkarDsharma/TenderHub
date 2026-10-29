import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Check,
  Copy,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  Package,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useTender } from '@/hooks/useTenders';
import { gemApi } from '@/services/gemApi';
import { formatCurrencyINR, formatDateDisplay } from '@/utils/formatters';
import { Button } from '@/components/ui/Button';

const display = (value, fallback = 'Not specified') => {
  const cleaned = String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
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

const InfoCard = ({ label, children, icon: Icon }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {Icon && <Icon className="w-4 h-4 text-dalBlue dark:text-blue-400" />}
      {label}
    </div>
    <div className="text-sm text-slate-800 dark:text-slate-200 break-words">{children}</div>
  </div>
);

const DateCard = ({ label, value, tone = 'normal', icon: Icon = Calendar }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2">
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <Icon className={`w-4 h-4 ${tone === 'urgent' ? 'text-amber-500' : tone === 'complete' ? 'text-emerald-500' : ''}`} />
      {label}
    </div>
    <div className={`font-mono text-sm font-bold ${tone === 'urgent' ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
      {formatDateDisplay(value) || 'Not specified'}
    </div>
  </div>
);

export default function GeMBidDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const { data: bid, isLoading, isError } = useTender(id);

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
  const documentLinks = [...new Set([
    ...(bid.nitDocuments || []).map((document) => document.fileUrl),
    ...(bid.pdfUrls || []),
    bid.detailsUrl,
  ].filter(Boolean))];

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
    <div className="flex-1 w-full bg-slate-50/60 dark:bg-slate-950/60 py-6 sm:py-8">
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
                {bid.state && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">{bid.state}</span>}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${bid.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{bid.status || 'GeM Bid'}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-slate-900 dark:text-white">{display(bid.title, 'Untitled GeM bid')}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" />{display(bid.departmentName || bid.organisationChain)}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-techCoral" />{display(bid.location)}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs font-bold text-dalBlue dark:bg-slate-800 dark:text-blue-300">
                Bid Number: {bidId}
                <button type="button" onClick={handleCopyBidId} className="rounded p-1 hover:bg-white dark:hover:bg-slate-700" title="Copy GeM bid number" aria-label="Copy GeM bid number">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><FileText className="w-5 h-5 text-dalBlue" /> Bid Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoCard label="Issuing Department" icon={Building2}>{display(bid.departmentName)}</InfoCard>
                <InfoCard label="Organisation Chain" icon={Landmark}>{display(bid.organisationChain)}</InfoCard>
                <InfoCard label="Bid Number">{display(bidId)}</InfoCard>
                <InfoCard label="Contract Type">{display(bid.formOfContract, 'Standard GeM Contract')}</InfoCard>
                <InfoCard label="Product Category" icon={Package}>{display(bid.productCategory)}</InfoCard>
                <InfoCard label="State / Consignee Region" icon={MapPin}>{display(bid.state || parsed.consignee)}</InfoCard>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Package className="w-5 h-5 text-dalBlue" /> Items & Specifications</h2>
                {parsed.quantity && <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Total Qty: {parsed.quantity}</span>}
              </div>
              {itemCategories.length > 0 && <div className="flex flex-wrap gap-2">{itemCategories.map((item, index) => <span key={`${item}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{display(item)}</span>)}</div>}
              {(parsed.consignee || parsed.stations || parsed.raw) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                {parsed.consignee && <InfoCard label="Consignee Address">{parsed.consignee}</InfoCard>}
                {parsed.stations && <InfoCard label="Delivery Stations">{parsed.stations}</InfoCard>}
                {parsed.raw && <div className="sm:col-span-2 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 whitespace-pre-wrap">{parsed.raw}</div>}
              </div>}
            </section>

            {documentLinks.length > 0 && <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><FileText className="w-5 h-5 text-dalBlue" /> Bid Documents</h2>
              {documentLinks.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold text-dalBlue hover:bg-blue-50 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-slate-800"><span>Official GeM document {index + 1}</span><ExternalLink className="w-4 h-4 shrink-0" /></a>)}
            </section>}
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Wallet className="w-5 h-5 text-dalBlue" /> Fee & EMD</h2>
              <InfoCard label="EMD Deposit">{bid.emdAmount > 0 ? formatCurrencyINR(bid.emdAmount) : 'Exempted / Zero'}</InfoCard>
              <InfoCard label="Tender Fee">{bid.tenderFee > 0 ? formatCurrencyINR(bid.tenderFee) : 'Not specified / Zero'}</InfoCard>
              <InfoCard label="Fee Payable At">{display(bid.feePayableAt)}</InfoCard>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Important Dates</h2>
              <DateCard label="Published" value={bid.publishedDateStr || bid.publishedDate || bid.publishedDateOnly} />
              <DateCard label="Bid Closing" value={bid.closingDateStr || bid.closingDate} tone="urgent" icon={Clock} />
              <DateCard label="Bid Opening" value={bid.bidOpeningDateStr || bid.bidOpeningDate} tone="complete" icon={CheckCircle2} />
              {(bid.documentDownloadStartDate || bid.documentDownloadStartDateStr) && <DateCard label="Document Download Starts" value={bid.documentDownloadStartDateStr || bid.documentDownloadStartDate} />}
              {(bid.documentDownloadEndDate || bid.documentDownloadEndDateStr) && <DateCard label="Document Download Ends" value={bid.documentDownloadEndDateStr || bid.documentDownloadEndDate} />}
            </section>

            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20 p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-dalBlue dark:text-blue-300"><MapPin className="w-4 h-4" /> Delivery Location</h2>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{display(bid.location, 'Location not specified')}</p>
              {bid.state && <p className="text-xs text-slate-500 dark:text-slate-400">Filtered state: {bid.state}</p>}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
