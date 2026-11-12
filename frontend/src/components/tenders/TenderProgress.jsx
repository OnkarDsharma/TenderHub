/**
 * @file frontend/src/components/tenders/TenderProgress.jsx
 * @description Post-closing progress of a tender, scraped daily from the portal's "Tenders Status" page:
 * stage timeline (bid opening → evaluation → AOC), bid result / evaluation documents, and the stage
 * summary text. Rendered on the tender detail page once bidding has closed.
 */
import { useState } from 'react';
import { FileText, FileSpreadsheet, Eye, Download, ChevronDown, Ban, Award, Hourglass } from 'lucide-react';
import { Tile } from '@/components/shared/BentoTile';
import { api } from '@/services/api';
import { formatDateTimeDisplay } from '@/utils/formatters';

// Portals the daily status scraper covers; elsewhere an unchecked tender just shows nothing.
const TRACKED_PORTALS = new Set(['JK_TENDERS']);

const SOURCE_LABELS = {
  STAGE_SUMMARY: 'Stage summary',
  STAGE_PAGE: 'Stage details',
  EMBEDDED_IN_PDF: 'Attached inside',
  LINKED_IN_PDF: 'Linked from',
};

const isCancelledStage = (stage) => /cancel|retender/i.test(stage || '');
const isSpreadsheet = (name) => /\.(xlsx?|csv)$/i.test(name || '');

const formatSize = (kb) => {
  if (!kb) return null;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
};

function StageTimeline({ stages }) {
  // The first stage not yet done is where the tender currently is.
  const currentIndex = stages.findIndex((s) => !s.completed);
  return (
    <ol className="ai-timeline filter-scrollbar">
      {stages.map((stage, i) => {
        const done = stage.completed;
        const current = i === currentIndex;
        return (
          <li
            key={`${stage.process}-${stage.name}-${i}`}
            className={`ai-timeline-item ${done ? 'is-start is-passed' : current ? 'is-open' : ''}`}
          >
            <span className="ai-timeline-label" title={stage.name}>{stage.name}</span>
            <span className="ai-timeline-dot" aria-hidden="true" />
            <span className="ai-timeline-date">
              {done ? 'Completed' : current ? 'In progress' : 'Pending'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatusDocuments({ tenderId, documents }) {
  const base = `${api.defaults.baseURL}/tenders/${tenderId}/documents/status`;
  return (
    <div className="space-y-2">
      {documents.map((doc, index) => {
        const name = doc.documentName || `status-document-${index + 1}`;
        const sheet = isSpreadsheet(name);
        const Icon = sheet ? FileSpreadsheet : FileText;
        const size = formatSize(doc.documentSizeKb);
        const origin = doc.parentDocument
          ? `${SOURCE_LABELS[doc.source] || 'From'} ${doc.parentDocument}`
          : SOURCE_LABELS[doc.source] || 'Portal document';
        return (
          <div
            key={`${name}-${index}`}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/60 hover:border-dalBlue dark:hover:border-blue-500 transition-all"
          >
            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${sheet
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/50'
                : 'bg-red-50 dark:bg-red-950/50 text-chinarRed border-red-200/80 dark:border-red-900/50'}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate" title={name}>{name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {origin}
                  {size && <span className="ml-1.5 font-mono text-slate-400">• {size}</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
              <a
                href={`${base}/${index}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-dalBlue hover:bg-dalBlue/90 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs transition-all cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View</span>
              </a>
              {sheet && (
                <a
                  href={`${base}/${index}?format=csv`}
                  className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  title="Download as CSV"
                >
                  CSV
                </a>
              )}
              <a
                href={`${base}/${index}?download=1`}
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageDetail({ detail, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
      >
        <span className="truncate">{detail.stage || 'Stage details'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <pre className="px-3.5 pb-3.5 max-h-96 overflow-auto filter-scrollbar whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {detail.content}
        </pre>
      )}
    </div>
  );
}

export function TenderProgress({ tender, nowMs }) {
  const info = tender?.tenderStatusInfo;
  const closesRaw = tender?.bidSubmissionEndDate || tender?.closingDate;
  const closedAt = closesRaw ? new Date(closesRaw?.$date || closesRaw).getTime() : NaN;
  const isClosed = !Number.isNaN(closedAt) && closedAt < nowMs;
  if (!isClosed) return null;

  const stages = info?.stages || [];
  const documents = info?.documents || [];
  const details = (info?.stageDetails || []).filter((d) => d?.content?.trim());
  const hasData = stages.length > 0 || documents.length > 0 || details.length > 0;

  // Not on the portal's status page (e.g. withdrawn listing) or a portal we don't track: nothing to show.
  if (!hasData && (info?.fetchStatus === 'NOT_FOUND' || !TRACKED_PORTALS.has(tender.sourcePortal))) return null;

  if (!hasData) {
    return (
      <Tile tone="light" order={0} className="ai-tile--full mb-2">
        <div className="ai-tile-head">
          <p className="ai-tile-kicker">Tender progress</p>
        </div>
        <div className="mt-3 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
          <Hourglass className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            Bidding has closed. Bid opening results, evaluation stages and the award will appear here
            once the department publishes them on the portal.
          </p>
        </div>
      </Tile>
    );
  }

  const cancelled = isCancelledStage(info.currentStage);
  const awarded = Boolean(info.isAocDone);

  return (
    <Tile tone="light" order={0} className="ai-tile--full mb-2">
      <div className="ai-tile-head">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="ai-tile-kicker">Tender progress</p>
          {awarded ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <Award className="w-3 h-3" /> Contract awarded
            </span>
          ) : cancelled ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <Ban className="w-3 h-3" /> {info.currentStage}
            </span>
          ) : info.currentStage ? (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-dalBlue dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {info.currentStage.replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
        {info.checkedAt && (
          <p className="ai-tile-sub">Last checked on portal: {formatDateTimeDisplay(info.checkedAt)}</p>
        )}
      </div>

      {cancelled && (
        <div className="mt-3 flex items-start gap-2.5 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
          <Ban className="w-4 h-4 shrink-0 mt-0.5" />
          <p>The department marked this tender as <strong>{info.currentStage}</strong> on the portal. See the documents below for the reason.</p>
        </div>
      )}

      {stages.length > 0 && <StageTimeline stages={stages} />}

      {documents.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <span>Bid results &amp; evaluation documents ({documents.length})</span>
          </div>
          <StatusDocuments tenderId={tender._id} documents={documents} />
        </div>
      )}

      {details.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Stage summary details</p>
          {details.map((detail, i) => (
            <StageDetail key={`${detail.stage}-${i}`} detail={detail} defaultOpen={false} />
          ))}
        </div>
      )}
    </Tile>
  );
}
