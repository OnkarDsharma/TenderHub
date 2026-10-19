/**
 * @file src/pages/Contact.jsx
 * @description Operational support and inquiry desk styled in clean deep-navy theme with floating white card.
 */
import { useState } from 'react';
import { Mail, MapPin, Send, CheckCircle2, Clock, HelpCircle, Landmark } from 'lucide-react';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="flex-1 flex items-center justify-center py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 bg-slate-100 dark:bg-[#0e1014] transition-colors duration-200">
      <div className="max-w-6xl w-full mx-auto bg-[#18364e] dark:bg-[#132b3e] rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-10 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center my-auto">
        
        {/* Left Column: Institutional Info styled to match reference */}
        <div className="lg:col-span-5 space-y-6 flex flex-col justify-between text-white">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-blue-100 text-xs font-semibold">
              <Landmark className="w-3.5 h-3.5 text-techCoral shrink-0" />
              <span>Operations &amp; Support Desk</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-white tracking-tight leading-[1.15]">
              Contact Technical Support
            </h1>
            
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal pt-1">
              Have inquiries regarding portal synchronization, tender document archives, or contractor notifications? Reach our operational support team.
            </p>
          </div>

          {/* Dotted Divider Line matching reference image */}
          <div className="border-b-2 border-dotted border-white/25 max-w-xs" />

          {/* Contact Details List */}
          <div className="space-y-3.5 text-xs sm:text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-techCoral shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Campus Location</span>
                <span className="font-semibold text-white">NIT Campus, Hazratbal, Srinagar, J&amp;K 190006</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Inquiries</span>
                <span className="font-mono font-semibold text-white">support@tenderhub.in</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Operational Hours</span>
                <span className="font-semibold text-white">Monday – Saturday, 09:30 AM – 06:00 PM IST</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300 pt-1">
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Inquiries are typically addressed within 1 business day.</span>
          </div>

          {/* Bottom Authority & Platform Bar (like partner logos in reference image) */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-bold tracking-widest uppercase text-slate-400/90">
            <span>JK eProc</span>
            <span>•</span>
            <span>Punjab eProc</span>
            <span>•</span>
            <span>HP Tenders</span>
            <span>•</span>
            <span>GeM Portal</span>
          </div>
        </div>

        {/* Right Column: Clean White Floating Form Card */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 sm:p-8 lg:p-9 shadow-2xl text-slate-800">
          {submitted ? (
            <div className="min-h-[340px] flex flex-col items-center justify-center text-center p-6 bg-emerald-50/60 rounded-xl border border-emerald-200">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 font-display mb-1">Inquiry Registered</h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-sm">
                Thank you. Your message has been routed to our operations desk. We will respond to your registered email address shortly.
              </p>
              <button
                type="button"
                className="mt-5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                onClick={() => setSubmitted(false)}
              >
                Submit Another Inquiry
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold font-display text-[#16324a]">
                  Send a Message
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Complete the fields below to reach our regional support desk.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Full Name / Organization <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Tariq Ahmad (Contractor)"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#1868db] focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="contact@domain.com"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#1868db] focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#1868db] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Subject / Topic
                </label>
                <select className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1868db] focus:border-transparent transition-all">
                  <option>Tender Notification &amp; WhatsApp Alerts</option>
                  <option>PDF Ingestion &amp; Archive Sync</option>
                  <option>Regional District Coverage Request</option>
                  <option>Contractor Account Verification</option>
                  <option>General Support or Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Message Details <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Please describe your inquiry, including relevant tender reference numbers..."
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#1868db] focus:border-transparent transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-5 bg-[#1868db] hover:bg-[#1457ba] active:bg-[#0f49a3] text-white font-semibold text-xs sm:text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <span>Send Inquiry</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}