/**
 * @file src/components/shared/AuthPromptModal.jsx
 * @description High-conversion, aesthetically refined modal prompting unauthenticated 
 * guests to log in or register when attempting to view full tender details or more tenders.
 */
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, ShieldCheck, FileSpreadsheet, Eye, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/useAuthStore';

export function AuthPromptModal({ 
  open, 
  onClose, 
  title = "Sign In to View Full Tender Details",
  subtitle = "Official tender documents, BOQs, and authority specifications are protected.",
  redirectUrl = "/tenders" 
}) {
  const navigate = useNavigate();
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);

  const handleNavigateLogin = () => {
    onClose();
    navigate(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
  };

  const handleNavigateSignup = () => {
    onClose();
    navigate(`/signup?redirect=${encodeURIComponent(redirectUrl)}`);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
        
        {/* Top Header Graphic Banner */}
        <div className="relative bg-gradient-to-br from-dalBlue via-dalBlue-700 to-slate-900 dark:from-slate-900 dark:via-blue-950 dark:to-slate-900 p-6 text-white overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-dalBlue/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <button 
            type="button" 
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-3 border border-white/10">
            <Lock className="w-3.5 h-3.5 text-dalBlue" />
            <span>Contractor Access Required</span>
          </div>

          <h3 className="text-lg sm:text-xl font-display font-bold leading-snug">
            {title}
          </h3>
          <p className="text-xs text-blue-100/80 mt-1 leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Content & Benefits */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Free Contractor Member Benefits
            </div>

            <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <Eye className="w-4 h-4 text-dalBlue dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>5 full tender detail views per day</strong> (resets after 24 hours) with complete technical &amp; financial terms.
              </span>
            </div>

            <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Unrestricted BOQ spreadsheets &amp; NIT archives</strong> directly from edge cloud storage.
              </span>
            </div>

            <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-dalBlue shrink-0 mt-0.5" />
              <span>
                <strong>Unlimited tender directory browsing</strong> across all 20 J&amp;K districts and departments.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <Button
              type="button"
              onClick={handleNavigateLogin}
              className="w-full bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Log In to View Tenders</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleNavigateSignup}
              className="w-full border-slate-300 dark:border-slate-700 hover:border-dalBlue text-slate-800 dark:text-slate-200 font-bold py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-dalBlue" />
              <span>Create Free Contractor Account</span>
            </Button>

            <div className="relative flex items-center justify-center pt-2">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-3 text-[10px] uppercase font-bold text-slate-400 absolute">
                or
              </span>
            </div>

            <button
              type="button"
              onClick={() => loginWithGoogle('login')}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
