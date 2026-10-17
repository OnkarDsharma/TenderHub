/**
 * @file src/components/layout/Navbar.jsx
 * @description Classical, human-crafted top navigation with reliable theme toggle,
 * clear institutional branding, and responsive mobile navigation.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Landmark, Heart, User, Menu, X, Sun, Moon, LogIn, LogOut, Sparkles } from 'lucide-react';
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
  const { user, isAuthenticated, isPro, logout } = useAuthStore();

  const primaryNavLinks = [
    { label: 'Browse Tenders', path: '/tenders' },
    { label: 'GeM Bids', path: '/gem-tenders' },
    { label: 'AI Services', path: '/services', isAi: true },
    { label: 'Check Score', path: '/check-score' },
    { label: 'Pricing', path: '/pricing' },
  ];

  const secondaryNavLinks = [
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];

  const allNavLinks = [
    { label: 'Home', path: '/' },
    ...primaryNavLinks,
    ...secondaryNavLinks,
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left Side: Brand Identity & Desktop Navigation grouped together */}
        <div className="flex items-center gap-6 xl:gap-8 min-w-0">
          {/* Institutional Brand Identity */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group focus:outline-none">
            <div className="w-8 h-8 rounded-lg bg-dalBlue text-white flex items-center justify-center shadow-xs shrink-0 group-hover:bg-dalBlue/90 transition-colors">
              <Landmark className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-display font-bold tracking-tight text-dalBlue dark:text-white leading-none">
                  Tender<span className="text-chinarRed">Hub</span>
                </span>
                {(import.meta.env.VITE_TEST_MODE === 'true' || (typeof window !== 'undefined' && window.location.port === '5175')) && (
                  <span className="text-[9px] font-mono font-bold tracking-tight bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800 select-none">
                    TEST
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-normal hidden sm:block">
                Procurement Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {primaryNavLinks.map((link) => {
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue dark:focus-visible:ring-blue-400 ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-dalBlue dark:text-white font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.isAi && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-100 dark:bg-blue-950/80 text-dalBlue dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      AI
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Secondary Destinations: About & Contact */}
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
            {secondaryNavLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'text-dalBlue dark:text-white font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Side Action Center: Theme, Saved, Profile & Mobile Hamburger */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Light/Dark Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Saved Tenders Bookmark Indicator */}
          <Link
            to="/profile"
            className="relative w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-chinarRed dark:hover:text-red-400 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue"
            title="Saved Tenders"
            aria-label="Saved Tenders"
          >
            <Heart className="w-4 h-4" />
            {savedTenders.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-chinarRed text-white text-[9px] font-mono font-bold flex items-center justify-center shadow-xs">
                {savedTenders.length}
              </span>
            )}
          </Link>

          {/* Subtle Visual Divider */}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

          {/* User Auth: Small Circular Profile or Sign In Actions */}
          {isAuthenticated ? (
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Circular Compact Profile Avatar */}
              <Link
                to="/profile"
                className={`relative w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full flex items-center justify-center transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue ${
                  isPro
                    ? 'ring-2 ring-amber-400 dark:ring-amber-400 hover:ring-amber-500 shadow-xs'
                    : 'border border-slate-200 dark:border-slate-700 hover:border-dalBlue dark:hover:border-blue-400 shadow-2xs hover:shadow-xs'
                }`}
                title={user?.name ? `${user.name} (${user.email || ''})` : user?.email || 'Contractor Workspace'}
                aria-label="Contractor Profile"
              >
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || 'User'}
                    className="w-full h-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className={`w-full h-full rounded-full text-[11px] font-bold flex items-center justify-center select-none ${
                      isPro
                        ? 'bg-amber-500 text-white'
                        : 'bg-dalBlue/10 dark:bg-blue-500/20 text-dalBlue dark:text-blue-300'
                    }`}
                  >
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )}

                {/* Floating PRO Badge Indicator */}
                {isPro && (
                  <span
                    className="absolute -bottom-1 -right-1 px-1 py-0.2 text-[8px] font-black uppercase tracking-tighter rounded-full bg-amber-500 text-slate-900 border border-white dark:border-slate-900 shadow-2xs select-none leading-none"
                    title="Pro Member"
                  >
                    PRO
                  </span>
                )}
              </Link>

              {/* Compact Logout Icon Button */}
              <button
                onClick={logout}
                title="Sign Out"
                className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full border border-transparent hover:border-red-200 dark:hover:border-red-900/60 flex items-center justify-center text-slate-500 hover:text-chinarRed dark:hover:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-950/20 transition-all cursor-pointer focus:outline-none"
                aria-label="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Link
                to="/signup"
                className="hidden sm:inline-flex items-center px-2.5 sm:px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all"
              >
                <span>Register</span>
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dalBlue hover:bg-dalBlue/90 text-white text-xs font-semibold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-dalBlue"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1 overflow-hidden"
          >
            {allNavLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`min-h-[40px] flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                  location.pathname === link.path
                    ? 'bg-dalBlue/10 dark:bg-blue-500/20 text-dalBlue dark:text-blue-300 font-bold border border-dalBlue/20 dark:border-blue-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[42px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-dalBlue dark:text-white bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60"
              >
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Contractor Workspace</span>
              </Link>

              {isAuthenticated ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 min-h-[44px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {user?.picture ? (
                      <img
                        src={user.picture}
                        alt="Profile"
                        className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-dalBlue text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {(user?.name || user?.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      {user?.name && (
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {user.name}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                        {user?.email}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-dalBlue hover:bg-dalBlue/90 shadow-xs"
                  >
                    <span>Register</span>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}