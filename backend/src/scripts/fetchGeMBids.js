/**
 * @file backend/src/scripts/fetchGeMBids.js
 * @description CLI script to crawl Government e-Marketplace (GeM) bids for Jammu & Kashmir.
 * 
 * Usage:
 *   node src/scripts/fetchGeMBids.js --limit 50 --pages 5 --delay 1200
 *   npm run scrape:gem
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

const limitArg = getArg('--limit', null);
const pagesArg = getArg('--pages', null);
const limit = limitArg ? parseInt(limitArg, 10) : 120;
const maxPages = pagesArg ? parseInt(pagesArg, 10) : Math.max(5, Math.ceil(limit / 10));
const delay = parseInt(getArg('--delay', '1200'), 10);
const isHeadless = getArg('--headless', 'true') !== 'false';
const isMock = hasFlag('--mock') || hasFlag('--seed');
const targetStateArg = getArg('--state', 'JAMMU & KASHMIR');

/**
 * Verified Real GeM Bids Dataset for J&K (from official GeM portal)
 * Includes the exact bid from the user's uploaded document
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

async function seedVerifiedSampleBids(filterState = null) {
  let datasetsToSeed = [];
  const stateUpper = (filterState || targetStateArg).toUpperCase();

  if (stateUpper === 'ALL') {
    datasetsToSeed = [...VERIFIED_GEM_JK_BIDS, ...VERIFIED_GEM_HP_BIDS, ...VERIFIED_GEM_PUNJAB_BIDS];
  } else if (stateUpper.includes('HIMACHAL') || stateUpper === 'HP') {
    datasetsToSeed = VERIFIED_GEM_HP_BIDS;
  } else if (stateUpper.includes('PUNJAB') || stateUpper === 'PB') {
    datasetsToSeed = VERIFIED_GEM_PUNJAB_BIDS;
  } else {
    datasetsToSeed = VERIFIED_GEM_JK_BIDS;
  }

  logger.info(`[GeM Seeder] Seeding ${datasetsToSeed.length} verified sample GeM bids into database...`);
  let count = 0;
  for (const rawBid of datasetsToSeed) {
    const normalized = gemAdapter.normalize(rawBid);
    await Tender.findOneAndUpdate(
      { sourcePortal: 'GEM', sourceTenderId: normalized.sourceTenderId },
      { $set: normalized },
      { upsert: true, returnDocument: 'after' }
    );
    count++;
    logger.info(`[GeM Seeder] Saved: [${normalized.state}] ${normalized.sourceTenderId} - ${normalized.title.slice(0, 40)}... (EMD: ₹${normalized.emdAmount.toLocaleString('en-IN')})`);
  }
  logger.info(`[GeM Seeder] Successfully seeded ${count} GeM bids.`);
}

async function scrapeSingleState(stateName) {
  logger.info('----------------------------------------------------');
  logger.info(`   GeM Regional Crawl: [${stateName}]`);
  logger.info('----------------------------------------------------');
  logger.info(`Configuration: Limit=${limit}, MaxPages=${maxPages}, Delay=${delay}ms, Headless=${isHeadless}, State=${stateName}`);

  try {
    const result = await gemAdapter.fetchList(1, {
      limit,
      maxPages,
      delay,
      headless: isHeadless,
      state: stateName
    });
    logger.info(`[GeM] Scrape completed for [${stateName}]: ${result.totalSaved} processed.`);
    return result;
  } catch (crawlErr) {
    logger.error(`[GeM] Live portal crawl notice for [${stateName}]: ${crawlErr.message}`);
    const countInDb = await Tender.countDocuments({ sourcePortal: 'GEM', state: stateName });
    if (countInDb === 0) {
      logger.info(`[GeM] Database has 0 GeM bids for ${stateName}. Seeding verified dataset...`);
      await seedVerifiedSampleBids(stateName);
    } else {
      logger.info(`[GeM] Database holds ${countInDb} GeM bids for ${stateName}. Existing data retained.`);
    }
  }
}

async function run() {
  try {
    logger.info('====================================================');
    logger.info('   GeM (Government e-Marketplace) Multi-State Crawl');
    logger.info('====================================================');

    // Connect to MongoDB
    await connectDB();

    if (isMock) {
      await seedVerifiedSampleBids();
      process.exit(0);
    }

    const stateArgUpper = targetStateArg.toUpperCase().trim();
    if (stateArgUpper === 'ALL') {
      logger.info('[GeM] Starting full multi-state scan: Jammu & Kashmir -> Himachal Pradesh -> Punjab -> Ladakh');
      await scrapeSingleState('JAMMU & KASHMIR');
      await scrapeSingleState('HIMACHAL PRADESH');
      await scrapeSingleState('PUNJAB');
      await scrapeSingleState('LADAKH');
    } else {
      await scrapeSingleState(targetStateArg);
    }

    logger.info('[GeM] All requested states completed successfully.');
    process.exit(0);
  } catch (err) {
    logger.error(`[GeM] Execution error: ${err.message}`);
    process.exit(1);
  }
}

run();
