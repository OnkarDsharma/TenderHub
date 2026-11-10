import test from 'node:test';
import assert from 'node:assert/strict';
import { computeContractorFit, holdsLicence, registrationRank } from '../src/services/contractorFit.js';
import { pickGeMAttachmentLinks } from '../src/services/tenderDocuments.service.js';

const profile = { companyName: 'Prime Infrastructure', registrationClass: 'Class A Works', avgAnnualTurnoverInr: 65000000, solvencyLimitInr: 25000000, largestSingleWorkDoneInr: 32000000, licences: [] };
const dossier = (eligibilityCriteria, mode = 'DOCUMENTS') => ({ grounding: { mode }, preBidAnalysis: { eligibilityCriteria } });

test('a mandatory licence the profile lacks makes the contractor ineligible', () => {
  const fit = computeContractorFit(profile, dossier({ thresholds: { minYearsExperience: 3 }, mandatoryLicences: [{ name: 'Drug License', source: '[ATC 1]' }] }));
  assert.equal(fit.licenceChecks[0].status, 'FAIL');
  assert.match(fit.verdict, /^Not eligible: Drug License/);
  assert.ok(fit.matchScore <= 30);
  assert.equal(fit.turnoverCheck.status, 'NOT_REQUIRED');
  assert.equal(fit.turnoverCheck.required, null);
});

test('the same tender passes once the licence is in the profile', () => {
  const fit = computeContractorFit({ ...profile, licences: ['Wholesale drug licence (Form 20B/21B)'] }, dossier({ mandatoryLicences: [{ name: 'Drug License' }] }));
  assert.equal(fit.licenceChecks[0].status, 'PASS');
  assert.equal(fit.verdict, 'Meets all requirements stated in the tender');
});

test('no thresholds means not assessed instead of a score', () => {
  const fit = computeContractorFit(profile, dossier({ thresholds: {} }));
  assert.equal(fit.matchScore, null);
  assert.match(fit.verdict, /^Not assessed: the tender sets no/);
  const template = computeContractorFit(profile, dossier({ thresholds: { minAvgAnnualTurnoverInr: 1 } }, 'TEMPLATE'));
  assert.equal(template.matchScore, null);
  assert.equal(template.turnoverCheck.status, 'NOT_ASSESSED');
});

test('financial thresholds compare against the stated figures only', () => {
  const fit = computeContractorFit(profile, dossier({ thresholds: { minAvgAnnualTurnoverInr: 350e5, minSolvencyInr: 30000000, requiredRegistration: 'Class B or above' } }));
  assert.equal(fit.turnoverCheck.status, 'PASS');
  assert.equal(fit.solvencyCheck.status, 'FAIL');
  assert.equal(fit.classCheck.status, 'PASS');
  assert.match(fit.verdict, /bank solvency requirement/);
});

test('registration classes and licence names are matched sensibly', () => {
  assert.equal(registrationRank('Class A Works'), 1);
  assert.equal(registrationRank('Class-III contractor'), 3);
  assert.equal(registrationRank('Special Class'), 0);
  assert.equal(registrationRank('Registered with Punjab Mandi Board'), null);
  assert.equal(holdsLicence('Electrical Contractor Licence', ['A-Grade electrical licence']), true);
  assert.equal(holdsLicence('Drug License', ['Electrical Contractor Licence']), false);
});

test('keeps only the buyer uploads linked from a GeM bid PDF', () => {
  const links = pickGeMAttachmentLinks([
    { url: 'https://bidplus.gem.gov.in/bidding/downloadOmppdfile/' },
    { url: 'https://mkp.gem.gov.in/uploaded_documents/51/OrderItem/BoqDocument/2026/spec_a.pdf' },
    { url: 'https://mkp.gem.gov.in/uploaded_documents/51/OrderItem/BoqLineItemsDocument/2026/boq_a.csv' },
    { url: 'https://mkp.gem.gov.in/uploaded_documents/51/OrderItem/BoqDocument/2026/spec_a.pdf' },
    { url: 'https://evil.example/uploaded_documents/x.pdf' },
    { url: 'http://mkp.gem.gov.in/uploaded_documents/insecure.pdf' },
  ]);
  assert.deepEqual(links.map((l) => [l.name, l.category]), [['spec_a.pdf', 'Specification'], ['boq_a.csv', 'BOQ']]);
});

test('routine registrations (PAN, GST, EPF) never fail the fit', async () => {
  const fit = computeContractorFit(profile, dossier({ mandatoryLicences: [{ name: 'PAN Registration' }, { name: 'GST Registration' }, { name: 'EPF Registration Certificate' }, { name: 'Electrical Contractor License' }] }));
  assert.deepEqual(fit.licenceChecks.map((c) => c.label), ['Electrical Contractor License']);
  const { sanitizePostAwardAnalysis } = await import('../src/services/contractorAgent.service.js');
  const post = sanitizePostAwardAnalysis({ qualityAndSafetyCompliance: [{ standardCode: 'Not stated in the tender documents', title: 'Not stated in the tender documents' }, { standardCode: 'IS 694', title: 'PVC cables' }], penaltyClauses: [] });
  assert.deepEqual(post.qualityAndSafetyCompliance.map((q) => q.standardCode), ['IS 694']);
});

test('profile completeness and class names from the profile form', async () => {
  const { isProfileComplete } = await import('../src/models/ContractorAgentProfile.js');
  assert.equal(isProfileComplete({ companyName: 'A', registrationClass: 'Class A Works', avgAnnualTurnoverInr: 1, solvencyLimitInr: 0, largestSingleWorkDoneInr: 5 }), true);
  assert.equal(isProfileComplete({ companyName: '', registrationClass: 'Class A Works', avgAnnualTurnoverInr: 1, solvencyLimitInr: 0, largestSingleWorkDoneInr: 5 }), false);
  assert.equal(isProfileComplete({ companyName: 'A', registrationClass: 'Class A Works', avgAnnualTurnoverInr: null, solvencyLimitInr: 0, largestSingleWorkDoneInr: 5 }), false);
  assert.equal(registrationRank('Class Special'), 0);
  const unregistered = computeContractorFit({ ...profile, registrationClass: 'Not registered (goods / services supplier)' }, dossier({ thresholds: { requiredRegistration: 'Class C or above' } }));
  assert.equal(unregistered.classCheck.status, 'FAIL');
  assert.match(unregistered.verdict, /^Not eligible: registration class/);
});
