/**
 * @file src/components/ui/Input.jsx
 * @description Standard form text input with enhanced visual focus rings, active selection states,
 * and reliable light/dark mode contrast.
 */
import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

export const Input = forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 sm:h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-150",
        "hover:border-slate-300 dark:hover:border-slate-600",
        "focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 focus:ring-1 focus:ring-dalBlue dark:focus:ring-blue-400",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';