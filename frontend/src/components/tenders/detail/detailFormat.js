/**
 * @file src/components/tenders/detail/detailFormat.js
 * @description Small value helpers for the tender details page.
 */

/** True when a backend value should read as "not available". */
export const isBlank = (value) => value === undefined || value === null || value === '' || value === 'NA';

/** Formats a size in KB as "123 KB" or "1.4 MB". */
export const formatSizeKb = (kb) => {
  if (!kb) return null;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
};

/** Parses a backend date (Date string, {$date}, or "NA") into a Date, or null. */
export const toDate = (raw) => {
  if (!raw || raw === 'NA' || raw === 'N/A') return null;
  const d = new Date(raw?.$date || raw);
  return isNaN(d.getTime()) ? null : d;
};

/** "Today", "Tomorrow", "in 12 days", "3 days ago" relative to `nowMs`. */
export const relativeDays = (date, nowMs) => {
  if (!date) return null;
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOfDay(date.getTime()) - startOfDay(nowMs)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
};

/**
 * Category of a tender notice from its name/description, so the main notice,
 * corrigenda and supporting files (estimates, drawings) read differently.
 */
export const noticeCategory = (doc) => {
  // Portal file names are generic (Tendernotice_2.pdf for an estimate), so the description decides.
  const text = String(doc?.description || doc?.documentName || '').toLowerCase();
  if (/corrigend|addend|amendment/.test(text)) return { tone: 'warning', weight: 'strong', label: 'Corrigendum' };
  if (/tender\s*notice|tendernotice|\bnit\b|notice inviting/.test(text)) return { tone: 'pdf', weight: 'strong', label: 'Notice' };
  return { tone: 'neutral', weight: 'normal', label: 'Supporting' };
};
