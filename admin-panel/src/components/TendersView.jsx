/**
 * @file admin-panel/src/components/TendersView.jsx
 * @description Administrative tender management panel providing full catalog search,
 * lifecycle state mutations, PDF storage verification, soft deletion, and delisting controls.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Download,
  Calendar,
  Building2,
  Coins,
  FileCheck,
  FileX,
  FileClock,
  Clock,
  X,
  Loader2,
  ShieldAlert,
  ArrowUpRight,
  Slash
} from 'lucide-react';
import adminApiDefault, { adminApi as adminApiNamed } from '../services/api.js';

const adminApi = adminApiDefault || adminApiNamed;

const formatIndianCurrency = (value) => {
  if (!value && value !== 0) return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return String(dateStr);
  }
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(dateStr);
  }
};

export function TendersView({ onRefresh }) {
  // Data states
  const [tenders, setTenders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('');
  const [debouncedDept, setDebouncedDept] = useState('');
  const [sortBy, setSortBy] = useState('publishDate');
  const [sortOrder, setSortOrder] = useState('desc');

  // Feedback states
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionInProgressId, setActionInProgressId] = useState(null);

  // Tender Detail Modal states
  const [selectedTender, setSelectedTender] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [modalStatus, setModalStatus] = useState('ACTIVE');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Delist Dialog modal
  const [delistingTender, setDelistingTender] = useState(null);
  const [delistReasonInput, setDelistReasonInput] = useState('');
  const [isDelisting, setIsDelisting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Debounce department input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedDept(deptFilter.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [deptFilter]);

  // Fetch tenders list
  const fetchTenders = useCallback(async () => {
    if (!adminApi || typeof adminApi.getTenders !== 'function') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = {
        page,
        limit,
        sortBy,
        sortOrder
      };

      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (debouncedDept) params.departmentName = debouncedDept;

      const data = await adminApi.getTenders(params);
      const tenderList = data?.tenders || data?.data?.tenders || (Array.isArray(data) ? data : []);
      const totalCount = data?.total ?? data?.pagination?.total ?? data?.count ?? tenderList.length;
      const pages = data?.totalPages ?? data?.pagination?.totalPages ?? Math.max(1, Math.ceil(totalCount / limit));

      setTenders(tenderList);
      setTotal(totalCount);
      setTotalPages(pages);
    } catch (err) {
      console.error('Failed to load tenders:', err);
      setActionError(`Failed to load tenders: ${err.message || 'Network error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, debouncedDept, sortBy, sortOrder]);

  useEffect(() => {
    fetchTenders();
  }, [fetchTenders]);

  const handleRefresh = async () => {
    await fetchTenders();
    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  // Open Tender Details Modal
  const handleOpenDetails = async (tender) => {
    const tenderId = tender._id || tender.id;
    setSelectedTender(tender);
    setModalStatus(tender.status || 'ACTIVE');

    if (adminApi && typeof adminApi.getTenderById === 'function' && tenderId) {
      setIsLoadingDetail(true);
      try {
        const full = await adminApi.getTenderById(tenderId);
        if (full?.tender) {
          setSelectedTender(full.tender);
          setModalStatus(full.tender.status || 'ACTIVE');
        }
      } catch (err) {
        console.warn('Could not load full tender detail, using table row data:', err);
      } finally {
        setIsLoadingDetail(false);
      }
    }
  };

  // Close Tender Details Modal
  const handleCloseDetails = () => {
    setSelectedTender(null);
  };

  // Update Tender Status from Modal
  const handleSaveStatus = async () => {
    if (!selectedTender) return;
    const tenderId = selectedTender._id || selectedTender.id;
    setIsUpdatingStatus(true);
    setActionSuccess('');
    setActionError('');

    try {
      const res = await adminApi.updateTender(tenderId, { status: modalStatus });
      setActionSuccess(`Tender status updated to ${modalStatus}.`);
      setSelectedTender((prev) => (prev ? { ...prev, status: modalStatus } : null));
      await fetchTenders();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(`Failed to update tender status: ${err.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Prompt Delist Dialog
  const handlePromptDelist = (tender) => {
    setDelistingTender(tender);
    setDelistReasonInput(tender.delistReason || 'Administrative decision / Specification discrepancy');
  };

  // Submit Delist / Relist
  const handleSubmitDelist = async (delist) => {
    if (!delistingTender) return;
    const tenderId = delistingTender._id || delistingTender.id;
    setIsDelisting(true);
    setActionSuccess('');
    setActionError('');

    try {
      await adminApi.updateTender(tenderId, {
        isDelisted: delist,
        delistReason: delist ? delistReasonInput.trim() : ''
      });

      setActionSuccess(
        delist
          ? `Tender "${delistingTender.referenceNumber || tenderId}" has been delisted.`
          : `Tender "${delistingTender.referenceNumber || tenderId}" has been relisted.`
      );

      setDelistingTender(null);
      if (selectedTender && (selectedTender._id === tenderId || selectedTender.id === tenderId)) {
        setSelectedTender((prev) => ({
          ...prev,
          isDelisted: delist,
          delistReason: delist ? delistReasonInput.trim() : ''
        }));
      }

      await fetchTenders();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(`Failed to update delist status: ${err.message}`);
    } finally {
      setIsDelisting(false);
    }
  };

  // Soft Delete Tender
  const handleDeleteTender = async (tender) => {
    const tenderId = tender._id || tender.id;
    const ref = tender.referenceNumber || tenderId;
    if (!window.confirm(`PERMANENT ACTION: Are you sure you want to delete tender "${ref}"? This will archive/remove it from active indexing.`)) {
      return;
    }

    setActionInProgressId(tenderId);
    setActionSuccess('');
    setActionError('');

    try {
      await adminApi.deleteTender(tenderId);
      setActionSuccess(`Tender "${ref}" has been deleted.`);
      if (selectedTender && (selectedTender._id === tenderId || selectedTender.id === tenderId)) {
        handleCloseDetails();
      }
      await fetchTenders();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      setActionError(`Failed to delete tender: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Tender Status Badge
  const getStatusBadge = (status, isDelisted) => {
    if (isDelisted) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-chinarRed dark:bg-rose-950/80 dark:text-red-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 w-fit">
          <Slash className="w-3 h-3 text-chinarRed" />
          DELISTED
        </span>
      );
    }

    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-subtle-pulse" />
            ACTIVE
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 w-fit">
            <Clock className="w-3 h-3 text-amber-600" />
            EXPIRED
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 w-fit">
            ARCHIVED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 w-fit">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 w-fit">
            {status || 'UNKNOWN'}
          </span>
        );
    }
  };

  // PDF Status Badge
  const getPdfStatusBadge = (pdfStatus, documents) => {
    const raw = (pdfStatus || documents?.tenderNotice?.storageKey ? 'COMPLETED' : 'PENDING').toUpperCase();
    switch (raw) {
      case 'COMPLETED':
      case 'AVAILABLE':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 w-fit">
            <FileCheck className="w-3 h-3 text-emerald-600" />
            COMPLETED
          </span>
        );
      case 'PENDING':
      case 'QUEUED':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1 w-fit">
            <FileClock className="w-3 h-3 text-amber-600" />
            PENDING
          </span>
        );
      case 'FAILED':
      case 'ERROR':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1 w-fit">
            <FileX className="w-3 h-3 text-rose-600" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 w-fit">
            NOT_AVAILABLE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">

      {/* 1. Header with Title & Total Count Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-charcoal-900 dark:text-paper-50 tracking-tight">
              Tender Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono bg-dalBlue-50 dark:bg-dalBlue-900/60 text-dalBlue-700 dark:text-blue-300 border border-dalBlue-200 dark:border-blue-800">
              {total.toLocaleString('en-IN')} Tenders
            </span>
          </div>
          <p className="text-xs sm:text-sm text-charcoal-500 dark:text-slate-400 mt-1">
            Search procurement notices, inspect R2 documents, update lifecycle statuses, and manage delisting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-subtle transition-all cursor-pointer disabled:opacity-50"
            title="Refresh tenders list"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-dalBlue dark:text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Notification Banners */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess('')}
            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError('')}
            className="text-rose-600 hover:text-rose-800 dark:text-rose-400 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Filters & Search Strip */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, ref no, or tender ID..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Dropdown */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE (Open Bidding)</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="ARCHIVED">ARCHIVED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="relative">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              placeholder="Filter by Department..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs font-sans text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400"
            />
            {deptFilter && (
              <button
                onClick={() => setDeptFilter('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(':');
                setSortBy(sb);
                setSortOrder(so);
                setPage(1);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-sans text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
            >
              <option value="publishDate:desc">Newest Published</option>
              <option value="publishDate:asc">Oldest Published</option>
              <option value="closingDate:asc">Closing Soonest</option>
              <option value="tenderValue:desc">Highest Value</option>
              <option value="tenderValue:asc">Lowest Value</option>
            </select>
          </div>

        </div>
      </div>

      {/* 4. Responsive Data Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card overflow-hidden">
        
        {/* Table summary bar */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
          <span>
            Showing <strong className="text-slate-900 dark:text-white font-mono">{tenders.length}</strong> of{' '}
            <strong className="text-slate-900 dark:text-white font-mono">{total}</strong> tenders
          </span>
          <div className="flex items-center gap-2">
            <span>Per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-mono"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-dalBlue dark:text-blue-400 mx-auto" />
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Querying procurement tenders repository...
            </div>
          </div>
        ) : tenders.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No tenders found
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No tender documents matched the specified search criteria or department filter.
            </p>
            {(searchQuery || statusFilter !== 'ALL' || deptFilter) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setDeptFilter('');
                  setPage(1);
                }}
                className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline pt-2 cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Ref No / ID</th>
                  <th className="py-3 px-4">Tender Title</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Est. Value</th>
                  <th className="py-3 px-4">Published</th>
                  <th className="py-3 px-4">Closing</th>
                  <th className="py-3 px-4">PDF Storage</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                {tenders.map((t) => {
                  const tenderId = t._id || t.id;
                  const isProcessing = actionInProgressId === tenderId;
                  const estValue = t.tenderValue ?? t.financials?.estimatedValue;
                  const pubDate = t.publishDate ?? t.tenderDates?.publishedDate ?? t.createdAt;
                  const closeDate = t.closingDate ?? t.tenderDates?.submissionEndDate;

                  return (
                    <tr
                      key={tenderId}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {/* Ref No / ID */}
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-dalBlue dark:text-blue-400 truncate max-w-[140px]" title={t.referenceNumber || t.tenderId}>
                          {t.referenceNumber || t.tenderId || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {t.tenderId && t.tenderId !== t.referenceNumber ? `ID: ${t.tenderId}` : ''}
                        </div>
                      </td>

                      {/* Title */}
                      <td className="py-3 px-4 max-w-xs">
                        <div
                          className="font-semibold text-slate-900 dark:text-white line-clamp-2 hover:line-clamp-none transition-all cursor-pointer"
                          title={t.title}
                          onClick={() => handleOpenDetails(t)}
                        >
                          {t.title || 'Untitled Procurement Notice'}
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4 max-w-[180px]">
                        <div className="text-slate-600 dark:text-slate-300 truncate" title={t.departmentName || t.organisationName}>
                          {t.departmentName || t.organisationName || 'J&K State Department'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {getStatusBadge(t.status, t.isDelisted)}
                      </td>

                      {/* Estimated Value */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatIndianCurrency(estValue)}
                      </td>

                      {/* Published Date */}
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(pubDate)}
                      </td>

                      {/* Closing Date */}
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(closeDate)}
                      </td>

                      {/* PDF Status */}
                      <td className="py-3 px-4">
                        {getPdfStatusBadge(t.pdfStatus, t.documents)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* View details button */}
                          <button
                            onClick={() => handleOpenDetails(t)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-dalBlue dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="View complete tender details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Delist button */}
                          <button
                            onClick={() => handlePromptDelist(t)}
                            disabled={isProcessing}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              t.isDelisted
                                ? 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                                : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                            }`}
                            title={t.isDelisted ? 'Relist tender' : 'Delist tender notice'}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteTender(t)}
                            disabled={isProcessing}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Soft delete tender"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Strip */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono bg-slate-50/50 dark:bg-slate-900/30">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="text-slate-500 dark:text-slate-400">
              Page <strong className="text-slate-900 dark:text-white">{page}</strong> of{' '}
              <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>

      {/* 6. Comprehensive Tender Detail Panel / Modal */}
      {selectedTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-6 my-8 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-dalBlue dark:text-blue-400">
                    {selectedTender.referenceNumber || selectedTender.tenderId || 'REFERENCE_NOT_SET'}
                  </span>
                  {getStatusBadge(selectedTender.status, selectedTender.isDelisted)}
                  {getPdfStatusBadge(selectedTender.pdfStatus, selectedTender.documents)}
                </div>
                <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white leading-snug">
                  {selectedTender.title}
                </h2>
                {selectedTender.portalUrl && (
                  <a
                    href={selectedTender.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-dalBlue dark:text-blue-400 hover:underline pt-0.5"
                  >
                    <span>View on official e-procurement portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button
                onClick={handleCloseDetails}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingDetail && (
              <div className="py-4 text-center flex items-center justify-center gap-2 text-xs font-mono text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-dalBlue dark:text-blue-400" />
                <span>Loading complete tender dataset...</span>
              </div>
            )}

            {/* Delist Warning Notice */}
            {selectedTender.isDelisted && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>THIS TENDER IS CURRENTLY DELISTED</span>
                </div>
                <p className="text-[11px]">
                  Reason: {selectedTender.delistReason || 'No specific reason provided.'}
                </p>
              </div>
            )}

            {/* Financials Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Estimated Value</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {formatIndianCurrency(selectedTender.tenderValue ?? selectedTender.financials?.estimatedValue)}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">EMD Amount</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {formatIndianCurrency(selectedTender.emdAmount ?? selectedTender.financials?.emdAmount)}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Tender Document Fee</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {formatIndianCurrency(selectedTender.tenderFee ?? selectedTender.financials?.feeAmount)}
                </div>
              </div>
            </div>

            {/* Department Hierarchy */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Department &amp; Authority</div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <div>
                  <strong className="text-slate-700 dark:text-slate-200">Department:</strong>{' '}
                  <span className="text-slate-900 dark:text-white font-medium">
                    {selectedTender.departmentName || selectedTender.organisationName || '—'}
                  </span>
                </div>
                {selectedTender.subDivision && (
                  <div>
                    <strong className="text-slate-700 dark:text-slate-200">Sub-division / Circle:</strong>{' '}
                    <span className="text-slate-600 dark:text-slate-300">{selectedTender.subDivision}</span>
                  </div>
                )}
                {selectedTender.location && (
                  <div>
                    <strong className="text-slate-700 dark:text-slate-200">Work Location:</strong>{' '}
                    <span className="text-slate-600 dark:text-slate-300">{selectedTender.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Critical Dates Grid */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Critical Procurement Schedule</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Published</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    {formatDate(selectedTender.publishDate ?? selectedTender.tenderDates?.publishedDate ?? selectedTender.createdAt)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Bid Starts</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    {formatDate(selectedTender.bidStartDate ?? selectedTender.tenderDates?.submissionStartDate)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Bid Closing</div>
                  <div className="font-semibold text-rose-600 dark:text-rose-400 mt-1">
                    {formatDateTime(selectedTender.closingDate ?? selectedTender.tenderDates?.submissionEndDate)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Bid Opening</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    {formatDateTime(selectedTender.openingDate ?? selectedTender.tenderDates?.openingDate)}
                  </div>
                </div>
              </div>
            </div>

            {/* Documents & Storage Information */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                Documents &amp; Cloudflare R2 Storage Keys
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs font-mono space-y-2">
                <div>
                  <span className="text-slate-400">R2 Object Key:</span>{' '}
                  <span className="text-slate-900 dark:text-white break-all">
                    {selectedTender.documents?.tenderNotice?.storageKey || selectedTender.r2StorageKey || selectedTender.storageKey || 'Not synced to Cloudflare R2'}
                  </span>
                </div>
                {selectedTender.documents?.tenderNotice?.pdfUrl && (
                  <div className="pt-1">
                    <a
                      href={selectedTender.documents.tenderNotice.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dalBlue-50 dark:bg-dalBlue-950 text-dalBlue dark:text-blue-300 border border-dalBlue-200 dark:border-blue-800 hover:bg-dalBlue-100 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Secured Document PDF</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Scope of Work / Description */}
            {selectedTender.description && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Scope of Work</div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-40 overflow-y-auto">
                  {selectedTender.description}
                </div>
              </div>
            )}

            {/* Administrative Mutations Strip */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="text-xs font-bold font-display text-slate-900 dark:text-white">
                Administrative Lifecycle Operations
              </div>
              
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                {/* Status Dropdown */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <label className="text-xs font-mono text-slate-500 whitespace-nowrap">Status:</label>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-sans text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="EXPIRED">EXPIRED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                  <button
                    onClick={handleSaveStatus}
                    disabled={isUpdatingStatus || modalStatus === selectedTender.status}
                    className="px-3 py-1.5 rounded-lg bg-dalBlue hover:bg-dalBlue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {isUpdatingStatus ? 'Saving...' : 'Apply Status'}
                  </button>
                </div>

                {/* Delist & Delete Buttons */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handlePromptDelist(selectedTender)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      selectedTender.isDelisted
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{selectedTender.isDelisted ? 'Relist Tender' : 'Delist Notice'}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteTender(selectedTender)}
                    className="px-3 py-1.5 rounded-lg bg-chinarRed hover:bg-chinarRed-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={handleCloseDetails}
                className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-paper text-xs font-semibold cursor-pointer"
              >
                Close Details
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. Delist Modal Dialog */}
      {delistingTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
                {delistingTender.isDelisted ? 'Relist Procurement Notice' : 'Delist Tender Notice'}
              </h3>
              <button
                onClick={() => setDelistingTender(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              {delistingTender.isDelisted
                ? `Are you sure you want to restore "${delistingTender.referenceNumber || delistingTender.title}" to public listings?`
                : `Delisting hides tender "${delistingTender.referenceNumber || delistingTender.title}" from public search and alert delivery.`}
            </p>

            {!delistingTender.isDelisted && (
              <div className="space-y-1.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Reason for Delisting (Publicly recorded):
                </label>
                <textarea
                  rows={3}
                  value={delistReasonInput}
                  onChange={(e) => setDelistReasonInput(e.target.value)}
                  placeholder="e.g. Cancelled by procuring department, Corrigendum issued, or Duplicate record."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs font-sans text-slate-900 dark:text-white focus:outline-none focus:border-dalBlue dark:focus:border-blue-400"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setDelistingTender(null)}
                disabled={isDelisting}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmitDelist(!delistingTender.isDelisted)}
                disabled={isDelisting}
                className={`px-4 py-2 rounded-lg text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  delistingTender.isDelisted
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-chinarRed hover:bg-chinarRed-700'
                }`}
              >
                {isDelisting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{delistingTender.isDelisted ? 'Confirm Relist' : 'Confirm Delist'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default TendersView;
