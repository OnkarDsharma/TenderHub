/**
 * @file frontend/src/pages/CheckScore.jsx
 * @description Bid Allocation Probability & Capacity Scoring Engine for Jammu & Kashmir Tenders.
 * Enforces authentication, captures contractor metrics on-demand, stores them in MongoDB,
 * and provides historical reference tracking.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Calculator, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  History, 
  Trash2, 
  ExternalLink,
  Info,
  Lock,
  ArrowRight,
  RefreshCw,
  Search,
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { bidScoreApi } from '@/services/bidScoreApi';
import { api } from '@/services/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ScoreSpeedometer } from '@/components/shared/ScoreSpeedometer';

export default function CheckScore() {
  const { tenderId: paramTenderId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  // State
  const [selectedTender, setSelectedTender] = useState(null);
  const [availableTenders, setAvailableTenders] = useState([]);
  const [manualTenderInput, setManualTenderInput] = useState(paramTenderId || '');
  const [isLoadingTender, setIsLoadingTender] = useState(false);

  // Form Fields (Contractor Metrics)
  const [registrationClass, setRegistrationClass] = useState('');
  const [maxAnnualTurnover, setMaxAnnualTurnover] = useState('');
  const [ongoingCommitments, setOngoingCommitments] = useState('');
  const [largestSimilarWork, setLargestSimilarWork] = useState('');
  const [proposedQuotePercentage, setProposedQuotePercentage] = useState('');
  const [hasMachineryEquipment, setHasMachineryEquipment] = useState(false);
  const [hasValidGstClearance, setHasValidGstClearance] = useState(false);
  const [hasRegistrationCardRenewal, setHasRegistrationCardRenewal] = useState(false);
  const [hasActiveCdrFdrFacility, setHasActiveCdrFdrFacility] = useState(false);
  const [saveAsDefaultProfile, setSaveAsDefaultProfile] = useState(false);

  // Outcome & History
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('calculator'); // 'calculator' | 'history'
  const [errorMessage, setErrorMessage] = useState('');
  const resultsRef = useRef(null);

  // 1. Fetch saved contractor metrics & history on load (if authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadSavedMetrics = async () => {
      try {
        const metricsData = await bidScoreApi.getMetrics();
        if (metricsData) {
          if (metricsData.registrationClass) setRegistrationClass(metricsData.registrationClass);
          const f = metricsData.financialMetrics;
          if (f) {
            if (f.maxAnnualTurnover) setMaxAnnualTurnover(String(f.maxAnnualTurnover));
            if (f.ongoingCommitments) setOngoingCommitments(String(f.ongoingCommitments));
            if (f.largestSimilarWork) setLargestSimilarWork(String(f.largestSimilarWork));
            if (f.hasMachineryEquipment !== undefined) setHasMachineryEquipment(f.hasMachineryEquipment);
            if (f.hasValidGstClearance !== undefined) setHasValidGstClearance(f.hasValidGstClearance);
            if (f.hasRegistrationCardRenewal !== undefined) setHasRegistrationCardRenewal(f.hasRegistrationCardRenewal);
            if (f.hasActiveCdrFdrFacility !== undefined) setHasActiveCdrFdrFacility(f.hasActiveCdrFdrFacility);
          }
        }
      } catch (err) {
        console.error('Failed to load saved metrics:', err);
      }
    };

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const historyData = await bidScoreApi.getHistory();
        setHistory(historyData);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadSavedMetrics();
    loadHistory();
  }, [isAuthenticated]);

  // 2. Fetch tender candidates for dropdown
  useEffect(() => {
    const fetchRecentTenders = async () => {
      try {
        const res = await api.get('/tenders?limit=20');
        const list = res.data?.data?.tenders || res.data?.data || res.data?.tenders || [];
        setAvailableTenders(list);
      } catch (err) {
        console.error('Failed to fetch tenders list:', err);
      }
    };
    fetchRecentTenders();
  }, []);

  // 3. Load target tender if tenderId exists in URL
  useEffect(() => {
    const targetId = paramTenderId;
    if (!targetId) return;

    const fetchTargetTender = async () => {
      setIsLoadingTender(true);
      setErrorMessage('');
      try {
        const res = await api.get(`/tenders/${targetId}`);
        const found = res.data?.data || res.data;
        if (found) {
          setSelectedTender(found);
          setManualTenderInput(found.sourceTenderId || found._id);
        }
      } catch {
        const match = availableTenders.find(t => t._id === targetId || t.sourceTenderId === targetId);
        if (match) {
          setSelectedTender(match);
        }
      } finally {
        setIsLoadingTender(false);
      }
    };

    fetchTargetTender();
  }, [paramTenderId, availableTenders]);

  const handleSelectTender = (tender) => {
    setSelectedTender(tender);
    setManualTenderInput(tender.sourceTenderId || tender._id);
    setErrorMessage('');
  };

  const handleCalculateScore = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return;

    if (!selectedTender) {
      setErrorMessage('Please select or search for a target Jammu & Kashmir tender first.');
      return;
    }

    setTimeout(() => {
      if (resultsRef.current && window.innerWidth < 1024) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 40);

    setIsEvaluating(true);
    setErrorMessage('');

    try {
      const payload = {
        tenderId: selectedTender._id || selectedTender.sourceTenderId,
        maxAnnualTurnover: Number(maxAnnualTurnover) || 0,
        ongoingCommitments: Number(ongoingCommitments) || 0,
        largestSimilarWork: Number(largestSimilarWork) || 0,
        proposedQuotePercentage: Number(proposedQuotePercentage),
        registrationClass,
        hasMachineryEquipment,
        hasValidGstClearance,
        hasRegistrationCardRenewal,
        hasActiveCdrFdrFacility,
        saveAsDefaultProfile,
      };

      const response = await bidScoreApi.evaluateScore(payload);
      if (response.success && response.data) {
        setEvaluationResult(response.data);
        const refreshedHistory = await bidScoreApi.getHistory();
        setHistory(refreshedHistory);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to calculate bid score. Please check your inputs.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleDeleteHistory = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Remove this evaluated contract from your history?')) return;
    try {
      await bidScoreApi.deleteHistoryItem(id);
      setHistory(prev => prev.filter(item => item._id !== id));
      if (evaluationResult?.evaluationId === id) {
        setEvaluationResult(null);
      }
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const formatINR = (val) => {
    if (!val || isNaN(val) || Number(val) <= 0) return null;
    const num = Number(val);
    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    }
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakhs`;
    }
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // If user is not logged in: Institutional Auth-Gate
  if (!isAuthenticated) {
    return (
      <div className="score-page max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 sm:p-10 shadow-xs text-center space-y-5">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-dalBlue dark:text-blue-400 rounded-xl flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-dalBlue dark:text-blue-400">
              Contractor Verification Required
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Bid Eligibility &amp; Score
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Log in to calculate your CPWD / J&amp;K PWD Assessed Bid Capacity, Two-Cover statutory responsiveness, and allocation odds.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700 max-w-md mx-auto text-left space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Standard formula: Assessed Capacity = (A &times; N &times; 2) &minus; B</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Two-Cover Technical Gatekeeper checks (Class, CDR, GST, Turnover)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Additional Performance Security (APS) warnings for quotes below -15%</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={() => navigate(`/login?redirect=${encodeURIComponent('/check-score')}`)}
              className="w-full sm:w-auto text-xs font-semibold"
            >
              Sign In to Contractor Workspace
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/signup?redirect=${encodeURIComponent('/check-score')}`)}
              className="w-full sm:w-auto text-xs font-semibold"
            >
              Register New Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="score-page min-h-screen bg-paper dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-dalBlue dark:text-blue-400 uppercase tracking-wider">
              <Calculator className="w-4 h-4" />
              <span>J&amp;K e-Procurement Scoring Engine</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Bid Eligibility &amp; Score
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
              Assess bid capacity, Two-Cover requirements, and quote competitiveness for J&amp;K public works. This estimate does not guarantee qualification or award.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-lg border border-slate-300 dark:border-slate-700 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('calculator')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'calculator'
                  ? 'bg-white dark:bg-slate-900 text-dalBlue dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Eligibility calculator
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-dalBlue dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Evaluated Bids ({history.length})</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3.5 text-xs font-medium text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: CALCULATOR & RESULT VIEW */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: TENDER SELECTION & CONTRACTOR FORM (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* Step 1: Select Target Contract */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-dalBlue dark:text-blue-300">
                    Step 1: Select Target Tender
                  </span>
                  {selectedTender && (
                    <button 
                      type="button"
                      onClick={() => setSelectedTender(null)}
                      className="text-xs font-semibold text-chinarRed hover:underline cursor-pointer"
                    >
                      Change Tender
                    </button>
                  )}
                </div>

                {selectedTender ? (
                  <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3.5 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-dalBlue dark:text-blue-300">
                        ID: {selectedTender.sourceTenderId}
                      </span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatINR(selectedTender.estimatedValue) || `₹${selectedTender.estimatedValue}`}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                      {selectedTender.title?.replace(/[[\]]/g, '')}
                    </h3>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-slate-400">Department</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">
                          {selectedTender.departmentName || 'Not provided'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-slate-400">Class</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {selectedTender.tendererClass || 'Not provided'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Pick from Active Public Works:
                      </label>
                      <select
                        onChange={(e) => {
                          const tender = availableTenders.find(t => t._id === e.target.value || t.sourceTenderId === e.target.value);
                          if (tender) handleSelectTender(tender);
                        }}
                        defaultValue=""
                        className="w-full text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
                      >
                        <option value="" disabled>-- Select a recent tender --</option>
                        {availableTenders.map(t => (
                          <option key={t._id} value={t._id}>
                            {t.sourceTenderId} • {t.title} ({formatINR(t.estimatedValue) || '—'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="relative flex items-center justify-center my-1.5">
                      <span className="bg-white dark:bg-slate-800 px-2 text-[10px] font-bold text-slate-400 uppercase">OR Enter Notice ID</span>
                      <div className="absolute inset-x-0 h-px bg-slate-200 dark:border-slate-700 -z-10" />
                    </div>

                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="e.g. 2026_PWD_321045_1"
                        value={manualTenderInput}
                        onChange={(e) => setManualTenderInput(e.target.value)}
                        className="text-xs font-mono"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={async () => {
                          if (!manualTenderInput) return;
                          setIsLoadingTender(true);
                          try {
                            const res = await api.get(`/tenders/${manualTenderInput.trim()}`);
                            const found = res.data?.data || res.data;
                            if (found) setSelectedTender(found);
                          } catch {
                            setErrorMessage('Tender ID not found in database. Please check the ID.');
                          } finally {
                            setIsLoadingTender(false);
                          }
                        }}
                        aria-label="Find tender by reference"
                      >
                        {isLoadingTender ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Contractor Financial & Bidding Inputs */}
              <form onSubmit={handleCalculateScore} className="score-entry-form bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
                <span className="text-xs font-semibold text-dalBlue dark:text-blue-300 block">
                  Step 2: Contractor credentials and financial capacity
                </span>

                {/* Registration Class */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Registration class (J&amp;K PWD / CPWD)
                  </label>
                  <select
                    value={registrationClass}
                    required
                    onChange={(e) => setRegistrationClass(e.target.value)}
                    className="w-full text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>Select registration class</option>
                    <option value="Class Special">Class Special / Super Class (Unlimited Value)</option>
                    <option value="Class A Works">Class A Works (Up to ₹10.0+ Crores)</option>
                    <option value="Class B Works">Class B Works (Up to ₹2.5 Crores)</option>
                    <option value="Class C Works">Class C Works (Up to ₹1.0 Crore)</option>
                    <option value="Class D Works">Class D Works (Up to ₹25 Lakhs)</option>
                  </select>
                </div>

                <h3 className="score-subsection-title">Financial capacity</h3>

                {/* Max Annual Turnover (A) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Peak annual civil turnover (A) · ₹
                    </label>
                    {formatINR(maxAnnualTurnover) && (
                      <span className="text-[11px] font-mono font-bold text-dalBlue dark:text-blue-400">
                        {formatINR(maxAnnualTurnover)}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="Enter maximum 1-year turnover in last 5 FYs (e.g. 15000000)"
                    value={maxAnnualTurnover}
                    onChange={(e) => setMaxAnnualTurnover(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Peak turnover achieved in any 1 FY among the last 5 financial years</span>
                </div>

                {/* Ongoing Commitments (B) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Ongoing commitments during contract period (B) · ₹
                    </label>
                    {formatINR(ongoingCommitments) && (
                      <span className="text-[11px] font-mono font-bold text-dalBlue dark:text-blue-400">
                        {formatINR(ongoingCommitments)}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="Value of works in hand to complete during this period (e.g. 5000000)"
                    value={ongoingCommitments}
                    onChange={(e) => setOngoingCommitments(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Enter the rupee value of works in hand due during this contract period.</span>
                </div>

                {/* Single Largest Similar Work */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Single largest completed similar work · ₹
                    </label>
                    {formatINR(largestSimilarWork) && (
                      <span className="text-[11px] font-mono font-bold text-dalBlue dark:text-blue-400">
                        {formatINR(largestSimilarWork)}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="Value of largest completed work (e.g. 8000000)"
                    value={largestSimilarWork}
                    onChange={(e) => setLargestSimilarWork(e.target.value)}
                    required
                  />
                </div>

                {/* Proposed Quoting Rate */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="score-subsection-title">Step 3: Proposed bid</span>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Proposed Quoting Rate (% vs Advertised SSR):
                    </label>
                    <Badge variant={Number(proposedQuotePercentage) < -15 ? 'warning' : 'primary'}>
                      {proposedQuotePercentage ? `${proposedQuotePercentage}%` : 'Enter rate'}
                    </Badge>
                  </div>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="-7.5"
                    value={proposedQuotePercentage}
                    onChange={(e) => setProposedQuotePercentage(e.target.value)}
                    required
                  />
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <p>Negative values are discounts; positive values are premiums against the advertised SSR.</p>
                    <p>• <strong>-5% to -14.9%:</strong> Typical competitive corridor in J&amp;K.</p>
                    <p>• <strong>Below -15%:</strong> Triggers mandatory Additional Performance Security (APS).</p>
                  </div>
                </div>

                {/* Statutory Checkboxes */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                  <h3 className="score-subsection-title">Eligibility and equipment checks</h3>
                  <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasRegistrationCardRenewal}
                      onChange={(e) => setHasRegistrationCardRenewal(e.target.checked)}
                      className="rounded border-slate-300 text-dalBlue"
                    />
                    <span>Registration Card renewed for current Financial Year</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasValidGstClearance}
                      onChange={(e) => setHasValidGstClearance(e.target.checked)}
                      className="rounded border-slate-300 text-dalBlue"
                    />
                    <span>Latest GSTR-3B filed &amp; Tax clearance certificate available</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasActiveCdrFdrFacility}
                      onChange={(e) => setHasActiveCdrFdrFacility(e.target.checked)}
                      className="rounded border-slate-300 text-dalBlue"
                    />
                    <span>CDR / FDR pledged to Executive Engineer prepared</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasMachineryEquipment}
                      onChange={(e) => setHasMachineryEquipment(e.target.checked)}
                      className="rounded border-slate-300 text-dalBlue"
                    />
                    <span>Required road rollers, tippers, or concrete plant available</span>
                  </label>
                </div>

                {/* Save to Profile Checkbox */}
                <div className="pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsDefaultProfile}
                      onChange={(e) => setSaveAsDefaultProfile(e.target.checked)}
                      className="rounded border-slate-300 text-dalBlue"
                    />
                    <span>Save updated baseline metrics to profile</span>
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={isEvaluating}
                  className="w-full text-xs font-semibold mt-2"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Computing Capacity &amp; L1 Odds...
                    </>
                  ) : (
                    <>
                      <Calculator className="w-3.5 h-3.5 mr-1.5" />
                  Calculate eligibility
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* RIGHT COLUMN: EVALUATION RESULTS DASHBOARD (7 cols) */}
            <div ref={resultsRef} className="lg:col-span-7">
              {isEvaluating && !evaluationResult ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-xs space-y-6">
                  <ScoreSpeedometer
                    score={50}
                    maxScore={100}
                    label="EVALUATING ALLOCATION ODDS..."
                    probability="Analyzing"
                    subtext={`Evaluating tender ${selectedTender?.sourceTenderId || ''} against statutory criteria`}
                    isCalculating={true}
                  />
                  <div className="p-3.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center gap-2 text-xs font-medium text-dalBlue dark:text-blue-300">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>Calculating Assessed Bid Capacity (A &times; N &times; 2 &minus; B)...</span>
                  </div>
                </div>
              ) : evaluationResult ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs space-y-5">
                  
                  {/* Gauge */}
                  <div className="space-y-4">
                    <ScoreSpeedometer
                      score={evaluationResult.results.totalScore}
                      maxScore={100}
                      label="BID ALLOCATION SCORE"
                      probability={evaluationResult.results.allocationProbability}
                      subtext={`NIT Reference: ${evaluationResult.tender.sourceTenderId}`}
                      isCalculating={isEvaluating}
                    />

                    {/* Target Contract Snapshot */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Evaluated Work
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                          {evaluationResult.tender.title?.replace(/[[\]]/g, '')}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {evaluationResult.tender.departmentName || 'Not provided'} • Class {evaluationResult.inputs?.registrationClass}
                        </p>
                      </div>

                      <div className="text-left sm:text-right shrink-0 sm:border-l sm:border-slate-200 dark:sm:border-slate-700 sm:pl-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Two-Cover Eligibility
                        </span>
                        <span className={`text-xs font-bold inline-flex items-center gap-1.5 mt-0.5 ${
                          evaluationResult.results.isCover1Eligible ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {evaluationResult.results.isCover1Eligible ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Technically Responsive</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Disqualification Risk</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assessed Capacity Metric Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Assessed Capacity</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {formatINR(evaluationResult.results.assessedBidCapacity) || '₹0'}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">(A &times; N &times; 2) &minus; B</span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Tender Value</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {formatINR(evaluationResult.tender.estimatedValue) || 'Not provided'}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Advertised Cost</span>
                    </div>

                    <div className={`p-3 rounded-lg border ${
                      evaluationResult.results.bidCapacitySurplus >= 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}>
                      <span className="text-[10px] uppercase font-bold block">
                        {evaluationResult.results.bidCapacitySurplus >= 0 ? 'Capacity Surplus' : 'Capacity Deficit'}
                      </span>
                      <span className="text-sm font-bold font-mono">
                        {formatINR(Math.abs(evaluationResult.results.bidCapacitySurplus)) || '₹0'}
                      </span>
                      <span className="text-[10px] block mt-0.5">
                        {evaluationResult.results.bidCapacitySurplus >= 0 ? 'Eligible to Bid' : 'Deficit Risk'}
                      </span>
                    </div>
                  </div>

                  {/* 4 Pillars Scoring */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Evaluation Breakdown by Pillar
                    </h3>

                    <div className="space-y-2.5">
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-700 dark:text-slate-300">1. Assessed Bid Capacity &amp; Turnover</span>
                          <span className="font-mono text-dalBlue dark:text-blue-400 font-bold">
                            {evaluationResult.results.categoryScores.bidCapacityScore} / 30
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-dalBlue h-full rounded-full transition-all duration-300" 
                            style={{ width: `${(evaluationResult.results.categoryScores.bidCapacityScore / 30) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-700 dark:text-slate-300">2. Technical Experience &amp; Class Match</span>
                          <span className="font-mono text-dalBlue dark:text-blue-400 font-bold">
                            {evaluationResult.results.categoryScores.technicalExperienceScore} / 25
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-600 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${(evaluationResult.results.categoryScores.technicalExperienceScore / 25) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-700 dark:text-slate-300">3. Pricing Strategy &amp; L1 Corridor</span>
                          <span className="font-mono text-dalBlue dark:text-blue-400 font-bold">
                            {evaluationResult.results.categoryScores.pricingCompetitivenessScore} / 25
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-600 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${(evaluationResult.results.categoryScores.pricingCompetitivenessScore / 25) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-700 dark:text-slate-300">4. Statutory J&amp;K Compliance (CDR, GST, Card)</span>
                          <span className="font-mono text-dalBlue dark:text-blue-400 font-bold">
                            {evaluationResult.results.categoryScores.statutoryComplianceScore} / 20
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-amber-500 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${(evaluationResult.results.categoryScores.statutoryComplianceScore / 20) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Risk Flags */}
                  {evaluationResult.results.riskFlags?.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Critical Risk Flags &amp; APS Notifications</span>
                      </div>
                      <ul className="text-xs text-amber-900/90 dark:text-amber-200/90 space-y-1 pl-5 list-disc">
                        {evaluationResult.results.riskFlags.map((flag, idx) => (
                          <li key={idx} className="leading-relaxed">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strategic Recommendations */}
                  {evaluationResult.results.actionableInsights?.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <span>Strategic Bidding Insights</span>
                      </div>
                      <ul className="text-xs text-emerald-900/90 dark:text-emerald-200/90 space-y-1 pl-5 list-disc">
                        {evaluationResult.results.actionableInsights.map((ins, idx) => (
                          <li key={idx} className="leading-relaxed">{ins}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Transparency Note */}
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      This assessment uses the configured J&amp;K PWD / CPWD Works formula (A &times; N &times; 2) &minus; B and the details entered above. It is not a guarantee of qualification; the tender committee makes the official decision.
                    </span>
                  </div>

                  {/* Link to Notice */}
                  <div className="pt-2 flex justify-end">
                    <Link
                      to={`/tenders/${evaluationResult.tender.sourceTenderId}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-dalBlue dark:text-blue-300 hover:underline"
                    >
                      <span>View tender details</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                </div>
              ) : (
                /* Empty Placeholder State */
                <div className="score-empty bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center space-y-3">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-sm mx-auto">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      No Score Evaluated Yet
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Select an active tender on the left, enter your turnover figures and quoting percentage, and calculate your assessed bid score.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: EVALUATED BIDS HISTORY */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Evaluated Bids History
                </h2>
                <p className="text-xs text-slate-500">
                  Past evaluations saved under your contractor profile.
                </p>
              </div>
              <Badge variant="outline">
                {history.length} Record(s)
              </Badge>
            </div>

            {isLoadingHistory ? (
              <div className="py-10 flex justify-center items-center gap-2 text-xs font-semibold text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading saved evaluations...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="py-10 text-center space-y-2.5">
                <History className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-xs text-slate-500">No evaluations saved yet. Run your first check on any active tender.</p>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={() => setActiveTab('calculator')}
                >
                  Run a Bid Check Now
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {history.map((item) => (
                  <div 
                    key={item._id}
                    onClick={() => {
                      setEvaluationResult({
                        evaluationId: item._id,
                        tender: item.tenderSnapshot,
                        inputs: item.inputs,
                        results: item.results,
                      });
                      setActiveTab('calculator');
                    }}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-750 px-3 rounded-lg transition-colors cursor-pointer group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-dalBlue dark:text-blue-300 border border-slate-200 dark:border-slate-700">
                          {item.tenderSnapshot?.sourceTenderId}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate max-w-lg group-hover:text-dalBlue dark:group-hover:text-blue-400">
                        {item.tenderSnapshot?.title?.replace(/[[\]]/g, '')}
                      </h4>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span>Value: <strong>{formatINR(item.tenderSnapshot?.estimatedValue) || 'Verified'}</strong></span>
                        <span>Quote: <strong>{item.inputs?.proposedQuotePercentage}%</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900 dark:text-white block font-mono">
                          {item.results?.totalScore} / 100
                        </span>
                        <Badge
                          variant={
                            item.results?.allocationProbability === 'High' ? 'success' :
                            item.results?.allocationProbability === 'Moderate' ? 'warning' :
                            'destructive'
                          }
                          className="text-[10px]"
                        >
                          {item.results?.allocationProbability}
                        </Badge>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(item._id, e)}
                        title="Delete from history"
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
