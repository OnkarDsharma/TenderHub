/**
 * @file src/App.jsx
 * @description Top-level component establishing the application layout shell and route definitions.
 */
import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layout Components
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { ScrollToTop } from './components/layout/ScrollToTop';

// Pages. Home ships in the main bundle (most common entry point); every other
// page is loaded on demand so visitors only download the code they need.
import Home from './pages/Home';
const Tenders = lazy(() => import('./pages/Tenders'));
const TenderDetails = lazy(() => import('./pages/TenderDetails'));
const GeMTenders = lazy(() => import('./pages/GeMTenders'));
const GeMBidDetails = lazy(() => import('./pages/GeMBidDetails'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Profile = lazy(() => import('./pages/Profile'));
const Pricing = lazy(() => import('./pages/Pricing'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Login = lazy(() => import('./pages/Login'));
const Services = lazy(() => import('./pages/Services'));

const PageFallback = () => (
  <div className="flex-1 min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-8 h-8 rounded-full border-3 border-dalBlue border-t-transparent animate-spin" />
  </div>
);
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
          <Suspense fallback={<PageFallback />}>
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
            <Route path="/tenders/in" element={<Navigate to="/tenders" replace />} />
            <Route path="/tenders/in/:state" element={<LandingPage kind="tenders" />} />
            <Route path="/tenders/in/:state/:dept" element={<LandingPage kind="tenders" />} />
            <Route path="/gem-tenders/in" element={<Navigate to="/gem-tenders" replace />} />
            <Route path="/gem-tenders/in/:state" element={<LandingPage kind="gem" />} />
            <Route path="/tenders/:id" element={<TenderDetails />} />
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      {MockBadge && <Suspense fallback={null}><MockBadge /></Suspense>}
    </div>
  );
}
