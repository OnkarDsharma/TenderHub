/**
 * @file backend/src/services/landing.service.js
 * @description Data for SEO landing pages that target searches like
 * "J&K tenders", "Jal Shakti Department tenders Jammu & Kashmir" or
 * "GeM bids Punjab":
 *
 *   /tenders/in/:state           open state-portal tenders in a state
 *   /tenders/in/:state/:dept     open tenders from one department in a state
 *   /gem-tenders/in/:state       open GeM bids delivered to a state
 *   /pmgsy-tenders               open PMGSY rural road tenders in every covered state
 *   /pmgsy-tenders/in/:state     open PMGSY rural road tenders in a state (only when it has any)
 *
 * Only pages with real content exist: a department page needs at least
 * MIN_DEPARTMENT_TENDERS open tenders, so search engines never see thin pages.
 * The same data feeds the React page (JSON API), the crawler HTML and the
 * landing sitemap.
 */
import Tender from '../models/Tender.js';
import { activeTenderFilter, activeGemFilter } from './sitemap.service.js';
import { slugify } from '../utils/tenderUrl.js';
import { displayDepartmentName } from '../utils/departmentNames.js';

export const MIN_DEPARTMENT_TENDERS = 3;
export const LIST_LIMIT = 50;

export const LANDING_STATES = [
  { slug: 'jammu-and-kashmir', name: 'Jammu & Kashmir', gemKey: 'Jammu & Kashmir' },
  { slug: 'ladakh', name: 'Ladakh', gemKey: 'Ladakh' },
  { slug: 'punjab', name: 'Punjab', gemKey: 'Punjab' },
  { slug: 'himachal-pradesh', name: 'Himachal Pradesh', gemKey: 'Himachal Pradesh' },
  { slug: 'haryana', name: 'Haryana', gemKey: 'Haryana' },
  { slug: 'delhi', name: 'Delhi', gemKey: 'Delhi' },
];

export const stateBySlug = (slug) => LANDING_STATES.find((s) => s.slug === String(slug || '').toLowerCase()) || null;

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stateMatch = (name) => ({ $regex: `^${escapeRegex(name)}$`, $options: 'i' });

/** Fields a tender card needs (no internal storage fields). */
export const CARD_FIELDS = [
  '_id', 'title', 'sourceTenderId', 'tenderReferenceNumber', 'sourcePortal', 'scheme', 'departmentCode', 'departmentName',
  'organisationChain', 'location', 'locationVerificationStatus', 'state', 'consigneeStates', 'productCategory',
  'estimatedValue', 'emdAmount', 'publishedDate', 'publishedDateStr', 'closingDate', 'closingDateStr',
  'bidSubmissionEndDate', 'bidSubmissionEndDateStr', 'isMultiTender', 'pdfParseStatus', 'pdfUrls', 'nitDocuments', 'detailsUrl',
].join(' ');

const listTenders = (filter) =>
  Tender.find(filter).select(CARD_FIELDS).sort({ closingDate: 1 }).limit(LIST_LIMIT).lean().maxTimeMS(15000);

const count = (filter) => Tender.countDocuments(filter).maxTimeMS(15000);

/**
 * Open-tender departments in a state, biggest first, merged by slug and
 * limited to those with enough tenders for a landing page.
 */
export async function departmentsInState(state, now = new Date()) {
  const rows = await Tender.aggregate([
    { $match: { ...activeTenderFilter(now), state: stateMatch(state.name), departmentName: { $nin: [null, ''] } } },
    { $group: { _id: '$departmentName', count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 15000 });

  // Group by the readable name's slug ("HAUDD" and "Housing and Urban
  // Development Department" become one page); remember each raw name's own
  // slug as an alias so earlier URLs (/.../haudd) still resolve and redirect.
  const bySlug = new Map();
  for (const { _id: rawName, count: n } of rows) {
    const name = displayDepartmentName(state.slug, rawName);
    const slug = slugify(name);
    if (!slug) continue;
    const entry = bySlug.get(slug) || { slug, name, names: [], aliases: new Set(), count: 0 };
    entry.names.push(rawName);
    const rawSlug = slugify(String(rawName).replace(/\s+/g, ' ').trim());
    if (rawSlug && rawSlug !== slug) entry.aliases.add(rawSlug);
    entry.count += n;
    bySlug.set(slug, entry);
  }
  return [...bySlug.values()]
    .filter((d) => d.count >= MIN_DEPARTMENT_TENDERS)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Top product categories among a state's open GeM bids. */
async function gemCategoriesInState(state, now = new Date()) {
  const rows = await Tender.aggregate([
    { $match: { ...activeGemFilter(now), consigneeStates: state.gemKey, productCategory: { $nin: [null, ''] } } },
    { $group: { _id: '$productCategory', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).option({ maxTimeMS: 15000 });
  return rows.map((r) => ({ name: String(r._id).trim(), count: r.count }));
}

const publicDepartment = ({ slug, name, count: n }) => ({ slug, name, count: n });

const activePmgsyFilter = (now) => ({ ...activeTenderFilter(now), scheme: 'PMGSY' });

/** Open PMGSY tender counts per covered state, biggest first (states with none are left out). */
async function pmgsyStateCounts(now = new Date()) {
  const rows = await Tender.aggregate([
    { $match: activePmgsyFilter(now) },
    { $group: { _id: '$state', count: { $sum: 1 } } },
  ]).option({ maxTimeMS: 15000 });
  const byName = new Map(rows.map((r) => [String(r._id).toLowerCase(), r.count]));
  return LANDING_STATES
    .map((st) => ({ slug: st.slug, name: st.name, count: byName.get(st.name.toLowerCase()) || 0 }))
    .filter((st) => st.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** PMGSY hub (no state) or state page; a state page exists only while it has open tenders. */
async function getPmgsyLanding(stateSlug, now) {
  const states = await pmgsyStateCounts(now);
  if (!stateSlug) {
    const filter = { ...activePmgsyFilter(now), state: { $in: LANDING_STATES.map((st) => st.name) } };
    const [total, tenders] = await Promise.all([count(filter), listTenders(filter)]);
    return { kind: 'pmgsy', state: null, department: null, total, tenders, departments: [], states };
  }
  const state = stateBySlug(stateSlug);
  const entry = state && states.find((st) => st.slug === state.slug);
  if (!entry) return null;
  const tenders = await listTenders({ ...activePmgsyFilter(now), state: stateMatch(state.name) });
  return {
    kind: 'pmgsy',
    state: { slug: state.slug, name: state.name },
    department: null,
    total: entry.count,
    tenders,
    departments: [],
    states: states.filter((st) => st.slug !== state.slug),
  };
}

/**
 * Landing page data, or null when the page should not exist (unknown state or
 * department, or a department below the thin-content threshold).
 * @param {'tenders'|'gem'} kind
 * @param {string} stateSlug
 * @param {string} [deptSlug]
 */
export async function getLanding(kind, stateSlug, deptSlug, now = new Date()) {
  if (kind === 'pmgsy') return deptSlug ? null : getPmgsyLanding(stateSlug, now);
  const state = stateBySlug(stateSlug);
  if (!state) return null;

  if (kind === 'gem') {
    if (deptSlug) return null;
    const filter = { ...activeGemFilter(now), consigneeStates: state.gemKey };
    const [total, tenders, categories] = await Promise.all([count(filter), listTenders(filter), gemCategoriesInState(state, now)]);
    return { kind, state: { slug: state.slug, name: state.name }, department: null, total, tenders, categories, departments: [] };
  }

  if (kind !== 'tenders') return null;
  const departments = await departmentsInState(state, now);

  if (!deptSlug) {
    const filter = { ...activeTenderFilter(now), state: stateMatch(state.name) };
    const [total, tenders] = await Promise.all([count(filter), listTenders(filter)]);
    return { kind, state: { slug: state.slug, name: state.name }, department: null, total, tenders, departments: departments.map(publicDepartment) };
  }

  const wanted = String(deptSlug).toLowerCase();
  const dept = departments.find((d) => d.slug === wanted || d.aliases.has(wanted));
  if (!dept) return null;
  const filter = { ...activeTenderFilter(now), state: stateMatch(state.name), departmentName: { $in: dept.names } };
  const tenders = await listTenders(filter);
  return {
    kind,
    state: { slug: state.slug, name: state.name },
    department: publicDepartment(dept),
    total: dept.count,
    tenders,
    departments: departments.filter((d) => d.slug !== dept.slug).slice(0, 30).map(publicDepartment),
  };
}

/** Public paths of every landing page that currently has content (for the sitemap). */
export async function allLandingPaths(now = new Date()) {
  const paths = ['/pmgsy-tenders', ...(await pmgsyStateCounts(now)).map((st) => `/pmgsy-tenders/in/${st.slug}`)];
  for (const state of LANDING_STATES) {
    paths.push(`/tenders/in/${state.slug}`, `/gem-tenders/in/${state.slug}`);
    const departments = await departmentsInState(state, now);
    for (const d of departments) paths.push(`/tenders/in/${state.slug}/${d.slug}`);
  }
  return paths;
}

/** Path for a landing page. */
export const landingPath = (kind, stateSlug, deptSlug) => {
  if (kind === 'pmgsy') return `/pmgsy-tenders${stateSlug ? `/in/${stateSlug}` : ''}`;
  return `/${kind === 'gem' ? 'gem-tenders' : 'tenders'}/in/${stateSlug}${deptSlug ? `/${deptSlug}` : ''}`;
};

/** Title and description shared by the React page and the crawler HTML. */
export function landingSeo(data) {
  const { kind, state, department, total } = data;
  if (kind === 'pmgsy') {
    const where = state ? state.name : 'J&K, Himachal, Punjab, Ladakh, Haryana and Delhi';
    return {
      heading: state ? `PMGSY Tenders in ${state.name}` : 'PMGSY Rural Road Tenders',
      title: state ? `PMGSY Tenders in ${state.name}: ${total} Open Rural Road Works` : `PMGSY Tenders: ${total} Open Rural Road Works`,
      description: `${total} open PMGSY (Pradhan Mantri Gram Sadak Yojana) tenders in ${where}: rural road construction, upgradation, bridges and maintenance. See values, EMD, closing dates and download documents and BOQs on tndrr.`,
    };
  }
  if (kind === 'gem') {
    return {
      heading: `GeM Bids in ${state.name}`,
      title: `GeM Bids in ${state.name}: ${total} Open Bids`,
      description: `${total} open Government e-Marketplace (GeM) bids for delivery in ${state.name}. Compare categories, EMD, delivery locations and closing dates on tndrr.`,
    };
  }
  if (department) {
    return {
      heading: `${department.name} Tenders in ${state.name}`,
      title: `${department.name} Tenders in ${state.name}`,
      description: `${total} open ${department.name} tenders in ${state.name}. See values, EMD, closing dates and download tender documents and BOQs on tndrr.`,
    };
  }
  return {
    heading: `Government Tenders in ${state.name}`,
    title: `${state.name} Government Tenders: ${total} Open`,
    description: `${total} open government e-tenders in ${state.name} from every department. Filter by department, value and closing date; download documents and BOQs on tndrr.`,
  };
}
