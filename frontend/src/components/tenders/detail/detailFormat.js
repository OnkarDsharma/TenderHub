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
