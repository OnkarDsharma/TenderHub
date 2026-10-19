/**
 * @file src/pages/About.jsx
 * @description Information regarding platform architecture, data synchronization with jktenders.gov.in, and engineering standards.
 */
import { Link } from 'react-router-dom';
import { Database, ArrowRight, Landmark, FileText, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function About() {
  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Mission Statement Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 sm:p-8 shadow-xs space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-dalBlue dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800">
            <Landmark className="w-3.5 h-3.5 text-dalBlue dark:text-blue-400 shrink-0" />
            <span>Platform Background</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
            Public Procurement Intelligence for Northern States (J&amp;K, Punjab &amp; Himachal)
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Public works contracts published across northern states—including Jammu &amp; Kashmir, Punjab, and Himachal Pradesh—represent critical infrastructure, rural water supply (Jal Jeevan Mission), road macadamization, and power grid projects. Historically, discovering these opportunities required navigating fragmented departmental portals with short-lived session timeouts and unindexed attachments.
          </p>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            TenderHub was established to provide contractors, civil engineers, and suppliers with a reliable, structured repository of official public tenders. We systematically index gazettes across northern state eProcurement portals (J&amp;K, Punjab, Himachal Pradesh) and GeM, verify document integrity, and provide work site clarity so local bidders can make informed, qualified decisions.
          </p>
        </div>

        {/* 3 Core Operating Standards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs space-y-2">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-dalBlue dark:text-blue-400 flex items-center justify-center mb-2">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Official Data Integrity
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every listing maintains a direct reference back to the official Tender Reference Number and issuing government division.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs space-y-2">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Document Archiving
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Official NIT notices and Bill of Quantities are cached to edge vaults so contractors can inspect specifications without session timeouts.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs space-y-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
              <MapPin className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              District &amp; Location Scope
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Clear city, district, and project location details help contractors assess geographical logistics and site access requirements.
            </p>
          </div>
        </div>

        {/* CTA Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 sm:p-8 text-center shadow-xs">
          <div className="max-w-md mx-auto space-y-2.5">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Explore Active Tender Notices
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Browse current open notices published by Public Works (R&amp;B), Jal Shakti, PMGSY, and regional development authorities.
            </p>
            <div className="pt-2">
              <Link to="/tenders">
                <Button variant="primary" size="sm" className="gap-1.5 text-xs font-semibold">
                  Browse Active Tenders <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}