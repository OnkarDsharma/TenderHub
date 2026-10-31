/**
 * @file frontend/src/mocks/fixtures/tenders.js
 * @description Fixture tenders (state portals + GeM) for the dev mock API.
 * Built from short specs so the list stays readable; every record carries the
 * full field set that Tenders, TenderDetails, GeMTenders and Home render.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const hourLabel = (d) => {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
};
const portalStr = (d) => `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${hourLabel(d)}`;
const gemStr = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${hourLabel(d)}`;

const at = (daysFromNow, hour = 11, minute = 0) => {
  const d = new Date(NOW + daysFromNow * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const PORTAL_BY_STATE = {
  'Jammu & Kashmir': { portal: 'JK_TENDERS', host: 'https://jktenders.gov.in/nicgep/app' },
  'Himachal Pradesh': { portal: 'HP_TENDERS', host: 'https://hptenders.gov.in/nicgep/app' },
  Punjab: { portal: 'PB_TENDERS', host: 'https://eproc.punjab.gov.in/nicgep/app' },
  Ladakh: { portal: 'LADAKH_TENDERS', host: 'https://ladakhtenders.gov.in/nicgep/app' },
};

let seq = 0;
const oid = () => {
  seq += 1;
  return `66a1f0c2a9b3e41d2c7f${String(seq).padStart(4, '0')}`;
};

/* ------------------------------------------------------------------ */
/* State portal tenders                                                */
/* ------------------------------------------------------------------ */

function buildTender(spec) {
  const {
    dept, deptName, chain, state, title, location, pincode, value, emd, fee = 1000,
    category = 'Civil Works', publishedDaysAgo, closingInDays, tendererClass = 'Class A',
    workDays = 365, authority, address, multi = false, status = 'ACTIVE', seqNo,
  } = spec;

  const published = at(-publishedDaysAgo, 18, 30);
  const closing = at(closingInDays, 16, 0);
  const opening = at(closingInDays + 1, 11, 0);
  const docStart = published;
  const clarStart = at(-publishedDaysAgo + 1, 10, 0);
  const clarEnd = at(closingInDays - 5, 17, 0);
  const sourceTenderId = `2026_${dept}_${seqNo}_1`;
  const _id = oid();
  const refNo = `${authority.split(' ').map((w) => w[0]).join('').toUpperCase()}/NIT-${String(seqNo).slice(-2)} of 2026-27`;

  return {
    _id,
    sourceTenderId,
    baseTenderId: `2026_${dept}_${seqNo}`,
    tenderReferenceNumber: refNo,
    title: `[${title}]`,
    workDescription: `${title}. Work to be executed as per approved DPR and PWD specifications.`,
    departmentCode: dept,
    departmentName: deptName,
    organisationChain: chain,
    department: deptName,
    state,
    sourcePortal: PORTAL_BY_STATE[state].portal,
    location,
    pincode,
    tenderCategory: 'Works',
    productCategory: category,
    subCategory: 'Civil Works - Roads and Buildings',
    contractType: 'Tender',
    tenderType: 'Open Tender',
    formOfContract: 'Item Rate',
    noOfCovers: 2,
    withdrawalAllowed: 'Yes',
    generalTechnicalEvaluationAllowed: 'Yes',
    itemWiseTechnicalEvaluationAllowed: 'No',
    isMultiCurrencyAllowedForBOQ: 'No',
    isMultiCurrencyAllowedForFee: 'No',
    allowTwoStageBidding: 'No',
    paymentMode: 'Online',
    estimatedValue: value,
    emdAmount: emd,
    emdFeeType: 'Fixed',
    emdExemptionAllowed: 'No',
    emdPayableTo: `${authority}`,
    emdPayableAt: location.split(',')[0],
    tenderFee: fee,
    feePayableTo: `${authority}`,
    feePayableAt: location.split(',')[0],
    tenderFeeExemptionAllowed: 'No',
    tendererClass,
    bidValidityDays: 120,
    periodOfWorkDays: workDays,
    ndaPreQualification: 'NA',
    independentExternalMonitorRemarks: 'NA',
    shouldAllowNDATender: 'No',
    allowPreferentialBidder: 'No',
    preBidMeetingDate: at(-publishedDaysAgo + 5, 11, 0).toISOString(),
    preBidMeetingPlace: `Office of the ${authority}`,
    preBidMeetingAddress: address,
    bidOpeningPlace: `Office of the ${authority}`,
    invitingAuthorityName: authority,
    invitingAuthorityAddress: address,
    status,
    isMultiTender: multi,
    relatedTenderIds: [],
    isDocumentAvailable: true,
    publishedDate: published.toISOString(),
    publishedDateStr: portalStr(published),
    publishedTime: hourLabel(published),
    documentDownloadStartDate: docStart.toISOString(),
    documentDownloadStartDateStr: portalStr(docStart),
    documentDownloadEndDate: closing.toISOString(),
    documentDownloadEndDateStr: portalStr(closing),
    clarificationStartDate: clarStart.toISOString(),
    clarificationStartDateStr: portalStr(clarStart),
    clarificationEndDate: clarEnd.toISOString(),
    clarificationEndDateStr: portalStr(clarEnd),
    bidSubmissionStartDate: docStart.toISOString(),
    bidSubmissionStartDateStr: portalStr(docStart),
    bidSubmissionEndDate: closing.toISOString(),
    bidSubmissionEndDateStr: portalStr(closing),
    bidSubmissionEndTime: hourLabel(closing),
    closingDate: closing.toISOString(),
    closingDateStr: portalStr(closing),
    closingTime: hourLabel(closing),
    bidOpeningDate: opening.toISOString(),
    bidOpeningDateStr: portalStr(opening),
    bidOpeningTime: hourLabel(opening),
    pdfUrls: [`https://mock.tndrr.local/${dept}/${sourceTenderId}/Tendernotice_1.pdf`],
    nitDocuments: [
      { sNo: 1, documentName: 'Tendernotice_1.pdf', description: 'Tender Notice (NIT)', documentSizeKb: 412, fileUrl: `https://mock.tndrr.local/${dept}/${sourceTenderId}/Tendernotice_1.pdf` },
      { sNo: 2, documentName: 'SpecialConditions.pdf', description: 'Special Conditions of Contract', documentSizeKb: 188, fileUrl: `https://mock.tndrr.local/${dept}/${sourceTenderId}/SpecialConditions.pdf` },
    ],
    workItemDocuments: [
      { sNo: 1, documentType: 'BOQ', documentName: `BOQ_${seqNo}.xls`, description: 'Bill of Quantities', documentSizeKb: 96, fileUrl: `https://mock.tndrr.local/${dept}/${sourceTenderId}/BOQ_${seqNo}.xls` },
      { sNo: 2, documentType: 'TECHNICAL_DOCUMENT', documentName: 'Drawings.pdf', description: 'Approved drawings', documentSizeKb: 2340, fileUrl: `https://mock.tndrr.local/${dept}/${sourceTenderId}/Drawings.pdf` },
    ],
    boqZipUrl: '',
    zipFileName: `Tender_Packet_${sourceTenderId}.zip`,
    zipFileSizeKb: 2810,
    offlineInstruments: [
      { sNo: 1, instrumentType: 'Demand Draft' },
      { sNo: 2, instrumentType: 'CDR' },
      { sNo: 3, instrumentType: 'FDR' },
    ],
    coversInfo: [
      { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: 'Scanned copies of EMD, registration, GST, PAN and experience certificates', documentType: '.pdf' },
      { coverNo: 2, coverType: 'Finance', description: 'Price bid in the prescribed BOQ format', documentType: '.xls' },
    ],
    otherImportantDocuments: [
      { sNo: 1, category: 'Technical', subCategory: 'Registration Certificate', description: `Valid contractor registration (${tendererClass}) with ${state} PWD or equivalent`, format: '.pdf' },
      { sNo: 2, category: 'Technical', subCategory: 'Experience Certificate', description: 'Completion certificates for similar works in the last 7 years', format: '.pdf' },
      { sNo: 3, category: 'Financial', subCategory: 'Turnover Certificate', description: 'CA-certified average annual turnover for the last 3 financial years', format: '.pdf' },
      { sNo: 4, category: 'Financial', subCategory: 'Solvency Certificate', description: 'Bank solvency certificate not older than 6 months', format: '.pdf' },
    ],
    detailsUrl: `${PORTAL_BY_STATE[state].host}?page=FrontEndViewTender&service=direct&tenderId=${seqNo}`,
  };
}

const JK_PWD = {
  dept: 'PWD', deptName: 'Public Works (R&B) Department', state: 'Jammu & Kashmir',
  chain: 'Public Works (R&B) Department||Chief Engineer PWD Jammu||SE RandB Poonch||Executive Engineer PWD Division Poonch',
  authority: 'Executive Engineer PWD Division Poonch', address: 'PWD (R&B) Division Office, Poonch, J&K 185101',
};
const JK_JSD = {
  dept: 'JSD', deptName: 'Jal Shakti Department', state: 'Jammu & Kashmir',
  chain: 'Jal Shakti Department||Chief Engineer Jal Shakti Kashmir||SE Hydraulic Circle Anantnag||Executive Engineer Jal Shakti Division Anantnag',
  authority: 'Executive Engineer Jal Shakti Division Anantnag', address: 'Jal Shakti Division, K.P. Road, Anantnag 192101',
};
const JK_HUDD = {
  dept: 'HUDD', deptName: 'Housing and Urban Development Department', state: 'Jammu & Kashmir',
  chain: 'Housing and Urban Development Department||Srinagar Municipal Corporation||Executive Engineer SMC Works',
  authority: 'Executive Engineer SMC Works', address: 'Srinagar Municipal Corporation, Karan Nagar, Srinagar 190010',
};
const PB_PWD = {
  dept: 'PWD', deptName: 'Public Works Department (B&R)', state: 'Punjab',
  chain: 'Public Works Department (B&R)||Chief Engineer (South) Patiala||SE Construction Circle Ludhiana||Executive Engineer Provincial Division Ludhiana',
  authority: 'Executive Engineer Provincial Division Ludhiana', address: 'PWD B&R Provincial Division, Ferozepur Road, Ludhiana 141001',
};
const PB_WRD = {
  dept: 'WRD', deptName: 'Water Resources Department', state: 'Punjab',
  chain: 'Water Resources Department||Chief Engineer Canals||SE Sirhind Canal Circle||Executive Engineer Sirhind Canal Division',
  authority: 'Executive Engineer Sirhind Canal Division', address: 'Sirhind Canal Division, Doraha, Ludhiana 141421',
};
const HP_PWD = {
  dept: 'HPPWD', deptName: 'Himachal Pradesh Public Works Department', state: 'Himachal Pradesh',
  chain: 'Himachal Pradesh Public Works Department||Chief Engineer Mandi Zone||SE 6th Circle Kullu||Executive Engineer HPPWD Division Manali',
  authority: 'Executive Engineer HPPWD Division Manali', address: 'HPPWD Division Manali, Kullu 175131',
};
const HP_JSV = {
  dept: 'JSV', deptName: 'Jal Shakti Vibhag', state: 'Himachal Pradesh',
  chain: 'Jal Shakti Vibhag||Chief Engineer Shimla Zone||SE Jal Shakti Circle Solan||Executive Engineer Jal Shakti Division Nalagarh',
  authority: 'Executive Engineer Jal Shakti Division Nalagarh', address: 'Jal Shakti Division, Nalagarh, Solan 174101',
};
const LA_PWD = {
  dept: 'PWD', deptName: 'Public Works Department Ladakh', state: 'Ladakh',
  chain: 'Public Works Department Ladakh||Chief Engineer PWD Leh||Executive Engineer R&B Division Leh',
  authority: 'Executive Engineer R&B Division Leh', address: 'R&B Division Office, Leh 194101',
};

const SPECS = [
  { ...JK_PWD, seqNo: 321045, title: 'Construction of 2.5 km link road from Mendhar to Balnoi including CC pavement and drains', location: 'Mendhar, Poonch', pincode: '185211', value: 18450000, emd: 369000, publishedDaysAgo: 3, closingInDays: 12, workDays: 365 },
  { ...JK_PWD, seqNo: 321102, title: 'Upgradation of Surankote-Bufliaz road km 0 to 6 by providing WBM and BM/SDBC', location: 'Surankote, Poonch', pincode: '185121', value: 64200000, emd: 1284000, publishedDaysAgo: 6, closingInDays: 2, tendererClass: 'Class A', workDays: 540 },
  { ...JK_JSD, seqNo: 322410, title: 'Laying and fitting of 150 mm DI K-9 pipe for augmentation of WSS Bijbehara under JJM', location: 'Bijbehara, Anantnag', pincode: '192124', value: 9860000, emd: 197200, publishedDaysAgo: 1, closingInDays: 15, category: 'Water Supply', tendererClass: 'Class B', workDays: 240 },
  { ...JK_JSD, seqNo: 322455, title: 'Construction of 2.0 lac gallon RCC overhead tank at Kokernag including staging', location: 'Kokernag, Anantnag', pincode: '192202', value: 27300000, emd: 546000, publishedDaysAgo: 9, closingInDays: 6, category: 'Water Supply', workDays: 365 },
  { ...JK_HUDD, seqNo: 323018, title: 'Construction of multi-level parking at Batamaloo including allied electrical works', location: 'Batamaloo, Srinagar', pincode: '190009', value: 412000000, emd: 8240000, fee: 5000, publishedDaysAgo: 12, closingInDays: 20, category: 'Buildings', tendererClass: 'Class Special', workDays: 730, multi: true },
  { ...JK_HUDD, seqNo: 323077, title: 'Macadamisation of internal lanes in Ward 14 Nowgam under AMRUT 2.0', location: 'Nowgam, Srinagar', pincode: '190015', value: 4350000, emd: 87000, publishedDaysAgo: 2, closingInDays: 9, tendererClass: 'Class C', workDays: 120 },
  { ...PB_PWD, seqNo: 410233, title: 'Widening and strengthening of Ludhiana-Malerkotla road km 12 to 24 (4-laning)', location: 'Ludhiana', pincode: '141001', value: 286500000, emd: 5730000, fee: 5000, publishedDaysAgo: 8, closingInDays: 18, tendererClass: 'Class A', workDays: 540 },
  { ...PB_PWD, seqNo: 410298, title: 'Construction of Government Senior Secondary School building at Jagraon (G+2)', location: 'Jagraon, Ludhiana', pincode: '142026', value: 52800000, emd: 1056000, publishedDaysAgo: 4, closingInDays: 11, category: 'Buildings', workDays: 450 },
  { ...PB_WRD, seqNo: 411560, title: 'Relining of Sirhind Feeder RD 120000 to 135000 with PCC lining', location: 'Doraha, Ludhiana', pincode: '141421', value: 138000000, emd: 2760000, publishedDaysAgo: 15, closingInDays: 4, category: 'Irrigation', workDays: 300 },
  { ...PB_WRD, seqNo: 411602, title: 'Supply and installation of solar pumps for canal lift schemes in Fazilka', location: 'Fazilka', pincode: '152123', value: 7200000, emd: 144000, publishedDaysAgo: 2, closingInDays: 14, category: 'Electrical', tendererClass: 'Class B', workDays: 150 },
  { ...HP_PWD, seqNo: 510877, title: 'Construction of RCC bridge 40 m span over Beas tributary at Patlikuhal on Manali road', location: 'Patlikuhal, Kullu', pincode: '175129', value: 91500000, emd: 1830000, fee: 2000, publishedDaysAgo: 5, closingInDays: 16, category: 'Bridges', workDays: 540 },
  { ...HP_PWD, seqNo: 510902, title: 'Periodic renewal of Kullu-Naggar-Manali left bank road km 5 to 19 with BC', location: 'Naggar, Kullu', pincode: '175130', value: 34600000, emd: 692000, publishedDaysAgo: 10, closingInDays: 1, workDays: 180 },
  { ...HP_JSV, seqNo: 512344, title: 'Providing sewerage scheme to Nalagarh town Phase II including STP of 4 MLD', location: 'Nalagarh, Solan', pincode: '174101', value: 176000000, emd: 3520000, fee: 5000, publishedDaysAgo: 7, closingInDays: 22, category: 'Sewerage', workDays: 720 },
  { ...LA_PWD, seqNo: 610120, title: 'Construction of pre-fabricated insulated school building at Nyoma', location: 'Nyoma, Leh', pincode: '194404', value: 23400000, emd: 468000, publishedDaysAgo: 3, closingInDays: 13, category: 'Buildings', workDays: 300 },
  // Archived / expired examples
  { ...JK_PWD, seqNo: 318811, title: 'Improvement of Mandi-Loran road by way of CC pavement in slide-prone stretches', location: 'Mandi, Poonch', pincode: '185101', value: 12900000, emd: 258000, publishedDaysAgo: 48, closingInDays: -20, status: 'EXPIRED' },
  { ...PB_PWD, seqNo: 407750, title: 'Construction of boundary wall and approach road for new bus stand Khanna', location: 'Khanna, Ludhiana', pincode: '141401', value: 8100000, emd: 162000, publishedDaysAgo: 60, closingInDays: -31, status: 'ARCHIVED' },
];

export const STATE_TENDERS = SPECS.map(buildTender);

// Mark the multi-work NIT's siblings
const multi = STATE_TENDERS.find((t) => t.isMultiTender);
if (multi) {
  multi.relatedTenderIds = [`${multi.baseTenderId}_2`, `${multi.baseTenderId}_3`];
}

/* ------------------------------------------------------------------ */
/* GeM bids                                                            */
/* ------------------------------------------------------------------ */

function buildGem(spec) {
  const { bidNo, state, title, category, qty, consignee, stations, chain, deptName, emd, publishedDaysAgo, closingInDays, validity = 90, location } = spec;
  const published = at(-publishedDaysAgo, 10, 0);
  const closing = at(closingInDays, 15, 0);
  const opening = at(closingInDays, 15, 30);
  const num = bidNo.split('/').pop();
  return {
    _id: oid(),
    sourcePortal: 'GEM',
    departmentCode: 'GEM',
    sourceTenderId: bidNo,
    tenderReferenceNumber: bidNo,
    state,
    title,
    workDescription: `[GeM Procurement] Category: ${category}\nTotal Quantity: ${qty}\nConsignee: ${consignee}\nDelivery Stations: ${stations}`,
    departmentName: deptName,
    organisationChain: chain,
    tenderCategory: 'Goods',
    tenderType: 'GeM Bid / Reverse Auction',
    formOfContract: `${validity} Days Validity`,
    productCategory: category,
    estimatedValue: 0,
    emdAmount: emd,
    tenderFee: 0,
    feePayableTo: 'Not applicable',
    feePayableAt: state,
    emdPayableTo: 'Buyer (as per GeM GTC)',
    emdPayableAt: state,
    location,
    publishedDate: published.toISOString(),
    publishedDateStr: gemStr(published),
    closingDate: closing.toISOString(),
    closingDateStr: gemStr(closing),
    bidOpeningDate: opening.toISOString(),
    bidOpeningDateStr: gemStr(opening),
    documentDownloadStartDate: published.toISOString(),
    documentDownloadStartDateStr: gemStr(published),
    documentDownloadEndDate: closing.toISOString(),
    documentDownloadEndDateStr: gemStr(closing),
    bidValidityDays: validity,
    status: closingInDays >= 0 ? 'ACTIVE' : 'EXPIRED',
    isMultiTender: false,
    relatedTenderIds: [],
    isDocumentAvailable: true,
    detailsUrl: `https://bidplus.gem.gov.in/showbidDocument/${num}`,
    pdfUrls: [`https://bidplus.gem.gov.in/showbidDocument/${num}`],
    nitDocuments: [],
    workItemDocuments: [],
    offlineInstruments: [],
    coversInfo: [],
    otherImportantDocuments: [],
  };
}

export const GEM_BIDS = [
  { bidNo: 'GEM/2026/B/7944446', state: 'Jammu & Kashmir', title: 'Bitumen VG-30 (Q3)', category: 'Bitumen VG-30', qty: 250, consignee: 'Executive Engineer, PWD (R&B) Division Anantnag', stations: 'Anantnag, Srinagar', chain: 'Government of Jammu and Kashmir > Public Works (R&B) Department > PWD Division Anantnag', deptName: 'Public Works (R&B) Department', emd: 185000, publishedDaysAgo: 6, closingInDays: 15, location: 'Anantnag, Srinagar' },
  { bidNo: 'GEM/2026/B/7951120', state: 'Jammu & Kashmir', title: 'Ordinary Portland Cement Grade 53 (Q3)', category: 'Portland Cement OPC 53', qty: 4000, consignee: 'Executive Engineer, Jal Shakti Division Budgam', stations: 'Budgam', chain: 'Government of Jammu and Kashmir > Jal Shakti Department > Jal Shakti Division Budgam', deptName: 'Jal Shakti Department', emd: 96000, publishedDaysAgo: 2, closingInDays: 1, location: 'Budgam' },
  { bidNo: 'GEM/2026/B/7938870', state: 'Punjab', title: 'TMT Bars Fe 500D 12 mm to 25 mm', category: 'TMT Steel Bars Fe 500D', qty: 180, consignee: 'Executive Engineer, PWD B&R Provincial Division Ludhiana', stations: 'Ludhiana, Jagraon', chain: 'Government of Punjab > Public Works Department (B&R) > Provincial Division Ludhiana', deptName: 'Public Works Department (B&R)', emd: 420000, publishedDaysAgo: 9, closingInDays: 7, location: 'Ludhiana' },
  { bidNo: 'GEM/2026/B/7960034', state: 'Himachal Pradesh', title: 'Hiring of JCB Backhoe Loader with Operator (per hour)', category: 'Hiring of Earth Moving Equipment', qty: 1200, consignee: 'Executive Engineer, HPPWD Division Manali', stations: 'Manali, Kullu', chain: 'Government of Himachal Pradesh > HPPWD > Division Manali', deptName: 'Himachal Pradesh Public Works Department', emd: 0, publishedDaysAgo: 1, closingInDays: 10, location: 'Manali, Kullu' },
  { bidNo: 'GEM/2026/B/7929512', state: 'Punjab', title: 'DI Pipes K-9 200 mm with Tyton Joints', category: 'Ductile Iron Pipes K9', qty: 3200, consignee: 'Executive Engineer, Water Supply and Sanitation Division Patiala', stations: 'Patiala, Rajpura', chain: 'Government of Punjab > Water Supply and Sanitation Department > Division Patiala', deptName: 'Water Supply and Sanitation Department', emd: 640000, publishedDaysAgo: 12, closingInDays: 3, location: 'Patiala' },
  { bidNo: 'GEM/2026/B/7971288', state: 'Ladakh', title: 'Pre-fabricated Insulated Panels (PUF) 100 mm', category: 'PUF Insulated Panels', qty: 900, consignee: 'Executive Engineer, R&B Division Leh', stations: 'Leh', chain: 'UT of Ladakh > Public Works Department > R&B Division Leh', deptName: 'Public Works Department Ladakh', emd: 150000, publishedDaysAgo: 4, closingInDays: 19, location: 'Leh' },
  { bidNo: 'GEM/2026/B/7902210', state: 'Jammu & Kashmir', title: 'Street Light LED Luminaire 90 W', category: 'LED Street Light', qty: 650, consignee: 'Executive Engineer, Jammu Municipal Corporation', stations: 'Jammu', chain: 'Government of Jammu and Kashmir > Housing and Urban Development Department > Jammu Municipal Corporation', deptName: 'Housing and Urban Development Department', emd: 72000, publishedDaysAgo: 30, closingInDays: -4, location: 'Jammu' },
].map(buildGem);

export const ALL_TENDERS = [...STATE_TENDERS, ...GEM_BIDS];

/* ------------------------------------------------------------------ */
/* Lookups + derived views                                             */
/* ------------------------------------------------------------------ */

export function findTender(idOrRef) {
  if (!idOrRef) return null;
  const key = decodeURIComponent(String(idOrRef)).trim().toLowerCase();
  return ALL_TENDERS.find((t) =>
    t._id.toLowerCase() === key ||
    (t.sourceTenderId || '').toLowerCase() === key ||
    (t.tenderReferenceNumber || '').toLowerCase() === key ||
    (t.baseTenderId || '').toLowerCase() === key,
  ) || null;
}

const LIST_FIELDS = [
  '_id', 'title', 'sourceTenderId', 'departmentCode', 'departmentName', 'organisationChain', 'closingDate', 'closingDateStr', 'closingTime',
  'publishedDate', 'publishedDateStr', 'publishedTime', 'bidOpeningDate', 'bidOpeningDateStr', 'bidOpeningTime', 'bidSubmissionEndDate',
  'bidSubmissionEndDateStr', 'bidSubmissionEndTime', 'estimatedValue', 'location', 'pincode', 'tenderCategory', 'productCategory', 'contractType',
  'status', 'isMultiTender', 'relatedTenderIds', 'isDocumentAvailable', 'tenderReferenceNumber', 'state', 'emdAmount', 'emdExemptionAllowed',
  'sourcePortal', 'tenderFee', 'tenderFeeExemptionAllowed', 'tenderType', 'pdfUrls', 'nitDocuments', 'detailsUrl', 'tendererClass',
];
export const toSummary = (t) => Object.fromEntries(LIST_FIELDS.filter((k) => k in t).map((k) => [k, t[k]]));

const daysUntil = (iso) => (new Date(iso).getTime() - NOW) / DAY;

export function statusBucket(t) {
  if (t.status === 'CANCELLED') return 'cancelled';
  if (t.status === 'ARCHIVED') return 'archived';
  if (t.status === 'EXPIRED' || daysUntil(t.closingDate) < 0) return 'expired';
  return 'active';
}

const AMOUNT_RANGES = {
  under_5l: [0, 500000], '5l_25l': [500000, 2500000], '25l_1cr': [2500000, 10000000], '1cr_5cr': [10000000, 50000000], above_5cr: [50000000, Infinity],
};

/** Shared filter + sort used by /tenders and /gem/tenders. */
export function filterTenders(source, q = {}) {
  let rows = source.slice();
  const status = (q.status || 'active').toLowerCase();
  if (status !== 'all') rows = rows.filter((t) => statusBucket(t) === status);

  const search = (q.search || q.keywords || '').trim().toLowerCase();
  if (search) {
    rows = rows.filter((t) => [t.title, t.sourceTenderId, t.tenderReferenceNumber, t.departmentName, t.organisationChain, t.location, t.productCategory]
      .some((v) => String(v || '').toLowerCase().includes(search)));
  }
  if (q.state) rows = rows.filter((t) => t.state.toLowerCase() === String(q.state).toLowerCase());
  const org = q.organisation || q.organization || q.department;
  if (org) rows = rows.filter((t) => (t.departmentName || '').toLowerCase() === String(org).toLowerCase());
  if (q.category) rows = rows.filter((t) => [t.productCategory, t.tenderCategory].some((v) => String(v || '').toLowerCase().includes(String(q.category).toLowerCase())));
  if (q.location) rows = rows.filter((t) => (t.location || '').toLowerCase().includes(String(q.location).toLowerCase()));
  if (q.tendererClass) rows = rows.filter((t) => (t.tendererClass || '').toLowerCase() === String(q.tendererClass).toLowerCase());
  if (q.tenderAmountRange && AMOUNT_RANGES[q.tenderAmountRange]) {
    const [lo, hi] = AMOUNT_RANGES[q.tenderAmountRange];
    rows = rows.filter((t) => t.estimatedValue >= lo && t.estimatedValue < hi);
  }
  if (q.minAmount) rows = rows.filter((t) => t.estimatedValue >= Number(q.minAmount));
  if (q.maxAmount) rows = rows.filter((t) => t.estimatedValue <= Number(q.maxAmount));
  if (q.closingDays) rows = rows.filter((t) => daysUntil(t.closingDate) <= Number(q.closingDays));
  if (q.hasPreBid === 'true') rows = rows.filter((t) => Boolean(t.preBidMeetingDate));
  if (q.feePreference === 'freeFee' || q.feePreference === 'bothFree') rows = rows.filter((t) => !t.tenderFee);
  if (q.feePreference === 'freeEmd' || q.feePreference === 'bothFree') rows = rows.filter((t) => !t.emdAmount);
  if (q.publishedRange === 'today') rows = rows.filter((t) => -daysUntil(t.publishedDate) <= 1);
  if (q.publishedRange === '7days') rows = rows.filter((t) => -daysUntil(t.publishedDate) <= 7);
  if (q.publishedRange === '1month') rows = rows.filter((t) => -daysUntil(t.publishedDate) <= 31);

  const sortBy = q.sortBy || 'arrival';
  const by = {
    arrival: (a, b) => new Date(b.publishedDate) - new Date(a.publishedDate),
    publishedAsc: (a, b) => new Date(a.publishedDate) - new Date(b.publishedDate),
    closingAsc: (a, b) => new Date(a.closingDate) - new Date(b.closingDate),
    closingDesc: (a, b) => new Date(b.closingDate) - new Date(a.closingDate),
    valueDesc: (a, b) => b.estimatedValue - a.estimatedValue,
    valueAsc: (a, b) => a.estimatedValue - b.estimatedValue,
    emdDesc: (a, b) => b.emdAmount - a.emdAmount,
  }[sortBy] || ((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
  rows.sort(by);
  return rows;
}

export function paginate(rows, q, defaultLimit = 12) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(q.limit) || defaultLimit));
  const start = (page - 1) * limit;
  return { page, limit, slice: rows.slice(start, start + limit), total: rows.length };
}

export function tenderCounts(source) {
  const counts = { activeCount: 0, archivedCount: 0, expiredCount: 0, closingSoonCount: 0 };
  for (const t of source) {
    const b = statusBucket(t);
    if (b === 'active') {
      counts.activeCount += 1;
      if (daysUntil(t.closingDate) <= 3) counts.closingSoonCount += 1;
    } else if (b === 'archived') counts.archivedCount += 1;
    else if (b === 'expired') counts.expiredCount += 1;
  }
  return counts;
}

export function tenderStats(q = {}) {
  let rows = STATE_TENDERS.filter((t) => statusBucket(t) === 'active');
  if (q.state) rows = rows.filter((t) => t.state.toLowerCase() === String(q.state).toLowerCase());
  const group = (keyFn) => {
    const map = new Map();
    for (const t of rows) {
      const k = keyFn(t);
      const cur = map.get(k) || { count: 0, totalValue: 0 };
      cur.count += 1; cur.totalValue += t.estimatedValue || 0;
      map.set(k, cur);
    }
    return map;
  };
  const domain = [...group((t) => t.productCategory)].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 8);
  const category = [...group((t) => t.tenderCategory)].map(([name, v]) => ({ name, ...v }));
  const dept = [...group((t) => t.organisationChain)].map(([fullName, v]) => {
    const parts = fullName.split('||');
    return { fullName, shortName: parts[parts.length - 1], rootOrg: parts[0], ...v };
  }).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10);
  const latest = rows.slice().sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate)).slice(0, 6)
    .map((t) => ({ _id: t._id, title: t.title, sourceTenderId: t.sourceTenderId, state: t.state, tenderCategory: t.tenderCategory, productCategory: t.productCategory, estimatedValue: t.estimatedValue, organisationChain: t.organisationChain, closingDate: t.closingDate, publishedDate: t.publishedDate, publishedDateStr: t.publishedDateStr, location: t.location }));
  return {
    state: q.state || 'All Northern States',
    activeTendersCount: rows.length,
    authoritiesCount: new Set(rows.map((t) => t.organisationChain)).size,
    totalValue: rows.reduce((s, t) => s + (t.estimatedValue || 0), 0),
    domainBreakdown: domain,
    categoryBreakdown: category,
    departmentBreakdown: dept,
    latestTenders: latest,
  };
}

export function organisations(q = {}) {
  let rows = STATE_TENDERS;
  if (q.state) rows = rows.filter((t) => t.state.toLowerCase() === String(q.state).toLowerCase());
  return [...new Set(rows.map((t) => t.departmentName))].sort();
}

export function gemStats(q = {}) {
  let rows = GEM_BIDS.filter((t) => statusBucket(t) === 'active');
  if (q.state) rows = rows.filter((t) => t.state.toLowerCase() === String(q.state).toLowerCase());
  return {
    totalActive: rows.length,
    closingSoon: rows.filter((t) => daysUntil(t.closingDate) <= 2).length,
    highEmdCount: rows.filter((t) => t.emdAmount >= 400000).length,
    verifiedState: q.state || 'Northern Region (J&K, HP, Punjab)',
    portal: 'Government e-Marketplace (GeM)',
  };
}

export function relatedTendersFor(t) {
  if (!t.isMultiTender) return [];
  return [2, 3].map((n) => ({
    _id: `${t._id.slice(0, 22)}${n}0`,
    sourceTenderId: `${t.baseTenderId}_${n}`,
    title: n === 2 ? '[Electrical and fire-fighting works for multi-level parking at Batamaloo]' : '[Landscaping and external development for multi-level parking at Batamaloo]',
    estimatedValue: n === 2 ? 38600000 : 9400000,
    publishedDate: t.publishedDate,
    publishedDateStr: t.publishedDateStr,
    closingDate: t.closingDate,
    status: t.status,
  }));
}
