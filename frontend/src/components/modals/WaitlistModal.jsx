import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';

const initialForm = { name: '', phone: '', email: '', contractorClass: '', firmName: '' };

export function WaitlistModal({ plan, onClose }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!plan) {
      setForm(initialForm);
      setError('');
      setSuccess(null);
    }
  }, [plan]);

  if (!plan) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="waitlist-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Priority early access</p><h2 id="waitlist-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{success ? 'You’re on the list!' : 'Join the waitlist'}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.name} · {plan.price} / month</p></div>
          <button type="button" onClick={onClose} aria-label="Close waitlist" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button>
        </div>
        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 animate-in zoom-in items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><Check className="h-7 w-7" /></div>
            <h3 className="mt-5 text-lg font-bold text-slate-900 dark:text-white">🎉 You’re #{success.waitlistCount} on the VIP Waitlist!</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">We’ll send an exclusive invite and early-bird coupon code directly to your WhatsApp as soon as unrestricted access goes live.</p>
            <Button className="mt-6 w-full" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div><label htmlFor="waitlist-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name *</label><Input id="waitlist-name" name="name" value={form.name} onChange={update} required maxLength={120} autoComplete="name" /></div>
            <div><label htmlFor="waitlist-phone" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">WhatsApp Mobile Number *</label><div className="flex items-center"><span className="rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">+91</span><Input id="waitlist-phone" name="phone" type="tel" inputMode="numeric" value={form.phone} onChange={(event) => { setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })); setError(''); }} required placeholder="9876543210" autoComplete="tel-national" className="rounded-l-none" /></div></div>
            <div><label htmlFor="waitlist-email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address <span className="font-normal text-slate-400">(optional)</span></label><Input id="waitlist-email" name="email" type="email" value={form.email} onChange={update} maxLength={254} autoComplete="email" /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label htmlFor="waitlist-class" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Contractor Class</label><select id="waitlist-class" name="contractorClass" value={form.contractorClass} onChange={update} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Select class</option>{['Class Special', 'Class A', 'Class B', 'Class C', 'Class D', 'Supplier/Other'].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              <div><label htmlFor="waitlist-firm" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Firm Name <span className="font-normal text-slate-400">(optional)</span></label><Input id="waitlist-firm" name="firmName" value={form.firmName} onChange={update} maxLength={160} autoComplete="organization" /></div>
            </div>
            <div><label htmlFor="waitlist-plan" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Selected Plan Interest</label><Input id="waitlist-plan" value={`${plan.name} (${plan.price} / month)`} readOnly /></div>
            {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{loading ? 'Joining waitlist…' : 'Join Priority Waitlist'}</Button>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">We’ll contact you on WhatsApp when your plan is ready.</p>
          </form>
        )}
      </section>
    </div>
  );
}
