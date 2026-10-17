/**
 * @file backend/src/utils/gemPdfParser.js
 * @description Extracts and parses structured data from official GeM Bid Document PDFs.
 */

import { PDFParse } from 'pdf-parse';

/**
 * Extracts raw text from a PDF Buffer
 * @param {Buffer} pdfBuffer 
 * @returns {Promise<string>}
 */
export async function extractTextFromPdfBuffer(pdfBuffer) {
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    await parser.load();
    const text = await parser.getText();
    return typeof text === 'string' ? text : (text?.text || '');
  } catch (err) {
    return '';
  }
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
  const bidEndDateStr = findMatch(/(?:Bid\s*End\s*Date\/Time|बड\s*बंद\s*होने\s*क\s*तार\s*ख\/समय)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
  const bidOpeningDateStr = findMatch(/(?:Bid\s*Opening\s*Date\/Time|बड\s*खुलने\s*क\s*तार\s*ख\/समय)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
  const bidValidityDays = parseInt(findMatch(/(?:Bid\s*Offer\s*Validity|बड\s*पेशकश\s*वैधता)[^\n]*?(\d+)\s*\(Days\)/i) || '180', 10);

  // 3. Ministry, Department, Organisation
  const rawMinistry = findMatch(/(?:Ministry\/State\s*Name|मं\s*ालय\/रा!य\s*का\s*नाम)\s*(?:[:\-]|\/Ministry\/State\s*Name)?\s*([^\n]+)/i);
  const rawDepartment = findMatch(/(?:Department\s*Name|वभाग\s*का\s*नाम)\s*(?:[:\-]|\/Department\s*Name)?\s*([^\n]+)/i);
  const rawOrg = findMatch(/(?:Organisation\s*Name|संगठन\s*का\s*नाम)\s*(?:[:\-]|\/Organisation\s*Name)?\s*([^\n]+)/i);
  const rawOffice = findMatch(/(?:Office\s*Name|कायाल%?\s*य\s*का\s*नाम)\s*(?:[:\-]|\/Office\s*Name)?\s*([^\n]+)/i);

  // 4. Item Details & Quantity
  const totalQuantity = parseInt(findMatch(/(?:Total\s*Quantity|कुल\s*मा\s*ा)\s*[:\-]?\s*(\d+)/i) || '0', 10);
  const rawItemCategory = findMatch(/(?:Item\s*Category|व'तु\(?णे?\s*ी)\s*(?:[:\-]|\/Item\s*Category)?\s*([^\n]+)/i);

  // 5. Eligibility Criteria (Turnover & Experience)
  const minTurnoverLakhs = findMatch(/(?:Minimum\s*Average\s*Annual\s*Turnover[^\n]*?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*Lakh/i);
  const oemTurnoverLakhs = findMatch(/(?:OEM\s*Average\s*Turnover[^\n]*?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*Lakh/i);
  const pastExperienceYears = parseInt(findMatch(/(?:Years\s*of\s*Past\s*Experience\s*Required[^\n]*?)\s*[:\-]?\s*(\d+)\s*Year/i) || '0', 10);

  // 6. EMD & ePBG Details
  const emdAdvisoryBank = findMatch(/(?:EMD\s*Detail[^\n]*?Advisory\s*Bank|एडवाईजर\s*बQक)\s*(?:[:\-]|\/Advisory\s*Bank)?\s*([^\n]+)/i);
  const emdAmount = parseFloat(findMatch(/(?:EMD\s*Amount|ईएमड\s*रािश)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i) || '0');
  const epbgPercentage = parseFloat(findMatch(/(?:ePBG\s*Percentage|ईपीबीजी\s*5ितशत)[^\n]*?(\d+(?:\.\d+)?)/i) || '0');
  const epbgDurationMonths = parseInt(findMatch(/(?:Duration\s*of\s*ePBG\s*required[^\n]*?)\s*[:\-]?\s*(\d+)/i) || '0', 10);
  const beneficiary = findMatch(/(?:Beneficiary|लाभाथe)\s*:\s*([^\n]+)/i);

  // 7. Pre-Bid Meeting
  const preBidDateStr = findMatch(/(?:Pre-Bid\s*Date\s*and\s*Time|Pre-Bid\s*Date\s*and\s*Time)\s*[:\-]?\s*(\d{2}[\-\/]\d{2}[\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i);
  const preBidVenue = findMatch(/(?:Pre-Bid\s*Venue|5ी-\s*बड\s*'थान)\s*(?:[:\-]|\/Pre-Bid\s*Venue)?\s*([^\n]+)/i);

  // 8. Consignee / Delivery Locations across Northern Region (J&K, Ladakh, HP, Punjab)
  const consigneeAddress = findMatch(/(?:Consignee\s*Reporting\/Officer[^\n]*?Rajauri|Consignees\/Reporting\s*Officer[^\n]*?\n[^\n]*?([A-Za-z\s]+)\s+\d+\s+\d+)/i) || null;
  
  const deliveryAddressBlock = findMatch(/(?:Actual\s*delivery[^\n]*?following\s*address)\s*([\s\S]*?)(?:\n\s*\d+\.\s*Generic|\n\s*Bidders\s*shall)/i);

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
    if (regex.test(cleanText)) {
      detectedLocations.push(loc);
    }
  }

  // Parse dates into JS Date objects
  const parseDateString = (str) => {
    if (!str) return null;
    try {
      const parts = str.match(/(\d{2})[\-\/](\d{2})[\-\/](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (parts) {
        const [_, day, month, year, hours = '00', mins = '00', secs = '00'] = parts;
        return new Date(`${year}-${month}-${day}T${hours}:${mins}:${secs}+05:30`);
      }
    } catch {
      return null;
    }
    return null;
  };

  return {
    bidNumber: bidNumber || null,
    dated: datedStr || null,
    bidEndDate: parseDateString(bidEndDateStr),
    bidEndDateStr: bidEndDateStr || null,
    bidOpeningDate: parseDateString(bidOpeningDateStr),
    bidOpeningDateStr: bidOpeningDateStr || null,
    bidValidityDays,
    ministryName: cleanField(rawMinistry) || 'Ministry of Defence',
    departmentName: cleanField(rawDepartment) || 'Department of Military Affairs',
    organisationName: cleanField(rawOrg) || 'Indian Army',
    officeName: cleanField(rawOffice) || null,
    totalQuantity: totalQuantity || 0,
    itemCategory: cleanField(rawItemCategory) || 'General Supplies',
    minTurnoverLakhs: minTurnoverLakhs ? parseFloat(minTurnoverLakhs) : null,
    oemTurnoverLakhs: oemTurnoverLakhs ? parseFloat(oemTurnoverLakhs) : null,
    pastExperienceYears: pastExperienceYears || 0,
    emdAmount: emdAmount || 0,
    emdAdvisoryBank: cleanField(emdAdvisoryBank) || null,
    epbgPercentage: epbgPercentage || 0,
    epbgDurationMonths: epbgDurationMonths || 0,
    beneficiary: beneficiary ? beneficiary.replace(/\s+/g, ' ').trim() : null,
    preBidDate: parseDateString(preBidDateStr),
    preBidDateStr: preBidDateStr || null,
    preBidVenue: cleanField(preBidVenue) || null,
    consigneeAddress: consigneeAddress || 'Jammu & Kashmir',
    deliveryLocations: detectedLocations.length > 0 ? detectedLocations : ['Jammu & Kashmir'],
    deliveryAddressDetails: deliveryAddressBlock ? deliveryAddressBlock.replace(/\s+/g, ' ').trim() : null,
    state: 'Jammu and Kashmir',
    sourcePortal: 'GEM'
  };
}
