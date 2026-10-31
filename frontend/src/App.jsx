/**
 * @file src/App.jsx
 * @description Top-level component establishing the application layout shell and route definitions.
 */
import { useEffect, lazy, Suspense } from 'react';
import TenderDetails from './pages/TenderDetails';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layout Components
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { ScrollToTop } from './components/layout/ScrollToTop';

// Pages
import Home from './pages/Home';
import Tenders from './pages/Tenders';
import GeMTenders from './pages/GeMTenders';
import GeMBidDetails from './pages/GeMBidDetails';
import Profile from './pages/Profile';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Services from './pages/Services';
import { useAuthStore } from './store/useAuthStore';

import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { CursorFollower } from './components/ui/cursor-follower';
// Dev-only mock badge: loaded lazily so none of the mock code or fixture data ships in production builds.
const MockBadge = import.meta.env.DEV
  ? lazy(() => import('./mocks/MockBadge').then((m) => ({ default: m.MockBadge })))
  : null;

export default function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  // Validate session on application launch
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="flex flex-col min-h-screen bg-paper dark:bg-slate-900 text-charcoal dark:text-slate-100 w-full max-w-[100vw] overflow-x-clip">
      <CursorFollower />
      <ScrollToTop />
      <Navbar />

      {/* Main content area grows to push the footer to the bottom */}
      <main className="flex-1 flex flex-col">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tenders" element={<Tenders />} />
            <Route path="/gem-tenders" element={<GeMTenders />} />
            <Route path="/gem-tenders/:id" element={<GeMBidDetails />} />
            <Route path="/check-score" element={<Navigate to="/services" replace />} />
            <Route path="/check-score/:tenderId" element={<Navigate to="/services" replace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:tenderId" element={<Services />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login defaultMode="login" />} />
            <Route path="/signup" element={<Login defaultMode="signup" />} />
            <Route path="/tenders/:id" element={<TenderDetails />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <Footer />
      {MockBadge && <Suspense fallback={null}><MockBadge /></Suspense>}
    </div>
  );
}
