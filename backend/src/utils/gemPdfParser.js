/**
 * @file backend/src/utils/gemPdfParser.js
 * @description Extracts and parses structured data from official GeM Bid Document PDFs.
 */

import { PDFParse } from 'pdf-parse';

export const GEM_PARSER_VERSION = '2.1.0';

const INDIAN_STATES_AND_UTS = [
  'Andaman & Nicobar Islands', 'Dadra & Nagar Haveli and Daman & Diu', 'Jammu & Kashmir',
  'Arunachal Pradesh', 'Himachal Pradesh', 'Madhya Pradesh', 'Andhra Pradesh',
  'Uttar Pradesh', 'West Bengal', 'Chhattisgarh', 'Uttarakhand', 'Maharashtra',
  'Meghalaya', 'Tamil Nadu', 'Rajasthan', 'Karnataka', 'Jharkhand', 'Telangana',
  'Nagaland', 'Puducherry', 'Haryana', 'Mizoram', 'Manipur', 'Sikkim', 'Tripura',
  'Gujarat', 'Punjab', 'Kerala', 'Assam', 'Bihar', 'Goa', 'Odisha', 'Delhi',
  'Chandigarh', 'Ladakh', 'Lakshadweep'
];

export function canonicalizeGeMState(rawValue) {
  if (!rawValue) return null;
  const normalize = (value) => value.toLowerCase().replace(/[.]/g, '').replace(/&/g, 'and').replace(/[^a-z]+/g, ' ').trim().replace(/\s+/g, ' ');
  const stateByKey = new Map(INDIAN_STATES_AND_UTS.map((name) => [normalize(name), name]));
  const aliases = new Map([
    ['j and k', 'Jammu & Kashmir'], ['jandk', 'Jammu & Kashmir'], ['j k', 'Jammu & Kashmir'], ['nct of delhi', 'Delhi'],
    ['national capital territory of delhi', 'Delhi'], ['orissa', 'Odisha'],
    ['pondicherry', 'Puducherry'], ['uttaranchal', 'Uttarakhand'],
  ].map(([alias, state]) => [normalize(alias), state]));
  // Exact labels only. Never infer state from a substring such as "Punjabi Masala"
  // or a department/organisation name that happens to mention a place.
  const candidates = String(rawValue).split(/[,;|]/).map((part) => part.trim().replace(/^(?:government|govt)\s+of\s+|^state\s+of\s+/i, ''));
  for (const candidate of candidates) {
    const key = normalize(candidate);
    if (aliases.has(key)) return aliases.get(key);
    if (stateByKey.has(key)) return stateByKey.get(key);
  }
  return null;
}

/**
 * Extracts raw text from a PDF Buffer
 * @param {Buffer} pdfBuffer 
 * @returns {Promise<string>}
 */
export async function extractTextFromPdfBuffer(pdfBuffer) {
  const parser = new PDFParse({ data: pdfBuffer });
  await parser.load();
  const text = await parser.getText();
  const extracted = typeof text === 'string' ? text : (text?.text || '');
  if (!extracted.trim()) throw new Error('PDF_TEXT_EMPTY');
  return extracted;
}

/**
 * Cleans extracted string of common OCR / bilingual slash prefixes
 */
function cleanField(val) {
  if (!val) return null;
  return val
    .replace(/^[\s\/:\\-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses structured tender data from GeM Bid Document raw text
 * @param {string} rawText 
 * @returns {Object} Structured GeM bid metadata
 */
export function parseGeMBidPdfText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {};
  }

  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Helper regex searcher
  const findMatch = (pattern, groupIndex = 1) => {
    const match = cleanText.match(pattern);
    return match && match[groupIndex] ? cleanField(match[groupIndex]) : null;
  };

  // 1. Bid Number & Date
  const bidNumber = findMatch(/(?:Bid\s*Number|बड\s*संBया|बड\s*संख्या)\s*[:\-]?\s*(GEM\/\d{4}\/[A-Z0-9_\/]+)/i)
    || findMatch(/(GEM\/\d{4}\/[A-Z]\/\d+)/i);

  const datedStr = findMatch(/(?:Dated|Cदनांक|दिनांक)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4})/i);

  // 2. Critical Dates
  const bidEndDateStr = findMatch(/(?:Bid\s*End\s*Date\/Time|RA\s*End\s*Date\/Time|बड\s*बंद\s*होने\s*क\s*तार\s*ख\/समय)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
  // A bid is opened after it closes; an RA starts before it ends. Keep the two
  // separate so the date-order check below is correct for each document type.
  const bidOpeningDateStr = findMatch(/(?:Bid\s*Opening\s*Date\/Time|बड\s*खुलने\s*क\s*तार\s*ख\/समय)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
  const raStartDateStr = findMatch(/RA\s*Start\s*Date\/Time\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
  const bidValidityDaysRaw = findMatch(/(?:Bid\s*Offer\s*Validity|बड\s*पेशकश\s*वैधता)[^\n]*?(\d+)\s*\(Days\)/i);
  const bidValidityDays = bidValidityDaysRaw ? parseInt(bidValidityDaysRaw, 10) : null;

  // 3. Ministry, Department, Organisation
  const rawMinistry = findMatch(/(?:Ministry\/State\s*Name|मं\s*ालय\/रा!य\s*का\s*नाम)\s*(?:[:\-]|\/Ministry\/State\s*Name)?\s*([^\n]+)/i);
  const rawDepartment = findMatch(/(?:Department\s*Name|वभाग\s*का\s*नाम)\s*(?:[:\-]|\/Department\s*Name)?\s*([^\n]+)/i);
  const rawOrg = findMatch(/(?:Organisation\s*Name|संगठन\s*का\s*नाम)\s*(?:[:\-]|\/Organisation\s*Name)?\s*([^\n]+)/i);
  const rawOffice = findMatch(/(?:Office\s*Name|कायाल%?\s*य\s*का\s*नाम)\s*(?:[:\-]|\/Office\s*Name)?\s*([^\n]+)/i);

  // 4. Item Details & Quantity
  const totalQuantityRaw = findMatch(/(?:Total\s*Quantity|कुल\s*मा\s*ा)\s*[:\-]?\s*(\d+)/i);
  const totalQuantity = totalQuantityRaw ? parseInt(totalQuantityRaw, 10) : null;
  const rawItemCategory = findMatch(/(?:Item\s*Category|व'तु\(?णे?\s*ी)\s*(?:[:\-]|\/Item\s*Category)?\s*([^\n]+)/i);

  // 5. Eligibility Criteria (Turnover & Experience)
  const minTurnoverLakhs = findMatch(/(?:Minimum\s*Average\s*Annual\s*Turnover[^\n]*?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*Lakh/i);
  const oemTurnoverLakhs = findMatch(/(?:OEM\s*Average\s*Turnover[^\n]*?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*Lakh/i);
  const pastExperienceRaw = findMatch(/(?:Years\s*of\s*Past\s*Experience\s*Required[^\n]*?)\s*[:\-]?\s*(\d+)\s*Year/i);
  const pastExperienceYears = pastExperienceRaw ? parseInt(pastExperienceRaw, 10) : null;

  // 6. EMD & ePBG Details
  const emdAdvisoryBank = findMatch(/(?:EMD\s*Detail[^\n]*?Advisory\s*Bank|एडवाईजर\s*बQक)\s*(?:[:\-]|\/Advisory\s*Bank)?\s*([^\n]+)/i);
  const emdAmountRaw = findMatch(/(?:EMD\s*Amount|ईएमड\s*रािश)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  const emdAmount = emdAmountRaw ? parseFloat(emdAmountRaw) : null;
  const epbgRaw = findMatch(/(?:ePBG\s*Percentage|ईपीबीजी\s*5ितशत)[^\n]*?(\d+(?:\.\d+)?)/i);
  const epbgPercentage = epbgRaw ? parseFloat(epbgRaw) : null;
  const epbgDurationRaw = findMatch(/(?:Duration\s*of\s*ePBG\s*required[^\n]*?)\s*[:\-]?\s*(\d+)/i);
  const epbgDurationMonths = epbgDurationRaw ? parseInt(epbgDurationRaw, 10) : null;
  const beneficiary = findMatch(/(?:Beneficiary|लाभाथe)\s*:\s*([^\n]+)/i);

  // 7. Pre-Bid Meeting
  const preBidDateStr = findMatch(/(?:Pre-Bid\s*Date\s*and\s*Time|Pre-Bid\s*Date\s*and\s*Time)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i);
  const preBidVenue = findMatch(/(?:Pre-Bid\s*Venue|5ी-\s*बड\s*'थान)\s*(?:[:\-]|\/Pre-Bid\s*Venue)?\s*([^\n]+)/i);

  // Delivery locations must come from an explicitly labeled delivery/consignee
  // section. A city mentioned elsewhere (for example in an item name) is not
  // evidence of where the goods must be delivered.
  const deliveryAddressMatch = cleanText.match(
    /(?:Actual\s*delivery[^\n]*?(?:following\s*address)?|Consignees?\s*\/\s*Reporting\s*Officer[^\n]*)\s*([\s\S]{0,1800}?)(?=\n\s*(?:\d+\.\s*Generic|Bidders?\s+shall|Buyer\s+Added|Terms\s+and\s+Conditions|$))/i
  );
  const deliveryAddressBlock = cleanField(deliveryAddressMatch?.[1]) || null;

  const REGIONAL_LOCATIONS = [
    // Jammu & Kashmir
    'Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Budgam', 'Pulwama', 'Kupwara', 
    'Shopian', 'Ganderbal', 'Bandipora', 'Kulgam', 'Doda', 'Ramban', 'Kishtwar', 
    'Udhampur', 'Reasi', 'Rajouri', 'Poonch', 'Kathua', 'Samba', 'Akhnoor', 
    'Mendhar', 'Sunderbani', 'Nowshera', 'Uri', 'Gulmarg', 'Pahalgam',
    // Ladakh
    'Kargil', 'Leh',
    // Himachal Pradesh
    'Shimla', 'Dharamshala', 'Kangra', 'Mandi', 'Kullu', 'Solan', 'Sirmaur', 
    'Chamba', 'Hamirpur', 'Una', 'Bilaspur', 'Kinnaur', 'Lahaul and Spiti', 'Manali', 'Baddi',
    // Punjab
    'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'SAS Nagar',
    'Hoshiarpur', 'Pathankot', 'Moga', 'Batala', 'Abohar', 'Malerkotla', 'Khanna',
    'Phagwara', 'Muktsar', 'Barnala', 'Firozpur', 'Kapurthala', 'Faridkot', 'Sangrur',
    'Fazilka', 'Gurdaspur', 'Rupnagar', 'Ropar', 'Tarn Taran', 'Fatehgarh Sahib', 'Nawanshahr'
  ];

  const detectedLocations = [];
  for (const loc of REGIONAL_LOCATIONS) {
    const regex = new RegExp(`\\b${loc}\\b`, 'i');
    if (deliveryAddressBlock && regex.test(deliveryAddressBlock)) {
      detectedLocations.push(loc);
    }
  }

  // Parse dates into JS Date objects
  const parseDateString = (str) => {
    if (!str) return null;
    try {
      const parts = str.match(/(\d{2})[\-\/](\d{2})[\-\/](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i);
      if (parts) {
        const [_, day, month, year, hourText = '00', mins = '00', secs = '00', meridiem] = parts;
        const d = Number(day), m = Number(month), y = Number(year);
        let hours = Number(hourText);
        if (d < 1 || m < 1 || m > 12 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || Number(mins) > 59 || Number(secs) > 59) return null;
        if (meridiem) {
          if (hours < 1 || hours > 12) return null;
          if (meridiem.toUpperCase() === 'PM' && hours < 12) hours += 12;
          if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
        } else if (hours > 23) return null;
        return new Date(`${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${mins}:${secs}+05:30`);
      }
    } catch {
      return null;
    }
    return null;
  };

  const documentType = /\bRA\s+Document\b|\bRA\s+Details\b/i.test(cleanText) || /GEM\/\d{4}\/R\//i.test(bidNumber || '') ? 'RA' : (/\bBid\s+Document\b/i.test(cleanText) ? 'BID' : 'UNKNOWN');
  const canonicalState = canonicalizeGeMState(rawMinistry);
  const flags = [];
  if (!bidNumber) flags.push('BID_NUMBER_MISSING');
  if (!rawMinistry) flags.push('OFFICIAL_STATE_MISSING');
  else if (!canonicalState) flags.push('STATE_NOT_RECOGNIZED');
  if (!deliveryAddressBlock) flags.push('DELIVERY_SECTION_NOT_FOUND');
  if (!bidEndDateStr) flags.push('CLOSING_DATE_MISSING');
  if (!bidOpeningDateStr && !raStartDateStr) flags.push('START_DATE_MISSING');
  const parsedClosingDate = parseDateString(bidEndDateStr);
  const parsedOpeningDate = parseDateString(bidOpeningDateStr);
  const parsedRaStartDate = parseDateString(raStartDateStr);
  const parsedPublishedDate = parseDateString(datedStr);
  if ((bidEndDateStr && !parsedClosingDate) || (bidOpeningDateStr && !parsedOpeningDate) || (raStartDateStr && !parsedRaStartDate) || (datedStr && !parsedPublishedDate)) flags.push('DATE_PARSE_INVALID');
  if (parsedClosingDate && parsedOpeningDate && parsedOpeningDate < parsedClosingDate) flags.push('DATE_ORDER_INVALID');
  if (parsedClosingDate && parsedRaStartDate && parsedClosingDate <= parsedRaStartDate) flags.push('DATE_ORDER_INVALID');
  if (parsedClosingDate && parsedPublishedDate && parsedClosingDate <= parsedPublishedDate) flags.push('DATE_ORDER_INVALID');
  return {
    bidNumber: bidNumber || null,
    dated: datedStr || null,
    bidEndDate: parseDateString(bidEndDateStr),
    bidEndDateStr: bidEndDateStr || null,
    bidOpeningDate: parsedOpeningDate,
    bidOpeningDateStr: bidOpeningDateStr || null,
    raStartDate: parsedRaStartDate,
    raStartDateStr: raStartDateStr || null,
    bidValidityDays,
    ministryName: cleanField(rawMinistry),
    ministryStateName: cleanField(rawMinistry),
    officialState: cleanField(rawMinistry),
    departmentName: cleanField(rawDepartment),
    organisationName: cleanField(rawOrg),
    officeName: cleanField(rawOffice) || null,
    totalQuantity,
    itemCategory: cleanField(rawItemCategory),
    minTurnoverLakhs: minTurnoverLakhs ? parseFloat(minTurnoverLakhs) : null,
    oemTurnoverLakhs: oemTurnoverLakhs ? parseFloat(oemTurnoverLakhs) : null,
    pastExperienceYears,
    emdAmount,
    emdAdvisoryBank: cleanField(emdAdvisoryBank) || null,
    epbgPercentage,
    epbgDurationMonths,
    beneficiary: beneficiary ? beneficiary.replace(/\s+/g, ' ').trim() : null,
    preBidDate: parseDateString(preBidDateStr),
    preBidDateStr: preBidDateStr || null,
    preBidVenue: cleanField(preBidVenue) || null,
    consigneeAddress: deliveryAddressBlock,
    deliveryLocations: detectedLocations,
    deliveryAddressDetails: deliveryAddressBlock,
    // Only recognised delivery cities; the raw section is kept separately so a
    // fragment of table headers is never shown as a location.
    location: detectedLocations.length > 0 ? detectedLocations.join(', ') : null,
    state: canonicalState,
    documentType,
    parserVersion: GEM_PARSER_VERSION,
    rawDeliverySection: deliveryAddressBlock,
    fieldConfidence: {
      officialState: canonicalState ? 'verified' : (rawMinistry ? 'unverified' : 'unknown'),
      department: rawDepartment ? 'verified' : 'unknown',
      organisation: rawOrg ? 'verified' : 'unknown',
      deliveryLocation: detectedLocations.length ? 'verified' : (deliveryAddressBlock ? 'partial' : 'unknown'),
      closingDate: bidEndDateStr && parseDateString(bidEndDateStr) ? 'verified' : 'unknown',
      startDate: parsedOpeningDate || parsedRaStartDate ? 'verified' : 'unknown',
      emdAmount: emdAmount === null ? 'unknown' : 'verified',
    },
    validationFlags: flags,
    sourcePortal: 'GEM'
  };
}
