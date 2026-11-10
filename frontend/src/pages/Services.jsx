/**
 * @file frontend/src/pages/Services.jsx
 * @description Dedicated AI Services section offering personalized contractor tender analysis,
 * BOQ raw material extraction, post-award execution schedules, and interactive Copilot.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Building2,
  RefreshCw,
  Search,
  Sliders,
  ArrowUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { servicesApi } from '../services/servicesApi';
import { api } from '../services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/useAuthStore';
import { CopilotComposer } from '@/components/services/CopilotComposer';
import { Tile } from '@/components/shared/BentoTile';

function renderCopilotText(content) {
  const parts = String(content || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-slate-200/70 dark:bg-slate-800 px-1 py-0.5 font-mono text-[0.95em]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function formatBoqEstimate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `₹${value.toLocaleString('en-IN')}`;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '—';
}

function parseSummaryBullets(text) {
  if (!text) return [];
  if (Array.isArray(text)) return text.filter(Boolean);
  if (typeof text !== 'string') return [String(text)];

  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Check if contains bullet symbols (•, -, *, etc.)
  if (/[•\-\*]/.test(trimmed)) {
    const cleaned = trimmed.replace(/^[•\-\*]\s*/, '');
    const points = cleaned
      .split(/(?:\r?\n\s*|\s+)[•\-\*]\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (points.length > 0) return points;
  }

  // 2. Check if numbered list (e.g. 1. or 1))
  if (/^\d+[\.\)]\s+/.test(trimmed) || /(?:\r?\n|\s+)\d+[\.\)]\s+/.test(trimmed)) {
    const cleaned = trimmed.replace(/^\d+[\.\)]\s*/, '');
    const points = cleaned
      .split(/(?:\r?\n\s*|\s+)\d+[\.\)]\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (points.length > 0) return points;
  }

  // 3. Check for multiple newlines
  if (trimmed.includes('\n')) {
    const lines = trimmed
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) return lines;
  }

  return [trimmed];
}

function renderSummaryBullets(summaryText, listClassName = 'space-y-2.5') {
  const points = parseSummaryBullets(summaryText);
  if (!points || points.length === 0) return null;

  return (
    <ul className={listClassName}>
      {points.map((point, index) => {
        const boldPrefixMatch = point.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
        const colonMatch = !boldPrefixMatch && point.match(/^([A-Za-z0-9\s&/()-]{2,35}):\s+(.+)$/);

        let title = null;
        let body = point;

        if (boldPrefixMatch) {
          title = boldPrefixMatch[1] + ':';
          body = boldPrefixMatch[2];
        } else if (colonMatch) {
          title = colonMatch[1] + ':';
          body = colonMatch[2];
        }

        return (
          <li key={index} className="flex items-start gap-2.5 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-dalBlue dark:bg-blue-400 mt-2 shrink-0" />
            <span className="flex-1">
              {title ? (
                <>
                  <strong className="font-semibold text-slate-800 dark:text-slate-100">{title} </strong>
                  {renderCopilotText(body)}
                </>
              ) : (
                renderCopilotText(body)
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const FIT_STATUS = {
  PASS: { label: 'Meets requirement', tone: 'is-good' },
  FAIL: { label: 'Not met', tone: 'is-high' },
  CONFIRM: { label: 'Confirm before bidding', tone: 'is-warn' },
  NOT_REQUIRED: { label: 'Not required by this tender', tone: 'is-low' },
  NOT_ASSESSED: { label: 'Not assessed', tone: 'is-low' },
};
const crore = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;

/** Rows for the eligibility tile, from the fit computed against the tender's own thresholds. */
function eligibilityRows(fit) {
  if (!fit) return [];
  const money = (check, label) => check && ({
    label,
    status: check.status || (check.passed ? 'PASS' : 'FAIL'),
    value: check.contractor ? crore(check.contractor) : 'Not in profile',
    requirement: check.required ? `Required ${crore(check.required)}` : null,
  });
  const rows = [
    fit.classCheck && {
      label: 'Registration',
      status: fit.classCheck.status || (fit.classCheck.passed ? 'PASS' : 'FAIL'),
      value: fit.registrationClass || 'Not in profile',
      requirement: fit.classCheck.required ? `Required: ${fit.classCheck.required}` : null,
    },
    money(fit.turnoverCheck, 'Average annual turnover'),
    money(fit.solvencyCheck, 'Bank solvency'),
    money(fit.experienceCheck, 'Largest similar work'),
    fit.yearsCheck && fit.yearsCheck.status !== 'NOT_REQUIRED' && fit.yearsCheck.status !== 'NOT_ASSESSED' && {
      label: 'Years of experience',
      status: fit.yearsCheck.status,
      value: `${fit.yearsCheck.required} years required`,
      requirement: null,
    },
    ...(fit.licenceChecks || []).map((c) => ({
      label: c.label,
      status: c.status,
      value: c.passed ? 'In your profile' : 'Not in your profile',
      requirement: 'Mandatory',
    })),
  ].filter(Boolean);
  return rows;
}

const SOURCE_METHOD_LABEL = { text: 'read', 'scanned-pdf': 'scanned, read by AI', skipped: 'not read' };

/** Shows which tender documents the dossier was built from, and what was missed. */
function DossierSources({ grounding }) {
  if (!grounding?.mode) {
    return (
      <div className="ai-sources is-warn" role="note">
        <AlertTriangle size={15} aria-hidden="true" />
        <p>This dossier was made before TenderHub read tender documents. Run the analysis again to base it on the NIT and BOQ.</p>
      </div>
    );
  }
  const docs = grounding.documents || [];
  const read = docs.filter((d) => d.method !== 'skipped');
  const notes = [...(grounding.warnings || []), ...(grounding.missingInformation || [])];

  if (grounding.mode === 'TEMPLATE') {
    return (
      <div className="ai-sources is-high" role="alert">
        <AlertTriangle size={15} aria-hidden="true" />
        <p><strong>Not an analysis of this tender.</strong> The AI service did not respond, so this is a generic template for similar tenders. Its figures are not from the NIT. Try again in a few minutes.</p>
      </div>
    );
  }

  return (
    <div className={`ai-sources ${grounding.mode === 'LISTING_ONLY' ? 'is-warn' : ''}`}>
      {grounding.mode === 'LISTING_ONLY' ? <AlertTriangle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
      <div className="min-w-0">
        <p>
          {grounding.mode === 'LISTING_ONLY'
            ? 'No tender document could be read, so this is based only on the portal listing. Most requirements are not covered.'
            : `Based on ${read.length} tender document${read.length === 1 ? '' : 's'}: ${read.map((d) => d.name).join(', ')}.`}
        </p>
        {(notes.length > 0 || docs.length > read.length) && (
          <details className="ai-sources-details">
            <summary>{notes.length} note{notes.length === 1 ? '' : 's'} on coverage</summary>
            <ul>
              {docs.map((d) => (
                <li key={`doc-${d.name}`}>
                  <span className="font-mono">{d.name}</span> - {SOURCE_METHOD_LABEL[d.method] || d.method}
                  {d.pages ? `, ${d.pages} pages` : ''}{d.truncated ? ', partly read' : ''}
                </li>
              ))}
              {notes.map((note, i) => <li key={`note-${i}`} className="is-note">{note}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

export default function Services() {
  const { tenderId: paramTenderId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const queryTenderId = searchParams.get('tenderId') || '';
  const initialTenderId = paramTenderId || queryTenderId;

  // State Management
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [inputTenderId, setInputTenderId] = useState(initialTenderId);
  const [activeTab, setActiveTab] = useState('preBid'); // 'preBid' | 'boq' | 'execution' | 'copilot'
  const [analyzing, setAnalyzing] = useState(false);
  const [dossierData, setDossierData] = useState(null);
  const [personalizedFit, setPersonalizedFit] = useState(null);
  const [error, setError] = useState('');
  // Set when the requested tender is not in TenderHub, to offer the browse pages.
  const [tenderNotFound, setTenderNotFound] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Copilot Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLockedUntil, setChatLockedUntil] = useState(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());

  // Contractor Profile Edit Modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [showScopeAdvisory, setShowScopeAdvisory] = useState(false);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const profilePopoverRef = useRef(null);
  const tenderInputRef = useRef(null);
  const resetAnalysis = () => {
    setDossierData(null);
    setPersonalizedFit(null);
    setChatMessages([]);
    setChatInput('');
    setActiveTab('preBid');
    setStatusMsg('');
    setError('');
    setInputTenderId('');
    if (paramTenderId || queryTenderId) navigate('/services', { replace: true });
    setTimeout(() => tenderInputRef.current?.focus(), 50);
  };
  useEffect(() => {
    if (!showProfilePopover && !showScopeAdvisory) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setShowProfilePopover(false);
      setShowScopeAdvisory(false);
    };
    const onClick = (e) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target)) setShowProfilePopover(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [showProfilePopover, showScopeAdvisory]);
  const lastAutoAnalyzeRef = useRef('');
  const analysisInFlightRef = useRef(false);
  // Tender the user asked to analyse before setting up their profile; it runs
  // as soon as the profile is saved.
  const pendingAnalysisRef = useRef('');
  const profileConfigured = Boolean(profile?.profileConfiguredAt);
  useEffect(() => {
    if (!chatLockedUntil) return undefined;
    const timer = setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [chatLockedUntil]);
  const [editProfile, setEditProfile] = useState({
    companyName: '',
    registrationClass: '',
    avgAnnualTurnoverInr: '',
    solvencyLimitInr: '',
    largestSingleWorkDoneInr: '',
    licences: '',
  });

  const loadPlansAndProfile = useCallback(async () => {
    try {
      const fetchedProfile = await servicesApi.getContractorProfile().catch(() => null);
      if (fetchedProfile) {
        setProfile(fetchedProfile);
        setEditProfile({
          companyName: fetchedProfile.companyName || '',
          registrationClass: fetchedProfile.registrationClass || '',
          avgAnnualTurnoverInr: fetchedProfile.avgAnnualTurnoverInr ?? '',
          solvencyLimitInr: fetchedProfile.solvencyLimitInr ?? '',
          largestSingleWorkDoneInr: fetchedProfile.largestSingleWorkDoneInr ?? '',
          licences: (fetchedProfile.licences || []).join(', '),
        });
      }
    } catch (err) {
      console.error('Failed to load services data:', err);
    } finally {
      setProfileReady(true);
    }
  }, []);

  const handleAnalyze = useCallback(async (idToAnalyze = inputTenderId) => {
    // State updates do not apply until the next render. This ref also blocks
    // duplicate calls if the route effect and a user click happen together.
    if (analysisInFlightRef.current) return;
    const targetId = idToAnalyze?.trim();
    if (!targetId) {
      setError('Please enter a valid Tender ID or Portal Reference.');
      return;
    }
    if (!isAuthenticated) {
      setError('Sign in or create an account to use the AI estimator.');
      setShowProfileModal(false);
      return;
    }
    if (!profileReady) {
      setError('Contractor profile is loading. Try again in a moment.');
      return;
    }
    if (!profileConfigured) {
      // The analysis compares the tender with the contractor's own figures, so
      // it needs a saved profile; the requested tender runs right after saving.
      pendingAnalysisRef.current = targetId;
      setError('Set up your contractor profile first. The analysis checks the tender against your firm\'s figures and starts as soon as you save.');
      setShowProfileModal(true);
      return;
    }

    try {
      analysisInFlightRef.current = true;
      setError('');
      setTenderNotFound(false);
      setAnalyzing(true);
      setStatusMsg('AI Agents reading tender documentation and calculating contractor fit...');

      const isGem = targetId.toUpperCase().includes('GEM');
      const normalizeId = (value) => String(value || '').trim().toUpperCase();
      let analysisTenderId = targetId;

      if (isGem) {
        let gemTender = null;
        try {
          const detail = await api.get(`/gem/tenders/${encodeURIComponent(targetId)}`);
          gemTender = detail.data?.data || null;
        } catch (lookupError) {
          if (lookupError.response?.status !== 404) {
            throw new Error('Could not reach the GeM bid index. Please retry in a moment.', { cause: lookupError });
          }
        }

        // Search is a fallback for GeM references that the router cannot resolve as a path segment.
        if (!gemTender) {
          try {
            const search = await api.get('/gem/tenders', {
              params: { search: targetId, status: 'all', limit: 10 },
            });
            const candidates = Array.isArray(search.data?.data) ? search.data.data : [];
            gemTender = candidates.find((tender) =>
              [tender.sourceTenderId, tender.tenderReferenceNumber, tender._id]
                .some((value) => normalizeId(value) === normalizeId(targetId))
            ) || null;
          } catch (lookupError) {
            throw new Error('Could not reach the GeM bid index. Please retry in a moment.', { cause: lookupError });
          }
        }

        if (!gemTender) {
          throw Object.assign(new Error('This GeM bid is not in TenderHub yet. Pick it from GeM Bids, or check the bid number.'), { code: 'TENDER_NOT_FOUND' });
        }
        analysisTenderId = gemTender._id || gemTender.sourceTenderId || targetId;
      } else if (/^[a-f\d]{24}$/i.test(targetId)) {
        // TenderDetails links with Mongo's _id. The text search below only
        // searches tender fields (it cannot match Mongo's _id), while the
        // dossier endpoint already resolves valid ObjectIds directly.
        analysisTenderId = targetId;
      } else {
        const tenderSearch = await api.get('/tenders', {
          params: { search: targetId, status: 'all', limit: 10 },
        });
        const tenderMatches = Array.isArray(tenderSearch.data?.data) ? tenderSearch.data.data : [];
        const tender = tenderMatches.find((candidate) =>
          [candidate.sourceTenderId, candidate._id, candidate.tenderReferenceNumber]
            .some((value) => normalizeId(value) === normalizeId(targetId))
        );
        if (!tender) {
          throw Object.assign(new Error('This tender is not in TenderHub. Check the ID, or pick the tender from Browse Tenders.'), { code: 'TENDER_NOT_FOUND' });
        }
        analysisTenderId = tender._id || tender.sourceTenderId || targetId;
      }

      const res = await servicesApi.analyzeTender(analysisTenderId);
      if (res.success) {
        setDossierData(res.dossier);
        setPersonalizedFit(res.personalizedFit);
        setStatusMsg('AI Analysis completed successfully.');
        loadPlansAndProfile();
        
        // Seed initial copilot welcome message
        setChatMessages([
          {
            role: 'assistant',
            content: `Namaste. I am your Tender Copilot for this contract.\n\n• Contractor Profile: ${res.personalizedFit?.contractorName || 'your contractor profile'} (${res.personalizedFit?.registrationClass})\n• Eligibility Match: ${res.personalizedFit?.matchScore}% (${res.personalizedFit?.verdict})\n• Quick Queries: Ask about EMD/CDR rules, turnover compliance, BOQ material quantities, or delay penalties.`
          }
        ]);
      } else {
        setError(res.error || 'Failed to complete tender analysis.');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      const payload = err.response?.data;
      setTenderNotFound(payload?.error === 'TENDER_NOT_FOUND' || err.code === 'TENDER_NOT_FOUND');
      if (payload?.error === 'PROFILE_REQUIRED') {
        pendingAnalysisRef.current = targetId;
        setShowProfileModal(true);
      }
      setError(payload?.message || payload?.error || err.message || 'Error executing AI analysis.');
    } finally {
      analysisInFlightRef.current = false;
      setAnalyzing(false);
    }
  }, [inputTenderId, isAuthenticated, loadPlansAndProfile, profileConfigured, profileReady]);

  useEffect(() => {
    if (showProfileModal) setProfileSaveError('');
  }, [showProfileModal]);

  // Load the account profile.
  useEffect(() => {
    loadPlansAndProfile();
  }, [loadPlansAndProfile]);

  // A GeM "AI analysis" action navigates here with a tender ID; run that
  // requested analysis once. Profile refreshes after completion must not
  // trigger another paid/long-running analysis for the same route.
  useEffect(() => {
    const targetId = paramTenderId || queryTenderId;
    if (!targetId) return;

    setInputTenderId(targetId);
    // Wait until the profile is set up. handleAnalyze opens the setup form when
    // it is not; once saved, this effect runs again for the same tender.
    // The ref is keyed by profile state so the setup form opens once per tender,
    // not again on every re-render while it is closed.
    const runKey = `${profileConfigured ? 'run' : 'setup'}:${targetId}`;
    if (profileReady && lastAutoAnalyzeRef.current !== runKey) {
      lastAutoAnalyzeRef.current = runKey;
      handleAnalyze(targetId);
    }
  }, [paramTenderId, queryTenderId, profileReady, profileConfigured, handleAnalyze]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || !dossierData) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setChatLoading(true);

    try {
      const res = await servicesApi.askCopilot(dossierData.tenderId, userText);
      if (res.success) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
        if (res.chatLockedUntil) setChatLockedUntil(res.chatLockedUntil);
        if (profile?.credits) {
          setProfile((prev) => ({
            ...prev,
            credits: {
              ...prev.credits,
              copilotQueriesLimit: res.remainingQueries + (prev.credits.copilotQueriesUsed || 0),
            }
          }));
        }
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Unable to process query. Please retry.' }]);
      }
    } catch (err) {
      const payload = err.response?.data;
      if (payload?.error === 'CHAT_LOCKED_24H') setChatLockedUntil(payload.lockedUntil);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${payload?.message || payload?.error || err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (savingProfile) return;
    setProfileSaveError('');
    setSavingProfile(true);
    try {
      const updated = await servicesApi.updateContractorProfile({
        ...editProfile,
        licences: String(editProfile.licences || '').split(',').map((l) => l.trim()).filter(Boolean),
      });
      if (!updated) {
        throw new Error('The server did not return the saved profile. Please try again.');
      }
      setProfile(updated);
      if (!updated.profileConfiguredAt) {
        setProfileSaveError('Saved, but some required fields are still empty. Fill in every field to run an AI analysis.');
        return;
      }
      setShowProfileModal(false);
      setError('');
      setStatusMsg('Contractor profile saved. Checking eligibility...');
      // A tender in the URL is picked up by the route effect once the profile is set.
      const pending = pendingAnalysisRef.current;
      pendingAnalysisRef.current = '';
      const routeTender = paramTenderId || queryTenderId;
      if (dossierData) {
        handleAnalyze(dossierData.tenderId);
      } else if (pending && pending !== routeTender) {
        handleAnalyze(pending);
      }
    } catch (err) {
      // Shown inside the modal: the page-level error sits behind the overlay,
      // which made failed saves look like the button did nothing.
      const status = err.response?.status;
      const responseError = err.response?.data?.message || err.response?.data?.error;
      setProfileSaveError(
        status === 401
          ? 'Your session has expired. Please sign in again, then save your baseline.'
          : responseError || err.message || 'Failed to update contractor profile.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const downloadBoqCsv = () => {
    const breakdown = dossierData?.preBidAnalysis?.boqMaterialBreakdown;
    const materials = breakdown?.materials || [];
    const lineItems = breakdown?.boqLineItems || [];
    if (!materials.length && !lineItems.length) {
      setError('There are no BOQ items available to export.');
      return;
    }

    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Type', 'Item No', 'Name / Description', 'Category', 'Quantity', 'Unit', 'Specification', 'Estimated Rate (₹)', 'Estimated Amount (₹)'],
      ...materials.map((item) => [
        'Material', '', item.name, item.category, item.estimatedQuantity, item.unit,
        item.specCode, item.approxRateInr, item.totalEstCost,
      ]),
      ...lineItems.map((item) => [
        'BOQ Line Item', item.itemNo, item.description, '', item.quantity, item.unit,
        '', item.estimatedRate, item.estimatedAmount,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTenderId = (inputTenderId || 'Schedule').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
    link.download = `tndrr_BOQ_${safeTenderId || 'Schedule'}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError('');
  };

  return (
    <div className="estimator-page min-h-screen bg-paper dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors pb-20">
      
      {/* 1. HERO: HEADING, TENDER INPUT, PROFILE CHIP, ADVISORY */}
      <section className={`ai-hero ${dossierData ? 'ai-hero--compact' : ''} ${showProfilePopover ? 'ai-hero--profile-open' : ''}`}>
        <div className="ai-hero-inner max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">

          {/* Top row: label + contractor profile chip */}
          <div className="ai-hero-top">
            <span className="ai-hero-label hidden sm:inline">AI Quantity Surveyor</span>
            <div className="ai-hero-chip-wrap" ref={profilePopoverRef}>
              <button
                type="button"
                className="ai-hero-chip"
                aria-haspopup="dialog"
                aria-expanded={showProfilePopover}
                onClick={() => setShowProfilePopover((open) => !open)}
              >
                <Building2 className="w-4 h-4 shrink-0 opacity-80" />
                <span className="truncate">{profileConfigured ? profile.companyName : 'Set up your profile'}</span>
                <span aria-hidden="true" className="ai-hero-chip-dot" />
                <span className="shrink-0 opacity-80">{profileConfigured ? profile.registrationClass : 'Required for analysis'}</span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform ${showProfilePopover ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showProfilePopover && (
                  <motion.div
                    role="dialog"
                    aria-label="Contractor profile baseline"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16 }}
                    className="ai-hero-popover"
                  >
                    <p className="ai-popover-eyebrow">Contractor profile baseline</p>
                    <dl className="ai-popover-list">
                      <div>
                        <dt>Registered entity</dt>
                        <dd className="truncate">{profile?.companyName || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt>Registration class</dt>
                        <dd>{profile?.registrationClass || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt>Avg annual turnover</dt>
                        <dd>{profile?.avgAnnualTurnoverInr ? `₹${(profile.avgAnnualTurnoverInr / 1e7).toFixed(1)} Crore` : 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt>AI dossier access</dt>
                        <dd><Badge variant="success">Unlimited for testing</Badge></dd>
                      </div>
                    </dl>
                    {profile?.companyName === 'Prime Infrastructure & Engineering' && (
                      <p className="ai-popover-note">
                        Example values are prefilled. Review and update them before using personalized analysis.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => { setShowProfilePopover(false); setShowProfileModal(true); }}
                    >
                      <Sliders className="w-3.5 h-3.5 mr-1.5" />
                      Configure profile
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Centre: heading + input (collapses to the title once a dossier is loaded) */}
          <div className="ai-hero-centre">
            <h1>AI Tender Analysis</h1>
            <AnimatePresence initial={false} mode="wait">
            {dossierData ? (
              <motion.div key="compact" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <button type="button" className="ai-hero-ghost-btn mt-4" onClick={resetAnalysis}>
                  Analyze another tender
                </button>
              </motion.div>
            ) : (
            <motion.div
              key="full"
              className="ai-hero-collapsible"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
            <p className="ai-hero-sub">
              Eligibility fit, material schedules and contract risk, from the tender ID.
            </p>

            <form
              className="ai-hero-pill"
              onSubmit={(e) => { e.preventDefault(); handleAnalyze(); }}
            >
              <Search className="w-[18px] h-[18px] shrink-0 opacity-60" aria-hidden="true" />
              <input
                type="text"
                placeholder="Enter a tender ID or portal reference"
                value={inputTenderId}
                onChange={(e) => setInputTenderId(e.target.value)}
                aria-label="Tender ID or portal reference"
                autoComplete="off"
                spellCheck={false}
                disabled={analyzing}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAnalyze(); } }}
                ref={tenderInputRef}
              />
              <button
                type="submit"
                className="ai-hero-pill-submit"
                aria-label={analyzing ? 'Analyzing tender' : 'Analyze tender'}
                title={analyzing ? 'Analyzing tender' : 'Analyze tender'}
                disabled={analyzing || !profileReady}
              >
                {analyzing ? <RefreshCw className="w-[18px] h-[18px] animate-spin" /> : <ArrowUp className="w-[18px] h-[18px]" />}
              </button>
            </form>

            <div className="ai-hero-feedback" aria-live="polite">
              {error ? (
                <>
                  <p className="ai-hero-feedback-error">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                  {!isAuthenticated && (
                    <button
                      type="button"
                      className="ai-hero-ghost-btn"
                      onClick={() => navigate(`/signup?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`)}
                    >
                      Sign in / Sign up
                    </button>
                  )}
                  {tenderNotFound && (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Link to="/tenders" className="ai-hero-ghost-btn">Browse Tenders</Link>
                      <Link to="/gem-tenders" className="ai-hero-ghost-btn">GeM Bids</Link>
                    </div>
                  )}
                </>
              ) : statusMsg ? (
                <p className="ai-hero-feedback-status">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{statusMsg}</span>
                </p>
              ) : null}
            </div>
            </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* Bottom: advisory line */}
          <AnimatePresence initial={false}>
          {!dossierData && <motion.div className="ai-hero-bottom" key="advisory" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="ai-hero-advisory">
              <span aria-hidden="true" className="ai-hero-advisory-dot" />
              <span>AI output is advisory. Verify every requirement in the source NIT.</span>
              <button type="button" onClick={() => setShowScopeAdvisory(true)}>
                Read the full scope and limitations
              </button>
            </div>
          </motion.div>}
          </AnimatePresence>
        </div>
      </section>

      {/* 2. MAIN WORKSPACE / DOSSIER CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {dossierData ? (
          <div className="ai-dossier">
            {/* Header: reference, title, summary, fit */}
            <header className="ai-dossier-head">
              <div className="min-w-0">
                <p className="ai-eyebrow">
                  <span>{dossierData.executiveOverview?.department || 'Department not listed'}</span>
                  <span className="ai-eyebrow-sep" aria-hidden="true" />
                  <span className="font-mono">{dossierData.sourceTenderId || dossierData.tenderId}</span>
                </p>
                <h2 className="ai-dossier-title">{dossierData.executiveOverview?.title}</h2>
                {dossierData.summary && (
                  <div className="ai-summary">{renderSummaryBullets(dossierData.summary, 'space-y-2')}</div>
                )}
                <DossierSources grounding={dossierData.grounding} />
              </div>

              {personalizedFit && (
                <aside className="ai-fit" aria-label="Contractor fit rating">
                  <p className="ai-label">Contractor fit</p>
                  {personalizedFit.matchScore === null || personalizedFit.matchScore === undefined
                    ? <p className="ai-fit-score ai-fit-score--na">Not assessed</p>
                    : <p className="ai-fit-score">{personalizedFit.matchScore}<span>%</span></p>}
                  <p className={`ai-fit-verdict ${personalizedFit.matchScore >= 80 ? 'is-good' : personalizedFit.matchScore === null || personalizedFit.matchScore === undefined ? 'is-low' : personalizedFit.matchScore <= 30 ? 'is-high' : 'is-warn'}`}>
                    <span className="ai-dot" aria-hidden="true" />
                    {personalizedFit.verdict}
                  </p>
                </aside>
              )}
            </header>

            {/* Tabs */}
            <div className="ai-tabs-wrap">
              <div className="ai-tabs" role="tablist" aria-label="Dossier sections">
                {[
                  { id: 'preBid', label: 'Pre-bid' },
                  { id: 'boq', label: 'Materials & BOQ' },
                  { id: 'execution', label: 'Execution' },
                  { id: 'copilot', label: 'Copilot' },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`ai-tab ${isActive ? 'is-active' : ''}`}
                    >
                      {isActive && <motion.span layoutId="ai-tab-pill" className="ai-tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" />}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ai-panel">
              {/* PRE-BID */}
              {activeTab === 'preBid' && (
                <div className="ai-bento" key="preBid">
                  <div className="ai-bento-col">
                    {personalizedFit && (
                      <Tile tone="light" size="tall" order={0}>
                        <p className="ai-tile-kicker">Eligibility fit</p>
                        <p className="ai-tile-sub">Against {personalizedFit.contractorName}</p>
                        <dl className="ai-tile-stats">
                          {eligibilityRows(personalizedFit).map((row) => (
                            <div key={row.label}>
                              <dt>{row.label}</dt>
                              <dd className="ai-tile-stat-value">{row.value}</dd>
                              {row.requirement && <dd className="ai-tile-stat-req">{row.requirement}</dd>}
                              <dd className={`ai-tile-stat-status ${FIT_STATUS[row.status]?.tone || 'is-low'}`}>
                                <span className="ai-dot" aria-hidden="true" />{FIT_STATUS[row.status]?.label || row.status}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </Tile>
                    )}
                  </div>

                  <div className="ai-bento-col">
                    {dossierData.preBidAnalysis?.riskAndRedFlags?.map((risk, idx) => (
                      <Tile key={idx} tone="dark" order={2 + idx}>
                        <p className="ai-tile-meta">
                          <span className={`ai-risk-level ${risk.severity === 'HIGH' ? 'is-high' : risk.severity === 'MEDIUM' ? 'is-warn' : 'is-low'}`}>
                            <span className="ai-dot" aria-hidden="true" />
                            {risk.severity === 'HIGH' ? 'High' : risk.severity === 'MEDIUM' ? 'Medium' : 'Low'} risk
                          </span>
                          <span className="font-mono">{risk.clauseReference || 'GCC'}</span>
                        </p>
                        <p className="ai-tile-title">{risk.title}</p>
                        <p className="ai-tile-text">{risk.riskSummary}</p>
                        <p className="ai-tile-note"><span>Mitigation</span>{risk.mitigationAction}</p>
                      </Tile>
                    ))}
                  </div>

                  <div className="ai-bento-col">
                    {personalizedFit?.identifiedGaps?.length > 0 && (
                      <Tile tone="blue" size="short" order={3}>
                        <p className="ai-tile-kicker">Eligibility gaps</p>
                        <ul className="ai-tile-list">
                          {personalizedFit.identifiedGaps.map((gap, idx) => (
                            <li key={idx}>
                              <p className="ai-tile-title">{gap.title}</p>
                              <p className="ai-tile-text">{gap.detail}</p>
                              <p className="ai-tile-note"><span>Mitigation</span>{gap.recommendation}</p>
                            </li>
                          ))}
                        </ul>
                      </Tile>
                    )}
                    <Tile tone="light" size="tall" order={4}>
                      <p className="ai-tile-kicker">Submission checklist</p>
                      <p className="ai-tile-sub">Every item is mandatory unless marked optional</p>
                      <ol className="ai-tile-list ai-tile-list--numbered">
                        {dossierData.preBidAnalysis?.mandatoryDocumentChecklist?.map((doc) => (
                          <li key={doc.sNo}>
                            <span className="ai-tile-num font-mono">{String(doc.sNo).padStart(2, '0')}</span>
                            <div>
                              <p className="ai-tile-title">
                                {doc.title}
                                {doc.stage && <span className="ai-tag">{doc.stage}</span>}
                                {doc.isMandatory === false && <span className="ai-tag">Optional</span>}
                              </p>
                              <p className="ai-tile-text">{doc.description}</p>
                              {doc.complianceTip && <p className="ai-tile-note"><span>Tip</span>{doc.complianceTip}</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </Tile>
                  </div>
                </div>
              )}

              {/* MATERIALS & BOQ */}
              {activeTab === 'boq' && (
                <div className="space-y-2" key="boq">
                  <div className="ai-bento">
                    <div className="ai-bento-col">
                      <Tile tone="light" size="tall" order={0}>
                        <p className="ai-tile-kicker">Material schedule</p>
                        <p className="ai-tile-sub">From the tender BOQ. Figures marked ≈ are AI estimates.</p>
                        {dossierData.preBidAnalysis?.boqMaterialBreakdown?.summary && (
                          <div className="ai-tile-summary">{renderSummaryBullets(dossierData.preBidAnalysis.boqMaterialBreakdown.summary, 'space-y-2')}</div>
                        )}
                      </Tile>
                      <Tile tone="blue" size="short" order={1}>
                        <p className="ai-tile-kicker">Export</p>
                        <p className="ai-tile-text">
                          {dossierData.preBidAnalysis?.boqMaterialBreakdown?.materials?.length || 0} materials and {dossierData.preBidAnalysis?.boqMaterialBreakdown?.boqLineItems?.length || 0} line items, as a spreadsheet.
                        </p>
                        <button type="button" onClick={downloadBoqCsv} className="ai-tile-btn">
                          <Download className="w-3.5 h-3.5" />
                          Export CSV
                        </button>
                      </Tile>
                    </div>
                    <div className="ai-bento-col ai-bento-col--wide">
                      {dossierData.preBidAnalysis?.boqMaterialBreakdown?.materials?.map((mat, idx) => (
                        <Tile key={idx} tone="dark" order={2 + idx}>
                          <p className="ai-tile-kicker">{mat.category || 'Material'}</p>
                          <p className="ai-tile-title">{mat.name}</p>
                          <p className="ai-tile-big ai-tile-big--sm">{mat.estimatedQuantity}</p>
                          <p className="ai-tile-text">{mat.approxRateInr}</p>
                          <p className="ai-tile-note"><span>Outlay</span>{mat.totalEstCost}</p>
                        </Tile>
                      ))}
                    </div>
                  </div>

                  <Tile tone="light" order={6} className="ai-tile--full">
                    <p className="ai-tile-kicker">Line items</p>
                    <p className="ai-tile-sub">Extracted against the standard Schedule of Rates</p>
                    <div className="ai-table-wrap mt-4">
                      <table className="ai-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Description</th>
                            <th className="num">Qty</th>
                            <th>Unit</th>
                            <th className="num">Rate</th>
                            <th className="num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossierData.preBidAnalysis?.boqMaterialBreakdown?.boqLineItems?.map((item, idx) => (
                            <tr key={idx}>
                              <td className="font-mono">{item.itemNo}</td>
                              <td className="desc">{item.description}</td>
                              <td className="num">{typeof item.quantity === 'number' ? item.quantity.toLocaleString('en-IN') : item.quantity}</td>
                              <td>{item.unit}</td>
                              <td className="num">{formatBoqEstimate(item.estimatedRate)}</td>
                              <td className="num strong">{formatBoqEstimate(item.estimatedAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Tile>
                </div>
              )}

              {/* EXECUTION */}
              {activeTab === 'execution' && (() => {
                const phases = dossierData.postAwardAnalysis?.procurementSchedule || [];
                const milestones = dossierData.postAwardAnalysis?.milestones || [];
                const renderPhase = (phase, idx, tone, size) => (
                  <Tile key={idx} tone={tone} size={size} order={idx}>
                    <p className="ai-tile-kicker">{phase.timeframe}</p>
                    <p className="ai-tile-title">{phase.phase}</p>
                    {phase.materialsToMobilize?.length > 0 && (
                      <ul className="ai-tile-bullets">
                        {phase.materialsToMobilize.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    )}
                    {phase.criticalPathItems && <p className="ai-tile-note"><span>Critical path</span>{phase.criticalPathItems}</p>}
                  </Tile>
                );
                return (
                  <div className="ai-bento ai-bento--split" key="execution">
                    <div className="ai-bento-col">
                      {phases.map((p, i) => renderPhase(p, i, i % 2 === 0 ? 'light' : 'blue'))}
                    </div>
                    <div className="ai-bento-col">
                      {milestones.map((m, idx) => (
                        <Tile key={m.milestoneNo} tone="dark" order={idx}>
                          <p className="ai-tile-meta"><span>Milestone {m.milestoneNo}</span>{m.targetDays ? <span className="font-mono">Day {m.targetDays}</span> : null}</p>
                          <p className="ai-tile-title">{m.description}</p>
                          {typeof m.financialProgressPct === 'number' && (
                            <p className="ai-tile-big ai-tile-big--sm">{m.financialProgressPct}<span>% billing</span></p>
                          )}
                          {m.penaltyIfDelayed && <p className="ai-tile-note"><span>If delayed</span>{m.penaltyIfDelayed}</p>}
                        </Tile>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* COPILOT */}
              {activeTab === 'copilot' && (() => {
                const locked = Boolean(chatLockedUntil && countdownNow < new Date(chatLockedUntil).getTime());
                const remaining = profile?.credits?.copilotQueriesLimit - (profile?.credits?.copilotQueriesUsed || 0) || 50;
                const quickQuestions = [
                  { label: 'EMD and CDR rules', prompt: 'What are the EMD amount and CDR submission rules for this tender?' },
                  { label: 'Eligibility', prompt: 'Check my eligibility and turnover compliance for this tender.' },
                  { label: 'BOQ quantities', prompt: 'Summarize the cement and steel quantities in the BOQ.' },
                  { label: 'Delay penalties', prompt: 'What are the delay penalty rules for this tender?' },
                ];
                return (
                  <section className="ai-chat">
                    <div className="ai-chat-bar">
                      <p><span className="copilot-orb ai-chat-orb" aria-hidden="true" />Copilot</p>
                      <p>Grounded in this tender and {profile?.companyName || 'your profile'} · {remaining} queries left</p>
                    </div>

                    <div className="ai-chat-scroll">
                      {chatMessages.length === 0 && !chatLoading && (
                        <div className="ai-chat-empty">
                          <h3>Ask about this tender</h3>
                          <p>Eligibility, EMD rules, material quantities, penalties, or anything in the notice.</p>
                        </div>
                      )}
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`ai-msg ${msg.role === 'user' ? 'is-user' : 'is-ai'}`}>
                          <div className="ai-msg-body whitespace-pre-line">{renderCopilotText(msg.content)}</div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="ai-msg is-ai">
                          <div className="ai-msg-body ai-msg-loading"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Reading the tender clauses</div>
                        </div>
                      )}
                    </div>

                    {locked && (
                      <div className="ai-chat-locked">
                        <strong>Free session limit reached.</strong> Chat resumes in {(() => { const s = Math.max(0, Math.ceil((new Date(chatLockedUntil).getTime() - countdownNow) / 1000)); return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`; })()}.
                        {' '}<Link to="/pricing">View plans</Link>
                      </div>
                    )}

                    <div className="ai-quick-row" role="group" aria-label="Quick questions">
                      {quickQuestions.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          className={`ai-quick-chip ${chatInput === q.prompt ? 'is-picked' : ''}`}
                          onClick={() => setChatInput(q.prompt)}
                          disabled={locked || chatLoading}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>

                    <CopilotComposer
                      value={chatInput}
                      onChange={setChatInput}
                      onSubmit={() => handleSendMessage({ preventDefault() {} })}
                      disabled={locked}
                      loading={chatLoading}
                      tenderRef={dossierData.sourceTenderId || dossierData.tenderId}
                    />
                  </section>
                );
              })()}

              <p className="ai-footnote">
                AI output is advisory. BOQ quantities, fit scores and risk clauses are estimates to speed up due diligence. Confirm every mandatory term against the published NIT.
              </p>
            </div>
          </div>
        ) : (
          <div className="ai-coverage">
            <div>
              <h2>Eligibility fit</h2>
              <p>Turnover and solvency against the NIT thresholds, with your contractor profile applied.</p>
            </div>
            <div>
              <h2>Materials and BOQ</h2>
              <p>Cement, steel and aggregate quantities with Schedule of Rates based estimates.</p>
            </div>
            <div>
              <h2>Contract risk</h2>
              <p>GCC clauses, penalties and milestone exposure flagged for review before you bid.</p>
            </div>
          </div>
        )}


      </main>

      {/* 3. DIALOG: PLATFORM SCOPE & AI LIMITATIONS */}
      <AnimatePresence>
        {showScopeAdvisory && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setShowScopeAdvisory(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-scope-title"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="ai-scope-dialog"
            >
              <div className="ai-scope-head">
                <div>
                  <p className="ai-popover-eyebrow">Important contractor advisory</p>
                  <h2 id="ai-scope-title">Current platform scope and AI limitations</h2>
                </div>
                <button type="button" aria-label="Close" className="ai-scope-close" onClick={() => setShowScopeAdvisory(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ol className="ai-scope-list">
                <li>
                  <span className="ai-scope-num">01</span>
                  <div>
                    <h3>Scanned document verification</h3>
                    <p>AI models ingest published portal metadata and digital notices. Bespoke special conditions or handwritten notes inside attached non-OCR or scanned PDFs should always be physically verified in the source NIT.</p>
                  </div>
                </li>
                <li>
                  <span className="ai-scope-num">02</span>
                  <div>
                    <h3>Normative BOQ rate estimates</h3>
                    <p>Extracted material schedules, cement and steel quantities, and estimated rates reflect standard CPWD/PWD Schedule of Rates (SOR). Actual local supplier rates, GST, and logistics freight must be factored in prior to bidding.</p>
                  </div>
                </li>
                <li>
                  <span className="ai-scope-num">03</span>
                  <div>
                    <h3>Benchmark eligibility checks</h3>
                    <p>Turnover and solvency checks apply general procurement ratios (120% three-year turnover, 40% bank solvency). Departmental relaxations, MSME exemptions, or Joint Venture (JV) allowances must be confirmed per individual gazette.</p>
                  </div>
                </li>
              </ol>

              <div className="ai-scope-foot">
                <Button type="button" variant="default" size="sm" onClick={() => setShowScopeAdvisory(false)}>
                  Understood
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* 4. MODAL: EDIT CONTRACTOR PROFILE MEMORY */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                  <span>{profileConfigured ? 'Configure Contractor Baseline' : 'Set up your contractor profile'}</span>
                </h3>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs">
                {!profileConfigured && (
                  <p className="rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-blue-800 dark:text-blue-200 leading-relaxed">
                    AI analysis checks each tender against your firm&apos;s real figures. Fill in every field to start; you can change them later.
                  </p>
                )}
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Company / Firm Name
                  </label>
                  <Input
                    type="text"
                    required
                    value={editProfile.companyName}
                    onChange={(e) => setEditProfile({ ...editProfile, companyName: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Registration Class
                    </label>
                    <select
                      value={editProfile.registrationClass}
                      required
                      onChange={(e) => setEditProfile({ ...editProfile, registrationClass: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      <option value="" disabled>Select registration class</option>
                      <option value="Class Special">Class Special</option>
                      <option value="Class A Works">Class A Works</option>
                      <option value="Class B Works">Class B Works</option>
                      <option value="Class C Works">Class C Works</option>
                      <option value="Class 1 PWD">Class 1 PWD</option>
                      <option value="Not registered (goods / services supplier)">Not registered (goods / services supplier)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Avg Turnover (₹)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      required
                      value={editProfile.avgAnnualTurnoverInr}
                      onChange={(e) => setEditProfile({ ...editProfile, avgAnnualTurnoverInr: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Bank Solvency (₹)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      required
                      value={editProfile.solvencyLimitInr}
                      onChange={(e) => setEditProfile({ ...editProfile, solvencyLimitInr: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Largest Single Work (₹)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      required
                      value={editProfile.largestSingleWorkDoneInr}
                      onChange={(e) => setEditProfile({ ...editProfile, largestSingleWorkDoneInr: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="profile-licences" className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Licences and registrations held
                  </label>
                  <Input
                    id="profile-licences"
                    type="text"
                    placeholder="e.g. Drug License, Electrical Contractor Licence A-Grade, BIS"
                    value={editProfile.licences}
                    onChange={(e) => setEditProfile({ ...editProfile, licences: e.target.value })}
                  />
                  <p className="mt-1 text-slate-500 dark:text-slate-400">Separate with commas. Tenders that make a licence mandatory are checked against this list.</p>
                </div>

                {profileSaveError && (
                  <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>{profileSaveError}</span>
                  </p>
                )}

                <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowProfileModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    disabled={savingProfile}
                  >
                    {savingProfile ? 'Saving…' : 'Save Baseline'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
