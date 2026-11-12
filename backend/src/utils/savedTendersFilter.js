/**
 * @file backend/src/utils/savedTendersFilter.js
 * @description "Saved only" list filter. The frontend sends the ids of the user's saved (hearted) tenders
 * as `savedIds`, so it works the same for signed-in users and for guests whose bookmarks live in the
 * browser. Each entry is a Mongo _id or a portal tender number (e.g. 2026_PWD_318811_1, GEM/2026/B/123).
 */
import mongoose from 'mongoose';

const MAX_SAVED_IDS = 500;

/**
 * @param {string|string[]|undefined} savedIds - comma-separated string or array; 'none' = saved list is empty
 * @returns {object|null} Mongo condition, or null when the filter is not requested
 */
export function buildSavedTendersCondition(savedIds) {
  if (savedIds === undefined || savedIds === null) return null;
  const raw = (Array.isArray(savedIds) ? savedIds : String(savedIds).split(','))
    .map((v) => String(v).trim())
    .filter((v) => v && v !== 'none' && v.length <= 80)
    .slice(0, MAX_SAVED_IDS);

  const objectIds = raw.filter((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v))
    .map((v) => new mongoose.Types.ObjectId(v));
  const tenderNumbers = raw.filter((v) => !/^[a-f\d]{24}$/i.test(v));

  // Asked for saved tenders but none are saved: match nothing.
  if (!objectIds.length && !tenderNumbers.length) return { _id: { $in: [] } };
  return {
    $or: [
      ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
      ...(tenderNumbers.length ? [{ sourceTenderId: { $in: tenderNumbers } }] : []),
    ],
  };
}
