// Helpers for turning the raw delivery/consignee section extracted from a GeM
// bid PDF into something readable. The PDF text layer mixes English with
// Devanagari whose glyphs are often mangled on extraction, repeats table
// headers for every item, and includes page markers and portal boilerplate.

const BOILERPLATE = [
  /Technical\s+Specifications?(?:\s+Specification)?(?:\s+Document)?(?:\s+View\s+File)?/gi,
  /BOQ\s+Detail(?:\s+Document)?(?:\s+View\s+File)?/gi,
  /\bView\s+File\b/gi,
  /Advisory\s*-?\s*Please\s+refer\s+attached\s+BOQ\s+document\s+for\s+detailed\s+consignee\s+list\s+and\s+delivery\s+period\.?/gi,
  /\/?Consignees?\s*\/\s*Reporting\s+Officer\s+and\s+Quantity/gi,
  /\/?S\.?\s*N\s*o\.?/gi,
  /\/?Consignee\s+Reporting\s*\/\s*Officer/gi,
  /\/?(?:Address|Quantity|Delivery\s+Days)\b/gi,
  /\/?Buyer\s+Added\s+Bid\s+Specific\s+Terms\s+and\s+Conditions/gi,
  /\b\d+\s*\/\s*\d+\s*--\s*\d+\s+of\s+\d+\s*--/g, // page markers: "8 / 12 -- 8 of 12 --"
  /--\s*\d+\s+of\s+\d+\s*--/g,
];

const isMangledToken = (token) => /[ऀ-ॿ◌]/.test(token);

/** Remove mangled Hindi words, bilingual table labels, boilerplate and noise. */
export const cleanGemText = (value) => {
  let text = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .split(/\s+/)
    // A token that contains any Devanagari is a garbled Hindi word, often glued
    // to its English label ("पता/Address"); keep only the English tail.
    .map((token) => (isMangledToken(token) ? (token.match(/\/([A-Za-z][^ऀ-ॿ◌]*)$/)?.[1] || '') : token))
    .join(' ');
  for (const pattern of BOILERPLATE) text = text.replace(pattern, ' ');
  return text
    .replace(/\*+/g, ' ')
    .replace(/(?:^|\s)[/:.[\]]+(?=\s|$)/g, ' ')
    .replace(/(?:^|\s)[A-Za-z0-9]{1,2}(?=\s|$)(?:\s+[A-Za-z0-9]{1,2}(?=\s|$))+/g, ' ') // runs of stray fragments
    .replace(/\s+/g, ' ')
    .trim();
};

const ROW_PATTERN = /(?:^|\s)(\d{1,3})\s+(?:\*[\s*]*)+([A-Za-z][A-Za-z0-9 ,.&()'-]*?)\s+(\d+(?:\.\d+)?)\s+(\d{1,4})(?=\s|$)/g;

/**
 * Extract consignee rows ("1 ****** AMRITSAR RURAL 1 30") from the raw text.
 * GeM masks officer names with asterisks, so the address follows the stars and
 * is followed by quantity and delivery days. The item name for each table sits
 * between the previous table's last row and its "Technical Specifications"
 * heading, so it is recovered from that gap when present.
 */
export const parseConsigneeRows = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ');
  const rows = [];
  let previousEnd = 0;
  for (const match of text.matchAll(ROW_PATTERN)) {
    const [whole, serial, address, quantity, days] = match;
    const gap = text.slice(previousEnd, match.index);
    const beforeSpecs = gap.split(/[ऀ-ॿ]|Technical\s+Specifications?/i)[0];
    const item = rows.length ? cleanGemText(beforeSpecs).replace(/^[\d\s/-]+/, '').trim() : '';
    rows.push({ serial, address: address.replace(/\s+/g, ' ').trim(), quantity, days, item });
    previousEnd = match.index + whole.length;
  }
  return rows;
};
