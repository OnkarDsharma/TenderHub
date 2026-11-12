/**
 * @file frontend/src/components/layout/AlertsBell.jsx
 * @description Navbar bell for saved-tender updates: when a tender the user saved moves to a new stage on
 * the portal, is awarded or cancelled (alerts written by the daily tender status scraper).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Award, Ban, ArrowRightCircle, CheckCheck } from 'lucide-react';
import { contractorService } from '@/services/contractor.service';
import { tenderPath } from '@/utils/tenderUrl';

const ALERTS_KEY = ['tender-alerts'];

const KIND_STYLE = {
  AWARDED: { Icon: Award, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  CANCELLED: { Icon: Ban, tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10' },
  STAGE: { Icon: ArrowRightCircle, tone: 'text-dalBlue dark:text-blue-400 bg-blue-500/10' },
};

const stageText = (value) => String(value || '').replace(/_/g, ' ');

/** One-line summary of what changed. */
function alertMessage(alert) {
  if (alert.kind === 'AWARDED') return 'Contract awarded (AOC published)';
  if (alert.kind === 'CANCELLED') return `${stageText(alert.currentStage) || 'Cancelled'} by the department`;
  if (alert.completedStages?.length) {
    const done = alert.completedStages.join(', ');
    return alert.currentStage ? `${done} done · now ${stageText(alert.currentStage)}` : `${done} done`;
  }
  return `Moved to ${stageText(alert.currentStage)}`;
}

function timeAgo(date) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ALERTS_KEY,
    queryFn: contractorService.getTenderAlerts,
    // The scraper runs twice a day, so a slow refresh is plenty.
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
  const alerts = data?.alerts || [];
  const unread = data?.unreadCount || 0;

  const markRead = useMutation({
    mutationFn: (ids) => contractorService.markTenderAlertsRead(ids),
    onMutate: (ids) => {
      // Optimistic: flip the flags and count right away.
      queryClient.setQueryData(ALERTS_KEY, (prev) => {
        if (!prev) return prev;
        const target = ids ? new Set(ids) : null;
        let flipped = 0;
        const next = prev.alerts.map((a) => {
          if (a.isRead || (target && !target.has(a._id))) return a;
          flipped++;
          return { ...a, isRead: true };
        });
        return { alerts: next, unreadCount: ids ? Math.max(0, prev.unreadCount - flipped) : 0 };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ALERTS_KEY }),
  });

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full text-slate-600 dark:text-slate-300 hover:text-techCoral transition-colors cursor-pointer"
        aria-label={unread ? `Saved tender updates, ${unread} unread` : 'Saved tender updates'}
        aria-expanded={open}
        aria-haspopup="true"
        title="Saved tender updates"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-techCoral text-white text-[10px] font-bold leading-4 text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-white dark:bg-[#18191E] border border-slate-200 dark:border-[#262832] shadow-xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-[#262832]">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Saved tender updates</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(undefined)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-dalBlue dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            {alerts.length === 0 ? (
              <p className="px-4 py-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400 text-center">
                No updates yet. Save a tender and you&apos;ll be notified here when its bids are opened,
                evaluated, awarded or cancelled.
              </p>
            ) : (
              <ul className="max-h-[22rem] overflow-y-auto filter-scrollbar divide-y divide-slate-100 dark:divide-[#262832]">
                {alerts.map((alert) => {
                  const { Icon, tone } = KIND_STYLE[alert.kind] || KIND_STYLE.STAGE;
                  return (
                    <li key={alert._id}>
                      <Link
                        to={tenderPath({ _id: alert.tenderId, title: alert.title, sourceTenderId: alert.sourceTenderId })}
                        onClick={() => {
                          if (!alert.isRead) markRead.mutate([alert._id]);
                          setOpen(false);
                        }}
                        className={`flex gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${alert.isRead ? '' : 'bg-blue-50/50 dark:bg-blue-500/5'}`}
                      >
                        <span className={`mt-0.5 w-7 h-7 rounded-lg grid place-items-center shrink-0 ${tone}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-900 dark:text-white">{alertMessage(alert)}</span>
                          <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{alert.title || alert.sourceTenderId}</span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono truncate">{alert.sourceTenderId}</span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">{timeAgo(alert.createdAt)}</span>
                          </span>
                        </span>
                        {!alert.isRead && <span className="mt-2 w-2 h-2 rounded-full bg-techCoral shrink-0" aria-label="Unread" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
