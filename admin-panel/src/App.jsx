import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2, Landmark } from 'lucide-react';
import { adminApi, getStoredAdminKey, getStoredAdminEmail } from './services/api';
import { ThemeProvider } from './context/ThemeContext';
import { AdminLogin } from './components/AdminLogin';
import { Navbar } from './components/Navbar';
import { TelemetryView } from './components/TelemetryView';
import { DiagnosticView } from './components/DiagnosticView';
import { IngestionView } from './components/IngestionView';
import { ArchiveView } from './components/ArchiveView';
import { LogsView } from './components/LogsView';
import { BackupView } from './components/BackupView';

// Lazy-loaded views created by peer agent
const DashboardView = lazy(() => import('./components/DashboardView'));
const UsersView = lazy(() => import('./components/UsersView'));
const TendersView = lazy(() => import('./components/TendersView'));

function AdminAppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [telemetry, setTelemetry] = useState(null);
  const [overview, setOverview] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [syncHistory, setSyncHistory] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Validate stored credentials on load
  useEffect(() => {
    const key = getStoredAdminKey();
    const email = getStoredAdminEmail();
    if (key && email) {
      adminApi.verify(key, email)
        .then(() => setIsAuthenticated(true))
        .catch(() => setIsAuthenticated(false))
        .finally(() => setIsInitialLoading(false));
    } else {
      setIsInitialLoading(false);
    }
  }, []);

  // Fetch all dashboard data
  const refreshAllData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsRefreshing(true);

    try {
      const [tel, ov, diag, hist] = await Promise.all([
        adminApi.getTelemetry().catch(() => null),
        adminApi.getOverview().catch(() => null),
        adminApi.getDiagnostics().catch(() => null),
        adminApi.getSyncHistory({ limit: 15 }).catch(() => null),
      ]);

      if (tel) setTelemetry(tel);
      if (ov) setOverview(ov);
      if (diag) setDiagnostics(diag);
      if (hist) setSyncHistory(hist);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Data refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  // Periodic refresh
  useEffect(() => {
    if (isAuthenticated) {
      refreshAllData();
      const interval = setInterval(refreshAllData, 25000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, refreshAllData]);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-slate-900 flex items-center justify-center text-dalBlue dark:text-blue-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  const activeIssuesCount = diagnostics?.count || 0;
  const isOperational = telemetry?.status === 'OPERATIONAL' && activeIssuesCount === 0;

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 text-charcoal dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Top Navbar */}
      <Navbar
        isOperational={isOperational}
        lastUpdated={lastUpdated}
        onRefresh={refreshAllData}
        isRefreshing={isRefreshing}
        onLogout={() => setIsAuthenticated(false)}
        diagnostics={diagnostics}
        overview={overview}
        telemetry={telemetry}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <Suspense fallback={
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-12 text-center text-sm font-mono text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-dalBlue dark:text-blue-400" />
            <span>Loading view...</span>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardView />} />
            <Route path="/telemetry" element={<TelemetryView telemetry={telemetry} overview={overview} isRefreshing={isRefreshing} />} />
            <Route path="/diagnostics" element={<DiagnosticView diagnostics={diagnostics} onRefresh={refreshAllData} />} />
            <Route path="/ingestion" element={<IngestionView overview={overview} syncHistory={syncHistory} onRefresh={refreshAllData} />} />
            <Route path="/archive" element={<ArchiveView overview={overview} onRefresh={refreshAllData} />} />
            <Route path="/backup" element={<BackupView />} />
            <Route path="/logs" element={<LogsView />} />
            <Route path="/users" element={<UsersView />} />
            <Route path="/tenders" element={<TendersView />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-6 py-4 text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-dalBlue dark:text-white" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              TenderHub Jammu &amp; Kashmir
            </span>
            <span className="text-[11px] text-slate-400">
              • Operations &amp; Diagnostic Infrastructure
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Isolated Deployment Architecture • Port 5174
          </div>
        </div>
      </footer>

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AdminAppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}
