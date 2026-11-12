/**
 * @file backend/src/config/pmgsy.js
 * @description PMGSY (Pradhan Mantri Gram Sadak Yojana) rural road tenders.
 *
 * Every state's "pmgsytenders<state>" address serves the same nationwide GePNIC database, so PMGSY is
 * scraped as ONE portal and each tender's state is taken from its organisation, not from the address.
 */

/** Any PMGSY host works; they all list the same organisations and tenders. */
export const PMGSY_BASE_URL = 'https://pmgsytendersjk.gov.in';

/**
 * Organisation name → state. First match wins. Organisations with no match are skipped and logged,
 * so a new organisation is never filed under the wrong state.
 */
const ORGANISATION_STATE_RULES = [
  [/jammu|kashmir/i, 'Jammu & Kashmir'],
  [/ladakh/i, 'Ladakh'],
  [/himachal|\bhppwd\b/i, 'Himachal Pradesh'],
  [/punjab/i, 'Punjab'],
  [/haryana/i, 'Haryana'],
  [/delhi/i, 'Delhi'],
  [/uttarakhand|uttarkhand/i, 'Uttarakhand'],
  [/\buprrda\b|uttar pradesh/i, 'Uttar Pradesh'],
  [/rajasthan/i, 'Rajasthan'],
  [/madhya pradesh/i, 'Madhya Pradesh'],
  [/gujarat/i, 'Gujarat'],
  [/bihar/i, 'Bihar'],
  [/\bwbsrda\b|west bengal/i, 'West Bengal'],
  [/mizoram/i, 'Mizoram'],
  [/andaman|\bapwd\b/i, 'Andaman & Nicobar Islands'],
  [/panchayat raj - ap\b|andhra/i, 'Andhra Pradesh'],
];

/** States whose PMGSY tenders are ingested. Matches the site's current coverage. */
const DEFAULT_PMGSY_STATES = ['Jammu & Kashmir', 'Ladakh', 'Himachal Pradesh', 'Punjab', 'Haryana', 'Delhi'];

/** PMGSY_STATES env: comma-separated state names, or ALL for every mapped state. */
function enabledStates() {
  const raw = String(process.env.PMGSY_STATES || '').trim();
  if (!raw) return new Set(DEFAULT_PMGSY_STATES);
  if (raw.toUpperCase() === 'ALL') return null;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Maps a PMGSY organisation name to its state, or null when unknown. */
export function pmgsyStateForOrganisation(orgName) {
  const name = String(orgName || '');
  const rule = ORGANISATION_STATE_RULES.find(([pattern]) => pattern.test(name));
  return rule ? rule[1] : null;
}

/** Returns the organisation's state when it should be ingested, otherwise null. */
export function pmgsyIncludedState(orgName) {
  const state = pmgsyStateForOrganisation(orgName);
  if (!state) return null;
  const allowed = enabledStates();
  return !allowed || allowed.has(state) ? state : null;
}
