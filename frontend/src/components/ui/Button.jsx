/**
 * @file src/components/ui/Button.jsx
 * @description Standardized button primitive with high-visibility focus states,
 * tactile interactions, and clear hover feedback.
 */
import { cn } from '@/utils/cn';

export function Button({ 
  className, 
  variant = 'default', 
  size = 'default', 
  children, 
  ...props 
}) {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-sans font-semibold text-xs sm:text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue dark:focus-visible:ring-blue-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 cursor-pointer select-none";
  
  const variants = {
    default: "bg-dalBlue text-white hover:bg-dalBlue/90 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs",
    destructive: "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 shadow-xs",
    outline: "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white shadow-xs",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80",
    ghost: "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
    accent: "bg-dalBlue text-white hover:bg-dalBlue/90 shadow-xs",
  };

  const sizes = {
    default: "h-9 sm:h-10 px-4 py-2 text-xs sm:text-sm",
    sm: "h-8 px-3 text-xs",
    lg: "h-11 sm:h-12 px-6 text-sm sm:text-base",
    icon: "h-9 w-9 p-0",
  };

  return (
    <button 
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
