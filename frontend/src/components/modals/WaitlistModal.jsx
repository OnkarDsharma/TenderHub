/**
 * @file frontend/src/components/modals/WaitlistModal.jsx
 * @description Priority waitlist dialog for paid plans. A navy summary panel
 * sits beside the form on wide screens and above it on phones.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';

const initialForm = { name: '', phone: '', email: '', contractorClass: '', firmName: '' };
const CLASSES = ['Class Special', 'Class A', 'Class B', 'Class C', 'Class D', 'Supplier/Other'];
const PERKS = [
  '50% early-bird discount on the first term',
  'Invitation sent to your WhatsApp the day access opens',
  'Priority onboarding with the procurement desk',
];

export function WaitlistModal({ plan, onClose }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const handleClose = useCallback(() => {
    setForm(initialForm);
    setError('');
    setSuccess(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!plan) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [plan, loading, handleClose]);

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const phone = form.phone.replace(/\D/g, '');
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit WhatsApp mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/waitlist', { ...form, phone: `+91${phone}`, interestedPlan: plan.id });
      setSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to join the waitlist right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {plan && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) handleClose(); }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="wl-modal"
          >
            {/* Summary panel */}
            <aside className="wl-modal-side">
              <p className="wl-side-kicker">Priority waitlist</p>
              <h2 id="waitlist-title" className="wl-side-title">{plan.name}</h2>
              <p className="wl-side-price">{plan.price}<span>{plan.billingCycle}</span></p>
              <ul className="wl-side-perks">
                {PERKS.map((perk) => (
                  <li key={perk}><Check className="h-3.5 w-3.5 shrink-0" />{perk}</li>
                ))}
              </ul>
              <p className="wl-side-foot">No payment now. We only message you when your plan is ready.</p>
            </aside>

            {/* Form / success */}
            <div className="wl-modal-main">
              <button type="button" onClick={handleClose} aria-label="Close waitlist" className="wl-modal-close" disabled={loading}>
                <X className="h-4 w-4" />
              </button>

              {success ? (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                  <span className="wl-success-mark"><Check className="h-6 w-6" /></span>
                  <p className="mt-6 text-xs font-semibold uppercase tracking-[.08em] text-slate-500 dark:text-slate-400">Your place in line</p>
                  <p className="wl-success-number">#{success.waitlistCount}</p>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    We will send your invitation and early-bird code to your WhatsApp as soon as {plan.name} opens.
                  </p>
                  <button type="button" className="wl-cta mt-8 max-w-xs" onClick={handleClose}>
                    <span>Done</span>
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={submit}>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Reserve your place</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Takes thirty seconds. WhatsApp number is all we need.</p>
                  </div>

                  <div>
                    <label htmlFor="waitlist-name" className="wl-label">Full name</label>
                    <Input id="waitlist-name" name="name" value={form.name} onChange={update} required maxLength={120} autoComplete="name" className="wl-input" />
                  </div>

                  <div>
                    <label htmlFor="waitlist-phone" className="wl-label">WhatsApp mobile number</label>
                    <div className="wl-phone">
                      <span>+91</span>
                      <Input
                        id="waitlist-phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        value={form.phone}
                        onChange={(event) => { setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })); setError(''); }}
                        required
                        placeholder="98765 43210"
                        autoComplete="tel-national"
                        className="wl-input rounded-l-none border-l-0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="waitlist-class" className="wl-label">Contractor class</label>
                      <select id="waitlist-class" name="contractorClass" value={form.contractorClass} onChange={update} className="wl-select">
                        <option value="">Select class</option>
                        {CLASSES.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="waitlist-firm" className="wl-label">Firm name <em>optional</em></label>
                      <Input id="waitlist-firm" name="firmName" value={form.firmName} onChange={update} maxLength={160} autoComplete="organization" className="wl-input" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="waitlist-email" className="wl-label">Email <em>optional</em></label>
                    <Input id="waitlist-email" name="email" type="email" value={form.email} onChange={update} maxLength={254} autoComplete="email" className="wl-input" />
                  </div>

                  {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

                  <button type="submit" className="wl-cta" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span>{loading ? 'Reserving your place' : 'Join the priority waitlist'}</span>
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400">Selected plan: {plan.name} at {plan.price} {plan.billingCycle}</p>
                </form>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
