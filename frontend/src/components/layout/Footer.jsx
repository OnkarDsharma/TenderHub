/**
 * @file src/components/layout/Footer.jsx
 * @description Classical platform footer containing official portal links,
 * regional operations desk information, and directory shortcuts.
 */
import { Link } from 'react-router-dom';
import { Mail, MapPin, ExternalLink } from 'lucide-react';
import { LANDING_STATES } from '@/utils/landingStates';

export function Footer() {
  return (
    <footer className="site-footer bg-blue-950 text-white pt-12 pb-8 border-t border-blue-900 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="site-footer-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6 lg:gap-8">
          
          {/* Brand & Description */}
          <div className="space-y-3">
            <Link to="/" className="inline-flex flex-col items-start" aria-label="tndrr home">
              <img src="/tndrr-logo.png" alt="tndrr" className="w-[148px] h-auto brightness-0 invert" />
              <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.17em] text-slate-400">Every tender. One search.</span>
            </Link>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              Public procurement intelligence for northern states. Live tenders, documents and BOQ data from official portals.
            </p>
          </div>

          {/* Monitored Portals */}
          <div>
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-3">
              Official Portals
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <a 
                  href="https://jktenders.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>JK eProcurement</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li>
                <a 
                  href="https://eproc.punjab.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>Punjab eProcurement</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li>
                <a 
                  href="https://hptenders.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>Himachal eProcurement</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li>
                <a 
                  href="https://gem.gov.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <span>Government e-Marketplace (GeM)</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
            </ul>
          </div>

          {/* Navigation Links */}
          <div>
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-3">
              Directory
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link to="/tenders" className="hover:text-white transition-colors">
                  Browse Active Tenders
                </Link>
              </li>
              <li>
                <Link to="/gem-tenders" className="hover:text-white transition-colors">
                  Government e-Marketplace (GeM) Bids
                </Link>
              </li>
              <li>
                <Link to="/services" className="hover:text-white transition-colors">
                  AI Tender Analysis &amp; Estimator
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition-colors">
                  Subscription Plans
                </Link>
              </li>
              <li>
                <Link to="/profile" className="hover:text-white transition-colors">
                  Contractor Workspace
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-white transition-colors">
                  About Platform
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  Contact Support Desk
                </Link>
              </li>
            </ul>
          </div>

          {/* Operations Desk */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-3">
              Operations Desk
            </h4>
            <div className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
              <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>Kh No. 621 Silver Oak Farms, Zero Number Rd, Ghitorni, New Delhi, Delhi 110030</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Mail className="w-4 h-4 text-slate-500 shrink-0" />
              <span>info@tndrr.in</span>
            </div>
          </div>
        </div>

        {/* Browse by state: crawlable links to the state landing pages */}
        <nav aria-label="Tenders by state" className="site-footer-states mt-10 space-y-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-display font-bold uppercase tracking-wider text-slate-300">Tenders by state</span>
            {LANDING_STATES.map((s) => (
              <Link key={s.slug} to={`/tenders/in/${s.slug}`} className="hover:text-white transition-colors">
                {s.name} tenders
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-display font-bold uppercase tracking-wider text-slate-300">GeM bids by state</span>
            {LANDING_STATES.map((s) => (
              <Link key={s.slug} to={`/gem-tenders/in/${s.slug}`} className="hover:text-white transition-colors">
                GeM bids {s.name}
              </Link>
            ))}
          </div>
        </nav>

        {/* Bottom Legal Bar */}
        <div className="site-footer-bottom mt-10 pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3 text-center sm:text-left">
          <p>© {new Date().getFullYear()} tndrr. Official tender notices remain the copyright of their respective issuing government authorities.</p>
          <div className="flex gap-4">
            <Link to="/about" className="hover:text-slate-300 transition-colors">Privacy</Link>
            <Link to="/contact" className="hover:text-slate-300 transition-colors">Contact</Link>
            <span className="text-slate-600 font-mono">v1.2.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
