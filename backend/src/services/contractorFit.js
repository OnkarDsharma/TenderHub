/**
 * @file backend/src/services/contractorFit.js
 * @description Compares a contractor's profile with the eligibility a dossier
 * read from the tender documents. Only thresholds the documents state are
 * checked; a tender that sets none is "not assessed" rather than scored
 * against assumed percentages of the tender value.
 */

const positive = (value) => (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);
const crore = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;

// Words that say nothing about which licence is meant.
const GENERIC = new Set(['licence', 'license', 'licenses', 'licences', 'certificate', 'certificates', 'registration', 'registered', 'valid', 'copy', 'from', 'with', 'issued', 'authority', 'mandatory', 'required', 'bidder', 'must', 'have', 'under', 'proof', 'document', 'documents', 'should', 'current', 'latest', 'certified', 'self', 'attested', 'their', 'that', 'this', 'india', 'government', 'department']);
const keyWords = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !GENERIC.has(w));

/** True when one of the profile's licences names the same licence. */
export function holdsLicence(required, held = []) {
  const wanted = keyWords(required);
  return held.some((licence) => {
    const have = keyWords(licence);
    if (!wanted.length || !have.length) return String(licence).toLowerCase().includes(String(required).toLowerCase());
    return wanted.some((w) => have.includes(w));
  });
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const LETTER = { a: 1, b: 2, c: 3, d: 4, e: 5 };
/** Rank of an enlistment class: 0 for special class, 1 for A / I, larger is lower. */
export function registrationRank(text) {
  const s = String(text || '').toLowerCase();
  if (/special\s*class|class\s*-?\s*special|class\s*-?\s*s\b/.test(s)) return 0;
  if (/not registered|goods|services supplier/.test(s)) return null;
  const m = s.match(/class\s*-?\s*\(?([a-e]|iv|v|i{1,3}|[1-5])\)?\b/);
  if (!m) return null;
  const v = m[1];
  return LETTER[v] ?? ROMAN[v] ?? Number(v);
}

// Statutory registrations every bidding firm has; they are checklist uploads,
// not eligibility licences, even when the AI lists them as mandatory.
const ROUTINE_REGISTRATION = /\b(pan|gst|gstin|epf|epfo|esi|esic|tan|udyam|msme|nsic|cancelled cheque|bank account|eft mandate|aadhaar)\b/i;
export const isRoutineRegistration = (name) => ROUTINE_REGISTRATION.test(String(name || ''));

export function computeContractorFit(profile, dossier, tenderDomain = null) {
  const grounded = dossier?.grounding?.mode === 'DOCUMENTS';
  // Figures in a template or listing-only dossier were not read from the
  // tender, so nothing in them is checked.
  const eligibility = grounded ? (dossier?.preBidAnalysis?.eligibilityCriteria || {}) : {};
  const thresholds = eligibility.thresholds || {};
  const notRequired = grounded ? 'NOT_REQUIRED' : 'NOT_ASSESSED';

  const financial = (label, required, contractorValue, fail) => {
    const req = positive(required);
    const have = positive(contractorValue);
    if (req === null) return { label, required: null, contractor: have, status: notRequired, passed: null };
    if (have === null) return { label, required: req, contractor: null, status: 'CONFIRM', passed: null, detail: `Tender requires ${crore(req)}; add your figure to the profile.` };
    const passed = have >= req;
    return { label, required: req, contractor: have, status: passed ? 'PASS' : 'FAIL', passed, detail: passed ? null : fail(req, have) };
  };

  const turnoverCheck = financial('Average annual turnover', thresholds.minAvgAnnualTurnoverInr, profile.avgAnnualTurnoverInr,
    (req, have) => `Tender requires ${crore(req)} average turnover; your profile has ${crore(have)}.`);
  const solvencyCheck = financial('Bank solvency', thresholds.minSolvencyInr, profile.solvencyLimitInr,
    (req, have) => `Tender requires a solvency certificate of ${crore(req)}; your profile has ${crore(have)}.`);
  const experienceCheck = financial('Largest similar work', thresholds.minSingleSimilarWorkInr, profile.largestSingleWorkDoneInr,
    (req, have) => `Tender requires a completed similar work of ${crore(req)}; your largest is ${crore(have)}.`);

  const requiredRegistration = typeof thresholds.requiredRegistration === 'string' && thresholds.requiredRegistration.trim() ? thresholds.requiredRegistration.trim() : null;
  let classCheck = { label: 'Registration', required: null, contractorClass: profile.registrationClass, status: notRequired, passed: null };
  if (requiredRegistration) {
    const need = registrationRank(requiredRegistration);
    const have = registrationRank(profile.registrationClass);
    if (/not registered/i.test(profile.registrationClass || '')) {
      classCheck = { ...classCheck, required: requiredRegistration, status: 'FAIL', passed: false,
        detail: `Tender requires ${requiredRegistration}; your profile says you are not registered as a contractor.` };
    } else if (need !== null && have !== null) {
      const passed = have <= need;
      classCheck = { ...classCheck, required: requiredRegistration, status: passed ? 'PASS' : 'FAIL', passed,
        detail: passed ? null : `Tender requires ${requiredRegistration}; your profile is ${profile.registrationClass}.` };
    } else {
      classCheck = { ...classCheck, required: requiredRegistration, status: 'CONFIRM', passed: null,
        detail: `Tender requires: ${requiredRegistration}. Your profile: ${profile.registrationClass || 'not set'}. Confirm they match.` };
    }
  }

  const years = positive(thresholds.minYearsExperience);
  const yearsCheck = years
    ? { label: 'Years of experience', required: years, status: 'CONFIRM', passed: null, detail: `Tender requires ${years} year${years === 1 ? '' : 's'} of supplying or executing similar work; confirm you can show contracts for each year.` }
    : { label: 'Years of experience', required: null, status: notRequired, passed: null };

  const held = Array.isArray(profile.licences) ? profile.licences : [];
  const licenceChecks = (Array.isArray(eligibility.mandatoryLicences) ? eligibility.mandatoryLicences : [])
    .filter((l) => l && typeof l.name === 'string' && l.name.trim() && !isRoutineRegistration(l.name))
    .map((l) => {
      const passed = holdsLicence(l.name, held);
      return { label: l.name.trim(), source: l.source || null, status: passed ? 'PASS' : 'FAIL', passed,
        detail: passed ? null : `${l.name.trim()} is mandatory and is not among your profile's licences. Add it to your profile if you hold it.` };
    });

  const checks = [classCheck, turnoverCheck, solvencyCheck, experienceCheck, yearsCheck, ...licenceChecks];
  const assessed = checks.filter((c) => ['PASS', 'FAIL', 'CONFIRM'].includes(c.status));
  const failed = assessed.filter((c) => c.status === 'FAIL');
  const toConfirm = assessed.filter((c) => c.status === 'CONFIRM');

  let matchScore = null;
  let verdict;
  if (!grounded) {
    verdict = 'Not assessed: this dossier is not based on the tender documents';
  } else if (!assessed.length) {
    verdict = 'Not assessed: the tender sets no turnover, solvency, experience or licence thresholds';
  } else {
    const passedCount = assessed.filter((c) => c.status === 'PASS').length;
    matchScore = Math.round((100 * (passedCount + 0.5 * toConfirm.length)) / assessed.length);
    const blocking = failed.filter((c) => c === classCheck || licenceChecks.includes(c));
    if (blocking.length) {
      const names = blocking.map((c) => (c === classCheck ? 'registration class' : c.label));
      verdict = `Not eligible: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''} missing`;
      matchScore = Math.min(matchScore, 30);
    } else if (failed.length) {
      verdict = `Below the tender's ${failed.map((c) => c.label.toLowerCase()).join(', ')} requirement`;
      matchScore = Math.min(matchScore, 60);
    } else if (toConfirm.length) {
      verdict = `Meets the stated figures; confirm ${toConfirm.length} item${toConfirm.length === 1 ? '' : 's'}`;
    } else {
      verdict = 'Meets all requirements stated in the tender';
    }
  }

  const recommendation = (c) => {
    if (c === turnoverCheck || c === experienceCheck) return 'Bid as a joint venture or consortium if the tender allows it, or skip this tender.';
    if (c === solvencyCheck) return 'Ask your bank for a solvency certificate of at least the required amount.';
    if (c === classCheck) return 'Check your enlistment against the NIT; a lower class cannot bid.';
    if (c === yearsCheck) return 'Keep contracts and completion certificates for each required year ready to upload.';
    return c.status === 'FAIL' ? 'Without this licence the bid will be rejected; obtain it or partner with a holder.' : 'Confirm before bidding.';
  };
  const identifiedGaps = [...failed, ...toConfirm].map((c) => ({
    type: c === classCheck ? 'REGISTRATION_CLASS' : licenceChecks.includes(c) ? 'LICENCE' : c === yearsCheck ? 'EXPERIENCE_YEARS' : 'FINANCIAL',
    severity: c.status === 'FAIL' ? 'HIGH' : 'MEDIUM',
    title: c.status === 'FAIL' ? `${c.label}: not met` : `${c.label}: confirm`,
    detail: c.detail,
    recommendation: recommendation(c),
  }));

  return {
    assessed: matchScore !== null,
    matchScore,
    verdict,
    tenderDomain,
    classCheck,
    turnoverCheck,
    solvencyCheck,
    experienceCheck,
    yearsCheck,
    licenceChecks,
    identifiedGaps,
    contractorName: profile.companyName,
    registrationClass: profile.registrationClass,
  };
}
