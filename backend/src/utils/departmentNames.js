/**
 * @file backend/src/utils/departmentNames.js
 * @description Readable department names for landing pages, titles and URLs.
 *
 * State portals publish many departments as codes ("HAUDD", "DC-PDD", "PHE")
 * or in ALL CAPS. People search for the full name ("Housing and Urban
 * Development Department tenders"), so landing pages use the expanded name.
 * The same code can mean different things per state (PWD in J&K is
 * "Public Works (R&B)"), so the table is keyed by state.
 *
 * Only names we are sure of are expanded; anything else keeps its original
 * wording, tidied (ALL CAPS -> Title Case, "Deptt" -> "Department").
 * Add new entries as new codes show up on the landing pages.
 */

const key = (name) => String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/** stateSlug -> { normalized raw name -> display name }. '*' applies to every state. */
const EXPANSIONS = {
  'jammu-and-kashmir': {
    pwd: 'Public Works (R&B) Department',
    haudd: 'Housing and Urban Development Department',
    'dc pdd': 'Power Development Department',
    'i and fc': 'Irrigation and Flood Control Department',
    phe: 'Jal Shakti (PHE) Department',
    jkspdc: 'J&K State Power Development Corporation',
    'dgp jk': 'J&K Police',
    skuast: 'SKUAST (Sher-e-Kashmir University of Agricultural Sciences and Technology)',
    jksfc: 'J&K State Forest Corporation',
    'j and k agro': 'J&K Agro Industries Development Corporation',
    'jandk state cable car corporation': 'J&K State Cable Car Corporation',
    'horticulture production deptt': 'Horticulture Production Department',
  },
  ladakh: {
    'lahdc leh': 'LAHDC Leh (Ladakh Autonomous Hill Development Council)',
  },
  punjab: {
    'ce pwd b and r': 'Public Works Department (B&R)',
    'water supply and sanitation': 'Water Supply and Sanitation Department',
  },
  'himachal-pradesh': {
    pwd: 'Public Works Department',
    'hp irrigation and public health': 'Jal Shakti Vibhag (Irrigation and Public Health)',
    hpsebl: 'HP State Electricity Board (HPSEBL)',
    'directorate rural development and panchayati ra': 'Directorate of Rural Development and Panchayati Raj',
  },
  delhi: {
    'ipgcl ppcl': 'Indraprastha Power Generation (IPGCL-PPCL)',
    dsiidc: 'Delhi State Industrial and Infrastructure Development Corporation (DSIIDC)',
    dttdc: 'Delhi Tourism and Transportation Development Corporation (DTTDC)',
    'ggs inderprastha university': 'Guru Gobind Singh Indraprastha University',
  },
  '*': {},
};

// Words kept lowercase in Title Case (unless first), and acronyms kept as-is.
const SMALL_WORDS = new Set(['and', 'of', 'for', 'the', 'in', 'on', 'at', 'to', 'by']);
const ACRONYMS = new Set(['hp', 'jk', 'pwd', 'phe', 'r&b', 'b&r', 'ltd', 'ltd.', 'iti', 'nit', 'iit', 'aiims']);

const titleCase = (text) =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (ACRONYMS.has(word)) return word === 'ltd' || word === 'ltd.' ? 'Ltd' : word.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

/**
 * Display name for a department as published by a state portal.
 * @param {string} stateSlug e.g. 'jammu-and-kashmir'
 * @param {string} rawName department name as stored
 */
export function displayDepartmentName(stateSlug, rawName) {
  const raw = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (!raw) return raw;
  const k = key(raw);
  const expanded = EXPANSIONS[stateSlug]?.[k] || EXPANSIONS['*'][k];
  if (expanded) return expanded;

  let name = raw.replace(/\bDeptt?\.?(?=\s|$)/gi, 'Department');
  // ALL CAPS names longer than a short code read better in Title Case.
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length > 6 && letters === letters.toUpperCase()) name = titleCase(name);
  return name;
}
