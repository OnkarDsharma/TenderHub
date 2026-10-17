/**
 * @file frontend/src/pages/Services.jsx
 * @description Dedicated AI Services section offering personalized contractor tender analysis,
 * BOQ raw material extraction, post-award execution schedules, and interactive Copilot.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Wrench,
  ShieldAlert,
  HelpCircle,
  CreditCard,
  Check,
  ChevronRight,
  RefreshCw,
  Search,
  Sliders,
  DollarSign,
  Scale
} from 'lucide-react';
import { servicesApi } from '../services/servicesApi';
import { billingApi } from '../services/billingApi';
import { useAuthStore } from '../store/useAuthStore';

export default function Services() {
  const { tenderId: paramTenderId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  // State Management
  const [plans, setPlans] = useState([]);
  const [profile, setProfile] = useState(null);
  const [inputTenderId, setInputTenderId] = useState(paramTenderId || '');
  const [activeTab, setActiveTab] = useState('preBid'); // 'preBid' | 'boq' | 'execution' | 'copilot'
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dossierData, setDossierData] = useState(null);
  const [personalizedFit, setPersonalizedFit] = useState(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Copilot Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Contractor Profile Edit Modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editProfile, setEditProfile] = useState({
    companyName: '',
    registrationClass: 'Class A Works',
    avgAnnualTurnoverInr: 50000000,
    solvencyLimitInr: 20000000,
    largestSingleWorkDoneInr: 30000000,
  });

  // Load Initial Data
  useEffect(() => {
    loadPlansAndProfile();
  }, []);

  // Auto-analyze if tenderId is present in URL
  useEffect(() => {
    if (paramTenderId) {
      setInputTenderId(paramTenderId);
      handleAnalyze(paramTenderId);
    }
  }, [paramTenderId]);

  const loadPlansAndProfile = async () => {
    try {
      setLoading(true);
      const [fetchedPlans, fetchedProfile] = await Promise.all([
        servicesApi.getPlans().catch(() => []),
        servicesApi.getContractorProfile().catch(() => null),
      ]);
      setPlans(fetchedPlans);
      if (fetchedProfile) {
        setProfile(fetchedProfile);
        setEditProfile({
          companyName: fetchedProfile.companyName || 'Prime Infrastructure',
          registrationClass: fetchedProfile.registrationClass || 'Class A Works',
          avgAnnualTurnoverInr: fetchedProfile.avgAnnualTurnoverInr || 50000000,
          solvencyLimitInr: fetchedProfile.solvencyLimitInr || 20000000,
          largestSingleWorkDoneInr: fetchedProfile.largestSingleWorkDoneInr || 30000000,
        });
      }
    } catch (err) {
      console.error('Failed to load services data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (idToAnalyze = inputTenderId) => {
    const targetId = idToAnalyze?.trim();
    if (!targetId) {
      setError('Please provide a valid Tender ID to analyze.');
      return;
    }

    try {
      setError('');
      setAnalyzing(true);
      setStatusMsg('AI Agents reading tender documentation and calculating contractor fit...');

      const res = await servicesApi.analyzeTender(targetId);
      if (res.success) {
        setDossierData(res.dossier);
        setPersonalizedFit(res.personalizedFit);
        setStatusMsg('AI Analysis completed successfully!');
        loadPlansAndProfile();
        
        // Seed initial copilot welcome message
        setChatMessages([
          {
            role: 'assistant',
            content: `Namaste! I am your Tender Copilot for this work.\n\n• Contractor Profile: ${res.personalizedFit?.contractorName || 'Prime Infrastructure'} (${res.personalizedFit?.registrationClass})\n• Eligibility Match: ${res.personalizedFit?.matchScore}% (${res.personalizedFit?.verdict})\n• Quick Queries: Ask me about EMD/CDR rules, turnover eligibility, BOQ material quantities, or delay penalties.`
          }
        ]);
      } else {
        setError(res.error || 'Failed to complete tender analysis.');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.error || err.message || 'Error executing AI analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

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
        setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Apologies, could not process query. Please retry.' }]);
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.response?.data?.error || err.message}` }]);
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
      setStatusMsg('Contractor memory updated! Re-evaluating bids with updated capacity...');
      if (dossierData) {
        handleAnalyze(dossierData.tenderId);
      }
    } catch (err) {
      setError('Failed to update contractor memory.');
    }
  };

  const handleCheckoutPlan = async (plan) => {
    try {
      const order = await billingApi.createOrder(`ai_${plan.id}`);
      if (order && window.Razorpay) {
        const options = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'TenderHub AI Services',
          description: plan.name,
          order_id: order.orderId,
          handler: async (response) => {
            await billingApi.verifyPayment(response);
            loadPlansAndProfile();
            setStatusMsg(`Payment verified! Plan ${plan.name} is now active.`);
          },
          theme: { color: '#1E3A8A' }
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Mock direct activation in test mode
        alert(`Plan selection: ${plan.name} (₹${plan.price}). Payment gateway ready.`);
      }
    } catch (err) {
      alert(`Checkout error: ${err.message}`);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors pb-24">
      {/* 1. HERO & CONTRACTOR STATUS BAR */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800/80 bg-gradient-to-b from-blue-50/50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 pt-10 pb-12">
        <div className="absolute inset-0 bg-grid-slate-100 dark:bg-grid-slate-800/20 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left 7 Columns: Headline, Subtitle & Symmetrically Aligned Search Console */}
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Next-Gen Contractor Intelligence Suite</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15]">
                Personalized AI Agent &amp; <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500">
                  Tender Quantity Surveyor
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Automate tender document scrutiny, BOQ bulk material calculations, and qualification checks. 
                Tuned specifically for your firm&apos;s registration class, turnover, and machinery.
              </p>

              {/* Symmetrically Aligned Search Console */}
              <div className="pt-2">
                <div className="bg-white dark:bg-slate-900/90 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg flex flex-col sm:flex-row items-center gap-2">
                  <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Enter Tender ID / Portal Reference (e.g., 2026_PWD_321045_1 or Mongo ID)..."
                      value={inputTenderId}
                      onChange={(e) => setInputTenderId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-white"
                    />
                  </div>
                  <button
                    onClick={() => handleAnalyze()}
                    disabled={analyzing}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {analyzing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing with AI...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Analyze Tender</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Status / Error Toast */}
                {statusMsg && (
                  <p className="mt-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{statusMsg}</span>
                  </p>
                )}
                {error && (
                  <p className="mt-2.5 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{error}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Right 5 Columns: Symmetrically Balanced Contractor Memory Card */}
            <div className="lg:col-span-5">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between gap-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Contractor Memory &amp; Baseline</span>
                  </div>
                  <button
                    onClick={() => setShowProfileModal(true)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registered Entity</span>
                    <p className="text-base font-black text-slate-900 dark:text-white truncate mt-0.5">
                      {profile?.companyName || 'Prime Infrastructure & Engineering'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Class Badge</span>
                      <span className="font-bold text-xs text-blue-700 dark:text-blue-300 mt-0.5 block truncate">
                        {profile?.registrationClass || 'Class A Works'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase">Avg Annual Turnover</span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white mt-0.5 block">
                        ₹{((profile?.avgAnnualTurnoverInr || 50000000) / 1e7).toFixed(1)} Crore
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Analysis Credits:</span>
                  </div>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    {profile?.credits?.availableDossiers ?? 2} Free Dossiers Available
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. MAIN DOSSIER & ANALYSIS DASHBOARD */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {dossierData ? (
          <div className="space-y-6">
            {/* Executive Snapshot Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                    {dossierData.executiveOverview?.department || 'Public Works'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Ref: {dossierData.sourceTenderId || dossierData.tenderId}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {dossierData.executiveOverview?.title}
                </h2>
                <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 mt-2">
                  {dossierData.summary}
                </div>
              </div>

              {/* Personalized Match Pill */}
              {personalizedFit && (
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 text-center min-w-[200px]">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Contractor Match Score
                  </p>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {personalizedFit.matchScore}%
                  </p>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    personalizedFit.matchScore >= 80 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {personalizedFit.verdict}
                  </span>
                </div>
              )}
            </div>

            {/* Navigation Tabs - Symmetrical Balanced Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
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
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer text-center ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT PANELS */}
            <div className="mt-4">
              {/* TAB 1: PRE-BID WINNING INSIGHTS */}
              {activeTab === 'preBid' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Eligibility & Gaps */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Personalized Financial & Experience Evaluation */}
                    {personalizedFit && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Scale className="w-4 h-4 text-blue-600" />
                            <span>Financial &amp; Technical Fit Breakdown</span>
                          </h3>
                          <span className="text-xs text-slate-500">
                            Based on {personalizedFit.contractorName}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase">3-Yr Avg Turnover</p>
                            <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                              ₹{(personalizedFit.turnoverCheck.contractor / 1e7).toFixed(2)} Cr
                            </p>
                            <p className="text-xs mt-0.5 text-slate-500">
                              Req: ₹{(personalizedFit.turnoverCheck.required / 1e7).toFixed(2)} Cr
                            </p>
                            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                              {personalizedFit.turnoverCheck.passed ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Compliant
                                </span>
                              ) : (
                                <span className="text-amber-600 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> JV Needed
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase">Bank Solvency</p>
                            <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                              ₹{(personalizedFit.solvencyCheck.contractor / 1e7).toFixed(2)} Cr
                            </p>
                            <p className="text-xs mt-0.5 text-slate-500">
                              Req: ₹{(personalizedFit.solvencyCheck.required / 1e7).toFixed(2)} Cr
                            </p>
                            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                              {personalizedFit.solvencyCheck.passed ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Sufficient
                                </span>
                              ) : (
                                <span className="text-amber-600 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Enhance Solvency
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase">Single Work Done</p>
                            <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                              ₹{(personalizedFit.experienceCheck.contractor / 1e7).toFixed(2)} Cr
                            </p>
                            <p className="text-xs mt-0.5 text-slate-500">
                              Req: ₹{(personalizedFit.experienceCheck.required / 1e7).toFixed(2)} Cr
                            </p>
                            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                              {personalizedFit.experienceCheck.passed ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Fully Eligible
                                </span>
                              ) : (
                                <span className="text-amber-600 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Check Sub-work
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Identified Gaps Cards */}
                        {personalizedFit.identifiedGaps.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              Actionable Gaps Detected:
                            </p>
                            {personalizedFit.identifiedGaps.map((gap, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-3"
                              >
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-xs space-y-1">
                                  <p className="font-bold text-amber-900 dark:text-amber-200">{gap.title}</p>
                                  <p className="text-slate-600 dark:text-slate-300">{gap.detail}</p>
                                  <p className="font-semibold text-blue-600 dark:text-blue-400">
                                    💡 Strategy: {gap.recommendation}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mandatory Document Submission Checklist */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>Mandatory Document &amp; Affidavit Submission Pack</span>
                      </h3>
                      <div className="space-y-3">
                        {dossierData.preBidAnalysis?.mandatoryDocumentChecklist?.map((doc) => (
                          <div
                            key={doc.sNo}
                            className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
                                  {doc.sNo}
                                </span>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">{doc.title}</p>
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {doc.stage}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 pl-7">{doc.description}</p>
                              {doc.complianceTip && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium pl-7">
                                  ⚠️ Tip: {doc.complianceTip}
                                </p>
                              )}
                            </div>
                            <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 shrink-0">
                              Compulsory
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Contract Risk & GCC Red Flags */}
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        <span>GCC Risk &amp; Contract Traps</span>
                      </h3>
                      <div className="space-y-3">
                        {dossierData.preBidAnalysis?.riskAndRedFlags?.map((risk, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-slate-500">
                                {risk.clauseReference || 'GCC Clause'}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                risk.severity === 'HIGH'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              }`}>
                                {risk.severity} Risk
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{risk.title}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300">{risk.riskSummary}</p>
                            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                              🛡️ Mitigation: {risk.mitigationAction}
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
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Boxes className="w-5 h-5 text-blue-600" />
                        <span>Bill of Quantities: Primary Raw Material Breakdown</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-line leading-relaxed">
                        {dossierData.preBidAnalysis?.boqMaterialBreakdown?.summary}
                      </p>
                    </div>
                    <button
                      onClick={downloadBoqCsv}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-2 shadow-sm hover:opacity-90 cursor-pointer self-start sm:self-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export BOQ (CSV)</span>
                    </button>
                  </div>

                  {/* Material Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {dossierData.preBidAnalysis?.boqMaterialBreakdown?.materials?.map((mat, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
                      >
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                          {mat.category || 'Material'}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {mat.name}
                        </h4>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <p className="text-2xl font-black text-slate-900 dark:text-white">
                            {mat.estimatedQuantity}
                          </p>
                          <p className="text-xs text-slate-500">Rate: {mat.approxRateInr}</p>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                            Est. Outlay: {mat.totalEstCost}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* BOQ Line Items Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Standard Schedule of Rates (SOR) Extracted Line Items
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-3 px-4 font-semibold">Item No</th>
                            <th className="py-3 px-4 font-semibold">Description of Work Item</th>
                            <th className="py-3 px-4 font-semibold">Quantity</th>
                            <th className="py-3 px-4 font-semibold">Unit</th>
                            <th className="py-3 px-4 font-semibold">Est. Rate (₹)</th>
                            <th className="py-3 px-4 font-semibold">Est. Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {dossierData.preBidAnalysis?.boqMaterialBreakdown?.boqLineItems?.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                              <td className="py-3 px-4 font-mono font-bold text-blue-600">{item.itemNo}</td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-200 max-w-md">{item.description}</td>
                              <td className="py-3 px-4 font-bold">{item.quantity}</td>
                              <td className="py-3 px-4">{item.unit}</td>
                              <td className="py-3 px-4">₹{item.estimatedRate?.toLocaleString('en-IN')}</td>
                              <td className="py-3 px-4 font-bold text-emerald-600">
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
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>Post-Award Material Procurement &amp; Staging Schedule</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {dossierData.postAwardAnalysis?.procurementSchedule?.map((phase, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2"
                        >
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                            {phase.timeframe}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{phase.phase}</h4>
                          <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold text-slate-500">Materials to Mobilize:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {phase.materialsToMobilize?.map((m, mIdx) => (
                                <li key={mIdx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 pt-1">
                            Critical Path: {phase.criticalPathItems}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Milestone Delivery Tracker */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span>Departmental Physical &amp; Financial Milestones</span>
                    </h3>
                    <div className="space-y-3">
                      {dossierData.postAwardAnalysis?.milestones?.map((m) => (
                        <div
                          key={m.milestoneNo}
                          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs font-black bg-blue-600 text-white">
                                Milestone {m.milestoneNo}
                              </span>
                              <span className="text-xs font-bold text-slate-500">
                                Target: {m.targetDays} Days
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {m.description}
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400">
                              ⚠️ Penalty if delayed: {m.penaltyIfDelayed}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] text-slate-400 font-bold uppercase">Billing Target</p>
                            <p className="text-xl font-black text-emerald-600">
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
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md flex flex-col h-[600px] overflow-hidden">
                  {/* Chat Header */}
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Personalized Tender Copilot
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Grounded in tender specs &amp; {profile?.companyName || 'your profile'} memory
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-semibold">
                      Queries Remaining: {profile?.credits?.copilotQueriesLimit - (profile?.credits?.copilotQueriesUsed || 0) || 50}
                    </span>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 max-w-2xl ${
                          msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300'
                        }`}>
                          {msg.role === 'user' ? 'You' : 'AI'}
                        </div>
                        <div className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/60'
                        }`}>
                          <p className="whitespace-pre-line">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-3 max-w-2xl">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold">
                          AI
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Copilot is scanning tender clauses...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Suggested Question Chips */}
                  <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center gap-2 overflow-x-auto text-[11px]">
                    {[
                      'EMD amount & FDR rules?',
                      'Check my turnover eligibility',
                      'Cement and Steel total quantities',
                      'What is the delay penalty rate?',
                    ].map((promptText, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setChatInput(promptText);
                        }}
                        className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 shrink-0 cursor-pointer"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>

                  {/* Input Form */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Ask any question about this tender (English, Hindi, Hinglish)..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-blue-700 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty State / Feature Showcase if no tender analyzed yet */
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-12 border border-slate-200 dark:border-slate-800 text-center max-w-3xl mx-auto shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <Cpu className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Ready to Analyze Any Government Tender
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
              Paste a Tender ID above, or pick one of the active sample tenders from Jammu &amp; Kashmir, CPWD, or NHAI to see the full AI Dossier in action.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {[
                { label: 'Sample PWD Road Work (₹45 Lakhs)', id: '2026_PWD_321045_1' },
                { label: 'Sample Water Supply Jal Nigam (₹1.8 Cr)', id: '2026_JAL_109283_1' },
                { label: 'Sample Health Building (₹3.2 Cr)', id: '2026_MED_441209_1' },
              ].map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputTenderId(sample.id);
                    handleAnalyze(sample.id);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all cursor-pointer"
                >
                  ⚡ Try {sample.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. PRICING & PLANS FOR SERVICES */}
        <section className="mt-20 pt-12 border-t border-slate-200 dark:border-slate-800">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
              Transparent, Value-Backed Pricing
            </span>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              Choose Your AI Estimator Plan
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              Save up to ₹15,000 per tender compared to manual quantity surveyors. Powered by high-speed Gemini Flash with verified Indian contracting benchmarks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto items-stretch">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all ${
                  plan.popular
                    ? 'bg-white dark:bg-slate-900 border-2 border-blue-600 shadow-xl scale-[1.02]'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                    {plan.badge}
                  </span>
                )}

                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{plan.description}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                      ₹{plan.price}
                    </span>
                    <span className="text-xs font-bold text-slate-500">{plan.unit}</span>
                  </div>

                  <ul className="mt-6 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                    {plan.features?.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => handleCheckoutPlan(plan)}
                  className={`mt-8 w-full py-3 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md cursor-pointer ${
                    plan.popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                  }`}
                >
                  {plan.ctaText || 'Get Started'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* 4. MODAL: EDIT CONTRACTOR PROFILE MEMORY */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <span>Configure Contractor Memory</span>
                </h3>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Company / Firm Name
                  </label>
                  <input
                    type="text"
                    value={editProfile.companyName}
                    onChange={(e) => setEditProfile({ ...editProfile, companyName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Registration Class
                    </label>
                    <select
                      value={editProfile.registrationClass}
                      onChange={(e) => setEditProfile({ ...editProfile, registrationClass: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="Class Special">Class Special / Super Class</option>
                      <option value="Class A Works">Class A Works</option>
                      <option value="Class B Works">Class B Works</option>
                      <option value="Class C Works">Class C Works</option>
                      <option value="Class 1 PWD">Class 1 PWD</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Avg. Turnover (INR)
                    </label>
                    <input
                      type="number"
                      value={editProfile.avgAnnualTurnoverInr}
                      onChange={(e) => setEditProfile({ ...editProfile, avgAnnualTurnoverInr: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Bank Solvency (INR)
                    </label>
                    <input
                      type="number"
                      value={editProfile.solvencyLimitInr}
                      onChange={(e) => setEditProfile({ ...editProfile, solvencyLimitInr: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Largest Single Work (INR)
                    </label>
                    <input
                      type="number"
                      value={editProfile.largestSingleWorkDoneInr}
                      onChange={(e) => setEditProfile({ ...editProfile, largestSingleWorkDoneInr: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer hover:bg-blue-700"
                  >
                    Save Memory
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
