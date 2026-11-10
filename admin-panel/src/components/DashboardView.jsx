/**
 * @file admin-panel/src/components/DashboardView.jsx
 * @description Central administrative operations dashboard displaying institutional platform telemetry,
 * user adoption metrics, procurement pipeline volume, quick navigation actions, and recent activity.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  Building2,
  Gavel,
  TrendingUp,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Terminal,
  Wrench,
  ExternalLink,
  UserCheck,
  UserX,
  FilePlus,
  Layers,
  Database
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

export function DashboardView({ overview, telemetry, onRefresh, onNavigate }) {
  let navigate = null;
  try {
    navigate = useNavigate();
  } catch (e) {
    // Graceful fallback if not inside a React Router provider
    navigate = null;
  }

  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [isRefreshingLocal, setIsRefreshingLocal] = useState(false);

  const fetchDashboardStats = useCallback(async () => {
    if (!adminApi || typeof adminApi.getDashboardStats !== 'function') {
      setIsLoadingStats(false);
      return;
    }

    try {
      setStatsError('');
      const data = await adminApi.getDashboardStats();
      setStats(data?.stats || data || null);
    } catch (err) {
      console.warn('Dashboard stats fetch failed:', err);
      setStatsError(err.message || 'Unable to load detailed dashboard metrics.');
    } finally {
      setIsLoadingStats(false);
      setIsRefreshingLocal(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const handleManualRefresh = async () => {
    setIsRefreshingLocal(true);
    await fetchDashboardStats();
    if (typeof onRefresh === 'function') {
      try {
        await onRefresh();
      } catch (err) {
        console.error('Parent refresh error:', err);
      }
    }
    setIsRefreshingLocal(false);
  };

  const handleActionNavigate = (path, tabKey) => {
    if (typeof onNavigate === 'function') {
      onNavigate(tabKey || path.replace('/', ''));
    } else if (navigate) {
      navigate(path);
    } else {
      window.location.href = path;
    }
  };

  // Derive consolidated metrics from dashboard stats and props fallback
  const userStats = stats?.users || overview?.users || {};
  const tenderStats = stats?.tenders || overview?.tenders || {};
  const orgStats = stats?.organizations || overview?.organizations || {};
  const bidStats = stats?.bids || overview?.bids || {};

  const totalUsers = userStats.total ?? overview?.usersCount ?? 0;
  const activeUsers = userStats.active ?? userStats.byRole?.user ?? 0;
  const totalTenders = tenderStats.total ?? overview?.tenders?.total ?? 0;
  const activeTenders = tenderStats.byStatus?.ACTIVE ?? overview?.tenders?.active ?? 0;
  const expiredTenders = tenderStats.byStatus?.EXPIRED ?? overview?.tenders?.expired ?? 0;
  const totalOrgs = orgStats.total ?? overview?.organizations?.total ?? 0;
  const totalBids = bidStats.total ?? overview?.bids?.total ?? 0;

  const recentUsers7d = userStats.recent7d ?? 0;
  const recentTenders7d = tenderStats.recent7d ?? 0;

  // System health evaluation
  const isHealthy = telemetry?.status === 'OPERATIONAL' || (!telemetry?.status && !statsError);
  const mongoLatency = telemetry?.latency?.mongoDbMs;
  const redisLatency = telemetry?.latency?.redisMs;

  // Recent activity lists
  const recentUsers = stats?.recentUsers || overview?.recentUsers || [];
  const recentTenders = stats?.recentTenders || overview?.recentTenders || [];

  return (
    <div className="space-y-6">

      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-charcoal-900 dark:text-paper-50 tracking-tight">
            Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-charcoal-500 dark:text-slate-400 mt-1">
            Real-time infrastructure telemetry, user adoption, tender activity, and system throughput.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshingLocal}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-subtle transition-all cursor-pointer disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshingLocal ? 'animate-spin text-dalBlue dark:text-blue-400' : ''}`} />
            <span>{isRefreshingLocal ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {statsError && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{statsError} Displaying baseline telemetry and system overview cache.</span>
          </div>
          <button
            onClick={() => setStatsError('')}
            className="text-amber-700 hover:text-amber-900 dark:text-amber-400 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Primary Stats Cards Row (4 cards in a grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        
        {/* Total Users */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Users</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-dalBlue dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800/60">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white font-mono">
              {isLoadingStats && !stats ? '...' : totalUsers.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {activeUsers.toLocaleString('en-IN')} active
            </span>
            <span>{userStats.inactive ?? (totalUsers - activeUsers)} inactive</span>
          </div>
        </div>

        {/* Total Tenders */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Tenders</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800/60">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white font-mono">
              {isLoadingStats && !stats ? '...' : totalTenders.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {activeTenders.toLocaleString('en-IN')} actively bidding
            </span>
            <span>{expiredTenders} expired</span>
          </div>
        </div>

        {/* Total Organizations */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Organizations</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800/60">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white font-mono">
              {isLoadingStats && !stats ? '...' : (totalOrgs > 0 ? totalOrgs.toLocaleString('en-IN') : 'All Depts')}
            </span>
          </div>
          <div className="mt-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
            J&amp;K Public Works &amp; State Agencies
          </div>
        </div>

        {/* Total Bids */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Platform Submissions</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center border border-purple-200 dark:border-purple-800/60">
              <Gavel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white font-mono">
              {isLoadingStats && !stats ? '...' : totalBids.toLocaleString('en-IN')}
            </span>
            <span className="text-xs font-mono text-slate-500">tracked</span>
          </div>
          <div className="mt-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Contractor bid submissions &amp; quotes
          </div>
        </div>

      </div>

      {/* 3. Secondary Stats Row (4 cards in a grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">

        {/* New Users (7d) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">New Users (7 Days)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-display font-bold text-slate-900 dark:text-white font-mono">
              +{recentUsers7d.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Registered in past 7 days
          </div>
        </div>

        {/* New Tenders (7d) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">New Tenders (7 Days)</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-dalBlue dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-display font-bold text-slate-900 dark:text-white font-mono">
              +{recentTenders7d.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Published in past 7 days
          </div>
        </div>

        {/* Expired Tenders */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Expired Tenders</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-display font-bold text-slate-900 dark:text-white font-mono">
              {expiredTenders.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {overview?.tenders?.expiredArchivedEligibleForPurge || 0} eligible for purge (&gt;30d)
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">System Health</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isHealthy
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
            }`}>
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500 animate-subtle-pulse' : 'bg-rose-500'}`} />
            <span className="text-sm font-bold font-display text-slate-900 dark:text-white uppercase tracking-wider">
              {telemetry?.status || (isHealthy ? 'OPERATIONAL' : 'DEGRADED')}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
            Mongo: {mongoLatency >= 0 ? `${mongoLatency}ms` : 'OK'} • Redis: {redisLatency >= 0 ? `${redisLatency}ms` : 'OK'}
          </div>
        </div>

      </div>

      {/* 4. Quick Actions Section */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-3">
          <div>
            <h2 className="text-base font-bold font-display text-charcoal-900 dark:text-paper-50">
              Administrative Quick Actions
            </h2>
            <p className="text-xs text-charcoal-500 dark:text-slate-400">
              Direct administrative pathways for platform management, pipeline audits, and diagnostic controls.
            </p>
          </div>
          <ShieldCheck className="w-5 h-5 text-dalBlue dark:text-blue-400" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">

          {/* Action 1: Manage Users */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col justify-between hover:border-dalBlue dark:hover:border-blue-400 transition-all bg-slate-50/50 dark:bg-slate-900/40">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-dalBlue dark:text-blue-300 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Manage Users</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Audit registered accounts, promote contractor credentials, and toggle access states.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => handleActionNavigate('/users', 'users')}
                className="w-full bg-dalBlue hover:bg-dalBlue-700 text-white rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Open Users</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action 2: Manage Tenders */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col justify-between hover:border-dalBlue dark:hover:border-blue-400 transition-all bg-slate-50/50 dark:bg-slate-900/40">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Manage Tenders</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect procurement records, verify R2 PDF attachments, and update lifecycle states.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => handleActionNavigate('/tenders', 'tenders')}
                className="w-full bg-dalBlue hover:bg-dalBlue-700 text-white rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Open Tenders</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action 3: View System Logs */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-500 transition-all bg-slate-50/50 dark:bg-slate-900/40">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <Terminal className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">View System Logs</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stream real-time scraper events, worker queue executions, and persistent system errors.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => handleActionNavigate('/logs', 'logs')}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-paper rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Stream Logs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action 4: Run Diagnostics */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-500 transition-all bg-slate-50/50 dark:bg-slate-900/40">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950 text-chinarRed dark:text-orange-300 flex items-center justify-center">
                <Wrench className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Run Diagnostics</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Evaluate connectivity, worker queues, Cloudflare storage parity, and self-healing tasks.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => handleActionNavigate('/diagnostics', 'diagnostics')}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-paper rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Inspect Health</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 5. Recent Activity Section (Last 5 users & Last 5 tenders) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Users Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-dalBlue dark:text-blue-400" />
              <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white">
                Recent User Registrations
              </h3>
            </div>
            <button
              onClick={() => handleActionNavigate('/users', 'users')}
              className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentUsers.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-slate-400">
              No recent registration activity recorded.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {recentUsers.slice(0, 5).map((u, i) => (
                <div key={u._id || u.id || i} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                      {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {u.name || 'Anonymous User'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {u.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      u.role === 'admin'
                        ? 'bg-blue-50 text-dalBlue dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        : u.role === 'contractor'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {u.role || 'user'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {formatDate(u.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Tenders Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-3">
            <div className="flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white">
                Recent Tenders Published
              </h3>
            </div>
            <button
              onClick={() => handleActionNavigate('/tenders', 'tenders')}
              className="text-xs font-semibold text-dalBlue dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentTenders.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-slate-400">
              No recent procurement notices indexed yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {recentTenders.slice(0, 5).map((t, i) => (
                <div key={t._id || t.id || t.tenderId || i} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-dalBlue dark:text-blue-400 truncate">
                        {t.referenceNumber || t.tenderId || 'REF—'}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-semibold uppercase ${
                        t.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {t.status || 'ACTIVE'}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={t.title}>
                      {t.title}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {t.departmentName || t.organisationName || 'J&K Government Department'}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                      {formatIndianCurrency(t.tenderValue)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {formatDate(t.publishDate || t.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

export default DashboardView;
