/**
 * @file frontend/src/components/profile/WhatsAppAlertsTab.jsx
 * @description Contractor WhatsApp notification settings panel.
 * Allows configuring phone number, target departments, districts, and minimum tender values.
 */
import { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Check, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  CheckCircle2, 
  BellRing,
  Building,
  MapPin,
  IndianRupee,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { notificationApi } from '@/services/notificationApi';
import { billingApi } from '@/services/billingApi';
import { Link } from 'react-router-dom';

const ALL_DEPARTMENTS = [
  'PUBLIC WORKS DEPARTMENT',
  'JAL SHAKTI DEPARTMENT',
  'PRADHAN MANTRI GRAM SADAK YOJANA',
  'AGRICULTURE PRODUCTION DEPARTMENT',
  'HEALTH AND MEDICAL EDUCATION',
  'POWER DEVELOPMENT DEPARTMENT',
  'HOUSING AND URBAN DEVELOPMENT',
  'SCHOOL EDUCATION DEPARTMENT',
  'TOURISM DEPARTMENT',
  'FOREST ECOLOGY AND ENVIRONMENT',
  'RURAL DEVELOPMENT AND PANCHAYATI RAJ'
];

const ALL_DISTRICTS = [
  'Srinagar', 'Jammu', 'Baramulla', 'Anantnag', 'Pulwama',
  'Budgam', 'Kupwara', 'Ganderbal', 'Bandipora', 'Kulgam',
  'Shopian', 'Udhampur', 'Kathua', 'Rajouri', 'Poonch',
  'Doda', 'Ramban', 'Reasi', 'Samba', 'Kishtwar'
];

export function WhatsAppAlertsTab() {
  const [phone, setPhone] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedDistricts, setSelectedDistricts] = useState([]);
  const [minValue, setMinValue] = useState(0);
  const [instantAlerts, setInstantAlerts] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      notificationApi.getPreferences(),
      billingApi.getStatus(),
    ]).then(([prefRes, subRes]) => {
      if (prefRes.status === 'fulfilled' && prefRes.value) {
        const p = prefRes.value;
        setPhone(p.whatsappPhone || '');
        setEnabled(p.whatsappEnabled !== false);
        setSelectedDepts(p.departments || []);
        setSelectedDistricts(p.districts || []);
        setMinValue(p.minValue || 0);
        setInstantAlerts(p.instantAlerts !== false);
        setDailyDigest(p.dailyDigest !== false);
      }
      if (subRes.status === 'fulfilled' && subRes.value) {
        setSubscription(subRes.value);
      }
      setIsLoading(false);
    });
  }, []);

  const toggleDept = (dept) => {
    setSelectedDepts(prev => 
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const toggleDistrict = (dist) => {
    setSelectedDistricts(prev =>
      prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]
    );
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setIsSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      await notificationApi.updatePreferences({
        whatsappPhone: phone.trim(),
        whatsappEnabled: enabled,
        departments: selectedDepts,
        districts: selectedDistricts,
        minValue: Number(minValue) || 0,
        instantAlerts,
        dailyDigest,
      });

      setFeedback({
        type: 'success',
        message: '✅ WhatsApp preferences updated successfully!',
      });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to update preferences.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!phone || phone.trim().length < 10) {
      setFeedback({ type: 'error', message: 'Please enter a valid 10-digit WhatsApp number first.' });
      return;
    }

    setIsTesting(true);
    setFeedback({ type: '', message: '' });

    try {
      await notificationApi.sendTestAlert(phone.trim());
      setFeedback({
        type: 'success',
        message: `📲 Test notification sent to ${phone}! Check your WhatsApp chat.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to dispatch test notification.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 flex items-center justify-center text-dalBlue dark:text-blue-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const isPro = subscription?.hasActiveSubscription;

  return (
    <div className="space-y-8">
      {/* Plan Status Banner */}
      {!isPro ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h4 className="text-sm font-bold tracking-tight">
                Unlock Instant WhatsApp Alerts with Pro
              </h4>
              <p className="text-xs text-blue-100 mt-0.5">
                Starting at just ₹399/month (~₹13/day). Receive instant alerts whenever relevant tenders are published.
              </p>
            </div>
          </div>
          <Link to="/pricing">
            <Button variant="primary" className="bg-white text-dalBlue hover:bg-blue-50 text-xs font-bold whitespace-nowrap shadow-xs">
              View Pro Plans
            </Button>
          </Link>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="text-xs font-medium">
            <span className="font-bold">tndrr Pro Active:</span> Your personalized WhatsApp delivery pipeline is enabled with high-priority queue processing.
          </div>
        </div>
      )}

      {/* Feedback Alert */}
      {feedback.message && (
        <div className={`p-4 rounded-xl text-xs font-medium flex items-center gap-2.5 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800' 
            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
        
        {/* Phone & Status Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp Mobile Number
            </label>
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendTest}
                disabled={isTesting || !phone}
                className="text-xs font-bold shrink-0"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                Test
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Enter 10-digit mobile number. We format it automatically (+91).
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" /> Minimum Tender Value (INR)
            </label>
            <Input
              type="number"
              placeholder="e.g. 500000 (₹5 Lakhs)"
              value={minValue || ''}
              onChange={(e) => setMinValue(Number(e.target.value))}
              className="text-xs"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Only notify for tenders with estimated value equal to or above this amount (0 = all).
            </p>
          </div>
        </div>

        {/* Delivery Options */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={enabled} 
              onChange={(e) => setEnabled(e.target.checked)} 
              className="rounded text-dalBlue focus:ring-dalBlue"
            />
            Enable WhatsApp Notifications
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={instantAlerts} 
              onChange={(e) => setInstantAlerts(e.target.checked)} 
              className="rounded text-dalBlue focus:ring-dalBlue"
            />
            Instant Alerts (as soon as published)
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={dailyDigest} 
              onChange={(e) => setDailyDigest(e.target.checked)} 
              className="rounded text-dalBlue focus:ring-dalBlue"
            />
            Daily Morning Digest (9:30 AM)
          </label>
        </div>

        {/* Target Departments */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400" /> Target Departments
            </label>
            <button 
              type="button" 
              onClick={() => setSelectedDepts(selectedDepts.length === ALL_DEPARTMENTS.length ? [] : [...ALL_DEPARTMENTS])}
              className="text-[11px] text-dalBlue dark:text-blue-400 font-semibold hover:underline"
            >
              {selectedDepts.length === ALL_DEPARTMENTS.length ? 'Clear All' : 'Select All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_DEPARTMENTS.map((dept) => {
              const isSelected = selectedDepts.includes(dept);
              return (
                <button
                  type="button"
                  key={dept}
                  onClick={() => toggleDept(dept)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    isSelected
                      ? 'bg-dalBlue text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                  {dept}
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Districts */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-chinarRed" /> Preferred Districts & Locations
            </label>
            <button 
              type="button" 
              onClick={() => setSelectedDistricts(selectedDistricts.length === ALL_DISTRICTS.length ? [] : [...ALL_DISTRICTS])}
              className="text-[11px] text-dalBlue dark:text-blue-400 font-semibold hover:underline"
            >
              {selectedDistricts.length === ALL_DISTRICTS.length ? 'Clear All' : 'Select All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_DISTRICTS.map((dist) => {
              const isSelected = selectedDistricts.includes(dist);
              return (
                <button
                  type="button"
                  key={dist}
                  onClick={() => toggleDistrict(dist)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    isSelected
                      ? 'bg-chinarRed text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                  {dist}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Save Button */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving}
            className="text-xs font-bold px-6 py-2.5 shadow-sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Saving Preferences...
              </>
            ) : (
              'Save WhatsApp Notification Preferences'
            )}
          </Button>
        </div>

      </form>
    </div>
  );
}
