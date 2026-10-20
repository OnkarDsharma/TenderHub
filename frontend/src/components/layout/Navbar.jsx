/**
 * @file src/components/layout/Navbar.jsx
 * @description Spacious, elegant top navigation matching the Techbyte aesthetic.
 * Fixed text congestion by using single-line no-wrap labels, generous gaps,
 * streamlined top utility bar, and comfortable spacing between links and profile.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Landmark,
  Heart, 
  Menu, 
  X, 
  Sun, 
  Moon, 
  LogOut, 
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/context/ThemeProvider';

export function Navbar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Subscribe to global stores
  const savedTenders = useBookmarkStore((state) => state.savedTenders);
  const { user, isAuthenticated, logout } = useAuthStore();

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Browse Tenders', path: '/tenders' },
    { label: 'GeM Bids', path: '/gem-tenders' },
    { label: 'AI Estimator', path: '/services', badge: 'AI' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Contact', path: '/contact' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full transition-colors duration-200">
      
      {/* Top Utility Bar (Clean, uncluttered top strip) */}
      <div className="navbar-source-strip bg-[#141416] text-[#A0A5B1] text-[11px] sm:text-xs py-1 px-4 sm:px-6 lg:px-8 border-b border-[#24262E] hidden md:block">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Left: data-source context */}
          <div className="flex items-center gap-2 font-medium">
            <Landmark className="w-3.5 h-3.5 text-techCoral shrink-0" />
            <span>Data sources: <strong className="text-white font-semibold">J&amp;K, Punjab, HP Portals &amp; GeM</strong></span>
          </div>

          {/* Right: AI Shortcut, Theme Toggle & Saved Bookmarks */}
          <div className="flex items-center gap-4">
            <Link 
              to="/services" 
              className="inline-flex items-center gap-1.5 text-techCoral hover:text-white transition-colors text-[11px] font-semibold"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI BOQ Estimator</span>
            </Link>

            <div className="h-3 w-px bg-[#2D313A]" />

            {/* Light/Dark Mode Switch */}
            <button
              onClick={toggleTheme}
              className="text-[#B2B7C2] hover:text-white transition-colors cursor-pointer"
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {/* Saved Tenders Bookmark */}
            <Link
              to="/profile"
              className="relative text-[#B2B7C2] hover:text-techCoral transition-colors cursor-pointer flex items-center gap-1"
              title="Saved Tenders"
              aria-label="Saved Tenders"
            >
              <Heart className="w-3.5 h-3.5" />
              {savedTenders.length > 0 && (
                <span className="w-3.5 h-3.5 rounded-full bg-techCoral text-white text-[8px] font-bold flex items-center justify-center">
                  {savedTenders.length}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="bg-white dark:bg-[#18191E] border-b border-slate-200 dark:border-[#262832] shadow-xs">
        <div className="navbar-main-row max-w-7xl mx-auto flex items-center justify-between h-16 sm:h-20 px-4 sm:px-6 lg:px-8 gap-4">
          
          {/* Brand wordmark */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex flex-col items-start" aria-label="tndrr home">
              <img
                src="/tndrr-wordmark.png"
                alt="tndrr"
                className={`w-[112px] sm:w-[132px] h-auto ${isDark ? 'brightness-0 invert' : ''}`}
              />
              <span className="mt-0.5 text-[7px] sm:text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Every tender. One search.
              </span>
            </Link>
          </div>

          {/* Desktop Nav Links (Clean, Spacious & No Wrapping) */}
          <nav className="hidden lg:flex items-center justify-center gap-5 xl:gap-7 flex-1 px-4">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`whitespace-nowrap text-[13px] font-semibold transition-all px-3 py-2 rounded-lg flex items-center gap-1.5 ${
                    isActive
                      ? 'text-techCoral font-bold bg-techCoral-50 dark:bg-techCoral/15'
                      : 'text-slate-700 dark:text-slate-300 hover:text-techCoral dark:hover:text-techCoral hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-techCoral-50 dark:bg-techCoral/15 text-techCoral border border-techCoral/30">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Action: Clean Button & Profile */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Quick Explore Button */}
            <Link
              to="/tenders"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-900 hover:bg-techCoral text-white dark:bg-slate-800 dark:hover:bg-techCoral text-xs font-bold uppercase tracking-wider transition-colors shadow-xs"
            >
              <span>Explore Tenders</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>

            {/* Auth Buttons / Profile */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <Link
                  to="/profile"
                  className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden hover:border-techCoral transition-colors"
                  title={user?.name || user?.email}
                >
                  {user?.picture ? (
                    <img src={user.picture} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-techCoral">
                      {(user?.name || user?.email || 'U')[0].toUpperCase()}
                    </span>
                  )}
                </Link>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="text-slate-400 hover:text-techCoral p-1 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <Link
                  to="/login"
                  className="px-3 py-1.5 rounded text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-techCoral transition-colors"
                >
                  Sign In
                </Link>
              </div>
            )}

            {/* Mobile Menu Icon */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded text-slate-700 dark:text-slate-300 hover:text-techCoral cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white dark:bg-[#18191E] border-b border-slate-200 dark:border-slate-800 px-6 py-4 space-y-3 shadow-lg"
          >
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-techCoral py-1.5"
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <Link
                to="/tenders"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-techCoral"
              >
                <span>Explore Tenders</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>

              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
