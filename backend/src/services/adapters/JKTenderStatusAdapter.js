/**
 * @file backend/src/services/adapters/JKTenderStatusAdapter.js
 * @description Post-closing tender status scraper for NIC GePNIC portals (default: jktenders.gov.in).
 *
 * For every closed tender in our DB (bidding over, AOC not yet reached) it:
 *   1. Opens "Tenders Status" (WebTenderStatusLists), enters the Tender ID in Search Criteria III,
 *      solves the captcha and searches.
 *   2. Reads the "Tender Stage" of the result row and opens its Status page.
 *   3. Reads the stage table (Process 1/2 → Technical Bid Opening, Technical Evaluation, Financial Bid Opening,
 *      Financial Evaluation, AOC) with a completed flag per stage.
 *   4. Opens "Click link to view the all stage summary Details" and saves the PDF it gives.
 *   5. Opens that PDF and saves every file inside it: embedded attachments and links to further documents.
 *   6. Opens "View More Details" and each stage's "View" link, saving their text and any documents on them.
 *   7. Uploads every file to R2 under {tender folder}/status/ and stores everything in Tender.tenderStatusInfo.
 *
 * Documents are downloaded again only when the set of completed stages changes, and a tender is no longer
 * picked once its AOC stage is complete.
 *
 * Portal notes: the portal blocks the browser Back button (history.forward()), and its links open popup windows
 * via onclick (window.open) — the same URL opened any other way (new tab, even with Referer) is answered with
 * "Unauthorised Access". So links are clicked like a user would and the popup / download is captured.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import pino from 'pino';
import Tender from '../../models/Tender.js';
import TenderAlert from '../../models/TenderAlert.js';
import ContractorProfile from '../../models/ContractorProfile.js';
import { captchaService } from '../captcha.service.js';
import { uploadFileToR2, formatTenderStorageKey } from '../../utils/r2Storage.js';
import { withDbRetry } from '../../config/db.js';

const logger = pino();

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CAPTCHA_ATTEMPTS = 8;
const MAX_FAILS = 5;                 // Stop picking a tender after this many consecutive failures
const MAX_PDF_NESTING = 2;           // Summary PDF → files inside it → files inside those
const MAX_FILES_PER_TENDER = 40;
const MAX_STAGE_TEXT = 20000;
const DEBUG_DIR = path.resolve('logs', 'tender-status');
const LOCAL_FILES_DIR = path.join(DEBUG_DIR, 'files');

/** Anchors that belong to the page chrome (left menu, header, footer) rather than the tender content. */
const NAV_EXCLUDE = '.left_nav, #Menu, #header, #footer, .footer';

const sanitizeFileName = (name, fallback = 'document.pdf') => {
  const clean = String(name || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (clean || fallback).slice(0, 150);
};

const looksLikePdf = (buf) => buf && buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-';

export class JKTenderStatusAdapter {
  constructor(portalName = 'JK_TENDERS', baseUrl = 'https://jktenders.gov.in') {
    this.portalName = portalName;
    this.baseUrl = baseUrl;
    this.statusSearchUrl = `${baseUrl}/nicgep/app?page=WebTenderStatusLists&service=page`;
    this.browser = null;
    this.context = null;
    this.stats = this.emptyStats();
  }

  emptyStats() {
    return {
      checked: 0, updated: 0, unchanged: 0, notFound: 0, failed: 0, aocReached: 0, alerts: 0,
      filesSaved: 0, captchaAttempts: 0, captchaSolved: 0
    };
  }

  /**
   * Closed tenders that still need a status check: bidding over, bids already opened (before that the
   * portal has nothing to show), AOC not complete, not checked in the last `recheckHours`, and not
   * failing repeatedly.
   */
  buildSelectionQuery({ maxAgeDays = 180, recheckHours = 20 } = {}) {
    const now = Date.now();
    return {
      sourcePortal: this.portalName,
      isDelisted: { $ne: true },
      status: { $ne: 'CANCELLED' },
      closingDate: { $lt: new Date(now), $gte: new Date(now - maxAgeDays * DAY_MS) },
      'tenderStatusInfo.isAocDone': { $ne: true },
      // Cancelled / retendered on the portal is final too (also matches tenders never checked: field missing)
      'tenderStatusInfo.currentStage': { $not: /cancel|retender/i },
      $and: [
        { $or: [
          { bidOpeningDate: { $exists: false } },
          { bidOpeningDate: null },
          { bidOpeningDate: { $lte: new Date(now) } }
        ] },
        { $or: [
          { 'tenderStatusInfo.checkedAt': { $exists: false } },
          { 'tenderStatusInfo.checkedAt': null },
          { 'tenderStatusInfo.checkedAt': { $lt: new Date(now - recheckHours * 60 * 60 * 1000) } }
        ] },
        { $or: [
          { 'tenderStatusInfo.failCount': { $exists: false } },
          { 'tenderStatusInfo.failCount': { $lt: MAX_FAILS } }
        ] }
      ]
    };
  }

  /**
   * Main entry point.
   * @param {Object} options
   * @param {string} [options.tenderId] - Check one tender (ignores the selection filters)
   * @param {number} [options.limit=50] - Max tenders per run
   * @param {boolean} [options.headless=true]
   * @param {boolean} [options.force=false] - Re-download documents even if no stage changed
   * @param {number} [options.maxAgeDays=180] - Only tenders that closed within this many days
   * @param {number} [options.maxMinutes] - Stop picking new tenders after this many minutes
   * @param {boolean} [options.local=false] - Save files to logs/tender-status/files/ and print the result;
   *   no DB or R2 writes. Used automatically when --id is not in our DB.
   */
  async fetchTenderStatuses(options = {}) {
    const { tenderId, limit = 50, headless = true, force = false, maxAgeDays = 180, maxMinutes, local = false } = options;
    const startedAt = Date.now();
    this.stats = this.emptyStats();

    const query = tenderId
      ? { sourcePortal: this.portalName, sourceTenderId: tenderId }
      : this.buildSelectionQuery({ maxAgeDays });

    let tenders = await withDbRetry(() => Tender.find(query)
      .select('sourceTenderId title publishedDate departmentCode organisationChain r2StorageKey tenderStatusInfo closingDate')
      // Never-checked first (null sorts first), then least recently checked; within each, oldest closing first —
      // older tenders are the likeliest to have reached AOC, so they finish in one visit and drop out.
      .sort({ 'tenderStatusInfo.checkedAt': 1, closingDate: 1 })
      .limit(tenderId ? 1 : limit)
      .lean());

    console.log(`\n======================================================================`);
    console.log(`📋 TENDER STATUS SCRAPER — ${this.portalName}`);
    console.log(`======================================================================`);
    console.log(`🎯 Tenders selected: ${tenders.length}${tenderId ? ` (single: ${tenderId})` : ` (limit ${limit}, closed within ${maxAgeDays} days)`}`);
    console.log(`======================================================================\n`);

    if (tenders.length === 0 && tenderId) {
      console.log(`ℹ️ ${tenderId} is not in our DB — scraping the portal in LOCAL mode (files saved to ${LOCAL_FILES_DIR}, no DB/R2 writes).`);
      tenders = [{ _id: null, sourceTenderId: tenderId }];
    }
    if (tenders.length === 0) return { ...this.stats };
    if (local) tenders = tenders.map((t) => ({ ...t, _id: null }));

    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    this.context = await this.browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    try {
      for (let i = 0; i < tenders.length; i++) {
        if (maxMinutes && Date.now() - startedAt > maxMinutes * 60 * 1000) {
          console.log(`⏱️ Time budget of ${maxMinutes} min reached — stopping.`);
          break;
        }
        const tender = tenders[i];
        console.log(`\n👉 [${i + 1}/${tenders.length}] ${tender.sourceTenderId}`);
        this.stats.checked++;
        try {
          await this.processTender(tender, { force });
        } catch (err) {
          this.stats.failed++;
          logger.error(`[TenderStatus] ${tender.sourceTenderId} failed: ${err.message}`);
          console.log(`   ❌ Failed: ${err.message}`);
          await this.markFailure(tender, err.message);
        }
        // Keep a human-like pace between searches
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      }
    } finally {
      await this.closeBrowser();
    }

    const s = this.stats;
    console.log(`\n======================================================================`);
    console.log(`📊 TENDER STATUS METRICS`);
    console.log(`======================================================================`);
    console.log(`🔎 Checked:                 ${s.checked}`);
    console.log(`🆕 Updated (stage changed): ${s.updated}`);
    console.log(`⏸️ Unchanged:               ${s.unchanged}`);
    console.log(`🏁 AOC reached:             ${s.aocReached}`);
    console.log(`❓ Not found on portal:     ${s.notFound}`);
    console.log(`❌ Failed:                  ${s.failed}`);
    console.log(`📄 Files saved:            ${s.filesSaved}`);
    console.log(`🔔 Saved-tender alerts:     ${s.alerts}`);
    console.log(`🔐 Captchas tried / solved: ${s.captchaAttempts} / ${s.captchaSolved}`);
    console.log(`⏱️ Duration:                ${Math.round((Date.now() - startedAt) / 1000)}s`);
    console.log(`======================================================================\n`);
    return { ...s };
  }

  async processTender(tender, { force = false } = {}) {
    const page = await this.context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    try {
      const result = await this.searchTender(page, tender.sourceTenderId);
      if (result.notFound) {
        this.stats.notFound++;
        console.log(`   ❓ Not listed on the Tender Status page.`);
        await this.saveStatus(tender, { fetchStatus: 'NOT_FOUND', countAsFailure: true });
        return;
      }
      console.log(`   📍 Tender Stage: ${result.currentStage || '(blank)'}`);

      // Open the Status page of the matched row
      const statusOpen = await this.followLink(page, result.statusLinkSelector);
      if (statusOpen.type !== 'page') throw new Error('Status link did not open a page');
      const statusPage = statusOpen.page;

      const parsed = await this.parseStatusPage(statusPage);
      if (!tender._id) await this.dumpDebug(statusPage, tender.sourceTenderId, 'status_page');
      for (const s of parsed.stages) {
        logger.debug?.(`[TenderStatus] stage "${s.name}" completed=${s.completed} imgs=${s.imgInfo}`);
        if (!tender._id) console.log(`      · ${s.name}: ${s.completed ? '✓' : '—'}${s.imgInfo ? `  [img: ${s.imgInfo}]` : ''}`);
        delete s.imgInfo;
      }
      const completed = parsed.stages.filter((s) => s.completed).map((s) => s.name);
      console.log(`   ✅ Completed stages: ${completed.length ? completed.join(', ') : 'none'}`);

      const isAocDone = parsed.stages.some((s) => s.completed && /\b(AOC|award)/i.test(s.name));
      const isFinal = isAocDone || /cancel|retender/i.test(result.currentStage || '');
      const stageSignature = `${completed.join('|')}#${result.currentStage || ''}`;
      const previous = (tender._id && tender.tenderStatusInfo) || {};
      const changed = force || previous.stageSignature !== stageSignature || !(previous.documents || []).length;

      if (!changed) {
        this.stats.unchanged++;
        console.log(`   ⏸️ No stage change since last check — skipping downloads.`);
        await this.saveStatus(tender, {
          currentStage: result.currentStage, stages: parsed.stages, isAocDone, stageSignature, fetchStatus: 'COMPLETED'
        });
        if (statusPage !== page) await statusPage.close().catch(() => {});
        return;
      }

      const ctx = this.newDocContext(tender);

      // Stage summary PDF (+ everything inside it)
      if (parsed.summaryLinkSelector) {
        await this.collectFromLink(statusPage, parsed.summaryLinkSelector, ctx, 'STAGE_SUMMARY', 'All Stage Summary');
      } else {
        console.log(`   ⚠️ "View all stage summary" link not found.`);
      }

      // "View More Details" and per-stage "View" pages
      for (const link of parsed.detailLinks) {
        await this.collectFromLink(statusPage, link.selector, ctx, 'STAGE_PAGE', link.label);
      }

      if (statusPage !== page) await statusPage.close().catch(() => {});

      await this.saveStatus(tender, {
        currentStage: result.currentStage,
        stages: parsed.stages,
        isAocDone,
        stageSignature,
        stageDetails: ctx.stageDetails,
        documents: ctx.documents,
        fetchStatus: 'COMPLETED'
      });

      this.stats.updated++;
      if (isAocDone) this.stats.aocReached++;

      if (previous.stageSignature !== stageSignature) {
        await this.alertSavers(tender, { previous, currentStage: result.currentStage, completed, isAocDone, stageSignature });
      }
      console.log(`   💾 Saved: ${ctx.documents.length} file(s), ${ctx.stageDetails.length} detail page(s)${isFinal ? ` — ${isAocDone ? 'AOC reached' : result.currentStage}, will stop tracking` : ''}`);
    } catch (err) {
      await this.dumpDebug(page, tender.sourceTenderId, 'error');
      throw err;
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Search (Criteria III: Tender ID + captcha)
  // ---------------------------------------------------------------------------

  async searchTender(page, tenderId) {
    let notFoundCount = 0;
    for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
      await page.goto(this.statusSearchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#tenderId', { timeout: 30000 });
      await page.fill('#tenderId', tenderId);

      const captchaImg = page.locator('#captchaImage').first();
      await captchaImg.waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(800);
      const imgBuffer = await captchaImg.screenshot().catch(() => null);
      if (!imgBuffer) continue;

      this.stats.captchaAttempts++;
      const { text: solved, provider } = await captchaService.solveImageCaptcha(imgBuffer).catch(() => ({}));
      // The portal's form only submits a 6-character captcha (anything else just raises an alert)
      if (!solved || solved.trim().length !== 6) {
        console.log(`   ↩️ Attempt ${attempt}: solver returned "${solved || ''}" (not 6 characters) — new captcha`);
        continue;
      }
      logger.info(`[TenderStatus Captcha] Attempt ${attempt}/${MAX_CAPTCHA_ATTEMPTS} (${provider}): "${solved}"`);

      await page.fill('#captchaText', solved);
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {}),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        page.click('#Search')
      ]);
      await page.waitForTimeout(1200);

      const outcome = await page.evaluate((id) => {
        const bodyText = document.body ? document.body.innerText : '';
        const rows = Array.from(document.querySelectorAll('tr')).filter((tr) =>
          tr.querySelectorAll('td').length >= 4 && tr.innerText.includes(id));
        // Innermost matching row (nested layout tables also contain the text)
        const row = rows.find((r) => !rows.some((o) => o !== r && r.contains(o)));
        if (row) {
          const table = row.closest('table');
          const headerCells = Array.from(table.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((c) => c.innerText.trim()))
            .find((cells) => cells.some((c) => /Tender\s*Stage/i.test(c))) || [];
          const cells = Array.from(row.querySelectorAll('td'));
          const stageIdx = headerCells.findIndex((c) => /Tender\s*Stage/i.test(c));
          const statusIdx = headerCells.findIndex((c) => /^Status$/i.test(c));
          const currentStage = (cells[stageIdx >= 0 ? stageIdx : cells.length - 2]?.innerText || '').trim();
          const statusCell = cells[statusIdx >= 0 ? statusIdx : cells.length - 1];
          const anchors = Array.from((statusCell || row).querySelectorAll('a'));
          const link = anchors.find((a) => a.querySelector('img')) || anchors[anchors.length - 1];
          if (link) link.setAttribute('data-ts-status', '1');
          return { found: true, currentStage, hasLink: !!link };
        }
        // The portal's own message line (error / info text), for logs
        const msgLine = bodyText.split('\n').map((l) => l.trim())
          .find((l) => /captcha|record|no\s+tender|not\s+found|invalid|error/i.test(l) && l.length < 200
            && !/^Provide Captcha|^Enter Captcha|Tender status finds search/i.test(l)) || '';
        if (/(invalid|incorrect|wrong)\s+captcha|captcha.{0,20}(invalid|incorrect|wrong|mismatch)/i.test(bodyText)) {
          return { captchaError: true, message: msgLine };
        }
        if (/no\s+(records?|tenders?|data)\s+(found|available)|records?\s+not\s+found/i.test(bodyText)) {
          return { notFound: true, message: msgLine };
        }
        return { unknown: true, message: msgLine };
      }, tenderId);

      if (!outcome.found) {
        const kind = outcome.notFound ? 'not-found' : outcome.captchaError ? 'captcha-error' : 'unknown';
        console.log(`   ↩️ Attempt ${attempt}: ${kind}${outcome.message ? ` — portal says: "${outcome.message}"` : ''}`);
        await this.dumpDebug(page, tenderId, `search_${attempt}_${kind}`);
      }

      if (outcome.found) {
        this.stats.captchaSolved++;
        if (!outcome.hasLink) throw new Error('Result row has no Status link');
        return { currentStage: outcome.currentStage, statusLinkSelector: 'a[data-ts-status="1"]' };
      }
      if (outcome.notFound) {
        // A wrong captcha can also come back as "no records": only trust it after two separate solves agree
        notFoundCount++;
        if (notFoundCount >= 2) {
          this.stats.captchaSolved++;
          return { notFound: true };
        }
      }
      // captchaError / unknown / first not-found → new captcha on the next loop iteration
    }
    if (notFoundCount > 0) return { notFound: true };
    throw new Error(`Search did not succeed after ${MAX_CAPTCHA_ATTEMPTS} captcha attempts`);
  }

  // ---------------------------------------------------------------------------
  // Status page
  // ---------------------------------------------------------------------------

  async parseStatusPage(page) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    return page.evaluate((navExclude) => {
      const inNav = (el) => !!el.closest(navExclude);
      const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');

      // Stage table: the innermost table whose header row has "Stages"
      const tables = Array.from(document.querySelectorAll('table')).filter((t) =>
        Array.from(t.querySelectorAll('tr')).some((tr) => /^\s*Stages?\s*$/i.test(text(tr.children[0] || tr))));
      const stageTable = tables.find((t) => !tables.some((o) => o !== t && t.contains(o)));

      const stages = [];
      const detailLinks = [];
      let linkCounter = 0;
      const tag = (a, label) => {
        const attr = `ts-link-${linkCounter++}`;
        a.setAttribute('data-ts-link', attr);
        detailLinks.push({ selector: `a[data-ts-link="${attr}"]`, label });
      };

      if (stageTable) {
        let process = '';
        for (const tr of Array.from(stageTable.querySelectorAll('tr'))) {
          if (tr.closest('table') !== stageTable) continue;
          const cells = Array.from(tr.children);
          const name = text(cells[0]);
          if (!name || /^Stages?$/i.test(name)) continue;
          const rest = cells.slice(1);
          const restText = rest.map(text).join(' ');
          if (/^Process\s*\d+/i.test(name) && !restText && !rest.some((c) => c.querySelector('img'))) {
            process = name;
            continue;
          }
          // Every row may hold an image (blank spacer for pending stages), so judge what the image is
          const imgs = rest.flatMap((c) => Array.from(c.querySelectorAll('img')))
            .filter((img) => img.offsetWidth > 0 || img.offsetHeight > 0 || !img.complete);
          const imgInfo = imgs.map((img) => `${img.getAttribute('src') || ''} ${img.getAttribute('alt') || ''} ${img.getAttribute('title') || ''}`);
          const isTickImg = (info) => /tick|right|check|correct|ok\.|yes|done|complete|green|success/i.test(info)
            && !/blank|spacer|cross|wrong|pending|no\.|not|red|incomplete/i.test(info);
          const completed = /[✓✔√]|completed|yes|done/i.test(restText) || imgInfo.some(isTickImg);
          stages.push({ process, name, completed, imgInfo: imgInfo.join(' | ') });
          for (const a of Array.from(tr.querySelectorAll('a'))) tag(a, name);
        }
      }

      let summaryLinkSelector = null;
      for (const a of Array.from(document.querySelectorAll('a'))) {
        if (inNav(a) || a.hasAttribute('data-ts-link')) continue;
        const label = text(a) || a.getAttribute('title') || '';
        if (/stage\s+summary/i.test(label)) {
          a.setAttribute('data-ts-summary', '1');
          summaryLinkSelector = 'a[data-ts-summary="1"]';
        } else if (/view\s+more\s+details/i.test(label)) {
          tag(a, 'View More Details');
        }
      }

      return { stages, summaryLinkSelector, detailLinks };
    }, NAV_EXCLUDE);
  }

  // ---------------------------------------------------------------------------
  // Link following (click like a user: popups / downloads; new tab only as fallback; never Back)
  // ---------------------------------------------------------------------------

  /**
   * Opens a link and reports what it produced: a download, a PDF body, a page (popup or same tab), or nothing.
   *
   * Links are clicked exactly like a user would: the portal's onclick handlers open real popup windows
   * (window.open) and the server answers "Unauthorised Access" to the same URL opened any other way.
   * Only when the click produces nothing is the href opened in a new tab (with Referer) as a fallback.
   */
  async followLink(page, selector) {
    const link = page.locator(selector).first();
    if (!(await link.count())) return { type: 'none' };

    const clicked = await this.clickLink(page, link);
    if (clicked.type !== 'none') return clicked;

    const rawHref = await link.getAttribute('href').catch(() => null);
    if (!rawHref || /^\s*(javascript:|#)/i.test(rawHref) || page.isClosed()) return clicked;
    return this.openInNewTab(page, new URL(rawHref, page.url()).href);
  }

  /** Clicks a link and waits for a popup, a download or a same-tab navigation. */
  async clickLink(page, link) {
    // PDF responses anywhere in the context (a popup's first response can arrive before we can hook the popup)
    const pdfResponses = [];
    const onResponse = (r) => {
      if (/application\/(pdf|octet-stream|zip|x-download|force-download)/i.test(r.headers()['content-type'] || '')) pdfResponses.push(r);
    };
    this.context.on('response', onResponse);

    try {
      const never = new Promise(() => {});
      const popupP = page.waitForEvent('popup', { timeout: 20000 }).then((p) => ({ type: 'popup', page: p })).catch(() => never);
      const downloadP = page.waitForEvent('download', { timeout: 20000 }).then((d) => ({ type: 'download', download: d })).catch(() => never);
      const navP = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).then(() => ({ type: 'nav' })).catch(() => never);
      const timeoutP = new Promise((r) => setTimeout(() => r({ type: 'none' }), 21000));

      await link.click({ timeout: 10000 }).catch(() => {});
      const first = await Promise.race([popupP, downloadP, navP, timeoutP]);

      if (first.type === 'download') return first;
      if (first.type === 'nav') return { type: 'page', page };
      if (first.type !== 'popup') {
        const resp = pdfResponses[0];
        if (resp) {
          const body = await resp.body().catch(() => null);
          if (body) return { type: 'buffer', buffer: body, fileName: this.fileNameFromHeaders(resp.headers()) };
        }
        return { type: 'none' };
      }

      // Popup: it may render HTML, trigger a download, or show a PDF in the viewer
      const popup = first.page;
      popup.on('dialog', (d) => d.dismiss().catch(() => {}));
      const popupDownloadP = popup.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await popup.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      const settle = await Promise.race([
        popupDownloadP.then((d) => (d ? { type: 'download', download: d } : never)),
        new Promise((r) => setTimeout(() => r(null), 4000))
      ]);
      if (settle) return { ...settle, tab: popup };

      const resp = pdfResponses.find((r) => { try { return r.frame().page() === popup; } catch { return false; } }) || pdfResponses[0];
      if (resp) {
        const body = await resp.body().catch(() => null);
        if (body) {
          await popup.close().catch(() => {});
          return { type: 'buffer', buffer: body, fileName: this.fileNameFromHeaders(resp.headers()) };
        }
      }
      if (popup.isClosed()) return { type: 'none' };
      return { type: 'page', page: popup };
    } finally {
      this.context.off('response', onResponse);
    }
  }

  /** Fallback: opens an href in a fresh tab of the same session. */
  async openInNewTab(page, href) {
    const tab = await this.context.newPage();
    tab.on('dialog', (d) => d.dismiss().catch(() => {}));
    const downloadP = tab.waitForEvent('download', { timeout: 45000 }).catch(() => null);
    // Headless Chromium turns PDF / attachment responses into a download (goto then rejects)
    const resp = await tab.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000, referer: page.url() }).catch(() => null);
    if (!resp) {
      const download = await downloadP;
      if (download) return { type: 'download', download, tab };
      await tab.close().catch(() => {});
      return { type: 'none' };
    }
    // Headed Chromium shows a PDF in its viewer instead: take the response body
    if (/application\/(pdf|octet-stream|zip)/i.test(resp.headers()['content-type'] || '')) {
      const body = await resp.body().catch(() => null);
      await tab.close().catch(() => {});
      return body ? { type: 'buffer', buffer: body, fileName: this.fileNameFromHeaders(resp.headers()) } : { type: 'none' };
    }
    return { type: 'page', page: tab };
  }

  fileNameFromHeaders(headers = {}) {
    const cd = headers['content-disposition'] || '';
    const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /**
   * Follows a link and stores whatever it leads to:
   *   download / PDF body → stored (and its inner files)
   *   HTML page → text saved as stage detail, plus every document link on it
   */
  async collectFromLink(page, selector, ctx, source, label) {
    if (ctx.documents.length >= MAX_FILES_PER_TENDER) return;
    const res = await this.followLink(page, selector);

    if (res.type === 'download') {
      await this.storeDownload(res.download, ctx, source, null, label);
      if (res.tab) await res.tab.close().catch(() => {});
      return;
    }
    if (res.type === 'buffer') {
      await this.storeBuffer(res.buffer, res.fileName || `${label}.pdf`, ctx, source, null);
      return;
    }
    if (res.type !== 'page') {
      console.log(`   ⚠️ "${label}" link produced nothing.`);
      return;
    }

    const target = res.page;
    try {
      await target.waitForLoadState('domcontentloaded').catch(() => {});
      await target.waitForTimeout(800);

      const bodyText = await target.locator('body').innerText().catch(() => '');
      if (/Unauthori[sz]ed Access|could not verify that you are authori[sz]ed/i.test(bodyText)) {
        console.log(`   ⛔ "${label}": portal answered "Unauthorised Access" — skipped.`);
        await this.dumpDebug(target, ctx.tenderId, `unauthorised_${sanitizeFileName(label)}`);
        return;
      }

      const content = await target.evaluate((navExclude) => {
        // This tab is thrown away afterwards, so the chrome can be removed in place (innerText needs live layout)
        const root = document.querySelector('#content') || document.body;
        root.querySelectorAll(navExclude).forEach((n) => { n.style.display = 'none'; });
        return root.innerText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      }, NAV_EXCLUDE).catch(() => '');
      if (content) ctx.stageDetails.push({ stage: label, content: content.slice(0, MAX_STAGE_TEXT) });

      // Document links on this page (PDF icons, download links)
      const docSelectors = await target.evaluate((navExclude) => {
        const out = [];
        let n = 0;
        for (const a of Array.from(document.querySelectorAll('a'))) {
          if (a.closest(navExclude)) continue;
          const href = a.getAttribute('href') || '';
          const label = `${a.innerText} ${a.getAttribute('title') || ''} ${href} ${a.innerHTML}`;
          if (/^(back|refresh|clear|print)$/i.test(a.innerText.trim())) continue;
          if (/\.pdf|download|pdf\.(gif|png|jpg)|docDownoad|DocDownload|DirectLink.*doc|\.xlsx?|\.zip/i.test(label)) {
            const attr = `ts-doc-${n++}`;
            a.setAttribute('data-ts-doc', attr);
            out.push({ selector: `a[data-ts-doc="${attr}"]`, label: (a.innerText || a.getAttribute('title') || 'document').trim() });
          }
        }
        return out;
      }, NAV_EXCLUDE).catch(() => []);

      let gotFile = false;
      for (const doc of docSelectors) {
        if (ctx.documents.length >= MAX_FILES_PER_TENDER) break;
        const r = await this.followLink(target, doc.selector);
        if (r.type === 'download') {
          gotFile = (await this.storeDownload(r.download, ctx, source, label, doc.label)) || gotFile;
          if (r.tab) await r.tab.close().catch(() => {});
        } else if (r.type === 'buffer') {
          gotFile = (await this.storeBuffer(r.buffer, r.fileName || `${doc.label}.pdf`, ctx, source, label)) || gotFile;
        } else if (r.type === 'page' && r.page !== target) {
          await r.page.close().catch(() => {});
        }
      }

      // The summary must end up as a PDF: if the page offered none, print the page itself
      if (source === 'STAGE_SUMMARY' && !gotFile) {
        const buf = await target.pdf({ format: 'A4', printBackground: true }).catch(() => null);
        if (buf) await this.storeBuffer(buf, `stage_summary_${ctx.tenderId}.pdf`, ctx, source, null);
      }
    } finally {
      if (target !== page) await target.close().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // File storage + PDF inspection
  // ---------------------------------------------------------------------------

  newDocContext(tender) {
    const folderKey = tender.r2StorageKey
      || formatTenderStorageKey(tender.sourceTenderId, tender.publishedDate, tender.departmentCode || tender.organisationChain);
    return {
      tenderId: tender.sourceTenderId,
      r2Folder: `${folderKey}/status`,
      localDir: tender._id ? null : path.join(LOCAL_FILES_DIR, sanitizeFileName(tender.sourceTenderId)),
      documents: [],
      stageDetails: [],
      seenHashes: new Set(),
      seenNames: new Set(),
      seenUrls: new Set()
    };
  }

  async storeDownload(download, ctx, source, parent, label) {
    const tmp = await download.path().catch(() => null);
    if (!tmp || !fs.existsSync(tmp)) return false;
    const buf = fs.readFileSync(tmp);
    return this.storeBuffer(buf, download.suggestedFilename() || `${label || 'document'}.pdf`, ctx, source, parent);
  }

  /** Uploads one file to R2 (deduped by content) and, for PDFs, also the files inside it. */
  async storeBuffer(buffer, rawName, ctx, source, parent, depth = 0) {
    if (!buffer || !buffer.length || ctx.documents.length >= MAX_FILES_PER_TENDER) return false;
    const hash = crypto.createHash('sha1').update(buffer).digest('hex');
    if (ctx.seenHashes.has(hash)) return false;
    ctx.seenHashes.add(hash);

    let fileName = sanitizeFileName(rawName);
    if (looksLikePdf(buffer) && !/\.pdf$/i.test(fileName)) fileName += '.pdf';
    if (ctx.seenNames.has(fileName)) fileName = fileName.replace(/(\.[^.]+)?$/, `_${hash.slice(0, 6)}$1`);
    ctx.seenNames.add(fileName);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tender-status-'));
    const tmpPath = path.join(tmpDir, fileName);
    try {
      fs.writeFileSync(tmpPath, buffer);
      let fileUrl;
      if (ctx.localDir) {
        fs.mkdirSync(ctx.localDir, { recursive: true });
        fileUrl = path.join(ctx.localDir, fileName);
        fs.copyFileSync(tmpPath, fileUrl);
      } else {
        fileUrl = await uploadFileToR2({ filePath: tmpPath, fileName, tenderId: ctx.r2Folder });
      }
      if (!fileUrl) return false;
      ctx.documents.push({
        documentName: fileName,
        source,
        ...(parent ? { parentDocument: parent } : {}),
        documentSizeKb: Math.max(1, Math.round(buffer.length / 1024)),
        fileUrl
      });
      this.stats.filesSaved++;
      console.log(`   📄 ${source}: ${fileName}${parent ? ` (inside ${parent})` : ''}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    if (looksLikePdf(buffer) && depth < MAX_PDF_NESTING) {
      await this.extractFromPdf(buffer, fileName, ctx, depth + 1);
    }
    return true;
  }

  /** Saves files embedded in a PDF (attachments) and documents it links to. */
  async extractFromPdf(buffer, parentName, ctx, depth) {
    let doc;
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0
      }).promise;
    } catch (err) {
      logger.warn(`[TenderStatus] Could not open ${parentName}: ${err.message}`);
      return;
    }

    try {
      // 1. Document-level attachments
      const attachments = (await doc.getAttachments().catch(() => null)) || {};
      for (const [key, att] of Object.entries(attachments)) {
        if (att?.content) {
          await this.storeBuffer(Buffer.from(att.content), att.filename || key, ctx, 'EMBEDDED_IN_PDF', parentName, depth);
        }
      }

      // 2. Per-page file-attachment annotations and link annotations
      const urls = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const pg = await doc.getPage(p);
        const annots = await pg.getAnnotations().catch(() => []);
        for (const a of annots) {
          if (a.subtype === 'FileAttachment' && a.file?.content) {
            await this.storeBuffer(Buffer.from(a.file.content), a.file.filename || `attachment_p${p}`, ctx, 'EMBEDDED_IN_PDF', parentName, depth);
          } else if (a.subtype === 'Link' && a.url) {
            urls.push(a.url);
          }
        }
        // Plain-text URLs pointing back to the portal
        const tc = await pg.getTextContent().catch(() => ({ items: [] }));
        const pageText = tc.items.map((i) => i.str).join(' ');
        for (const m of pageText.matchAll(/https?:\/\/[^\s"'<>]+/g)) urls.push(m[0]);
      }

      // 3. Download linked documents (portal or other http links; HTML pages are skipped)
      for (const url of urls) {
        if (ctx.documents.length >= MAX_FILES_PER_TENDER) break;
        if (ctx.seenUrls.has(url)) continue;
        ctx.seenUrls.add(url);
        try {
          const resp = await this.context.request.get(url, { timeout: 45000 });
          if (!resp.ok()) continue;
          const type = resp.headers()['content-type'] || '';
          const body = await resp.body();
          if (/text\/html/i.test(type) && !looksLikePdf(body)) continue;
          const name = this.fileNameFromHeaders(resp.headers())
            || decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'linked_document';
          await this.storeBuffer(body, name, ctx, 'LINKED_IN_PDF', parentName, depth);
        } catch (err) {
          logger.warn(`[TenderStatus] Linked document ${url} failed: ${err.message}`);
        }
      }
    } finally {
      await doc.destroy().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  async saveStatus(tender, data) {
    if (!tender._id) {
      // LOCAL mode: print what would be stored
      const { countAsFailure, ...result } = data;
      console.log(`\n🧾 LOCAL RESULT for ${tender.sourceTenderId}:\n${JSON.stringify(result, null, 2)}`);
      return;
    }
    const now = new Date();
    const set = { 'tenderStatusInfo.checkedAt': now, 'tenderStatusInfo.fetchStatus': data.fetchStatus };
    const update = { $set: set };

    if (data.countAsFailure) {
      update.$inc = { 'tenderStatusInfo.failCount': 1 };
    } else {
      set['tenderStatusInfo.failCount'] = 0;
      set['tenderStatusInfo.lastError'] = null;
    }
    for (const key of ['currentStage', 'stages', 'isAocDone', 'stageSignature', 'stageDetails', 'documents']) {
      if (data[key] !== undefined) set[`tenderStatusInfo.${key}`] = data[key];
    }
    await withDbRetry(() => Tender.updateOne({ _id: tender._id }, update));
  }

  /**
   * In-app alert for every user who saved this tender, once per portal state. The first check of a tender
   * only alerts when something already happened (a stage done or a cancellation), not for "To be Opened".
   */
  async alertSavers(tender, { previous, currentStage, completed, isAocDone, stageSignature }) {
    if (!tender._id) return;
    const cancelled = /cancel|retender/i.test(currentStage || '');
    const previouslyDone = new Set((previous.stages || []).filter((s) => s.completed).map((s) => s.name));
    const newlyDone = completed.filter((name) => !previouslyDone.has(name));
    if (!previous.stageSignature && !newlyDone.length && !cancelled) return;
    if (!newlyDone.length && !cancelled && previous.currentStage === currentStage) return;

    try {
      const savers = await withDbRetry(() => ContractorProfile.find({ savedTenders: tender._id, userId: { $ne: null } })
        .select('userId').lean());
      const userIds = [...new Set(savers.map((p) => String(p.userId)))];
      if (!userIds.length) return;

      const kind = isAocDone ? 'AWARDED' : cancelled ? 'CANCELLED' : 'STAGE';
      const alert = {
        tenderId: tender._id,
        sourceTenderId: tender.sourceTenderId,
        title: String(tender.title || '').replace(/[[\]]/g, '').trim().slice(0, 300),
        kind,
        previousStage: previous.currentStage || null,
        currentStage: currentStage || null,
        completedStages: newlyDone,
        signature: stageSignature,
      };
      const ops = userIds.map((userId) => ({
        updateOne: {
          filter: { userId, tenderId: tender._id, signature: stageSignature },
          update: { $setOnInsert: { ...alert, userId, isRead: false } },
          upsert: true,
        },
      }));
      const res = await withDbRetry(() => TenderAlert.bulkWrite(ops, { ordered: false }));
      const created = res.upsertedCount || 0;
      this.stats.alerts = (this.stats.alerts || 0) + created;
      if (created) console.log(`   🔔 Alerted ${created} user(s) who saved this tender (${kind.toLowerCase()}).`);
    } catch (err) {
      // Alerts are best effort: never fail the status scrape over them.
      logger.error(`[TenderStatus] Could not create alerts for ${tender.sourceTenderId}: ${err.message}`);
    }
  }

  async markFailure(tender, message) {
    if (!tender._id) return;
    await withDbRetry(() => Tender.updateOne({ _id: tender._id }, {
      $set: {
        'tenderStatusInfo.checkedAt': new Date(),
        'tenderStatusInfo.fetchStatus': 'FAILED',
        'tenderStatusInfo.lastError': String(message).slice(0, 500)
      },
      $inc: { 'tenderStatusInfo.failCount': 1 }
    })).catch((err) => logger.error(`[TenderStatus] Could not record failure: ${err.message}`));
  }

  async dumpDebug(page, tenderId, tag) {
    try {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
      const base = path.join(DEBUG_DIR, `${sanitizeFileName(tenderId)}_${tag}`);
      fs.writeFileSync(`${base}.html`, await page.content());
      await page.screenshot({ path: `${base}.png`, fullPage: true });
    } catch { /* best effort */ }
  }

  async closeBrowser() {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = null;
    this.browser = null;
  }
}
