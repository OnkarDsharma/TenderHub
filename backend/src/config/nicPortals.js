/**
 * @file backend/src/config/nicPortals.js
 * @description The NIC GePNIC portals scraped by JKTenderAdapter / JKTenderDateAdapter.
 * Each entry is the (portalName, baseUrl, state) triple passed to the adapter constructors.
 * PMGSY is nationwide: its `state` is only a fallback, each tender's real state comes from its organisation.
 */
import { JKTenderDateAdapter } from '../services/adapters/JKTenderDateAdapter.js';
import { PMGSY_BASE_URL, pmgsyIncludedState } from './pmgsy.js';

export const NIC_PORTALS = [
  { portalName: 'JK_TENDERS', baseUrl: 'https://jktenders.gov.in', state: 'Jammu & Kashmir', aliases: ['jk', 'j&k', 'jammu', 'kashmir'] },
  { portalName: 'PB_TENDERS', baseUrl: 'https://eproc.punjab.gov.in', state: 'Punjab', aliases: ['pb', 'punjab'] },
  { portalName: 'HP_TENDERS', baseUrl: 'https://hptenders.gov.in', state: 'Himachal Pradesh', aliases: ['hp', 'himachal'] },
  { portalName: 'LADAKH_TENDERS', baseUrl: 'https://tenders.ladakh.gov.in', state: 'Ladakh', aliases: ['ladakh'] },
  { portalName: 'HR_TENDERS', baseUrl: 'https://etenders.hry.nic.in', state: 'Haryana', aliases: ['hr', 'haryana'] },
  { portalName: 'DL_TENDERS', baseUrl: 'https://govtprocurement.delhi.gov.in', state: 'Delhi', aliases: ['dl', 'delhi'] },
  {
    portalName: 'PMGSY',
    baseUrl: PMGSY_BASE_URL,
    state: 'Other',
    scheme: 'PMGSY',
    stateForOrganisation: pmgsyIncludedState,
    aliases: ['pmgsy'],
  },
];

/** Resolves 'ALL' (or empty) to every portal; otherwise a portal name, state name or alias to one portal. */
export function resolveNicPortals(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value || value === 'all') return [...NIC_PORTALS];
  const match = NIC_PORTALS.find((p) =>
    p.portalName.toLowerCase() === value || p.state.toLowerCase() === value || p.aliases.includes(value));
  if (!match) throw new Error(`Unknown state/portal "${input}". Use ALL or one of: ${NIC_PORTALS.map((p) => p.aliases[0]).join(', ')}`);
  return [match];
}

/** Builds the date adapter for a portal entry, carrying scheme and per-organisation state when set. */
export function createDateAdapter({ portalName, baseUrl, state, scheme, stateForOrganisation }) {
  return new JKTenderDateAdapter(portalName, baseUrl, state, { scheme, stateForOrganisation });
}
