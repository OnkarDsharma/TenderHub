/**
 * @file src/components/tenders/FilterSelectionModal.jsx
 * @description Accessible interactive selection modal for tender filter sidebar rows
 * (Portal, State, City, Procurement Type, Tender Amount, Category, Organisation, Fee Preferences, Advanced Filters, Advanced Search).
 */
import { useState, useMemo } from 'react';
import { Search, X, Check, SlidersHorizontal, IndianRupee } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function FilterSelectionModal({
  isOpen,
  onClose,
  modalType,
  title,
  subtitle,
  currentValue,
  options = [],
  onApply,
  // Context-specific props
  extraState = {},
}) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Local working state for selections before user clicks "Apply"
  const [selectedSingle, setSelectedSingle] = useState(currentValue || '');
  
  // For Tender Amount (custom min/max)
  const [amountRange, setAmountRange] = useState(extraState.tenderAmountRange || 'any');
  const [minAmount, setMinAmount] = useState(extraState.minAmount || '');
  const [maxAmount, setMaxAmount] = useState(extraState.maxAmount || '');

  // For Advanced Filters
  const [advancedState, setAdvancedState] = useState({
    hasPreBid: extraState.hasPreBid || false,
    withdrawalAllowed: extraState.withdrawalAllowed || false,
    twoStageBidding: extraState.twoStageBidding || false,
    preferentialBidder: extraState.preferentialBidder || false,
    tendererClass: extraState.tendererClass || '',
  });

  // For Advanced Search
  const [advSearchState, setAdvSearchState] = useState({
    exactPhrase: extraState.exactPhrase || '',
    anyWords: extraState.anyWords || '',
    excludeWords: extraState.excludeWords || '',
    referenceNumber: extraState.referenceNumber || '',
  });

  // Filter options with search
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter((opt) => {
      const label = typeof opt === 'string' ? opt : (opt.label || opt.value || '');
      return label.toLowerCase().includes(term);
    });
  }, [options, searchTerm]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (modalType === 'amount') {
      onApply({
        tenderAmountRange: amountRange,
        minAmount: amountRange === 'custom' ? minAmount : '',
        maxAmount: amountRange === 'custom' ? maxAmount : '',
      });
    } else if (modalType === 'advancedFilters') {
      onApply(advancedState);
    } else if (modalType === 'advancedSearch') {
      onApply(advSearchState);
    } else {
      onApply(selectedSingle);
    }
    onClose();
  };

  const handleClear = () => {
    if (modalType === 'amount') {
      setAmountRange('any');
      setMinAmount('');
      setMaxAmount('');
      onApply({ tenderAmountRange: 'any', minAmount: '', maxAmount: '' });
    } else if (modalType === 'advancedFilters') {
      const reset = {
        hasPreBid: false,
        withdrawalAllowed: false,
        twoStageBidding: false,
        preferentialBidder: false,
        tendererClass: '',
      };
      setAdvancedState(reset);
      onApply(reset);
    } else if (modalType === 'advancedSearch') {
      const reset = { exactPhrase: '', anyWords: '', excludeWords: '', referenceNumber: '' };
      setAdvSearchState(reset);
      onApply(reset);
    } else {
      setSelectedSingle('');
      onApply('');
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* 1. Tender Amount Specific UI */}
          {modalType === 'amount' ? (
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Preset Amount Brackets
              </label>
              <div className="space-y-2">
                {[
                  { value: 'any', label: 'Any Amount (No restriction)' },
                  { value: 'under_5l', label: 'Under ₹5 Lakhs (< ₹5,00,000)' },
                  { value: '5l_25l', label: '₹5 Lakhs - ₹25 Lakhs' },
                  { value: '25l_1cr', label: '₹25 Lakhs - ₹1 Crore' },
                  { value: '1cr_5cr', label: '₹1 Crore - ₹5 Crores' },
                  { value: 'above_5cr', label: 'Above ₹5 Crores (> ₹5,00,00,000)' },
                  { value: 'custom', label: 'Custom Range (Specify Min / Max)' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    onClick={() => setAmountRange(opt.value)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                      amountRange === opt.value
                        ? 'border-dalBlue bg-blue-50/60 dark:bg-blue-950/40 text-dalBlue dark:text-blue-300 font-semibold shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs">{opt.label}</span>
                    <input
                      type="radio"
                      name="amountRange"
                      checked={amountRange === opt.value}
                      onChange={() => setAmountRange(opt.value)}
                      className="text-dalBlue focus:ring-dalBlue h-3.5 w-3.5"
                    />
                  </label>
                ))}
              </div>

              {amountRange === 'custom' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 mt-3 animate-in fade-in duration-150">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-dalBlue" />
                    <span>Custom Estimated Value Range (₹)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Minimum (₹)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g. 500000"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Maximum (₹)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g. 2500000"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : modalType === 'advancedFilters' ? (
            /* 2. Advanced Filters Specific UI */
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Filter tenders by procurement regulations, meetings, and eligibility criteria.
              </p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedState.hasPreBid}
                    onChange={(e) =>
                      setAdvancedState((prev) => ({ ...prev, hasPreBid: e.target.checked }))
                    }
                    className="mt-0.5 rounded text-dalBlue focus:ring-dalBlue h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Has Pre-Bid Meeting
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tenders that include a scheduled pre-bid consultation meeting.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedState.withdrawalAllowed}
                    onChange={(e) =>
                      setAdvancedState((prev) => ({ ...prev, withdrawalAllowed: e.target.checked }))
                    }
                    className="mt-0.5 rounded text-dalBlue focus:ring-dalBlue h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Bid Withdrawal Allowed
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Permits retraction or resubmission of tenders prior to closing.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedState.twoStageBidding}
                    onChange={(e) =>
                      setAdvancedState((prev) => ({ ...prev, twoStageBidding: e.target.checked }))
                    }
                    className="mt-0.5 rounded text-dalBlue focus:ring-dalBlue h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Two-Stage Bidding
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Evaluated through separate technical and commercial qualifying stages.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedState.preferentialBidder}
                    onChange={(e) =>
                      setAdvancedState((prev) => ({
                        ...prev,
                        preferentialBidder: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded text-dalBlue focus:ring-dalBlue h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Preferential Bidder Allowed
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Special consideration for MSME / local contractors.
                    </span>
                  </div>
                </label>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Contractor / Tenderer Class
                  </label>
                  <select
                    value={advancedState.tendererClass}
                    onChange={(e) =>
                      setAdvancedState((prev) => ({ ...prev, tendererClass: e.target.value }))
                    }
                    className="w-full py-2 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-dalBlue"
                  >
                    <option value="">Any Contractor Class</option>
                    <option value="Class A">Class A</option>
                    <option value="Class B">Class B</option>
                    <option value="Class C">Class C</option>
                    <option value="Class D">Class D</option>
                    <option value="Super Class">Super Class / Special Class</option>
                  </select>
                </div>
              </div>
            </div>
          ) : modalType === 'advancedSearch' ? (
            /* 3. Advanced Search Specific UI */
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Exact Phrase
                </label>
                <Input
                  placeholder="e.g. construction of concrete road"
                  value={advSearchState.exactPhrase}
                  onChange={(e) =>
                    setAdvSearchState((prev) => ({ ...prev, exactPhrase: e.target.value }))
                  }
                />
                <span className="text-[10px] text-slate-500">Matches this exact word sequence.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Any of these Words
                </label>
                <Input
                  placeholder="e.g. solar water pump pipeline"
                  value={advSearchState.anyWords}
                  onChange={(e) =>
                    setAdvSearchState((prev) => ({ ...prev, anyWords: e.target.value }))
                  }
                />
                <span className="text-[10px] text-slate-500">Matches any of the entered terms.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Exclude Words
                </label>
                <Input
                  placeholder="e.g. electrical repair"
                  value={advSearchState.excludeWords}
                  onChange={(e) =>
                    setAdvSearchState((prev) => ({ ...prev, excludeWords: e.target.value }))
                  }
                />
                <span className="text-[10px] text-slate-500">Excludes notices containing these terms.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Tender Reference Number / ID
                </label>
                <Input
                  placeholder="e.g. NIT-12/2026/PWD"
                  value={advSearchState.referenceNumber}
                  onChange={(e) =>
                    setAdvSearchState((prev) => ({ ...prev, referenceNumber: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : (
            /* 4. Standard Options List with Search (Portal, State, City, Category, Organisation, Fee) */
            <div className="space-y-3">
              {options.length > 6 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder={`Search ${title.toLowerCase()}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {filteredOptions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No matching options found.
                  </div>
                ) : (
                  filteredOptions.map((opt) => {
                    const optValue = typeof opt === 'string' ? opt : opt.value;
                    const optLabel = typeof opt === 'string' ? opt : opt.label;
                    const optSub = typeof opt === 'object' ? opt.description : null;
                    const isSelected = selectedSingle === optValue;

                    return (
                      <div
                        key={optValue || 'all'}
                        onClick={() => setSelectedSingle(optValue)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-dalBlue dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-900'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-transparent'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-xs block truncate">{optLabel}</span>
                          {optSub && (
                            <span className="text-[10px] text-slate-400 block truncate">
                              {optSub}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-dalBlue shrink-0" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Clear
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleApply}
              className="text-xs bg-dalBlue hover:bg-dalBlue/90 text-white font-bold px-4"
            >
              Apply Filter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
