/**
 * @file src/components/ui/Badge.jsx
 * @description Small visual indicator for statuses, categories, and alerts with theme-aware styling.
 */
import { cn } from '@/utils/cn';

export function Badge({ className, variant = 'default', children, ...props }) {
  const baseStyles = "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors";
  
  const variants = {
    default: "bg-dalBlue/10 dark:bg-blue-500/20 text-dalBlue dark:text-blue-300 border border-dalBlue/20 dark:border-blue-500/30",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700",
    outline: "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300",
    success: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
    warning: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    destructive: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
    pro: "bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold tracking-tight uppercase text-[10px]",
    neutral: "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[10px]",
  };

  return (
    <span className={cn(baseStyles, variants[variant], className)} {...props}>
      {children}
    </span>
  );
}