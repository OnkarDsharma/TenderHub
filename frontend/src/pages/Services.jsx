/**
 * @file frontend/src/pages/Services.jsx
 * @description Dedicated AI Services section offering personalized contractor tender analysis,
 * BOQ raw material extraction, post-award execution schedules, and interactive Copilot.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Cpu,
  FileText,
  Boxes,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Send,
  Zap,
  TrendingUp,
  Download,
  Building2,
  ShieldAlert,
  Check,
  RefreshCw,
  Search,
  Sliders,
  Scale,
} from 'lucide-react';
import { servicesApi } from '../services/servicesApi';
import { api } from '../services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/useAuthStore';

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
  const [exampleTender, setExampleTender] = useState(null);
  const [inputTenderId, setInputTenderId] = useState(initialTenderId);
  const [activeTab, setActiveTab] = useState('preBid'); // 'preBid' | 'boq' | 'execution' | 'copilot'
  const [analyzing, setAnalyzing] = useState(false);
  const [dossierData, setDossierData] = useState(null);
  const [personalizedFit, setPersonalizedFit] = useState(null);
  const [error, setError] = useState('');
  const [dossierLimitReached, setDossierLimitReached] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Copilot Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLockedUntil, setChatLockedUntil] = useState(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());

  // Contractor Profile Edit Modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const lastAutoAnalyzeRef = useRef('');
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
        });
      }
    } catch (err) {
      console.error('Failed to load services data:', err);
    } finally {
      setProfileReady(true);
    }
  }, []);

  const handleAnalyze = useCallback(async (idToAnalyze = inputTenderId) => {
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
    if (!profile) {
      setError('Review and save your contractor profile before running a personalized analysis.');
      setShowProfileModal(true);
      return;
    }

    try {
      setError('');
      setDossierLimitReached(false);
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
          throw new Error('This GeM bid is not in the TenderHub index yet. Choose it from GeM Bids or sync the bid before analyzing it.');
        }
        analysisTenderId = gemTender._id || gemTender.sourceTenderId || targetId;
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
          throw new Error('Tender reference was not found in the TenderHub index. Choose an active tender from Browse Tenders and try again.');
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
      if (payload?.error === 'DAILY_DOSSIER_LIMIT_REACHED') {
        setDossierLimitReached(true);
        setError(`Daily Limit Reached (2/2): You've used your 2 free tender analyses for today. Your quota resets at ${payload.resetsAt ? new Date(payload.resetsAt).toLocaleTimeString() : 'midnight'}, or you can upgrade to Starter for unlimited dossiers.`);
      } else setError(payload?.message || payload?.error || err.message || 'Error executing AI analysis.');
    } finally {
      setAnalyzing(false);
    }
  }, [inputTenderId, isAuthenticated, loadPlansAndProfile, profile, profileReady]);

  // Load the account profile and one real tender as the optional example.
  useEffect(() => {
    loadPlansAndProfile();
    api.get('/tenders', { params: { limit: 1, status: 'active' } })
      .then((response) => {
        const payload = response.data?.data?.tenders || response.data?.data || response.data?.tenders || [];
        setExampleTender(Array.isArray(payload) ? payload[0] || null : null);
      })
      .catch((err) => console.error('Failed to load a tender example:', err));
  }, [loadPlansAndProfile]);

  // Auto-analyze if the route contains a tender ID, after profile data loads.
  useEffect(() => {
    const targetId = paramTenderId || queryTenderId;
    if (targetId) {
      setInputTenderId(targetId);
      const profileKey = profile?.updatedAt || profile?.companyName || 'missing-profile';
      const runKey = `${targetId}:${profileKey}`;
      if (profileReady && lastAutoAnalyzeRef.current !== runKey) {
        lastAutoAnalyzeRef.current = runKey;
        handleAnalyze(targetId);
      }
    }
  }, [paramTenderId, queryTenderId, profileReady, profile, handleAnalyze]);

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
    try {
      const updated = await servicesApi.updateContractorProfile(editProfile);
      setProfile(updated);
      setShowProfileModal(false);
      setStatusMsg('Contractor baseline updated. Re-evaluating bid capacity...');
      if (dossierData) {
        handleAnalyze(dossierData.tenderId);
      }
    } catch {
      setError('Failed to update contractor memory profile.');
    }
  };

  const downloadBoqCsv = () => {
    if (!dossierData?.preBidAnalysis?.boqMaterialBreakdown) return;
    const materials = dossierData.preBidAnalysis.boqMaterialBreakdown.materials || [];
    let csv = 'Material Name,Category,Estimated Quantity,Unit,Specification,Approx Rate,Estimated Total\n';
    materials.forEach((m) => {
      csv += `"${m.name}","${m.category}","${m.estimatedQuantity}","${m.unit}","${m.specCode}","${m.approxRateInr}","${m.totalEstCost}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `TenderHub_BOQ_Materials_${inputTenderId || 'Schedule'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="estimator-page min-h-screen bg-paper dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors pb-20">
      
      {/* 1. HEADER & CONTRACTOR PROFILE STRIP */}
      <section className="bg-white dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/80 pt-8 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left 7 Columns: Title, Scrutiny Description & Search */}
            <div className="estimator-primary lg:col-span-8 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-900/30 text-dalBlue dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Cpu className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" />
                <span>AI Quantity Surveyor &amp; Copilot</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                AI Tender Analysis
              </h1>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Analyze tender documents, compare turnover and solvency criteria, extract material schedules, and review contractual risks before you submit a bid. Confirm key requirements in the source documents.
              </p>

              {/* Tender Analysis Input Console */}
              <div className="pt-2">
                <div className="p-1.5 sm:p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-2">
                  <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Enter a Tender ID or portal reference"
                      value={inputTenderId}
                      onChange={(e) => setInputTenderId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                      aria-label="Tender ID or portal reference"
                      className="pl-10 text-xs sm:text-sm border-0 bg-transparent focus-visible:ring-0 shadow-none"
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => handleAnalyze()}
                    disabled={analyzing || !profileReady}
                    className="w-full sm:w-auto text-xs font-semibold shrink-0"
                  >
                    {analyzing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Analyzing tender...
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Analyze tender
                      </>
                    )}
                  </Button>
                </div>

                {/* Status / Feedback message */}
                {statusMsg && (
                  <p className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>{statusMsg}</span>
                  </p>
                )}
                {error && (
                  <div className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                    <p className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /><span>{error}</span></p>
                    {!isAuthenticated && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="mt-2"
                        onClick={() => navigate(`/signup?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`)}
                      >
                        Sign in / Sign up
                      </Button>
                    )}
                    {dossierLimitReached && <a href="/services#pricing" className="mt-2 inline-flex rounded-md bg-dalBlue px-3 py-2 font-semibold text-white">Unlock Unlimited Dossiers - ₹999/mo</a>}
                  </div>
                )}
                {!dossierData && exampleTender && (
                  <button type="button" onClick={() => setInputTenderId(exampleTender.sourceTenderId || exampleTender._id)} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-dalBlue dark:text-blue-300 hover:underline">
                    <span>Try an example</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">{exampleTender.sourceTenderId || exampleTender._id}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right 5 Columns: Contractor Baseline & Capacity Card */}
            <div className="estimator-profile lg:col-span-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <Building2 className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                    <span>Contractor Profile Baseline</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(true)}
                    className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Configure Profile</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registered Entity</span>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {profile?.companyName || 'Profile not configured'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Registration Class</span>
                      <span className="font-semibold text-xs text-dalBlue dark:text-blue-300 block truncate mt-0.5">
                        {profile?.registrationClass || 'Not provided'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Avg Annual Turnover</span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white block mt-0.5">
                        {profile?.avgAnnualTurnoverInr ? `₹${(profile.avgAnnualTurnoverInr / 1e7).toFixed(1)} Crore` : 'Not provided'}
                      </span>
                    </div>
                  </div>
                  {profile?.companyName === 'Prime Infrastructure & Engineering' && (
                    <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
                      Example profile values are prefilled. Review and update them before using personalized analysis.
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Available AI Dossiers:</span>
                  <Badge variant="success">
                      {profile?.credits?.availableDossiers ?? '—'} Dossiers Available
                  </Badge>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. MAIN WORKSPACE / DOSSIER CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {dossierData ? (
          <div className="space-y-6">
            {/* Executive Snapshot Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {dossierData.executiveOverview?.department || 'Department not listed'}
                  </Badge>
                  <span className="text-xs text-slate-500 font-mono">
                    Ref: {dossierData.sourceTenderId || dossierData.tenderId}
                  </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">TenderHub record</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {dossierData.executiveOverview?.title}
                </h2>
                <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-200/70 dark:border-slate-700/60 leading-relaxed">
                  {dossierData.summary}
                </div>
              </div>

              {/* Personalized Match Pill */}
              {personalizedFit && (
                <div className="bg-slate-50 dark:bg-slate-900/70 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 text-center min-w-[200px]">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Contractor Fit Rating
                  </p>
                  <p className="text-3xl font-bold text-dalBlue dark:text-blue-400 mt-1">
                    {personalizedFit.matchScore}%
                  </p>
                  <div className="mt-1">
                    <Badge variant={personalizedFit.matchScore >= 80 ? 'success' : 'warning'}>
                      {personalizedFit.verdict}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Tabs - Clean Segmented Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
              {[
                { id: 'preBid', label: '1. Win The Bid (Pre-Bid)', icon: TrendingUp },
                { id: 'boq', label: '2. Raw Materials & BOQ', icon: Boxes },
                { id: 'execution', label: '3. Execution & Milestones', icon: Calendar },
                { id: 'copilot', label: '4. Contractor Copilot Chat', icon: Sparkles },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-dalBlue text-white shadow-xs font-bold'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT PANELS */}
            <div>
              {/* TAB 1: PRE-BID WINNING INSIGHTS */}
              {activeTab === 'preBid' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Eligibility & Gaps */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Financial & Technical Fit Breakdown */}
                    {personalizedFit && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Scale className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                            <span>Financial &amp; Technical Fit Breakdown</span>
                          </h3>
                          <span className="text-xs text-slate-500">
                            Based on {personalizedFit.contractorName}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase">3-Yr Avg Turnover</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                              ₹{(personalizedFit.turnoverCheck.contractor / 1e7).toFixed(2)} Cr
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Req: ₹{(personalizedFit.turnoverCheck.required / 1e7).toFixed(2)} Cr
                            </p>
                            <div className="mt-2 text-xs font-semibold">
                              {personalizedFit.turnoverCheck.passed ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Compliant
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> JV Needed
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase">Bank Solvency</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                              ₹{(personalizedFit.solvencyCheck.contractor / 1e7).toFixed(2)} Cr
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Req: ₹{(personalizedFit.solvencyCheck.required / 1e7).toFixed(2)} Cr
                            </p>
                            <div className="mt-2 text-xs font-semibold">
                              {personalizedFit.solvencyCheck.passed ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Sufficient
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Enhance Solvency
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase">Single Work Done</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                              ₹{(personalizedFit.experienceCheck.contractor / 1e7).toFixed(2)} Cr
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Req: ₹{(personalizedFit.experienceCheck.required / 1e7).toFixed(2)} Cr
                            </p>
                            <div className="mt-2 text-xs font-semibold">
                              {personalizedFit.experienceCheck.passed ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Fully Eligible
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Check Sub-work
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Identified Gaps Cards */}
                        {personalizedFit.identifiedGaps?.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Identified Capacity Gaps:
                            </p>
                            {personalizedFit.identifiedGaps.map((gap, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5"
                              >
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-xs space-y-1">
                                  <p className="font-semibold text-amber-900 dark:text-amber-200">{gap.title}</p>
                                  <p className="text-slate-600 dark:text-slate-300">{gap.detail}</p>
                                  <p className="font-medium text-dalBlue dark:text-blue-400">
                                    Mitigation: {gap.recommendation}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mandatory Document Submission Checklist */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                        <span>Mandatory Document &amp; Affidavit Submission Pack</span>
                      </h3>
                      <div className="space-y-2.5">
                        {dossierData.preBidAnalysis?.mandatoryDocumentChecklist?.map((doc) => (
                          <div
                            key={doc.sNo}
                            className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-dalBlue dark:text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                                  {doc.sNo}
                                </span>
                                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{doc.title}</p>
                                <Badge variant="outline" className="text-[10px]">
                                  {doc.stage}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 pl-7">{doc.description}</p>
                              {doc.complianceTip && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium pl-7">
                                  Note: {doc.complianceTip}
                                </p>
                              )}
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/60 shrink-0">
                              Compulsory
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Contract Risk & GCC Red Flags */}
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        <span>GCC Risk &amp; Contract Traps</span>
                      </h3>
                      <div className="space-y-3">
                        {dossierData.preBidAnalysis?.riskAndRedFlags?.map((risk, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-semibold text-slate-500">
                                {risk.clauseReference || 'GCC Clause'}
                              </span>
                              <Badge variant={risk.severity === 'HIGH' ? 'destructive' : 'warning'}>
                                {risk.severity} Risk
                              </Badge>
                            </div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{risk.title}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{risk.riskSummary}</p>
                            <p className="text-[11px] font-medium text-dalBlue dark:text-blue-400 pt-0.5">
                              Mitigation: {risk.mitigationAction}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BOQ RAW MATERIAL SCHEDULE */}
              {activeTab === 'boq' && (
                <div className="space-y-6">
                  {/* Summary & Download Bar */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                        <span>Bill of Quantities: Primary Raw Material Breakdown</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {dossierData.preBidAnalysis?.boqMaterialBreakdown?.summary}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={downloadBoqCsv}
                      className="self-start sm:self-center text-xs"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export BOQ (CSV)
                    </Button>
                  </div>

                  {/* Material Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {dossierData.preBidAnalysis?.boqMaterialBreakdown?.materials?.map((mat, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2"
                      >
                        <Badge variant="outline" className="text-[10px]">
                          {mat.category || 'Material'}
                        </Badge>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {mat.name}
                        </h4>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                          <p className="text-xl font-bold text-slate-900 dark:text-white">
                            {mat.estimatedQuantity}
                          </p>
                          <p className="text-xs text-slate-500">Rate: {mat.approxRateInr}</p>
                          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            Est. Outlay: {mat.totalEstCost}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* BOQ Line Items Table */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Standard Schedule of Rates (SOR) Extracted Line Items
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Item No</th>
                            <th className="py-2.5 px-4 font-semibold">Description of Work Item</th>
                            <th className="py-2.5 px-4 font-semibold">Quantity</th>
                            <th className="py-2.5 px-4 font-semibold">Unit</th>
                            <th className="py-2.5 px-4 font-semibold">Est. Rate (₹)</th>
                            <th className="py-2.5 px-4 font-semibold">Est. Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {dossierData.preBidAnalysis?.boqMaterialBreakdown?.boqLineItems?.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-750">
                              <td className="py-2.5 px-4 font-mono font-semibold text-dalBlue dark:text-blue-400">{item.itemNo}</td>
                              <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 max-w-md">{item.description}</td>
                              <td className="py-2.5 px-4 font-semibold">{item.quantity}</td>
                              <td className="py-2.5 px-4 text-slate-500">{item.unit}</td>
                              <td className="py-2.5 px-4">₹{item.estimatedRate?.toLocaleString('en-IN')}</td>
                              <td className="py-2.5 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                                ₹{item.estimatedAmount?.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: POST-AWARD EXECUTION & MILESTONES */}
              {activeTab === 'execution' && (
                <div className="space-y-6">
                  {/* Procurement Phasing */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                      <span>Post-Award Material Procurement &amp; Staging Schedule</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {dossierData.postAwardAnalysis?.procurementSchedule?.map((phase, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 space-y-2"
                        >
                          <span className="text-[10px] font-bold text-dalBlue dark:text-blue-400 uppercase tracking-wider">
                            {phase.timeframe}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">{phase.phase}</h4>
                          <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold text-slate-500">Materials to Mobilize:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {phase.materialsToMobilize?.map((m, mIdx) => (
                                <li key={mIdx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 pt-1">
                            Critical Path: {phase.criticalPathItems}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Milestone Delivery Tracker */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span>Departmental Physical &amp; Financial Milestones</span>
                    </h3>
                    <div className="space-y-3">
                      {dossierData.postAwardAnalysis?.milestones?.map((m) => (
                        <div
                          key={m.milestoneNo}
                          className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="primary" className="text-[10px]">
                                Milestone {m.milestoneNo}
                              </Badge>
                              <span className="text-xs font-semibold text-slate-500">
                                Target: {m.targetDays} Days
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {m.description}
                            </p>
                            <p className="text-xs text-rose-600 dark:text-rose-400">
                              Penalty if delayed: {m.penaltyIfDelayed}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Billing Target</p>
                            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                              {m.financialProgressPct}% Progress
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: INTERACTIVE CONTRACTOR COPILOT CHAT */}
              {activeTab === 'copilot' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col h-[560px] overflow-hidden">
                  {/* Chat Header */}
                  <div className="p-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-dalBlue text-white flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          Personalized Tender Copilot
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Grounded in tender specs &amp; {profile?.companyName || 'your contractor profile'} capacity
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                      Queries Remaining: {profile?.credits?.copilotQueriesLimit - (profile?.credits?.copilotQueriesUsed || 0) || 50}
                    </span>
                  </div>

                  {/* Messages Area */}
                  {chatLockedUntil && countdownNow < new Date(chatLockedUntil).getTime() && (
                    <div className="mx-3 mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                      <strong>⏳ Free Session Limit Reached (5/5 Queries)</strong>
                      <p className="mt-1">Chat is locked for 24 hours. Resumes in: {(() => { const seconds = Math.max(0, Math.ceil((new Date(chatLockedUntil).getTime() - countdownNow) / 1000)); return `${Math.floor(seconds / 3600)}h : ${Math.floor((seconds % 3600) / 60)}m : ${seconds % 60}s`; })()}</p>
                      <a href="/services#pricing" className="mt-1 inline-block font-semibold text-blue-700 dark:text-blue-300">⚡ Upgrade to Starter - Instant Unlimited Access</a>
                    </div>
                  )}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-2.5 max-w-2xl ${
                          msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          msg.role === 'user'
                            ? 'bg-dalBlue text-white'
                            : 'bg-blue-100 dark:bg-blue-900/60 text-dalBlue dark:text-blue-300'
                        }`}>
                          {msg.role === 'user' ? 'You' : 'AI'}
                        </div>
                        <div className={`p-3 rounded-xl text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-dalBlue text-white'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/60'
                        }`}>
                          <div className="whitespace-pre-line">{renderCopilotText(msg.content)}</div>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-2.5 max-w-2xl">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-dalBlue flex items-center justify-center shrink-0 text-[10px] font-bold">
                          AI
                        </div>
                        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 text-xs text-slate-500 flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Scanning tender clauses...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Suggested Question Chips */}
                  <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-2 overflow-x-auto text-[11px]">
                    {[
                      'EMD amount & CDR submission rules?',
                      'Check my turnover eligibility',
                      'Cement and Steel total quantities',
                      'What is the delay penalty rate?',
                    ].map((promptText, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setChatInput(promptText);
                        }}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-dalBlue shrink-0 cursor-pointer text-xs"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>

                  {/* Input Form */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="Ask questions about this tender (EMD, BOQ, penalty clauses)..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="text-xs"
                      disabled={Boolean(chatLockedUntil && countdownNow < new Date(chatLockedUntil).getTime())}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={chatLoading || !chatInput.trim() || Boolean(chatLockedUntil && countdownNow < new Date(chatLockedUntil).getTime())}
                      className="shrink-0"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Send
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="estimator-empty-state max-w-5xl mx-auto border-t border-slate-200 dark:border-slate-700 py-8 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Analysis workspace</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Enter a tender reference above to begin. Analysis results will appear here when available.
              </p>
            </div>
          </div>
        )}


      </main>

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
                  <span>Configure Contractor Baseline</span>
                </h3>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs">
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
                      onChange={(e) => setEditProfile({ ...editProfile, avgAnnualTurnoverInr: Number(e.target.value) })}
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
                      onChange={(e) => setEditProfile({ ...editProfile, solvencyLimitInr: Number(e.target.value) })}
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
                      onChange={(e) => setEditProfile({ ...editProfile, largestSingleWorkDoneInr: Number(e.target.value) })}
                    />
                  </div>
                </div>

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
                    variant="primary"
                    size="sm"
                  >
                    Save Baseline
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
