/**
 * @file backend/src/scripts/fetchGeMBids.js
 * @description CLI for the GeM consignee-state sync (J&K, Ladakh, HP, Punjab).
 *
 * Usage:
 *   node src/scripts/fetchGeMBids.js                       # all 4 states, up to 250 PDFs
 *   node src/scripts/fetchGeMBids.js --state=PUNJAB --pdf-limit 50
 *   node src/scripts/fetchGeMBids.js --dry-run             # listing only, writes nothing, prints counts
 *   node src/scripts/fetchGeMBids.js --pdf-limit 0         # listing pass only (also the backfill for old records)
 */

import { connectDB } from '../config/db.js';
import { gemAdapter, safeDate } from '../services/adapters/GeMAdapter.js';
import Tender from '../models/Tender.js';
import pino from 'pino';

const logger = pino();

// Parse command line arguments (supports both --flag=value and --flag value)
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const eqArg = args.find(a => a.startsWith(`${flag}=`));
  if (eqArg) {
    return eqArg.split('=').slice(1).join('=').replace(/^['"]|['"]$/g, '');
  }
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1].replace(/^['"]|['"]$/g, '') : defaultValue;
};
const hasFlag = (flag) => args.some(a => a === flag || a.startsWith(`${flag}=`));

// --pdf-limit caps PDF downloads per run (legacy --limit is accepted as an alias).
// --max-requests caps GeM listing requests per state; a capped state is
// incomplete, so none of its bids are marked NOT_LISTED.
const pdfLimit = parseInt(getArg('--pdf-limit', getArg('--limit', '250')), 10);
const maxRequests = parseInt(getArg('--max-requests', '2500'), 10);
const delay = parseInt(getArg('--delay', '1200'), 10);
const isMock = hasFlag('--mock') || hasFlag('--seed');
const isDryRun = hasFlag('--dry-run');
const targetStateArg = getArg('--state', 'ALL');

/**
 * Synthetic local demo records. These are never a fallback for failed live scraping
 * and are explicitly marked unverified when the optional --mock/--seed mode is used.
 */
const VERIFIED_GEM_JK_BIDS = [
  {
    bidNumber: 'GEM/2026/B/7944446',
    items: 'PRE CAST UG BUNKER PUB EXTRA HT',
    quantity: 56,
    departmentName: 'Ministry of Defence / Department of Military Affairs',
    startDate: new Date('2026-08-24T18:57:00+05:30'),
    endDate: new Date('2026-11-06T10:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7944446',
    pdfData: {
      itemCategory: 'PRE CAST UG BUNKER PUB EXTRA HT',
      totalQuantity: 56,
      ministryName: 'Ministry Of Defence',
      departmentName: 'Department Of Military Affairs',
      organisationName: 'Indian Army',
      minTurnoverLakhs: 6100,
      pastExperienceYears: 3,
      emdAmount: 61264000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 5,
      epbgDurationMonths: 44,
      beneficiary: 'GOC-IN-C, NC, SBI Hari Market Jammu Public Fund Account',
      preBidDate: new Date('2026-09-08T11:00:00+05:30'),
      preBidVenue: '25 Inf Div Ordnance Unit, Rajouri',
      consigneeAddress: 'Rajouri, Jammu and Kashmir',
      deliveryLocations: ['Poonch', 'Rajouri', 'Mendhar', 'Akhnoor', 'Jaurian', 'Battal', 'Narian', 'Sunderbani', 'Rakhmuthi', 'Pallanwala', 'Budwal', 'Khanetar'],
      dated: '2026-08-24',
      bidEndDate: new Date('2026-11-06T10:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7955251',
    items: 'UNDER GROUND STORAGE AND REPAIR SHED',
    quantity: 15,
    departmentName: 'Ministry of Defence / Department of Military Affairs',
    startDate: new Date('2026-08-25T09:17:00+05:30'),
    endDate: new Date('2026-11-07T18:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7955251',
    pdfData: {
      itemCategory: 'UNDER GROUND STORAGE AND REPAIR SHED',
      totalQuantity: 15,
      ministryName: 'Ministry Of Defence',
      departmentName: 'Department Of Military Affairs',
      organisationName: 'Indian Army (HQ 16 Corps)',
      minTurnoverLakhs: 2800,
      pastExperienceYears: 3,
      emdAmount: 24500000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 3,
      epbgDurationMonths: 24,
      beneficiary: 'Commander, Corps Military Engineering Services, Nagrota',
      consigneeAddress: 'Nagrota, Jammu and Kashmir',
      deliveryLocations: ['Nagrota', 'Jammu', 'Udhampur', 'Samba'],
      dated: '2026-08-25',
      bidEndDate: new Date('2026-11-07T18:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7955155',
    items: 'PROCUREMENT AND INSTALLATION OF HIGH-ALTITUDE SOLAR POWER SYSTEMS',
    quantity: 8,
    departmentName: 'Ministry of Defence / Department of Military Affairs',
    startDate: new Date('2026-08-25T11:35:00+05:30'),
    endDate: new Date('2026-11-07T11:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7955155',
    pdfData: {
      itemCategory: 'SOLAR POWER SYSTEMS (HIGH ALTITUDE)',
      totalQuantity: 8,
      ministryName: 'Ministry Of Defence',
      departmentName: 'Department Of Military Affairs',
      organisationName: 'Border Roads Organisation (Project Beacon)',
      minTurnoverLakhs: 1500,
      pastExperienceYears: 2,
      emdAmount: 8500000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 5,
      epbgDurationMonths: 36,
      beneficiary: 'Chief Engineer, Project Beacon, Srinagar',
      consigneeAddress: 'Rangreth, Srinagar, Jammu and Kashmir',
      deliveryLocations: ['Srinagar', 'Baramulla', 'Kupwara', 'Bandipora'],
      dated: '2026-08-25',
      bidEndDate: new Date('2026-11-07T11:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7954826',
    items: 'HEAVY DUTY SNOW CLEARING VEHICLES AND ATTACHMENTS',
    quantity: 12,
    departmentName: 'Ministry of Road Transport and Highways',
    startDate: new Date('2026-08-25T09:02:00+05:30'),
    endDate: new Date('2026-11-08T15:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7954826',
    pdfData: {
      itemCategory: 'SPECIAL PURPOSE VEHICLES & SNOW PLOWS',
      totalQuantity: 12,
      ministryName: 'Ministry of Road Transport and Highways',
      departmentName: 'National Highways & Infrastructure Development Corporation',
      organisationName: 'NHIDCL J&K Regional Office',
      minTurnoverLakhs: 3200,
      pastExperienceYears: 3,
      emdAmount: 18000000,
      emdAdvisoryBank: 'Punjab National Bank',
      epbgPercentage: 5,
      epbgDurationMonths: 36,
      beneficiary: 'Executive Director, NHIDCL, Jammu',
      consigneeAddress: 'Batote, Ramban, Jammu and Kashmir',
      deliveryLocations: ['Ramban', 'Banihal', 'Doda', 'Kishtwar'],
      dated: '2026-08-25',
      bidEndDate: new Date('2026-11-08T15:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7960114',
    items: 'SURGICAL AND MEDICAL DIAGNOSTIC EQUIPMENT FOR DISTRICT HOSPITALS',
    quantity: 45,
    departmentName: 'Ministry of Health and Family Welfare',
    startDate: new Date('2026-08-26T14:20:00+05:30'),
    endDate: new Date('2026-11-12T17:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7960114',
    pdfData: {
      itemCategory: 'HOSPITAL MEDICAL EQUIPMENTS',
      totalQuantity: 45,
      ministryName: 'Ministry of Health and Family Welfare',
      departmentName: 'Department of Health & Medical Education (J&K)',
      organisationName: 'JK Medical Supplies Corporation (JKMSCL)',
      minTurnoverLakhs: 850,
      pastExperienceYears: 2,
      emdAmount: 4200000,
      emdAdvisoryBank: 'J&K Bank Ltd',
      epbgPercentage: 3,
      epbgDurationMonths: 24,
      beneficiary: 'Managing Director, JKMSCL, Jammu/Srinagar',
      consigneeAddress: 'Bagh-e-Ali Mardan Khan, Srinagar',
      deliveryLocations: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla'],
      dated: '2026-08-26',
      bidEndDate: new Date('2026-11-12T17:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7605433',
    items: 'TONER CARTRIDGES / INK CARTRIDGES FOR DEFENCE FORMATIONS',
    quantity: 70,
    departmentName: 'Ministry of Defence / Department of Military Affairs',
    startDate: new Date('2026-10-04T11:00:00+05:30'),
    endDate: new Date('2026-12-10T17:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7605433',
    pdfData: {
      itemCategory: 'OFFICE SUPPLIES & CONSUMABLES',
      totalQuantity: 70,
      ministryName: 'Ministry Of Defence',
      departmentName: 'Department Of Military Affairs',
      organisationName: 'Indian Army Field Unit',
      minTurnoverLakhs: 120,
      pastExperienceYears: 1,
      emdAmount: 450000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 3,
      epbgDurationMonths: 12,
      beneficiary: 'Commanding Officer, Military Station, Jammu',
      consigneeAddress: 'Satwari, Jammu, Jammu and Kashmir',
      deliveryLocations: ['Jammu', 'Akhnoor', 'Samba'],
      dated: '2026-10-04',
      bidEndDate: new Date('2026-12-10T17:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/6070048',
    items: 'REFINED SUNFLOWER OIL (V4) DEFENCE SUPPLIES',
    quantity: 7000,
    departmentName: 'Ministry of Defence / Department of Military Affairs',
    startDate: new Date('2026-10-10T17:00:00+05:30'),
    endDate: new Date('2026-12-12T17:04:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/6070048',
    pdfData: {
      itemCategory: 'RATION & FOOD GRAINS',
      totalQuantity: 7000,
      ministryName: 'Ministry Of Defence',
      departmentName: 'Department Of Military Affairs',
      organisationName: 'Army Supply Corps (ASC)',
      minTurnoverLakhs: 450,
      pastExperienceYears: 2,
      emdAmount: 1850000,
      emdAdvisoryBank: 'Punjab National Bank',
      epbgPercentage: 5,
      epbgDurationMonths: 18,
      beneficiary: 'Officer Commanding, Supply Depot ASC, Udhampur',
      consigneeAddress: 'Udhampur, Jammu and Kashmir',
      deliveryLocations: ['Udhampur', 'Jammu', 'Srinagar'],
      dated: '2026-10-10',
      bidEndDate: new Date('2026-12-12T17:04:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7555498',
    items: 'COAT COMBAT DISRUPTIVE DETACHABLE LINERS',
    quantity: 15124,
    departmentName: 'Ministry of Home Affairs / Central Armed Police Forces',
    startDate: new Date('2026-10-11T15:00:00+05:30'),
    endDate: new Date('2026-12-12T17:05:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7555498',
    pdfData: {
      itemCategory: 'TACTICAL UNIFORMS & TEXTILES',
      totalQuantity: 15124,
      ministryName: 'Ministry of Home Affairs',
      departmentName: 'Central Armed Police Forces (CAPF)',
      organisationName: 'CRPF / BSF J&K Sector',
      minTurnoverLakhs: 8500,
      pastExperienceYears: 3,
      emdAmount: 38000000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 5,
      epbgDurationMonths: 36,
      beneficiary: 'DIG, Group Centre CRPF, Bantalab, Jammu',
      consigneeAddress: 'Bantalab, Jammu, Jammu and Kashmir',
      deliveryLocations: ['Jammu', 'Srinagar', 'Baramulla', 'Anantnag', 'Pulwama'],
      dated: '2026-10-11',
      bidEndDate: new Date('2026-12-12T17:05:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7777976',
    items: 'HIGH ALTITUDE DEFENCE TACTICAL GEAR & ACCESSORIES',
    quantity: 350,
    departmentName: 'Ministry of Home Affairs / Central Reserve Police Force',
    startDate: new Date('2026-10-12T10:00:00+05:30'),
    endDate: new Date('2026-12-15T16:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7777976',
    pdfData: {
      itemCategory: 'DEFENCE GEAR & SPECIALIZED EQUIPMENT',
      totalQuantity: 350,
      ministryName: 'Ministry of Home Affairs',
      departmentName: 'Central Reserve Police Force',
      organisationName: 'CRPF J&K Operations Directorate',
      minTurnoverLakhs: 420,
      pastExperienceYears: 2,
      emdAmount: 1400000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 3,
      epbgDurationMonths: 18,
      beneficiary: 'Commandant, 79 Bn CRPF, Humhama, Budgam',
      consigneeAddress: 'Humhama, Budgam, Jammu and Kashmir',
      deliveryLocations: ['Budgam', 'Srinagar', 'Pulwama'],
      dated: '2026-10-12',
      bidEndDate: new Date('2026-12-15T16:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7812340',
    items: 'WATER TREATMENT CHLORINATION & PURIFICATION SYSTEMS',
    quantity: 24,
    departmentName: 'Jal Shakti Department (PHE / I&FC J&K)',
    startDate: new Date('2026-10-12T11:00:00+05:30'),
    endDate: new Date('2026-12-20T14:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7812340',
    pdfData: {
      itemCategory: 'WATER SUPPLY & HYDRAULIC MACHINERY',
      totalQuantity: 24,
      ministryName: 'Government of Jammu & Kashmir',
      departmentName: 'Jal Shakti Department (PHE)',
      organisationName: 'PHE Division Srinagar & Baramulla',
      minTurnoverLakhs: 650,
      pastExperienceYears: 2,
      emdAmount: 2100000,
      emdAdvisoryBank: 'J&K Bank Ltd',
      epbgPercentage: 5,
      epbgDurationMonths: 24,
      beneficiary: 'Executive Engineer, PHE Mechanical Division, Srinagar',
      consigneeAddress: 'Srinagar, Jammu and Kashmir',
      deliveryLocations: ['Srinagar', 'Baramulla', 'Ganderbal', 'Bandipora'],
      dated: '2026-10-12',
      bidEndDate: new Date('2026-12-20T14:00:00+05:30')
    }
  }
];

const VERIFIED_GEM_HP_BIDS = [
  {
    bidNumber: 'GEM/2026/B/7982315',
    items: 'DISTRIBUTION TRANSFORMERS 100KVA 11KV',
    quantity: 25,
    departmentName: 'Himachal Pradesh State Electricity Board Limited',
    state: 'Himachal Pradesh',
    startDate: new Date('2026-09-01T10:00:00+05:30'),
    endDate: new Date('2026-11-20T15:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7982315',
    pdfData: {
      itemCategory: 'DISTRIBUTION TRANSFORMERS',
      totalQuantity: 25,
      ministryName: 'Government of Himachal Pradesh',
      departmentName: 'HP State Electricity Board (HPSEBL)',
      organisationName: 'HPSEBL Transmission & Distribution',
      minTurnoverLakhs: 420,
      pastExperienceYears: 2,
      emdAmount: 1850000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 3,
      epbgDurationMonths: 24,
      beneficiary: 'Senior Executive Engineer, HPSEBL, Shimla',
      consigneeAddress: 'Shimla, Himachal Pradesh',
      deliveryLocations: ['Shimla', 'Solan', 'Dharamshala', 'Mandi'],
      dated: '2026-09-01',
      bidEndDate: new Date('2026-11-20T15:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7979941',
    items: 'PRECAST RCC PIPES NP3 CLASS',
    quantity: 450,
    departmentName: 'Public Works Department (HPPWD)',
    state: 'Himachal Pradesh',
    startDate: new Date('2026-09-05T11:00:00+05:30'),
    endDate: new Date('2026-11-25T17:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7979941',
    pdfData: {
      itemCategory: 'PRECAST RCC DRAINAGE PIPES',
      totalQuantity: 450,
      ministryName: 'Government of Himachal Pradesh',
      departmentName: 'Public Works Department (HPPWD)',
      organisationName: 'HPPWD Division Kangra',
      minTurnoverLakhs: 180,
      pastExperienceYears: 2,
      emdAmount: 920000,
      emdAdvisoryBank: 'Punjab National Bank',
      epbgPercentage: 5,
      epbgDurationMonths: 18,
      beneficiary: 'Executive Engineer, HPPWD Division, Kangra',
      consigneeAddress: 'Kangra, Himachal Pradesh',
      deliveryLocations: ['Kangra', 'Dharamshala', 'Kullu', 'Mandi'],
      dated: '2026-09-05',
      bidEndDate: new Date('2026-11-25T17:00:00+05:30')
    }
  }
];

const VERIFIED_GEM_PUNJAB_BIDS = [
  {
    bidNumber: 'GEM/2026/B/7981240',
    items: 'SUBMERSIBLE PUMPING MACHINERY & CONTROL PANELS',
    quantity: 35,
    departmentName: 'Department of Water Supply & Sanitation Punjab',
    state: 'Punjab',
    startDate: new Date('2026-09-02T12:00:00+05:30'),
    endDate: new Date('2026-11-22T16:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7981240',
    pdfData: {
      itemCategory: 'WATER SUPPLY PUMPING MACHINERY',
      totalQuantity: 35,
      ministryName: 'Government of Punjab',
      departmentName: 'Department of Water Supply & Sanitation',
      organisationName: 'DWSS Division Patiala',
      minTurnoverLakhs: 560,
      pastExperienceYears: 3,
      emdAmount: 2200000,
      emdAdvisoryBank: 'Punjab National Bank',
      epbgPercentage: 5,
      epbgDurationMonths: 24,
      beneficiary: 'Executive Engineer, DWSS Division, Patiala',
      consigneeAddress: 'Patiala, Punjab',
      deliveryLocations: ['Patiala', 'Ludhiana', 'Bathinda', 'Mohali'],
      dated: '2026-09-02',
      bidEndDate: new Date('2026-11-22T16:00:00+05:30')
    }
  },
  {
    bidNumber: 'GEM/2026/B/7978912',
    items: 'ADVANCED DIALYSIS MACHINES & MEDICAL MONITORS',
    quantity: 20,
    departmentName: 'Punjab Health Systems Corporation (PHSC)',
    state: 'Punjab',
    startDate: new Date('2026-09-08T09:30:00+05:30'),
    endDate: new Date('2026-11-28T18:00:00+05:30'),
    pdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/7978912',
    pdfData: {
      itemCategory: 'HOSPITAL MEDICAL EQUIPMENTS',
      totalQuantity: 20,
      ministryName: 'Government of Punjab',
      departmentName: 'Punjab Health Systems Corporation',
      organisationName: 'PHSC Headquarters Mohali',
      minTurnoverLakhs: 890,
      pastExperienceYears: 3,
      emdAmount: 3400000,
      emdAdvisoryBank: 'State Bank of India',
      epbgPercentage: 3,
      epbgDurationMonths: 36,
      beneficiary: 'Managing Director, PHSC, Mohali',
      consigneeAddress: 'Phase 6, SAS Nagar Mohali, Punjab',
      deliveryLocations: ['Mohali', 'Amritsar', 'Jalandhar', 'Ludhiana'],
      dated: '2026-09-08',
      bidEndDate: new Date('2026-11-28T18:00:00+05:30')
    }
  }
];

async function seedSyntheticDemoBids(filterState = null) {
  let datasetsToSeed = [];
  const stateUpper = (filterState || targetStateArg).toUpperCase();

  const tag = (bids, state) => bids.map((bid) => ({ ...bid, consigneeStates: [state] }));
  const jk = tag(VERIFIED_GEM_JK_BIDS, 'Jammu & Kashmir');
  const hp = tag(VERIFIED_GEM_HP_BIDS, 'Himachal Pradesh');
  const pb = tag(VERIFIED_GEM_PUNJAB_BIDS, 'Punjab');
  if (stateUpper === 'ALL') {
    datasetsToSeed = [...jk, ...hp, ...pb];
  } else if (stateUpper.includes('HIMACHAL') || stateUpper === 'HP') {
    datasetsToSeed = hp;
  } else if (stateUpper.includes('PUNJAB') || stateUpper === 'PB') {
    datasetsToSeed = pb;
  } else {
    datasetsToSeed = jk;
  }

  logger.info(`[GeM Seeder] Seeding ${datasetsToSeed.length} synthetic demo records; none are source-verified...`);
  let count = 0;
  for (const rawBid of datasetsToSeed) {
    const normalized = gemAdapter.normalize(rawBid);
    normalized.officialStateConfidence = 'unverified';
    normalized.locationVerificationStatus = 'UNVERIFIED';
    normalized.gemValidationFlags = [...new Set([...(normalized.gemValidationFlags || []), 'SYNTHETIC_SEED_DATA'])];
    normalized.pdfFetchStatus = 'NOT_AVAILABLE';
    normalized.pdfParseStatus = 'FAILED';
    normalized.gemStatus = 'UNKNOWN';
    const existing = await Tender.findOne({ sourcePortal: 'GEM', sourceTenderId: normalized.sourceTenderId }).select('_id').lean();
    if (existing) {
      logger.warn(`[GeM Seeder] Skipped ${normalized.sourceTenderId}; mock mode never overwrites an existing record.`);
      continue;
    }
    await Tender.create(normalized);
    count++;
    logger.info(`[GeM Seeder] Saved unverified demo row: ${normalized.sourceTenderId}`);
  }
  logger.info(`[GeM Seeder] Successfully seeded ${count} synthetic demo rows.`);
}

async function run() {
  try {
    logger.info('====================================================');
    logger.info('   GeM consignee-state sync (J&K, Ladakh, HP, Punjab)');
    logger.info('====================================================');

    await connectDB();

    if (isMock) {
      if (process.env.NODE_ENV !== 'development') throw new Error('Synthetic --mock/--seed data may only be written with NODE_ENV=development');
      await seedSyntheticDemoBids();
      process.exit(0);
    }

    const report = await gemAdapter.syncConsigneeStates({
      states: targetStateArg,
      pdfLimit: isDryRun ? 0 : pdfLimit,
      delay,
      maxRequests,
      dryRun: isDryRun,
    });

    // Compact, log-friendly summary (the CI job prints the tail of this log).
    for (const [state, st] of Object.entries(report.states)) {
      logger.info(`[GeM] ${state}: ${st.error ? `FAILED - ${st.error}` : `${st.listed}/${st.numFound} listed, complete=${st.complete}, requests=${st.requests}${st.removed !== undefined ? `, removed=${st.removed}` : ''}${st.wouldRemove !== undefined ? `, wouldRemove=${st.wouldRemove}` : ''}${st.delistingSkipped ? `, delisting skipped (${st.delistingSkipped})` : ''}`}`);
    }
    logger.info(`[GeM] listing: inserted=${report.listing.inserted} updated=${report.listing.updated} | not listed: ${report.delisted} | PDFs: ${report.pdf.completed} parsed, ${report.pdf.failed} failed, ${report.pdf.remainingDue} still due${isDryRun ? ' | DRY RUN, nothing written' : ''}`);

    if (report.errors.length) {
      logger.error(`[GeM] Finished with errors: ${report.errors.join(' | ')}`);
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    // Node's fetch reports every network failure as "fetch failed"; the real reason (timeout, reset, DNS) is in err.cause.
    const cause = err.cause ? ` (${[err.cause.code, err.cause.message].filter(Boolean).join(': ')})` : '';
    logger.error(`[GeM] Execution error: ${err.message}${cause}`);
    process.exit(1);
  }
}

run();
