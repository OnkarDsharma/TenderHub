/**
 * @file backend/src/services/tenderDocuments.service.js
 * @description Gathers the documents of one tender (NIT PDFs, the work-item
 * archive with its BOQ spreadsheet, extra work-item files and the GeM bid
 * document) and turns them into text an AI model can analyse.
 *
 * PDFs with a text layer become text. Scanned PDFs, which have no text, are
 * returned as files so a model that reads PDFs (Gemini) can read them
 * directly. Only files stored in the project's R2 bucket, or the official GeM
 * bid document, are fetched.
 */

import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import pino from 'pino';
import { getTenderR2Object } from '../utils/r2Storage.js';
import { spreadsheetToText, isOle } from '../utils/spreadsheetText.js';
import { GeMHttpClient } from './adapters/GeMAdapter.js';

const logger = pino();

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCES = 15;
const MAX_ARCHIVE_ENTRIES = 40;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
// A page with fewer readable characters than this is treated as scanned.
const MIN_CHARS_PER_PAGE = 40;
// Scanned PDFs are uploaded to Gemini's File API. Gemini bills each page as
// an image (~260 tokens), so the page cap bounds the cost of one analysis.
export const MAX_SCANNED_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_SCANNED_PAGES = 400;
export const DEFAULT_TEXT_BUDGET = 400000;

const PRIORITY = { NIT: 0, 'GeM bid document': 0, Corrigendum: 1, BOQ: 2, Specification: 3, 'Tender Documents': 3 };
const MAX_GEM_ATTACHMENTS = 12;
const priorityOf = (doc) => PRIORITY[doc.category] ?? (/boq/i.test(doc.name) ? 2 : 4);

const detectKind = (buffer, name = '') => {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (isOle(buffer)) return 'xls';
  if (buffer.readUInt32LE(0) === 0x04034b50) {
    const zip = new AdmZip(buffer);
    return zip.getEntry('xl/workbook.xml') ? 'xlsx' : 'zip';
  }
  if (buffer.subarray(0, 4).toString('latin1') === 'Rar!') return 'rar';
  const head = buffer.subarray(0, 2048).toString('utf8');
  if (/^\s*</.test(head) && /<(html|table)/i.test(head)) return 'html';
  if (/\.(csv|txt)$/i.test(name) && !head.includes('\u0000')) return 'text';
  return 'unknown';
};

const htmlToText = (html) => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<\/(td|th)>/gi, '\t')
  .replace(/<\/(tr|p|div|li|h\d)>|<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]*\n[ \t\n]*/g, '\n')
  .trim();

async function readPdfText(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { text: result.text || '', pages: result.total || result.pages?.length || 1 };
  } finally {
    await parser.destroy();
  }
}

async function downloadR2(url) {
  const object = await getTenderR2Object(url);
  if (object.ContentLength && object.ContentLength > MAX_FILE_BYTES) throw new Error('file is larger than 25 MB');
  const chunks = [];
  let size = 0;
  for await (const chunk of object.Body) {
    size += chunk.length;
    if (size > MAX_FILE_BYTES) throw new Error('file is larger than 25 MB');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const isR2Url = (url) => {
  try {
    const host = new URL(url).host;
    const configured = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).host : null;
    return host.endsWith('.r2.dev') || host === configured;
  } catch {
    return false;
  }
};
/**
 * The links a GeM bid PDF carries. Its "View File" links point to the buyer's
 * specification and BOQ files on mkp.gem.gov.in; only those uploads are kept,
 * not GeM's generic policy circulars.
 */
export function pickGeMAttachmentLinks(links) {
  const out = [];
  const seen = new Set();
  for (const link of links) {
    let url;
    try { url = new URL(link.url); } catch { continue; }
    if (url.protocol !== 'https:' || !['mkp.gem.gov.in', 'bidplus.gem.gov.in'].includes(url.host)) continue;
    if (!url.pathname.startsWith('/uploaded_documents/') || seen.has(url.href)) continue;
    seen.add(url.href);
    const category = /BoqLineItemsDocument/i.test(url.pathname) ? 'BOQ'
      : /BoqDocument|specification/i.test(url.pathname) ? 'Specification' : 'Bid attachment';
    out.push({ url: url.href, name: fileNameOf(url.href), category });
  }
  return out.slice(0, MAX_GEM_ATTACHMENTS);
}

async function readPdfLinks(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    return (info.pages || []).flatMap((page) => page.links || []);
  } finally {
    await parser.destroy();
  }
}

async function downloadPublic(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (TenderHub document reader)' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_FILE_BYTES) throw new Error('file is larger than 25 MB');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) throw new Error('file is larger than 25 MB');
  return buffer;
}

const isGeMUrl = (url) => {
  try { return new URL(url).host === 'bidplus.gem.gov.in'; } catch { return false; }
};
const fileNameOf = (url) => {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || url; } catch { return url; }
};

/** Lists the files a tender points to, without downloading them. */
export function listTenderSources(tender) {
  const sources = [];
  const seen = new Set();
  const add = (url, name, category) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({ url, name: name || fileNameOf(url), category });
  };
  for (const doc of tender.nitDocuments || []) add(doc.fileUrl, doc.documentName, /corrig/i.test(`${doc.description} ${doc.documentName}`) ? 'Corrigendum' : 'NIT');
  for (const doc of tender.workItemDocuments || []) add(doc.fileUrl, doc.documentName, doc.documentType || 'Work item document');
  add(tender.boqZipUrl || tender.boqFileUrl, tender.zipFileName, 'Work item archive');
  for (const url of tender.pdfUrls || []) add(url, null, tender.sourcePortal === 'GEM' ? 'GeM bid document' : 'Tender document');
  add(tender.gemPdfUrl, null, 'GeM bid document');
  return sources.slice(0, MAX_SOURCES);
}

/** Shares the character budget so short documents keep all their text. */
export function allocateTextBudget(lengths, budget) {
  const allowed = lengths.map(() => 0);
  let left = budget;
  let open = lengths.map((_, i) => i).filter((i) => lengths[i] > 0);
  while (open.length && left > 0) {
    const share = Math.floor(left / open.length);
    if (share === 0) break;
    const next = [];
    for (const i of open) {
      const take = Math.min(share, lengths[i] - allowed[i]);
      allowed[i] += take;
      left -= take;
      if (allowed[i] < lengths[i]) next.push(i);
    }
    open = next;
  }
  return allowed;
}

/**
 * Downloads and reads every document of a tender.
 * Returns the readable text documents (in priority order), the scanned PDFs
 * to attach as files, warnings about anything that could not be read, and a
 * hash of the documents so an unchanged tender can reuse its analysis.
 */
export async function collectTenderDocuments(tender, { textBudget = DEFAULT_TEXT_BUDGET } = {}) {
  const warnings = [];
  const docs = [];
  const fileHashes = new Set();
  // The same NIT is often attached twice under different names (Tendernotice_1.pdf
  // and nit52.pdf) with different bytes, so text is deduplicated too.
  const textHashes = new Set();
  const isDuplicateText = (text) => {
    const key = crypto.createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex');
    if (textHashes.has(key)) return true;
    textHashes.add(key);
    return false;
  };
  let gemClient = null;

  const addFile = async (buffer, name, category, depth = 0) => {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (fileHashes.has(hash)) return;
    fileHashes.add(hash);
    const kind = detectKind(buffer, name);
    try {
      if (kind === 'pdf') {
        const { text, pages } = await readPdfText(buffer);
        const readable = text.replace(/\s+/g, '').length;
        const scanned = readable < pages * MIN_CHARS_PER_PAGE;
        if (!scanned && isDuplicateText(text)) return;
        docs.push({ name, category, kind, pages, hash, text: scanned ? '' : text.trim(), scanned, buffer: scanned ? buffer : null });
      } else if (kind === 'xls' || kind === 'xlsx') {
        const text = spreadsheetToText(buffer, { xlsx: kind === 'xlsx' });
        if (isDuplicateText(text)) return;
        docs.push({ name, category: /boq/i.test(name) ? 'BOQ' : category, kind: 'spreadsheet', hash, text });
      } else if (kind === 'html' || kind === 'text') {
        const raw = buffer.toString('utf8');
        docs.push({ name, category, kind: 'text', hash, text: kind === 'html' ? htmlToText(raw) : raw });
      } else if (kind === 'zip') {
        if (depth > 1) { warnings.push(`${name}: nested archive skipped.`); return; }
        const entries = new AdmZip(buffer).getEntries().filter((e) => !e.isDirectory);
        if (entries.length > MAX_ARCHIVE_ENTRIES) warnings.push(`${name}: only the first ${MAX_ARCHIVE_ENTRIES} of ${entries.length} files were read.`);
        let total = 0;
        for (const entry of entries.slice(0, MAX_ARCHIVE_ENTRIES)) {
          total += entry.header.size;
          if (entry.header.size > MAX_FILE_BYTES || total > MAX_ARCHIVE_BYTES) {
            warnings.push(`${name}: ${entry.entryName} skipped (archive too large).`);
            continue;
          }
          await addFile(entry.getData(), entry.entryName.split('/').pop(), category, depth + 1);
        }
      } else if (kind === 'rar') {
        warnings.push(`${name}: RAR archives cannot be opened, so its contents were not analysed.`);
      } else {
        warnings.push(`${name}: unsupported file type, not analysed.`);
      }
    } catch (error) {
      warnings.push(`${name}: could not be read (${error.message}).`);
    }
  };

  const sources = listTenderSources(tender);
  const gemLinks = [];
  await Promise.all(sources.map(async (source) => {
    try {
      let buffer;
      if (isR2Url(source.url)) {
        buffer = await downloadR2(source.url);
      } else if (isGeMUrl(source.url)) {
        // The bid PDF is fetched even though its text is stored at sync time,
        // because its links lead to the specification and BOQ files.
        gemClient ||= new GeMHttpClient();
        buffer = await gemClient.downloadPdf(source.url);
        source.name = 'GeM bid document';
        gemLinks.push(...await readPdfLinks(buffer).catch(() => []));
      } else {
        warnings.push(`${source.name}: stored outside TenderHub, not fetched.`);
        return;
      }
      source.buffer = buffer;
    } catch (error) {
      warnings.push(`${source.name}: download failed (${error.message}).`);
    }
  }));
  const gemBidFetched = sources.some((s) => s.buffer && isGeMUrl(s.url));
  if (!gemBidFetched && tender.sourcePortal === 'GEM' && tender.gemRawText?.trim()) {
    // Fall back to the text stored at sync time; the attachments stay unknown.
    const text = tender.gemRawText.trim();
    docs.push({ name: 'GeM bid document', category: 'GeM bid document', kind: 'pdf', hash: crypto.createHash('sha256').update(text).digest('hex'), text });
    warnings.push('GeM bid document: could not be downloaded, so its specification and BOQ attachments were not analysed.');
    if (tender.gemRawTextTruncated) warnings.push('GeM bid document: only the first 120,000 characters were stored, the rest was not analysed.');
  }

  const attachments = pickGeMAttachmentLinks(gemLinks);
  await Promise.all(attachments.map(async (attachment) => {
    try {
      attachment.buffer = await downloadPublic(attachment.url);
    } catch (error) {
      warnings.push(`${attachment.name}: download failed (${error.message}).`);
    }
  }));

  // Read in a fixed order so results do not depend on download timing.
  for (const source of [...sources, ...attachments]) {
    if (source.buffer) await addFile(source.buffer, source.name, source.category);
    source.buffer = null;
  }

  docs.sort((a, b) => priorityOf(a) - priorityOf(b));

  const textDocs = docs.filter((d) => d.text);
  const allowed = allocateTextBudget(textDocs.map((d) => d.text.length), textBudget);
  textDocs.forEach((doc, i) => {
    doc.chars = doc.text.length;
    if (allowed[i] < doc.text.length) {
      doc.truncated = true;
      doc.text = doc.text.slice(0, allowed[i]);
      warnings.push(`${doc.name}: too long, only the first ${allowed[i].toLocaleString('en-IN')} of ${doc.chars.toLocaleString('en-IN')} characters were analysed.`);
    }
  });

  const scannedPdfs = [];
  let scannedBytes = 0;
  let scannedPages = 0;
  for (const doc of docs.filter((d) => d.scanned)) {
    if (scannedBytes + doc.buffer.length > MAX_SCANNED_PDF_BYTES || scannedPages + doc.pages > MAX_SCANNED_PAGES) {
      warnings.push(`${doc.name}: scanned PDF (${doc.pages} pages) left out, the scanned files together exceed ${MAX_SCANNED_PAGES} pages.`);
      doc.skipped = true;
      continue;
    }
    scannedBytes += doc.buffer.length;
    scannedPages += doc.pages;
    scannedPdfs.push(doc);
  }

  const documentHash = docs.length
    ? crypto.createHash('sha256').update(docs.map((d) => d.hash).sort().join(':')).digest('hex')
    : null;

  logger.info(`[TenderDocuments] ${tender.sourceTenderId}: ${textDocs.length} text documents, ${scannedPdfs.length} scanned PDFs, ${warnings.length} warnings.`);
  return {
    textDocuments: textDocs,
    scannedPdfs,
    warnings,
    documentHash,
    summary: docs.map((d) => ({
      name: d.name,
      category: d.category,
      kind: d.kind,
      method: d.scanned ? (d.skipped ? 'skipped' : 'scanned-pdf') : 'text',
      pages: d.pages,
      chars: d.chars || 0,
      truncated: Boolean(d.truncated),
    })),
  };
}
