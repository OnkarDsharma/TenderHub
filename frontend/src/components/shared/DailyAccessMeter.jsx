/**
 * @file src/components/shared/DailyAccessMeter.jsx
 * @description Human-crafted, non-robotic daily allowance indicator for free-tier contractors.
 * Automatically hidden for Pro/Premium members who have unlimited tender access.
 */
import { Link } from 'react-router-dom';
import { Compass, Sparkles, AlertCircle } from 'lucide-react';

export function DailyAccessMeter({ 
  viewsUsed = 0, 
  viewsLimit = 5, 
  resetsAt = null,
  isPro = false,
  variant = 'default', // 'default' | 'compact'
  className = ''
}) {
  // Pro / Premium customers have unlimited views; never display access counters
  if (isPro || viewsLimit === 'Unlimited') {
    return null;
  }

  const limitNum = typeof viewsLimit === 'number' ? viewsLimit : 5;
  const used = Math.min(Math.max(0, viewsUsed), limitNum);
  const remaining = Math.max(0, limitNum - used);
  const isExhausted = remaining === 0;
  const isNearLimit = remaining === 1;

  // Discrete 5-step quota segments
  const segments = Array.from({ length: limitNum }, (_, i) => i < used);

  if (variant === 'compact') {
    return (
      <div 
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 shadow-xs ${className}`}
        title={`Daily Free Contractor Pass: ${used} of ${limitNum} accessed today. Resets every 24 hours.`}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Daily Pass
        </span>

        {/* 5 Segmented Quota Dots */}
        <div className="flex items-center gap-1">
          {segments.map((isFilled, idx) => (
            <span
              key={idx}
              className={`w-1.5 h-3 rounded-full transition-all duration-300 ${
                isFilled
                  ? isExhausted 
                    ? 'bg-chinarRed' 
                    : 'bg-dalBlue dark:bg-blue-400'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">
          {used}/{limitNum}
        </span>

        {isNearLimit && (
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 px-1.5 py-0.2 rounded">
            1 left
          </span>
        )}

        {isExhausted ? (
          <Link
            to="/pricing"
            className="text-[10px] font-extrabold text-dalBlue hover:underline flex items-center gap-0.5 ml-0.5"
          >
            Unlock Pro →
          </Link>
        ) : (
          <Link
            to="/pricing"
            className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-dalBlue dark:hover:text-white transition-colors"
          >
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  // Default Badge Variant (used in Tender Directory & dashboards)
  return (
    <div 
      className={`inline-flex flex-wrap items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-xl border transition-all ${
        isExhausted
          ? 'bg-red-50/70 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
          : isNearLimit
          ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-xs'
      } ${className}`}
      title={`Daily Allowance: ${used} of ${limitNum} accessed in current 24h window.`}
    >
      <div className="flex items-center gap-1.5">
        <Compass className={`w-3.5 h-3.5 ${isExhausted ? 'text-chinarRed' : 'text-dalBlue dark:text-blue-400'}`} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Free Tier Allowance
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Discrete Segmented Micro-Bars */}
        <div className="flex items-center gap-1 px-1 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80">
          {segments.map((isFilled, idx) => (
            <span
              key={idx}
              className={`w-1.5 h-3 rounded-full transition-all duration-300 ${
                isFilled
                  ? isExhausted 
                    ? 'bg-chinarRed' 
                    : isNearLimit 
                    ? 'bg-amber-500' 
                    : 'bg-dalBlue dark:bg-blue-400'
                  : 'bg-slate-300/80 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <span className="text-xs font-semibold">
          <strong className="font-mono text-slate-950 dark:text-white">{used}</strong> of <strong className="font-mono text-slate-950 dark:text-white">{limitNum}</strong> accessed today
        </span>
      </div>

      {isExhausted ? (
        <Link 
          to="/pricing" 
          className="inline-flex items-center gap-1 text-[11px] font-bold text-dalBlue hover:underline bg-blue-100/60 dark:bg-blue-900/40 px-2 py-0.5 rounded-md"
        >
          <Sparkles className="w-3 h-3 text-dalBlue" />
          <span>Unlock Unlimited Access</span>
        </Link>
      ) : (
        <Link 
          to="/pricing" 
          className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-dalBlue dark:hover:text-blue-300 transition-colors hidden sm:inline"
        >
          • Unlimited with Pro →
        </Link>
      )}
    </div>
  );
}
