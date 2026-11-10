/**
 * @file backend/src/config/nicPortals.js
 * @description The NIC GePNIC state portals scraped by JKTenderAdapter / JKTenderDateAdapter.
 * Each entry is the (portalName, baseUrl, state) triple passed to the adapter constructors.
 */

export const NIC_PORTALS = [
  { portalName: 'JK_TENDERS', baseUrl: 'https://jktenders.gov.in', state: 'Jammu & Kashmir', aliases: ['jk', 'j&k', 'jammu', 'kashmir'] },
  { portalName: 'PB_TENDERS', baseUrl: 'https://eproc.punjab.gov.in', state: 'Punjab', aliases: ['pb', 'punjab'] },
  { portalName: 'HP_TENDERS', baseUrl: 'https://hptenders.gov.in', state: 'Himachal Pradesh', aliases: ['hp', 'himachal'] },
  { portalName: 'LADAKH_TENDERS', baseUrl: 'https://tenders.ladakh.gov.in', state: 'Ladakh', aliases: ['ladakh'] },
  { portalName: 'HR_TENDERS', baseUrl: 'https://etenders.hry.nic.in', state: 'Haryana', aliases: ['hr', 'haryana'] },
  { portalName: 'DL_TENDERS', baseUrl: 'https://govtprocurement.delhi.gov.in', state: 'Delhi', aliases: ['dl', 'delhi'] },
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
