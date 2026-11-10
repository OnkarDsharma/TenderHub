import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { parseXls, parseXlsx, sheetsToText, spreadsheetToText } from '../src/utils/spreadsheetText.js';
import { allocateTextBudget, listTenderSources } from '../src/services/tenderDocuments.service.js';
import { buildDossierPrompt, buildListingContext } from '../src/services/dossierPrompt.js';

const record = (type, data) => {
  const head = Buffer.alloc(4);
  head.writeUInt16LE(type, 0);
  head.writeUInt16LE(data.length, 2);
  return Buffer.concat([head, data]);
};
const cellHead = (row, col) => {
  const b = Buffer.alloc(6);
  b.writeUInt16LE(row, 0);
  b.writeUInt16LE(col, 2);
  return b;
};
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

/** A BIFF8 workbook: a hidden "BoQ1" sheet with real cells and a visible notice sheet. */
function buildWorkbookStream() {
  // SST: "Item Description", then "Excavation ₹" split across a CONTINUE
  // record whose flag byte switches the rest of the characters to UTF-16.
  const first = Buffer.concat([u16(16), Buffer.from([0]), Buffer.from('Item Description', 'latin1')]);
  const secondHead = Buffer.concat([u16(12), Buffer.from([0]), Buffer.from('Excavation', 'latin1')]);
  const sst = Buffer.concat([u32(2), u32(2), first, secondHead]);
  const cont = Buffer.concat([Buffer.from([1]), Buffer.from(' ₹', 'utf16le')]);

  const bof = record(0x0809, Buffer.alloc(16));
  const sheetName = (name) => Buffer.concat([Buffer.from([name.length, 0]), Buffer.from(name, 'latin1')]);
  const boundsheet = (offset, hidden, name) => record(0x0085, Buffer.concat([u32(offset), Buffer.from([hidden, 0]), sheetName(name)]));

  const number = (row, col, value) => { const b = Buffer.alloc(8); b.writeDoubleLE(value); return record(0x0203, Buffer.concat([cellHead(row, col), b])); };
  const rk = (row, col, int) => record(0x027e, Buffer.concat([cellHead(row, col), u32(((int << 2) | 2) >>> 0)]));
  const labelSst = (row, col, idx) => record(0x00fd, Buffer.concat([cellHead(row, col), u32(idx)]));
  const formulaString = (row, col) => {
    const value = Buffer.from([0, 0, 0, 0, 0, 0, 0xff, 0xff]);
    return record(0x0006, Buffer.concat([cellHead(row, col), value, Buffer.alloc(6)]));
  };
  const string = (text) => record(0x0207, Buffer.concat([u16(text.length), Buffer.from([0]), Buffer.from(text, 'latin1')]));

  const boqSheet = Buffer.concat([
    bof,
    labelSst(0, 1, 0), number(0, 3, 0), // header row
    labelSst(1, 1, 1), number(1, 3, 1250.5), rk(1, 5, 185),
    formulaString(2, 1), string('Total'), number(2, 5, 231342.5),
    record(0x000a, Buffer.alloc(0)),
  ]);
  const noticeSheet = Buffer.concat([bof, labelSst(0, 0, 0), record(0x000a, Buffer.alloc(0))]);

  const globalsWithout = (offA, offB) => Buffer.concat([
    bof, boundsheet(offA, 1, 'BoQ1'), boundsheet(offB, 0, 'Macros'),
    record(0x00fc, sst), record(0x003c, cont), record(0x000a, Buffer.alloc(0)),
  ]);
  const globalsLength = globalsWithout(0, 0).length;
  const globals = globalsWithout(globalsLength, globalsLength + boqSheet.length);
  return Buffer.concat([globals, boqSheet, noticeSheet]);
}

/** Wraps a stream in a minimal OLE2 compound file (512-byte sectors). */
function buildCompoundFile(stream) {
  const size = Math.max(stream.length, 4096);
  const data = Buffer.concat([stream, Buffer.alloc(Math.ceil(size / 512) * 512 - stream.length)]);
  const dataSectors = data.length / 512;
  const header = Buffer.alloc(512, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x3e, 0x18);
  header.writeUInt16LE(3, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(1, 0x2c); // one FAT sector
  header.writeUInt32LE(1, 0x30); // directory in sector 1
  header.writeUInt32LE(4096, 0x38);
  header.writeUInt32LE(0xfffffffe, 0x3c);
  header.writeUInt32LE(0xfffffffe, 0x44);
  for (let i = 0; i < 109; i += 1) header.writeUInt32LE(i === 0 ? 0 : 0xffffffff, 0x4c + i * 4);

  const fat = Buffer.alloc(512, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0);
  fat.writeUInt32LE(0xfffffffe, 4);
  for (let s = 0; s < dataSectors; s += 1) fat.writeUInt32LE(s === dataSectors - 1 ? 0xfffffffe : 3 + s, (2 + s) * 4);

  const dir = Buffer.alloc(512, 0);
  const entry = (i, name, type, start, length) => {
    const o = i * 128;
    Buffer.from(`${name}\0`, 'utf16le').copy(dir, o);
    dir.writeUInt16LE((name.length + 1) * 2, o + 64);
    dir[o + 66] = type;
    dir.writeUInt32LE(0xffffffff, o + 68);
    dir.writeUInt32LE(0xffffffff, o + 72);
    dir.writeUInt32LE(i === 0 ? 1 : 0xffffffff, o + 76);
    dir.writeUInt32LE(start, o + 116);
    dir.writeUInt32LE(length, o + 120);
  };
  entry(0, 'Root Entry', 5, 0xfffffffe, 0);
  entry(1, 'Workbook', 2, 2, data.length);
  return Buffer.concat([header, fat, dir, data]);
}

test('reads cell values from a BIFF8 .xls, including strings split across CONTINUE records', () => {
  const sheets = parseXls(buildCompoundFile(buildWorkbookStream()));
  assert.deepEqual(sheets.map((s) => [s.name, s.hidden]), [['BoQ1', true], ['Macros', false]]);
  const boq = sheets[0].cells;
  assert.equal(boq.get(1).get(1), 'Excavation ₹');
  assert.equal(boq.get(1).get(3), '1250.5');
  assert.equal(boq.get(1).get(5), '185');
  assert.equal(boq.get(2).get(1), 'Total');
});

test('keeps the macro-hidden BOQ sheet and drops the one-line "enable macros" sheet', () => {
  const text = spreadsheetToText(buildCompoundFile(buildWorkbookStream()));
  assert.match(text, /### Sheet: BoQ1/);
  assert.doesNotMatch(text, /### Sheet: Macros/);
  assert.match(text, /Excavation ₹\t1250\.5\t185/);
});

test('reads .xlsx shared strings and numbers', () => {
  const zip = new AdmZip();
  zip.addFile('xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="BoQ" sheetId="1" r:id="rId1"/></sheets></workbook>'));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'));
  zip.addFile('xl/sharedStrings.xml', Buffer.from('<sst><si><t>Item</t></si><si><t>Cement &amp; sand</t></si></sst>'));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>42</v></c></row><row r="3"><c r="A3" t="s"><v>0</v></c></row></sheetData>'));
  const text = sheetsToText(parseXlsx(zip.toBuffer()));
  assert.match(text, /Cement & sand\t42/);
});

test('shares the text budget so short documents are kept whole', () => {
  assert.deepEqual(allocateTextBudget([100, 5000, 5000], 3000), [100, 1450, 1450]);
  assert.deepEqual(allocateTextBudget([10, 20], 1000), [10, 20]);
});

test('lists NIT, work-item and GeM sources once each', () => {
  const sources = listTenderSources({
    sourcePortal: 'JK_TENDERS',
    nitDocuments: [{ documentName: 'Tendernotice_1.pdf', fileUrl: 'https://x.r2.dev/tenders/a/Tendernotice_1.pdf' }, { documentName: 'Corrigendum_1.pdf', description: 'Corrigendum', fileUrl: 'https://x.r2.dev/tenders/a/c.pdf' }],
    workItemDocuments: [{ documentName: 'BOQ_1.xls', documentType: 'BOQ' }],
    boqZipUrl: 'https://x.r2.dev/tenders/a/work_1.zip',
    pdfUrls: ['https://x.r2.dev/tenders/a/Tendernotice_1.pdf'],
  });
  assert.deepEqual(sources.map((s) => s.category), ['NIT', 'Corrigendum', 'Work item archive']);
});

test('prompt carries the documents, forbids filling gaps, and has no sample figures', () => {
  const tender = { sourcePortal: 'JK_TENDERS', title: 'Road work', estimatedValue: 0, closingDate: new Date('2026-12-01T00:00:00Z') };
  const prompt = buildDossierPrompt(tender, {
    textDocuments: [{ name: 'NIT.pdf', category: 'NIT', text: 'Clause 5: turnover Rs 2 crore' }],
    scannedPdfs: [{ name: 'SBD.pdf', category: 'Work item archive', pages: 40 }],
  });
  assert.match(prompt, /<document name="NIT.pdf" type="NIT">\nClause 5: turnover Rs 2 crore\n<\/document>/);
  assert.match(prompt, /SBD.pdf \(Work item archive, 40 pages, attached as a scanned PDF\)/);
  assert.match(prompt, /Do not use typical values/);
  assert.doesNotMatch(prompt, /8,400 Bags|IS 1489|0\.5% per week/);
  assert.match(buildListingContext(tender), /Tender value \(INR\): 0/);

  const empty = buildDossierPrompt(tender, { textDocuments: [], scannedPdfs: [] });
  assert.match(empty, /NO TENDER DOCUMENTS COULD BE READ/);
});
