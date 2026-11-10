/**
 * @file backend/src/utils/spreadsheetText.js
 * @description Turns tender spreadsheets (NIC BOQ .xls files and .xlsx files)
 * into plain tab-separated text that an AI model can read. It reads cell
 * values only: no formatting, formulas or macros are interpreted or run.
 *
 * Legacy .xls files are OLE2 compound files holding a BIFF8 "Workbook" stream.
 * The reader below covers the records that carry cell values (shared strings,
 * labels, numbers, RK values, cached formula results).
 */

import AdmZip from 'adm-zip';

const ENDOFCHAIN = 0xfffffffe;
const MAX_CELLS = 200000;

const isOle = (buf) => buf.length >= 512 && buf.readUInt32LE(0) === 0xe011cfd0 && buf.readUInt32LE(4) === 0xe11ab1a1;

/** Reads one named stream out of an OLE2 compound file. */
function readCompoundStream(buf, wantedNames) {
  if (!isOle(buf)) throw new Error('Not an OLE2 compound file');
  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const miniSectorSize = 1 << buf.readUInt16LE(0x20);
  const numFat = buf.readUInt32LE(0x2c);
  const firstDir = buf.readUInt32LE(0x30);
  const cutoff = buf.readUInt32LE(0x38);
  const firstMiniFat = buf.readUInt32LE(0x3c);
  let difatSector = buf.readUInt32LE(0x44);
  const numDifat = buf.readUInt32LE(0x48);
  if (![512, 4096].includes(sectorSize)) throw new Error('Unsupported OLE2 sector size');

  const sectorOffset = (s) => (s + 1) * sectorSize;
  const readSector = (s) => {
    const off = sectorOffset(s);
    if (off + sectorSize > buf.length) throw new Error('OLE2 sector out of range');
    return buf.subarray(off, off + sectorSize);
  };

  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < numFat; i += 1) fatSectors.push(buf.readUInt32LE(0x4c + i * 4));
  for (let guard = 0; difatSector < ENDOFCHAIN && fatSectors.length < numFat && guard <= numDifat; guard += 1) {
    const sector = readSector(difatSector);
    const perSector = sectorSize / 4 - 1;
    for (let i = 0; i < perSector && fatSectors.length < numFat; i += 1) fatSectors.push(sector.readUInt32LE(i * 4));
    difatSector = sector.readUInt32LE(perSector * 4);
  }
  const toTable = (sectors) => {
    const table = new Uint32Array((sectors.length * sectorSize) / 4);
    sectors.forEach((s, i) => {
      const data = readSector(s);
      for (let j = 0; j < sectorSize / 4; j += 1) table[i * (sectorSize / 4) + j] = data.readUInt32LE(j * 4);
    });
    return table;
  };
  const fat = toTable(fatSectors);
  const chain = (start, table) => {
    const out = [];
    const seen = new Set();
    for (let s = start; s < table.length; s = table[s]) {
      if (seen.has(s)) throw new Error('OLE2 sector chain loops');
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readChain = (start) => Buffer.concat(chain(start, fat).map(readSector));

  const dir = readChain(firstDir);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = Math.min(64, dir.readUInt16LE(o + 64));
    entries.push({
      name: dir.toString('utf16le', o, o + Math.max(0, nameLen - 2)),
      type: dir[o + 66],
      start: dir.readUInt32LE(o + 116),
      size: dir.readUInt32LE(o + 120),
    });
  }
  const root = entries[0];
  const entry = entries.find((e) => e.type === 2 && wantedNames.includes(e.name.toLowerCase()));
  if (!entry) throw new Error('Workbook stream not found');

  if (entry.size >= cutoff) return readChain(entry.start).subarray(0, entry.size);
  const miniStream = readChain(root.start).subarray(0, root.size);
  const miniFat = firstMiniFat < ENDOFCHAIN ? toTable(chain(firstMiniFat, fat)) : new Uint32Array(0);
  return Buffer.concat(chain(entry.start, miniFat).map((s) => miniStream.subarray(s * miniSectorSize, (s + 1) * miniSectorSize)))
    .subarray(0, entry.size);
}

/** Reads bytes across a record and its CONTINUE records, as BIFF8 strings require. */
class SegmentReader {
  constructor(segments) { this.segments = segments; this.i = 0; this.p = 0; }

  advance() {
    while (this.i < this.segments.length && this.p >= this.segments[this.i].length) { this.i += 1; this.p = 0; }
  }

  u8() {
    this.advance();
    const seg = this.segments[this.i];
    if (!seg) throw new Error('BIFF string ran past its record');
    return seg[this.p++];
  }

  u16() { return this.u8() | (this.u8() << 8); }

  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }

  skip(n) {
    let left = n;
    while (left > 0) {
      this.advance();
      const seg = this.segments[this.i];
      if (!seg) return;
      const take = Math.min(left, seg.length - this.p);
      this.p += take;
      left -= take;
    }
  }

  // Character data that crosses into a CONTINUE record restarts with a flag byte
  // saying whether the rest is 8-bit or UTF-16.
  chars(count, highByte) {
    const parts = [];
    let left = count;
    let wide = highByte;
    while (left > 0) {
      let seg = this.segments[this.i];
      if (seg && this.p >= seg.length) {
        this.i += 1;
        this.p = 0;
        seg = this.segments[this.i];
        if (!seg) break;
        wide = (seg[this.p++] & 1) === 1;
      }
      if (!seg) break;
      const width = wide ? 2 : 1;
      const n = Math.min(left, Math.floor((seg.length - this.p) / width));
      if (n === 0) { this.p = seg.length; continue; }
      parts.push(seg.toString(wide ? 'utf16le' : 'latin1', this.p, this.p + n * width));
      this.p += n * width;
      left -= n;
    }
    return parts.join('');
  }

  /** XLUnicodeRichExtendedString (SST entries) or XLUnicodeString (LABEL, STRING). */
  unicodeString({ rich = true } = {}) {
    const count = this.u16();
    const flags = this.u8();
    const runs = rich && (flags & 0x08) ? this.u16() : 0;
    const ext = rich && (flags & 0x04) ? this.u32() : 0;
    const text = this.chars(count, (flags & 0x01) === 1);
    this.skip(runs * 4 + ext);
    return text;
  }
}

function decodeRk(rk) {
  let value;
  if (rk & 0x02) {
    value = rk >> 2;
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
    value = b.readDoubleLE(0);
  }
  return rk & 0x01 ? value / 100 : value;
}

const tidyNumber = (n) => (Number.isFinite(n) ? String(Number(n.toPrecision(12))) : '');

function readRecords(stream) {
  const records = [];
  for (let pos = 0; pos + 4 <= stream.length;) {
    const type = stream.readUInt16LE(pos);
    const len = stream.readUInt16LE(pos + 2);
    records.push({ type, offset: pos, data: stream.subarray(pos + 4, pos + 4 + len) });
    pos += 4 + len;
  }
  return records;
}

/** Converts a BIFF8 .xls buffer into sheets of rows. */
export function parseXls(buffer) {
  const stream = readCompoundStream(buffer, ['workbook', 'book']);
  const records = readRecords(stream);
  const byOffset = new Map(records.map((r, i) => [r.offset, i]));
  const sheets = [];
  let sst = [];

  for (let i = 0; i < records.length; i += 1) {
    const { type, data } = records[i];
    if (type === 0x002f) throw new Error('Spreadsheet is password-encrypted');
    if (type === 0x0085 && data.length >= 8) {
      const reader = new SegmentReader([data.subarray(6)]);
      const count = reader.u8();
      const flags = reader.u8();
      sheets.push({ offset: data.readUInt32LE(0), hidden: data[4] !== 0, kind: data[5], name: reader.chars(count, (flags & 1) === 1) });
    } else if (type === 0x00fc) {
      const segments = [data];
      for (let j = i + 1; j < records.length && records[j].type === 0x003c; j += 1) segments.push(records[j].data);
      const reader = new SegmentReader(segments);
      reader.skip(4);
      const unique = reader.u32();
      sst = [];
      try {
        for (let k = 0; k < unique; k += 1) sst.push(reader.unicodeString());
      } catch { /* keep the strings read so far */ }
    } else if (type === 0x000a) {
      break; // end of the workbook globals
    }
  }

  const out = [];
  let cellCount = 0;
  for (const sheet of sheets.filter((s) => s.kind === 0)) {
    const start = byOffset.get(sheet.offset);
    if (start === undefined) continue;
    const cells = new Map();
    const put = (row, col, value) => {
      if (value === '' || value === null || value === undefined || cellCount >= MAX_CELLS) return;
      if (!cells.has(row)) cells.set(row, new Map());
      cells.get(row).set(col, String(value));
      cellCount += 1;
    };
    let pendingString = null;
    for (let i = start + 1; i < records.length; i += 1) {
      const { type, data } = records[i];
      if (type === 0x000a) break;
      try {
        if (type === 0x00fd && data.length >= 10) put(data.readUInt16LE(0), data.readUInt16LE(2), sst[data.readUInt32LE(6)]);
        else if (type === 0x0203 && data.length >= 14) put(data.readUInt16LE(0), data.readUInt16LE(2), tidyNumber(data.readDoubleLE(6)));
        else if (type === 0x027e && data.length >= 10) put(data.readUInt16LE(0), data.readUInt16LE(2), tidyNumber(decodeRk(data.readUInt32LE(6))));
        else if (type === 0x00bd && data.length >= 6) {
          const row = data.readUInt16LE(0);
          const firstCol = data.readUInt16LE(2);
          const n = Math.floor((data.length - 6) / 6);
          for (let k = 0; k < n; k += 1) put(row, firstCol + k, tidyNumber(decodeRk(data.readUInt32LE(4 + k * 6 + 2))));
        } else if (type === 0x0204 && data.length >= 9) {
          put(data.readUInt16LE(0), data.readUInt16LE(2), new SegmentReader([data.subarray(6)]).unicodeString({ rich: false }));
        } else if (type === 0x0006 && data.length >= 14) {
          const row = data.readUInt16LE(0);
          const col = data.readUInt16LE(2);
          if (data.readUInt16LE(12) !== 0xffff) put(row, col, tidyNumber(data.readDoubleLE(6)));
          else if (data[6] === 0) pendingString = { row, col };
          else if (data[6] === 1) put(row, col, data[8] ? 'TRUE' : 'FALSE');
        } else if (type === 0x0207 && pendingString) {
          const segments = [data];
          for (let j = i + 1; j < records.length && records[j].type === 0x003c; j += 1) segments.push(records[j].data);
          put(pendingString.row, pendingString.col, new SegmentReader(segments).unicodeString({ rich: false }));
          pendingString = null;
        } else if (type === 0x0205 && data.length >= 8 && data[7] === 0) {
          put(data.readUInt16LE(0), data.readUInt16LE(2), data[6] ? 'TRUE' : 'FALSE');
        }
      } catch { /* skip a malformed cell and keep reading */ }
    }
    out.push({ name: sheet.name, hidden: sheet.hidden, cells });
  }
  return out;
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');
const textRuns = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Converts an .xlsx buffer into sheets of rows. */
export function parseXlsx(buffer) {
  const zip = new AdmZip(buffer);
  const read = (name) => zip.getEntry(name)?.getData().toString('utf8') || '';
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]));
  const workbook = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  const target = (rid) => rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
    || rels.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
  const out = [];
  let cellCount = 0;
  for (const m of workbook.matchAll(/<sheet\s([^>]*)\/?>/g)) {
    const attrs = m[1];
    const name = decodeXml(attrs.match(/name="([^"]*)"/)?.[1] || 'Sheet');
    const rid = attrs.match(/r:id="([^"]+)"/)?.[1];
    const path = rid && target(rid);
    if (!path) continue;
    const xml = read(path.startsWith('/') ? path.slice(1) : `xl/${path}`);
    const cells = new Map();
    for (const c of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (cellCount >= MAX_CELLS) break;
      const ref = c[1].match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = c[1].match(/t="([^"]+)"/)?.[1];
      const body = c[2] || '';
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value;
      if (type === 's') value = shared[Number(raw)];
      else if (type === 'inlineStr') value = textRuns(body);
      else if (raw !== undefined) value = decodeXml(raw);
      if (value === undefined || value === '') continue;
      const row = Number(ref.match(/\d+/)[0]) - 1;
      if (!cells.has(row)) cells.set(row, new Map());
      cells.get(row).set(colIndex(ref), value);
      cellCount += 1;
    }
    out.push({ name, hidden: /state="(hidden|veryHidden)"/.test(attrs), cells });
  }
  return out;
}

/**
 * Renders sheets as text: one line per non-empty row, tab-separated, with
 * columns that are empty across the whole sheet dropped. NIC BOQ files keep
 * the BOQ on a sheet that is hidden until macros run, while the only visible
 * sheet says "Please Enable Macros", so sheets are chosen by content, not
 * visibility: one-or-two-row notice sheets are dropped when a fuller sheet exists.
 */
function chooseSheets(sheets) {
  const withContent = sheets.filter((s) => s.cells.size > 0);
  const substantial = withContent.filter((s) => s.cells.size > 2);
  return substantial.length ? substantial : withContent;
}

/** Each chosen sheet as non-empty rows of tidied cell values, empty columns dropped. */
function sheetRows(sheet) {
  const usedCols = [...new Set([...sheet.cells.values()].flatMap((row) => [...row.keys()]))].sort((a, b) => a - b);
  return [...sheet.cells.keys()].sort((a, b) => a - b).map((r) => {
    const row = sheet.cells.get(r);
    const values = usedCols.map((c) => (row.get(c) || '').replace(/\s+/g, ' ').trim());
    while (values.length && !values[values.length - 1]) values.pop();
    return values;
  }).filter((values) => values.some(Boolean));
}

export function sheetsToText(sheets) {
  return chooseSheets(sheets).map((sheet) => {
    const lines = sheetRows(sheet).map((values) => values.join('\t'));
    return `### Sheet: ${sheet.name}\n${lines.join('\n')}`;
  }).join('\n\n');
}

// A cell starting with = + - @ (or a tab/CR) is run as a formula by spreadsheet
// apps, so it is prefixed with ' unless it is a plain number such as -12.5.
const csvCell = (value) => {
  let v = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/**
 * Renders sheets as CSV: cell values only (formulas give their last
 * calculated result). Several BOQ sheets go one after another, each headed by
 * a "Sheet: <name>" row. Starts with a UTF-8 byte-order mark so Excel reads
 * Hindi and the rupee sign correctly.
 */
export function sheetsToCsv(sheets) {
  const chosen = chooseSheets(sheets);
  const blocks = chosen.map((sheet) => {
    const rows = sheetRows(sheet);
    if (chosen.length > 1) rows.unshift([`Sheet: ${sheet.name}`]);
    return rows.map((values) => values.map(csvCell).join(',')).join('\r\n');
  });
  return `\uFEFF${blocks.join('\r\n\r\n')}\r\n`;
}

const isXlsxZip = (buffer) => {
  try {
    return Boolean(new AdmZip(buffer).getEntry('xl/workbook.xml'));
  } catch {
    return false;
  }
};

/** Parses an .xls or .xlsx buffer by its contents, not its file name. */
export function parseSpreadsheet(buffer) {
  if (isOle(buffer)) return parseXls(buffer);
  if (isXlsxZip(buffer)) return parseXlsx(buffer);
  throw new Error('Not an Excel spreadsheet');
}

export const spreadsheetToText = (buffer, { xlsx = false } = {}) => sheetsToText(xlsx ? parseXlsx(buffer) : parseXls(buffer));
export const spreadsheetToCsv = (buffer) => sheetsToCsv(parseSpreadsheet(buffer));
export { isOle };
