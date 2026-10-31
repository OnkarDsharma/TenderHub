/**
 * @file frontend/src/mocks/fixtures/account.js
 * @description Test account, contractor profiles, AI dossier, bid-score and
 * notification fixtures for the dev mock API. State that the UI can change
 * (profile edits, bookmarks, chat quota, history) is persisted in localStorage
 * so it survives reloads while mock mode is on.
 */

const STATE_KEY = 'tndrr_mock_state';
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString();

export const TEST_USER_ID = '6abe2b7f4ec335668fdc702a';
export const TEST_ORG_ID = '6abe2b7f4ec335668fdc7000';

export const TEST_ACCOUNT = {
  email: 'test@tndrr.local',
  name: 'Rajesh Koul',
  otp: '123456',
};

/** A JWT-shaped token (three dot-separated parts) so the request interceptor keeps it. */
export function fakeJwt(email) {
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: TEST_USER_ID, email, iat: Math.floor(Date.now() / 1000) })}.mock`;
}

export function buildUser(email = TEST_ACCOUNT.email, name = TEST_ACCOUNT.name) {
  return {
    id: TEST_USER_ID,
    email,
    name,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(1).join(' '),
    picture: null,
    role: 'contractor',
    emailVerified: true,
    providers: { emailOtp: true },
    organizationId: TEST_ORG_ID,
    isPro: true,
    hasActiveSubscription: true,
    subscription: { planId: 'contractor_pro', status: 'active', currentPeriodEnd: iso(30) },
    dailyViews: { viewsUsed: 0, viewsLimit: 'Unlimited', viewsRemaining: 'Unlimited', resetsAt: null, resetsInMs: null },
  };
}

/* ------------------------------------------------------------------ */
/* Persistent mock state                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_STATE = () => ({
  session: null, // { email, name }
  agentProfile: {
    _id: '6abe2b7f4ec335668fdca001',
    userId: TEST_USER_ID,
    companyName: 'Prime Infrastructure & Engineering',
    registrationClass: 'Class A Works',
    primaryJurisdiction: 'Jammu & Kashmir / North Zone',
    gstin: '01AABCP1234F1Z5',
    panNumber: 'AABCP1234F',
    avgAnnualTurnoverInr: 65000000,
    solvencyLimitInr: 25000000,
    ongoingCommitmentsInr: 12000000,
    largestSingleWorkDoneInr: 32000000,
    machineryInventory: [
      { name: 'JCB 3DX Excavator', category: 'Earthmoving', quantity: 2, isOwned: true, condition: 'Good Operating Condition' },
      { name: 'Static Tandem Roller (8-10T)', category: 'Paving', quantity: 1, isOwned: true },
      { name: 'Transit Concrete Mixer 6m3', category: 'Concrete', quantity: 1, isOwned: true },
      { name: 'Water Tanker (5000L)', category: 'Transport', quantity: 2, isOwned: true },
    ],
    specialties: ['Road & Highway Construction', 'Civil Buildings', 'Drainage Works'],
    customInstructions: 'Strictly check liquidated damages, bank guarantee duration, and material price escalation.',
    credits: {
      planTier: 'contractor_pro', dailyDossiersLimit: 50, dailyDossiersUsed: 0, lastDossierDate: null,
      chatQueriesLimit: 100, chatQueriesUsed: 0, chatLockedUntil: null,
      weeklyWhatsAppLimit: 20, weeklyWhatsAppUsed: 1, weekStartDate: iso(-3),
      availableDossiers: 50, usedDossiers: 0, copilotQueriesLimit: 100, copilotQueriesUsed: 0,
      planExpiresAt: iso(30),
    },
    analyzedTenders: [],
    createdAt: iso(-40),
    updatedAt: iso(-1),
  },
  contractorProfile: {
    _id: '6abe2b7f4ec335668fdcc001',
    userId: TEST_USER_ID,
    contractorId: 'JKPWD-A-0423',
    name: 'Prime Infrastructure & Engineering',
    jurisdiction: 'Jammu & Kashmir / North Zone',
    affiliation: 'J&K PWD (R&B) Division Srinagar',
    divisionBadge: 'J&K Public Works Division',
    accountAuth: 'OTP Verified',
    registrationClass: 'Class A Works',
    portalVerification: 'Active • L1 Compliant',
    status: 'Active',
    preferences: { targetSectors: ['Civil Works', 'Roads & Bridges'], preferredLocations: ['Srinagar'], minTenderValue: 2500000, preferEmdExemption: false, isConfigured: true },
    financialMetrics: { maxAnnualTurnover: 65000000, ongoingCommitments: 12000000, largestSimilarWork: 32000000, hasMachineryEquipment: true, hasValidGstClearance: true, hasRegistrationCardRenewal: true, hasActiveCdrFdrFacility: true, lastUpdated: iso(-7) },
    evaluations: [],
  },
  savedTenderIds: [],
  bidHistory: [],
  notificationPrefs: {
    _id: '6abe2b7f4ec335668fdcn001',
    userId: TEST_USER_ID,
    whatsappPhone: '9419012345',
    whatsappEnabled: true,
    departments: ['PUBLIC WORKS DEPARTMENT', 'JAL SHAKTI DEPARTMENT'],
    districts: ['Srinagar', 'Budgam'],
    keywords: [],
    minValue: 2500000,
    maxValue: 0,
    instantAlerts: true,
    dailyDigest: true,
    lastNotifiedAt: iso(-1),
    totalAlertsSent: 14,
  },
  waitlistCount: 342,
});

let cache = null;

export function getState() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    cache = raw ? { ...DEFAULT_STATE(), ...JSON.parse(raw) } : DEFAULT_STATE();
  } catch {
    cache = DEFAULT_STATE();
  }
  return cache;
}

export function saveState(mutator) {
  const state = getState();
  if (typeof mutator === 'function') mutator(state);
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  return state;
}

export function resetState() {
  cache = null;
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* AI plans                                                            */
/* ------------------------------------------------------------------ */

export const AI_PLANS = [
  { id: 'pay_per_tender', name: 'Pay-Per-Tender Dossier', badge: 'On-Demand', price: 299, originalPrice: 499, unit: 'per tender', periodDays: 30, popular: false, description: 'One complete AI dossier with BOQ breakdown and risk register.', features: ['1 full tender dossier', 'Eligibility and turnover fit', 'BOQ material schedule', '20 copilot queries'], ctaText: 'Analyze Single Tender', dossierCredits: 1, chatQueries: 20 },
  { id: 'copilot_starter', name: 'Copilot Starter', badge: 'Most Popular', price: 999, originalPrice: 1999, unit: 'per month', periodDays: 30, popular: true, description: 'For contractors bidding every week.', features: ['10 dossiers per month', 'Unlimited eligibility checks', 'Execution schedules', '100 copilot queries'], ctaText: 'Start Copilot', dossierCredits: 10, chatQueries: 100 },
  { id: 'bidding_pro', name: 'Bidding Pro', badge: 'Teams', price: 2499, originalPrice: 4999, unit: 'per month', periodDays: 30, popular: false, description: 'High-volume bidding desks.', features: ['35 dossiers per month', 'Priority processing', 'WhatsApp alerts', '350 copilot queries'], ctaText: 'Go Pro', dossierCredits: 35, chatQueries: 350 },
];

/* ------------------------------------------------------------------ */
/* AI dossier + personalised fit, derived from a tender record         */
/* ------------------------------------------------------------------ */

const inr = (n) => `₹ ${Math.round(n).toLocaleString('en-IN')}`;
const crore = (n) => `₹${(n / 1e7).toFixed(2)} Crore`;
const lakh = (n) => `₹${(n / 1e5).toFixed(2)} Lakhs`;

export function buildDossier(tender, profile) {
  const value = tender.estimatedValue || tender.emdAmount * 50 || 5000000;
  const emd = tender.emdAmount || Math.round(value * 0.02);
  const isGem = tender.sourcePortal === 'GEM';
  const isRoad = /road|macadam|pavement|bridge|renewal|widening/i.test(tender.title);
  const isWater = /pipe|water|wss|tank|sewer|stp|canal|lining/i.test(tender.title);
  const days = tender.periodOfWorkDays || 365;
  const dept = tender.departmentName || 'Procuring Department';
  const title = tender.title.replace(/^\[|\]$/g, '');
  const minClass = tender.tendererClass || 'Class A';

  const material = value * 0.58;
  const cementBags = Math.round(material * 0.18 / 385);
  const steelT = Math.round(material * 0.22 / 62000);
  const aggCum = Math.round(material * 0.14 / 1450);
  const bitumenT = isRoad ? Math.round(material * 0.2 / 52000) : 0;
  const pipeM = isWater ? Math.round(material * 0.25 / 2100) : 0;

  const materials = [
    { name: 'Portland Pozzolana / OPC 43 Cement', category: 'Cement', estimatedQuantity: `${cementBags.toLocaleString('en-IN')} Bags`, unit: 'Bags', specCode: 'IS 1489 Part 1', approxRateInr: '₹ 385 / bag', totalEstCost: inr(cementBags * 385) },
    { name: 'TMT Reinforcement Bars Fe 500D', category: 'Steel', estimatedQuantity: `${steelT} MT`, unit: 'MT', specCode: 'IS 1786', approxRateInr: '₹ 62,000 / MT', totalEstCost: inr(steelT * 62000) },
    { name: 'Crushed Stone Aggregate 20 mm / 40 mm', category: 'Aggregate', estimatedQuantity: `${aggCum.toLocaleString('en-IN')} Cum`, unit: 'Cum', specCode: 'IS 383', approxRateInr: '₹ 1,450 / cum', totalEstCost: inr(aggCum * 1450) },
  ];
  if (isRoad) materials.push({ name: 'Bitumen VG-30 (Bulk)', category: 'Bitumen', estimatedQuantity: `${bitumenT} MT`, unit: 'MT', specCode: 'IS 73', approxRateInr: '₹ 52,000 / MT', totalEstCost: inr(bitumenT * 52000) });
  if (isWater) materials.push({ name: 'DI Pipe K-9 150-200 mm', category: 'Pipes', estimatedQuantity: `${pipeM.toLocaleString('en-IN')} Rmt`, unit: 'Rmt', specCode: 'IS 8329', approxRateInr: '₹ 2,100 / rmt', totalEstCost: inr(pipeM * 2100) });

  const boqLineItems = isRoad ? [
    { itemNo: '1.1', description: 'Earthwork in excavation for roadway in ordinary soil including disposal up to 1 km lead', quantity: Math.round(value / 9000), unit: 'Cum', estimatedRate: 185, estimatedAmount: Math.round(value / 9000) * 185 },
    { itemNo: '2.1', description: 'Providing and laying granular sub-base Grade II with crusher-run material', quantity: Math.round(value / 14000), unit: 'Cum', estimatedRate: 1620, estimatedAmount: Math.round(value / 14000) * 1620 },
    { itemNo: '3.1', description: 'Providing and laying 50 mm Bituminous Macadam with VG-30 including tack coat', quantity: Math.round(value / 4200), unit: 'Sqm', estimatedRate: 420, estimatedAmount: Math.round(value / 4200) * 420 },
    { itemNo: '3.2', description: 'Providing and laying 25 mm Semi-Dense Bituminous Concrete', quantity: Math.round(value / 4200), unit: 'Sqm', estimatedRate: 310, estimatedAmount: Math.round(value / 4200) * 310 },
    { itemNo: '4.1', description: 'RCC M-25 for side drains and culverts including shuttering', quantity: Math.round(value / 120000), unit: 'Cum', estimatedRate: 7850, estimatedAmount: Math.round(value / 120000) * 7850 },
  ] : [
    { itemNo: '1.1', description: 'Earthwork in excavation in trenches / foundation in all kinds of soil', quantity: Math.round(value / 12000), unit: 'Cum', estimatedRate: 210, estimatedAmount: Math.round(value / 12000) * 210 },
    { itemNo: '2.1', description: 'PCC 1:4:8 in foundation and under floors', quantity: Math.round(value / 150000), unit: 'Cum', estimatedRate: 5200, estimatedAmount: Math.round(value / 150000) * 5200 },
    { itemNo: '3.1', description: 'RCC M-25 in columns, beams and slabs including centering and shuttering', quantity: Math.round(value / 95000), unit: 'Cum', estimatedRate: 8400, estimatedAmount: Math.round(value / 95000) * 8400 },
    { itemNo: '3.2', description: 'Reinforcement TMT Fe 500D cut, bent and placed in position', quantity: steelT * 1000, unit: 'Kg', estimatedRate: 78, estimatedAmount: steelT * 1000 * 78 },
    { itemNo: '9.1', description: isWater ? 'Laying DI K-9 pipe in trench including jointing and testing' : 'Supply of items per special conditions', quantity: isWater ? pipeM : 1, unit: isWater ? 'Rmt' : 'LS', estimatedRate: isWater ? 2650 : 'To be quoted by bidder', estimatedAmount: isWater ? pipeM * 2650 : 'To be quoted by bidder' },
  ];

  const dossier = {
    _id: `6abf${tender._id.slice(4)}`,
    tenderId: tender._id,
    sourceTenderId: tender.sourceTenderId,
    status: 'COMPLETED',
    summary: [
      `• Scope & Department: ${title} (${dept})`,
      `• Outlay & Timeline: ${lakh(value)} | ${days} calendar days execution window`,
      `• Required Enlistment: Minimum ${minClass} registration with ${tender.state} PWD or equivalent`,
      `• Mandatory Financials: EMD ${lakh(emd)} (CDR/FDR), 40% banker solvency (${lakh(value * 0.4)}), 120% three-year average turnover`,
      `• Winning Recommendation: ${isRoad ? 'Secure a hot-mix plant tie-up within 60 km before bidding' : 'Confirm site access and material lead times before pricing'}; quote within the L1 corridor of -4% to -8%.`,
    ].join('\n'),
    executiveOverview: {
      title, department: dept, estimatedValue: value, emdAmount: emd, tenderFee: tender.tenderFee || 0,
      submissionDeadline: tender.closingDate, location: tender.location, contractType: isGem ? 'GeM Bid / Reverse Auction' : 'Item Rate Contract', completionPeriodDays: days,
    },
    preBidAnalysis: {
      eligibilityCriteria: {
        requiredTurnover: `${crore(value * 1.2)} (average 3-year turnover)`,
        solvencyRequired: `${crore(value * 0.4)} banker solvency certificate`,
        experienceCriteria: `One similar completed work of at least ${crore(value * 0.8)} in the last 7 years`,
        minimumRegistrationClass: minClass, jointVentureAllowed: value > 100000000, emdExemptionPossible: false,
        keyRequirements: ['Active GST registration with updated GSTR-3B filings', 'PAN and valid contractor registration card', 'No blacklisting affidavit on stamp paper', 'Bank solvency not older than 6 months'],
      },
      mandatoryDocumentChecklist: [
        { sNo: 1, title: 'Earnest Money Deposit (EMD) / Bid Security', description: `EMD of ${inr(emd)} as CDR/FDR/BG pledged to ${tender.invitingAuthorityName || tender.departmentName}.`, stage: 'Fee Cover', isMandatory: true, complianceTip: 'Validity must be at least 180 days from the technical bid opening date.' },
        { sNo: 2, title: 'Tender Fee Receipt', description: `Non-refundable tender fee ${inr(tender.tenderFee || 0)} paid online through the portal gateway.`, stage: 'Fee Cover', isMandatory: true, complianceTip: 'Keep the payment reference; it is cross-checked at opening.' },
        { sNo: 3, title: 'Contractor Registration Card', description: `Valid enlistment of ${minClass} or above with the state PWD / CPWD / MES / Railways.`, stage: 'Technical Cover', isMandatory: true, complianceTip: 'Renewal must be current on the date of bid submission.' },
        { sNo: 4, title: 'Turnover and Solvency Certificates', description: `CA-certified turnover for FY 2023-24 to 2025-26 and banker solvency of ${lakh(value * 0.4)}.`, stage: 'Technical Cover', isMandatory: true, complianceTip: 'Solvency certificate must name the inviting authority.' },
        { sNo: 5, title: 'Experience Certificates', description: 'Completion certificates for similar works issued by an officer not below Executive Engineer.', stage: 'Technical Cover', isMandatory: true, complianceTip: 'Attach the work order along with each completion certificate.' },
        { sNo: 6, title: 'Price Bid (BOQ)', description: 'Rates filled only in the portal BOQ template, in figures, inclusive of GST.', stage: 'Financial Cover', isMandatory: true, complianceTip: 'Do not alter the template; altered BOQs are rejected.' },
      ],
      boqMaterialBreakdown: {
        summary: [
          `• Material Outlay: Estimated at ${lakh(material)} (~58% of tender budget)`,
          `• Core Materials: ${materials.map((m) => m.category).join(', ')}`,
          `• Phase 1 Staging: Mobilise 25% cement and ${isRoad ? 'GSB aggregate' : 'shuttering'} within the first 15 days`,
          '• Rates: Normative CPWD/PWD Schedule of Rates; confirm local supplier quotes and freight before pricing',
        ].join('\n'),
        materials,
        boqLineItems,
      },
      riskAndRedFlags: [
        { severity: 'HIGH', title: 'Liquidated Damages', clauseReference: 'GCC Clause 2', riskSummary: 'LD at 1% of contract value per week of delay, capped at 10%.', mitigationAction: isRoad ? 'Front-load bitumen procurement before the winter shutdown window.' : 'Lock long-lead material orders within 10 days of award.' },
        { severity: 'MEDIUM', title: 'No Price Escalation', clauseReference: 'Special Conditions 7', riskSummary: `Fixed-price contract for ${days} days; steel and cement volatility is on the contractor.`, mitigationAction: 'Build a 4-6% contingency into the quoted rates for steel-heavy items.' },
        { severity: 'MEDIUM', title: 'Performance Security', clauseReference: 'GCC Clause 1', riskSummary: '3% performance security plus 5% retention from running bills until defect liability ends.', mitigationAction: 'Arrange bank guarantee limits in advance; retention affects cash flow for 12 months.' },
        { severity: 'LOW', title: 'Site Handover', clauseReference: 'Special Conditions 3', riskSummary: 'Site handed over in stretches; delays in land clearance are not grounds for extension beyond 30 days.', mitigationAction: 'Record a joint site inspection before mobilisation.' },
      ],
    },
    postAwardAnalysis: {
      procurementSchedule: [
        { phase: 'Phase 1: Mobilisation', timeframe: 'Days 1-15', materialsToMobilize: ['25% cement stock', isRoad ? 'GSB aggregate' : 'Shuttering formwork', 'Site office and labour camp'], criticalPathItems: isRoad ? 'Hot-mix plant tie-up MoU' : 'Approved drawings and layout' },
        { phase: 'Phase 2: Sub-structure', timeframe: `Days 16-${Math.round(days * 0.4)}`, materialsToMobilize: ['TMT steel 60%', 'Cement 40%', 'Aggregate 50%'], criticalPathItems: 'Foundation and drainage completion before monsoon' },
        { phase: 'Phase 3: Super-structure / Surfacing', timeframe: `Days ${Math.round(days * 0.4) + 1}-${Math.round(days * 0.85)}`, materialsToMobilize: isRoad ? ['Bitumen VG-30', 'Aggregate 50%'] : ['Remaining steel', 'Blockwork and finishing items'], criticalPathItems: isRoad ? 'Bituminous layers in dry weather window' : 'Slab cycles and curing' },
        { phase: 'Phase 4: Finishing and Handover', timeframe: `Days ${Math.round(days * 0.85) + 1}-${days}`, materialsToMobilize: ['Road furniture / fixtures', 'Testing consumables'], criticalPathItems: 'Third-party quality tests and completion certificate' },
      ],
      milestones: [
        { milestoneNo: 1, description: 'Mobilisation, survey and earthwork complete', targetDays: Math.round(days * 0.15), financialProgressPct: 10, penaltyIfDelayed: '0.5% of contract value per week' },
        { milestoneNo: 2, description: isRoad ? 'Sub-base and base course complete' : 'Foundation and plinth complete', targetDays: Math.round(days * 0.4), financialProgressPct: 35, penaltyIfDelayed: '0.5% of contract value per week' },
        { milestoneNo: 3, description: isRoad ? 'Bituminous layers and drains complete' : 'Structure and roofing complete', targetDays: Math.round(days * 0.8), financialProgressPct: 80, penaltyIfDelayed: '1% of contract value per week' },
        { milestoneNo: 4, description: 'Testing, defects rectification and handover', targetDays: days, financialProgressPct: 100, penaltyIfDelayed: '1% of contract value per week, capped at 10%' },
      ],
      qualityAndSafetyCompliance: [
        { standardCode: isRoad ? 'MORTH 500' : 'IS 456', title: isRoad ? 'Bituminous course density' : 'Concrete cube strength', testFrequency: isRoad ? 'Per 500 Sqm' : 'Per 30 Cum', inspectingAuthority: 'Executive Engineer QC' },
      ],
      penaltyClauses: [{ type: 'Delay', rate: '1% per week', maximumCap: '10%', conditions: 'Applies after the approved extension period lapses.' }],
    },
    aiEngine: { model: 'mock-fixture', promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCostPaise: 0, latencyMs: 0, processedAt: iso(0) },
    createdAt: iso(0),
    updatedAt: iso(0),
  };

  const turnoverReq = Math.round(value * 1.2);
  const solvencyReq = Math.round(value * 0.4);
  const expReq = Math.round(value * 0.8);
  const contractorTurnover = profile.avgAnnualTurnoverInr || 0;
  const contractorSolvency = profile.solvencyLimitInr || 0;
  const contractorExp = profile.largestSingleWorkDoneInr || 0;
  const ceiling = /special/i.test(profile.registrationClass) ? Infinity : /class a/i.test(profile.registrationClass) ? 250000000 : /class b/i.test(profile.registrationClass) ? 50000000 : 20000000;
  const checks = {
    classCheck: { passed: value <= ceiling, contractorClass: profile.registrationClass, ceilingLimit: Number.isFinite(ceiling) ? ceiling : null, tenderValue: value },
    turnoverCheck: { required: turnoverReq, contractor: contractorTurnover, passed: contractorTurnover >= turnoverReq, ratioPercent: turnoverReq ? Math.round((contractorTurnover / turnoverReq) * 100) : 0 },
    solvencyCheck: { required: solvencyReq, contractor: contractorSolvency, passed: contractorSolvency >= solvencyReq },
    experienceCheck: { required: expReq, contractor: contractorExp, passed: contractorExp >= expReq },
    bidCapacityCheck: { passed: true, availableCapacity: Math.max(0, contractorTurnover * 2 - (profile.ongoingCommitmentsInr || 0)), requiredValue: value },
  };
  const passed = ['classCheck', 'turnoverCheck', 'solvencyCheck', 'experienceCheck'].filter((k) => checks[k].passed).length;
  const matchScore = Math.min(97, 40 + passed * 14 + (isRoad ? 0 : 3));
  const gaps = [];
  if (!checks.turnoverCheck.passed) gaps.push({ type: 'FINANCIAL_TURNOVER', severity: 'HIGH', title: 'Turnover Below Threshold', detail: `Required ${crore(turnoverReq)} against your ${crore(contractorTurnover)}.`, recommendation: 'Bid in joint venture with a partner whose turnover bridges the gap, or target smaller lots.' });
  if (!checks.solvencyCheck.passed) gaps.push({ type: 'BANK_SOLVENCY', severity: 'HIGH', title: 'Solvency Certificate Shortfall', detail: `Required ${crore(solvencyReq)} against your ${crore(contractorSolvency)}.`, recommendation: 'Request an enhanced solvency certificate from your banker against fixed deposits.' });
  if (!checks.experienceCheck.passed) gaps.push({ type: 'BID_CAPACITY', severity: 'MEDIUM', title: 'Similar Work Experience Gap', detail: `Largest similar work ${crore(contractorExp)} is below the ${crore(expReq)} benchmark.`, recommendation: 'Attach consortium experience or a JV partner with a qualifying completion certificate.' });
  if (!checks.classCheck.passed) gaps.push({ type: 'REGISTRATION_CLASS', severity: 'HIGH', title: 'Registration Class Ceiling Exceeded', detail: `${profile.registrationClass} ceiling does not cover ${crore(value)}.`, recommendation: 'Apply for class upgradation or bid as the minor partner in a JV.' });
  if (isRoad) gaps.push({ type: 'PLANT_EQUIPMENT', severity: 'MEDIUM', title: 'Mandatory Machinery Attachment Needed', detail: 'Bituminous work requires a sensor paver and hot-mix plant within the hauling radius per state special conditions.', recommendation: 'Attach a notarised lease agreement or supplier tie-up MoU with an established plant owner.' });

  const verdict = matchScore >= 80 ? 'Strong Bid Candidate'
    : matchScore >= 65 ? 'Conditionally Eligible (Requires Leased Machinery / Enhanced Solvency)'
      : 'High Risk - Joint Venture Recommended';

  const personalizedFit = {
    matchScore, verdict, tenderDomain: isGem ? 'GOODS_SUPPLY' : 'CIVIL_WORKS', ...checks, identifiedGaps: gaps,
    contractorName: profile.companyName, registrationClass: profile.registrationClass,
  };

  return { dossier, personalizedFit };
}

/* ------------------------------------------------------------------ */
/* Copilot replies                                                     */
/* ------------------------------------------------------------------ */

export function copilotReply(message, dossier, fit) {
  const q = (message || '').toLowerCase();
  const ov = dossier.executiveOverview;
  if (/emd|cdr|fdr|security|deposit/.test(q)) {
    return `• **EMD Required**: ${inr(ov.emdAmount)} as CDR/FDR/BG pledged to the inviting authority\n• **Validity**: Minimum 180 days from technical bid opening\n• **Exemption**: Not available for this notice; MSME exemptions must be confirmed with the department\n• **Tip**: Scan the pledged instrument into the Fee Cover and carry the original to the opening`;
  }
  if (/turnover|solvency|eligib|qualify/.test(q)) {
    return `• **Turnover Check**: ${crore(fit.turnoverCheck.contractor)} available vs ${crore(fit.turnoverCheck.required)} required — ${fit.turnoverCheck.passed ? 'cleared' : 'short'}\n• **Solvency Check**: ${crore(fit.solvencyCheck.contractor)} vs ${crore(fit.solvencyCheck.required)} — ${fit.solvencyCheck.passed ? 'cleared' : 'short'}\n• **Experience**: ${crore(fit.experienceCheck.contractor)} vs ${crore(fit.experienceCheck.required)} — ${fit.experienceCheck.passed ? 'cleared' : 'short'}\n• **Verdict**: ${fit.verdict}`;
  }
  if (/cement|steel|material|boq|quantity|aggregate|bitumen/.test(q)) {
    const m = dossier.preBidAnalysis.boqMaterialBreakdown.materials;
    return `• **Material Schedule** (normative SOR estimates):\n${m.map((x) => `• ${x.name}: \`${x.estimatedQuantity}\` at ${x.approxRateInr} ≈ ${x.totalEstCost}`).join('\n')}\n• Confirm local supplier quotes, GST and freight before pricing.`;
  }
  if (/delay|penalt|ld|liquidated|milestone|time/.test(q)) {
    const ms = dossier.postAwardAnalysis.milestones;
    return `• **Liquidated Damages**: 1% of contract value per week, capped at 10%\n• **Milestones**:\n${ms.map((x) => `• Day ${x.targetDays}: ${x.description} (${x.financialProgressPct}% financial progress)`).join('\n')}`;
  }
  if (/risk|clause|gcc|flag/.test(q)) {
    const r = dossier.preBidAnalysis.riskAndRedFlags;
    return r.map((x) => `• **${x.title}** (${x.clauseReference}, ${x.severity}): ${x.riskSummary} Mitigation: ${x.mitigationAction}`).join('\n');
  }
  return `• **Bid Match Score**: ${fit.matchScore}% (${fit.verdict})\n• **Scope**: ${ov.title}\n• **Outlay**: ${lakh(ov.estimatedValue)} over ${ov.completionPeriodDays} days\n• Ask me about EMD rules, turnover compliance, BOQ material quantities, or delay penalties.`;
}

/* ------------------------------------------------------------------ */
/* Bid score                                                           */
/* ------------------------------------------------------------------ */

export function evaluateBid(tender, inputs) {
  const value = tender.estimatedValue || 5000000;
  const capacity = Math.max(0, inputs.maxAnnualTurnover * 2 * 1.5 - inputs.ongoingCommitments);
  const surplus = capacity - value;
  const bidCapacityScore = surplus > value ? 30 : surplus > 0 ? 22 : 8;
  const technicalExperienceScore = inputs.largestSimilarWork >= value * 0.8 ? 25 : inputs.largestSimilarWork >= value * 0.5 ? 16 : 6;
  const quote = Number(inputs.proposedQuotePercentage) || 0;
  const pricingCompetitivenessScore = quote <= -10 ? 12 : quote <= -4 ? 23 : quote <= 0 ? 17 : 8;
  const statutoryComplianceScore = [inputs.hasValidGstClearance, inputs.hasRegistrationCardRenewal, inputs.hasActiveCdrFdrFacility, inputs.hasMachineryEquipment].filter(Boolean).length * 5;
  const totalScore = bidCapacityScore + technicalExperienceScore + pricingCompetitivenessScore + statutoryComplianceScore;
  const allocationProbability = surplus < 0 ? 'Disqualified / Critical Risk' : totalScore >= 75 ? 'High' : totalScore >= 50 ? 'Moderate' : 'Low';
  return {
    totalScore, probabilityPercentage: totalScore, allocationProbability,
    assessedBidCapacity: capacity, bidCapacitySurplus: surplus, isBidCapacityEligible: surplus >= 0, isCover1Eligible: inputs.hasValidGstClearance && inputs.hasRegistrationCardRenewal,
    categoryScores: { bidCapacityScore, technicalExperienceScore, pricingCompetitivenessScore, statutoryComplianceScore },
    riskFlags: [
      ...(inputs.hasMachineryEquipment ? [] : ['Machinery & Plant: Tender requires owned/leased equipment (tippers, vibratory rollers, hot-mix plant).']),
      ...(quote <= -10 ? ['Aggressive quote: below -10% invites additional performance security under the state circular.'] : []),
    ],
    actionableInsights: [
      surplus > 0 ? `Strong Financial Headroom: assessed bid capacity exceeds tender value by ${Math.round((surplus / value) * 100)}%.` : 'Bid capacity shortfall: reduce ongoing commitments or bid in JV.',
      `Quote corridor: ${quote}% proposed; recent L1 awards in this circle cleared between -4% and -8%.`,
    ],
    jkSpecificGuidelines: [`Ensure the CDR / FDR is pledged specifically to "${tender.invitingAuthorityName || tender.departmentName}".`],
  };
}
