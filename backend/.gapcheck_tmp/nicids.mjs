import fs from 'node:fs';
import { chromium } from 'playwright';
import { NIC_PORTALS } from '../src/config/nicPortals.js';
const want = process.argv[2].split(',');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function readRows(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('table.list_table tr')).map(r => {
    const td = r.querySelectorAll('td'); if (td.length < 5 || !td[4].querySelector('a')) return null;
    const m = (td[4].innerText || '').match(/\[([^\]]+)\]/g) || [];
    const id = m.length ? m[m.length - 1].slice(1, -1).replace(/\s+/g, '') : null;
    return id && { id, published: td[1].innerText.trim(), closing: td[2].innerText.trim(), title: td[4].innerText.replace(/\s+/g, ' ').slice(0, 140), org: (td[5]?.innerText || '').replace(/\s+/g, ' ').trim() };
  }).filter(Boolean));
}

async function scanPortal(p) {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const url = `${p.baseUrl}/nicgep/app?page=FrontEndTendersByOrganisation&service=page`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector("table#table tr[id^='informal']", { timeout: 30000 });
  const orgs = await page.evaluate(() => Array.from(document.querySelectorAll("table#table tr[id^='informal']")).map((r, i) => {
    const td = r.querySelectorAll('td'); return { i, name: td[1]?.innerText.replace(/\s+/g, ' ').trim(), count: parseInt(td[2]?.innerText, 10) || 0 };
  }).filter(o => o.count > 0));
  const result = { portal: p.portalName, orgs: [] };
  for (const o of orgs) {
    const rows = new Map(); let err = null;
    for (let attempt = 0; attempt < 2 && rows.size < o.count; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector("table#table tr[id^='informal']", { timeout: 30000 });
        await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}),
          page.locator("table#table tr[id^='informal']").nth(o.i).locator('td:nth-child(3) a').click({ timeout: 20000 })]);
        let pageNo = 1; const seen = new Set();
        while (true) {
          await page.waitForSelector('table.list_table', { timeout: 30000 });
          let last = -1, stable = 0; const dl = Date.now() + 120000;
          while (Date.now() < dl) { const c = await page.locator('table.list_table tr').count(); if (c === last) { if (++stable >= 3) break; } else stable = 0; last = c; await page.waitForTimeout(800); }
          const pr = await readRows(page); const fp = pr.map(r => r.id).join('|');
          if (!pr.length || seen.has(fp)) break; seen.add(fp);
          pr.forEach(r => rows.set(r.id, r));
          if (rows.size >= o.count) break;
          const link = page.locator('a').filter({ hasText: new RegExp(`^\\s*${pageNo + 1}\\s*$`) }).first();
          if (!(await link.count())) break;
          await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), link.click({ timeout: 15000 })]);
          await page.waitForTimeout(600); pageNo++;
        }
      } catch (e) { err = e.message.split('\n')[0]; }
    }
    result.orgs.push({ name: o.name, count: o.count, got: rows.size, err, rows: [...rows.values()] });
    console.log(`${p.portalName} | ${o.name} | ${rows.size}/${o.count}${err ? ' ERR ' + err : ''}`);
  }
  await ctx.close();
  fs.writeFileSync(`.gapcheck_tmp/ids_${p.portalName}.json`, JSON.stringify(result));
}
await Promise.all(NIC_PORTALS.filter(p => want.includes(p.portalName)).map(p => scanPortal(p).catch(e => console.log(p.portalName, 'FAILED', e.message))));
await browser.close(); process.exit(0);
