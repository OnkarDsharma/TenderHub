/**
 * @file src/pages/Pricing.jsx
 * @description Transparent B2B pricing plans for TenderHub J&K.
 * Offers segmented tabs for Tender Discovery & Alerts (Pro Plans) and AI Quantity Surveyor (Copilot Plans).
 */
import { useState, useEffect } from 'react';
import { 
  Check, 
  Shield, 
  ArrowRight, 
  MessageSquare, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  X,
  PhoneCall,
  HelpCircle,
  Layers,
  Bot
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { billingApi } from '@/services/billingApi';
import { notificationApi } from '@/services/notificationApi';

export default function Pricing() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('tenders'); // 'tenders' | 'ai'
  const [subscription, setSubscription] = useState(null);
  const [loadingPlanId, setLoadingPlanId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // WhatsApp confirmation modal state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Fetch current user subscription status and saved WhatsApp preferences
  useEffect(() => {
    if (isAuthenticated) {
      billingApi.getStatus()
        .then((sub) => setSubscription(sub))
        .catch(() => {});

      notificationApi.getPreferences()
        .then((pref) => {
          if (pref?.whatsappPhone) {
            setWhatsappPhone(pref.whatsappPhone);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleInitiateUpgrade = (plan) => {
    if (!isAuthenticated) {
      navigate('/login?redirect=/pricing');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setSelectedPlan(plan);
    setShowPhoneModal(true);
  };

  const handleProceedToPayment = async (e) => {
    e?.preventDefault();
    const cleanPhone = whatsappPhone.trim().replace(/\D/g, '');

    if (!cleanPhone || cleanPhone.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number for WhatsApp alerts.');
      return;
    }

    setPhoneError('');
    setShowPhoneModal(false);
    setLoadingPlanId(selectedPlan.id);

    try {
      const orderData = await billingApi.createOrder(selectedPlan.id);

      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        throw new Error('Failed to load Razorpay payment gateway. Please check your internet connection.');
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'TenderHub J&K',
        description: `${selectedPlan.name} Subscription`,
        order_id: orderData.orderId,
        prefill: {
          name: orderData.prefill?.name || user?.name || '',
          email: orderData.prefill?.email || user?.email || '',
          contact: cleanPhone,
        },
        theme: {
          color: '#102D49',
        },
        modal: {
          ondismiss: () => {
            setLoadingPlanId(null);
          }
        },
        handler: async (response) => {
          try {
            setLoadingPlanId(selectedPlan.id);
            const verifyRes = await billingApi.verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planId: selectedPlan.id,
              phone: cleanPhone,
            });

            if (verifyRes.success) {
              setSuccessMessage(`Payment verified. ${selectedPlan.name} is now active. Receipt and onboarding sent to WhatsApp ${cleanPhone}.`);
              const updatedSub = await billingApi.getStatus();
              setSubscription(updatedSub);
              checkAuth();
            }
          } catch (err) {
            setErrorMessage(err.response?.data?.message || 'Payment verification failed.');
          } finally {
            setLoadingPlanId(null);
          }
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', function (failResponse) {
        setErrorMessage(`Payment Failed: ${failResponse.error?.description || 'Transaction declined.'}`);
        setLoadingPlanId(null);
      });
      paymentObject.open();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || 'Payment initiation failed.');
      setLoadingPlanId(null);
    }
  };

  const PRO_PLANS = [
    {
      id: 'free',
      name: 'Free Starter',
      price: '₹0',
      period: 'forever',
      ratePerDay: 'Free forever',
      badge: 'Basic Access',
      desc: 'Discover active tenders and evaluate public works across J&K.',
      features: [
        'First 15 tender cards unlocked per day',
        'Search across all 20 J&K districts',
        'Save up to 10 bookmarked tenders',
        'Standard portal search helpers',
      ],
      isPopular: false,
      cta: 'Current Plan',
      disabled: true,
    },
    {
      id: 'pro_monthly',
      name: 'Pro Monthly',
      price: '₹10',
      period: '/ month',
      ratePerDay: 'Introductory promotional access',
      badge: 'Most Popular',
      desc: 'Full access for active contractors and suppliers to monitor all district tenders.',
      features: [
        'Full access to ALL tenders & pagination (no view limits)',
        'Personalized WhatsApp alerts for Depts & Districts',
        'Instant BOQ Excel & Price Schedule downloads',
        'Save unlimited tenders & document bookmarks',
        'Corrigendum & bid extension notifications',
        'Priority technical support desk',
      ],
      isPopular: true,
      cta: 'Pay ₹10 & Upgrade',
    },
    {
      id: 'pro_quarterly',
      name: 'Pro Quarterly',
      price: '₹999',
      period: '/ 3 months',
      ratePerDay: '~₹11 / day (Save 17%)',
      badge: 'Working Season',
      desc: 'Designed for active peak bidding seasons from spring through autumn.',
      features: [
        'All Pro Monthly features included',
        'Save 17% compared to monthly renewal',
        'High-priority WhatsApp notification delivery',
        'Dedicated contractor support liaison',
      ],
      isPopular: false,
      cta: 'Upgrade to Pro Quarterly',
    },
    {
      id: 'pro_annual',
      name: 'Pro Annual',
      price: '₹2,999',
      period: '/ year',
      ratePerDay: '~₹8 / day (Save 37%)',
      badge: 'Best Value',
      desc: 'Annual coverage for established Class A and Class B engineering firms.',
      features: [
        'All Pro features for a full 365 days',
        'Effective rate of only ₹249/month',
        'Direct priority engineering hotline',
        'Early access to newly automated department scrapers',
      ],
      isPopular: false,
      cta: 'Upgrade to Pro Annual',
    },
  ];

  const AI_PLANS = [
    {
      id: 'ai_pay_per_tender',
      name: 'Pay-Per-Tender Dossier',
      price: '₹299',
      period: 'per tender',
      ratePerDay: 'Valid for 30 days',
      badge: 'On-Demand',
      desc: 'Full comprehensive AI analysis and BOQ takeoff for a single critical tender.',
      features: [
        '1 Full Comprehensive AI Tender Dossier',
        'Instant BOQ Raw Material Extractor & Rates',
        'Turnover & Solvency Capacity Gap Check',
        'Mandatory Document & Affidavit Checklist',
        'Post-Award Milestone & Penalty Alert Sheet',
        '48-Hour Interactive Tender Copilot (20 queries)',
      ],
      isPopular: false,
      cta: 'Analyze Single Tender',
    },
    {
      id: 'ai_copilot_starter',
      name: 'Contractor Copilot Starter',
      price: '₹999',
      period: '/ month',
      ratePerDay: '10 Dossiers / month',
      badge: 'Most Popular',
      desc: 'Continuous AI quantity surveying and bid advisory for active local contractors.',
      features: [
        '10 Full AI Tender Dossiers every month',
        'Personalized Contractor Profile Memory',
        'Turnover, Machinery & Solvency Gap Analysis',
        'Complete Raw Material BOQ Schedule & Rates',
        '100 Interactive Copilot AI Queries',
        'Email & WhatsApp Summary Alerts',
      ],
      isPopular: true,
      cta: 'Activate Copilot Starter',
    },
    {
      id: 'ai_bidding_pro',
      name: 'Bidding Pro & Execution Suite',
      price: '₹2,499',
      period: '/ month',
      ratePerDay: '35 Dossiers / month',
      badge: 'Enterprise Value',
      desc: 'Advanced intelligence suite for engineering firms executing multiple public works.',
      features: [
        '35 Full AI Tender Dossiers per month',
        'Advanced Multi-Agent Engineering Intelligence',
        'Auto-generated Excel BOQ Line Items & Rates',
        'Subcontractor Work Packaging & Safety Specs',
        '350 Interactive Copilot AI Queries',
        'Direct WhatsApp Priority Desk Support',
      ],
      isPopular: false,
      cta: 'Upgrade to Bidding Pro',
    },
  ];

  const hasActiveSub = subscription?.hasActiveSubscription;
  const currentPlanList = activeTab === 'tenders' ? PRO_PLANS : AI_PLANS;

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-10 sm:py-14 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-dalBlue dark:text-blue-300 text-xs font-semibold uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" /> Transparent Procurement Pricing
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
            Plans Built for Government Contractors
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Choose between full portal access with real-time WhatsApp alerts, or AI quantity surveying dossiers to evaluate technical specifications and BOQ materials.
          </p>

          {/* Segmented Tab Control */}
          <div className="pt-4 flex justify-center">
            <div className="inline-flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('tenders')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'tenders'
                    ? 'bg-white dark:bg-slate-900 text-dalBlue dark:text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Tender Access &amp; Alerts</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'ai'
                    ? 'bg-white dark:bg-slate-900 text-dalBlue dark:text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>AI Quantity Surveyor &amp; Copilot</span>
              </button>
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {successMessage && (
          <div className="mt-8 max-w-2xl mx-auto p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs sm:text-sm font-medium">{successMessage}</div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-8 max-w-2xl mx-auto p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="text-xs sm:text-sm font-medium">{errorMessage}</div>
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div className={`mt-10 grid grid-cols-1 ${activeTab === 'tenders' ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3 max-w-5xl mx-auto'} gap-6 items-stretch`}>
          {currentPlanList.map((plan) => {
            const isCurrentActivePlan = hasActiveSub && subscription?.planId === plan.id;
            const isLoading = loadingPlanId === plan.id;

            return (
              <div 
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-xl p-6 transition-all duration-200 ${
                  plan.isPopular 
                    ? 'bg-white dark:bg-slate-800 ring-2 ring-dalBlue dark:ring-blue-500 shadow-md z-10' 
                    : 'bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-xs hover:border-slate-300'
                }`}
              >
                {/* Status / Recommended Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-6">
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide ${
                      plan.isPopular 
                        ? 'bg-chinarRed text-white shadow-xs' 
                        : 'bg-slate-700 text-white dark:bg-slate-600'
                    }`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {plan.name}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px] leading-relaxed">
                    {plan.desc}
                  </p>

                  {/* Price */}
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-dalBlue dark:text-white">
                      {plan.price}
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {plan.period}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {plan.ratePerDay}
                  </div>

                  {/* Feature Checklist */}
                  <div className="mt-5 border-t border-slate-100 dark:border-slate-700/80 pt-4 space-y-2.5">
                    {plan.features.map((perk, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="leading-snug">{perk}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call to Action Button */}
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
                  {isCurrentActivePlan ? (
                    <div className="w-full py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-center font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-4 h-4" /> Active Plan
                    </div>
                  ) : plan.disabled ? (
                    <Button 
                      variant="outline" 
                      className="w-full text-xs font-semibold cursor-default opacity-60" 
                      disabled
                    >
                      {plan.cta}
                    </Button>
                  ) : (
                    <Button
                      variant={plan.isPopular ? 'primary' : 'outline'}
                      className="w-full text-xs font-semibold"
                      onClick={() => handleInitiateUpgrade(plan)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                          Processing...
                        </>
                      ) : (
                        <>
                          {plan.cta}
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quota & Subscription FAQ strip */}
        <div className="mt-14 max-w-4xl mx-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-5 h-5 text-dalBlue dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              How Quotas &amp; Plans Work
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1">What happens when view limits are reached?</h4>
              <p className="leading-relaxed">
                Free Starter accounts can preview the first 15 tender notices per day. Upgrading to any Pro plan immediately removes all pagination and notice viewing caps.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1">How do AI Dossier credits renew?</h4>
              <p className="leading-relaxed">
                Copilot Starter and Bidding Pro plans grant fresh dossier credits every monthly billing cycle. You can also analyze single high-stakes tenders on-demand using the Pay-Per-Tender option at any time.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Are payments secure?</h4>
              <p className="leading-relaxed">
                All transactions are processed securely through Razorpay supporting UPI (Google Pay, PhonePe, Paytm), Netbanking, and Debit/Credit Cards. Receipts are automatically sent to your verified mobile number.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Can I cancel anytime?</h4>
              <p className="leading-relaxed">
                Yes. You retain access until the end of your billing cycle. You can manage or renew your plan at any time without unexpected auto-charges.
              </p>
            </div>
          </div>
        </div>

        {/* Trust & Assistance */}
        <div className="mt-8 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-5 border border-slate-200 dark:border-slate-700 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs text-slate-700 dark:text-slate-300">
              Need assistance selecting a plan for multiple firm divisions or Joint Ventures?
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/contact')}
          >
            Contact Procurement Desk
          </Button>
        </div>

      </div>

      {/* Explicit WhatsApp Confirmation Modal */}
      {showPhoneModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Confirm WhatsApp Alerts Number
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Plan: <span className="font-semibold text-dalBlue dark:text-blue-400">{selectedPlan.name} ({selectedPlan.price})</span>
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPhoneModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProceedToPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-600" /> Enter WhatsApp Mobile Number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={whatsappPhone}
                    onChange={(e) => {
                      setWhatsappPhone(e.target.value);
                      if (phoneError) setPhoneError('');
                    }}
                    className="pl-11 text-xs font-mono font-semibold"
                    autoFocus
                  />
                </div>
                {phoneError && (
                  <p className="text-[11px] text-rose-500 mt-1 font-medium">{phoneError}</p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Payment receipt and tender notifications matching your department and district criteria will be delivered to this number.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2.5">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowPhoneModal(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary"
                  size="sm"
                  className="font-semibold"
                >
                  Proceed to Pay {selectedPlan.price}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}