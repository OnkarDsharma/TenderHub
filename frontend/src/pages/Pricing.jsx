import { useEffect, useState } from 'react';
import { ArrowRight, BellRing, Check, CheckCircle2, HelpCircle, Lock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { WaitlistModal } from '@/components/modals/WaitlistModal';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { billingApi } from '@/services/billingApi';

export const UNIFIED_PLANS = [
  {
    id: 'free_starter', name: 'Free Launch Access', badge: 'Active Free Access', price: '₹0', billingCycle: 'free forever',
    description: 'Perfect for local contractors exploring public tenders and AI estimation.', isLocked: false, ctaText: 'Current Active Plan',
    features: ['Full search & discovery across all northern states (J&K, Punjab, HP)', '2 Full AI Tender Dossiers per day (BOQ & eligibility)', '5 Interactive Copilot queries / 24-hr session', '2 Targeted WhatsApp tender alerts per week', 'Standard SOR rate schedules & document downloads', 'Save up to 15 bookmarked tenders'],
  },
  {
    id: 'contractor_pro', name: 'Contractor Pro Suite', badge: 'Most Popular', price: '₹999', billingCycle: '/ month',
    description: 'Continuous tender intelligence and high-volume AI estimation for active bidders.', isLocked: true, lockLabel: 'Full Unrestricted Access Coming Soon', ctaText: 'Join Priority Waitlist',
    features: ['Unrestricted daily AI Tender Dossiers (BOQ & materials)', 'Unlimited 24/7 AI Copilot queries (No lockouts)', 'Real-time daily WhatsApp tender alerts (Custom filters)', 'Instant Excel/PDF BOQ schedule exports', 'Corrigendum & bid extension instant SMS/WhatsApp alerts', 'Priority email & WhatsApp desk support'],
  },
  {
    id: 'bidding_pro_enterprise', name: 'Bidding Pro & Enterprise', badge: 'Maximum Value', price: '₹2,499', billingCycle: '/ month',
    description: 'Advanced multi-agent intelligence and multi-user access for engineering firms.', isLocked: true, lockLabel: 'Full Unrestricted Access Coming Soon', ctaText: 'Join Priority Waitlist',
    features: ['Everything in Pro Suite included', 'Multi-User Access (Up to 3 team members / estimators)', 'Direct WhatsApp AI Copilot assistant (Query on WhatsApp)', 'Subcontractor work packaging & safety compliance generator', 'Joint Venture (JV) & Solvency deficit analyzer', 'Dedicated contractor liaison & VIP onboarding'],
  },
];

export default function Pricing() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [waitlistPlan, setWaitlistPlan] = useState(null);

  useEffect(() => {
    if (isAuthenticated) billingApi.getStatus().then(setSubscription).catch(() => {});
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-10 sm:py-14 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        <header className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-dalBlue dark:text-blue-300 text-xs font-semibold uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" /> ✨ ALL-IN-ONE PROCUREMENT SUITE
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight">Simple, Unified Plans for Government Contractors</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">Everything you need in one place: live tender indexing across northern states (J&amp;K, Punjab, and Himachal), automated WhatsApp alerts, and instant AI Bill of Quantities (BOQ) estimation.</p>
        </header>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 max-w-6xl mx-auto gap-8 items-stretch">
          {UNIFIED_PLANS.map((plan) => {
            const isCurrent = plan.id === 'free_starter' || (subscription?.hasActiveSubscription && subscription?.planId === plan.id);
            return (
              <article key={plan.id} className={`relative flex flex-col justify-between rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-800 shadow-sm ${plan.isLocked ? 'border border-amber-300 dark:border-amber-700/70' : 'border border-emerald-300 dark:border-emerald-700/70'}`}>
                <div>
                  <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${plan.id === 'contractor_pro' ? 'bg-dalBlue text-white' : 'bg-slate-700 text-white dark:bg-slate-600'}`}>{plan.badge}</span>
                  <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 min-h-10 leading-relaxed">{plan.description}</p>
                  {plan.isLocked ? (
                    <div className="relative mt-5 flex min-h-12 items-center">
                      <div aria-hidden="true" className="flex items-baseline gap-2 select-none blur-sm opacity-50"><span className="text-4xl font-bold text-dalBlue dark:text-white">{plan.price}</span><span className="text-sm text-slate-500 dark:text-slate-400">{plan.billingCycle}</span></div>
                      <span className="absolute left-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Coming Soon</span>
                    </div>
                  ) : <div className="mt-5 flex items-baseline gap-2"><span className="text-4xl font-bold text-dalBlue dark:text-white">{plan.price}</span><span className="text-sm text-slate-500 dark:text-slate-400">{plan.billingCycle}</span></div>}
                  {plan.isLocked ? (
                    <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider"><Lock className="w-3.5 h-3.5" /><span>Paid plan · launching soon</span></div>
                  ) : <div className="mt-5 inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-semibold"><CheckCircle2 className="w-4 h-4" />Available now</div>}
                  <div className="relative mt-5 border-t border-slate-100 dark:border-slate-700 pt-5">
                    <ul className={`space-y-3 ${plan.isLocked ? 'select-none blur-[3px] opacity-45' : ''}`} aria-label={plan.isLocked ? 'Paid features coming soon' : 'Included features'}>
                      {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span className="leading-snug">{feature}</span></li>)}
                    </ul>
                    {plan.isLocked && <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-xl border border-amber-300 bg-white/95 px-4 py-3 text-center text-sm font-bold text-slate-800 shadow-md dark:border-amber-700 dark:bg-slate-900/95 dark:text-white">Paid features<br /><span className="text-amber-700 dark:text-amber-300">Coming Soon</span></span></div>}
                  </div>
                </div>
                <div className="mt-7 pt-5 border-t border-slate-100 dark:border-slate-700">
                  {plan.isLocked ? <>
                    <Button variant="default" className="w-full h-12 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-sm shadow-md hover:bg-amber-400 hover:shadow-lg gap-2" onClick={() => setWaitlistPlan(plan)}><BellRing className="w-5 h-5" />Join the Priority Waitlist</Button>
                    <p className="mt-2 text-center text-xs font-medium text-slate-600 dark:text-slate-300">Get launch updates and a 50% early-bird offer.</p>
                  </> : <Button variant="outline" className="w-full cursor-default" disabled>{isCurrent ? 'Current Active Plan' : plan.ctaText}<ArrowRight className="w-4 h-4 ml-2" /></Button>}
                </div>
              </article>
            );
          })}
        </div>

        <section className="mt-14 max-w-4xl mx-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-3"><HelpCircle className="w-5 h-5 text-dalBlue dark:text-blue-400" /><h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">How access works</h3></div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">Free Launch Access is available now with daily usage limits. Contractor Pro Suite and Bidding Pro &amp; Enterprise are in preparation. Join the priority waitlist to receive an invitation and early-bird launch offer when they become available.</p>
        </section>
        <div className="mt-8 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-5 border border-slate-200 dark:border-slate-700 max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3"><Shield className="w-5 h-5 text-emerald-600 shrink-0" /><span className="text-sm text-slate-700 dark:text-slate-300">Need help selecting a plan for multiple firm divisions or Joint Ventures?</span></div>
          <Button variant="outline" size="sm" onClick={() => navigate('/contact')}>Contact Procurement Desk</Button>
        </div>
      </div>
      <WaitlistModal plan={waitlistPlan} onClose={() => setWaitlistPlan(null)} />
    </div>
  );
}
