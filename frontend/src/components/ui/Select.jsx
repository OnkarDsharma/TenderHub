/**
 * @file src/components/ui/Select.jsx
 * @description Accessible select component with clear active selection styling,
 * prominent hover & focus-visible feedback, and custom chevron indicator.
 */
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

// Wrapper context passing
export function Select({ value, onValueChange, children }) {
  return (
    <div className="relative w-full">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { value, onValueChange });
        }
        return child;
      })}
    </div>
  );
}

// SelectTrigger with custom styling and indicator chevron
export function SelectTrigger({ className, children, value, onValueChange }) {
  const isSelected = Boolean(value);

  return (
    <div className="relative w-full group">
      <select
        value={value || ''}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn(
          "flex h-9 sm:h-10 w-full items-center justify-between rounded-lg border px-3 pr-8 py-1.5 text-xs sm:text-sm appearance-none cursor-pointer transition-all duration-150",
          isSelected
            ? "border-dalBlue dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 text-dalBlue dark:text-blue-200 font-semibold shadow-2xs"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-normal hover:border-slate-300 dark:hover:border-slate-600",
          "focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 focus:ring-1 focus:ring-dalBlue dark:focus:ring-blue-400",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors duration-150",
          isSelected
            ? "text-dalBlue dark:text-blue-300"
            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
        )}
      />
    </div>
  );
}

export const SelectValue = ({ placeholder }) => (
  <option value="" disabled className="text-slate-400">
    {placeholder}
  </option>
);

export const SelectContent = ({ children }) => <>{children}</>;

export const SelectItem = ({ value, children, className }) => (
  <option
    value={value}
    className={cn(
      "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-1.5",
      className
    )}
  >
    {children}
  </option>
);