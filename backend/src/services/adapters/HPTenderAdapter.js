/**
 * @file backend/src/services/adapters/HPTenderAdapter.js
 * @description Dedicated scraper adapter for Himachal Pradesh e-Procurement Portal (hptenders.gov.in).
 * Inherits all NIC-GEP crawler mechanics, Gemini captcha solving, PDF extraction,
 * Ghostscript compression, and Cloudflare R2 ingestion from JKTenderAdapter.
 */

import { JKTenderAdapter } from './JKTenderAdapter.js';

export class HPTenderAdapter extends JKTenderAdapter {
  constructor() {
    super('HP_TENDERS', 'https://hptenders.gov.in', 'Himachal Pradesh');
  }
}

export const hpTenderAdapter = new HPTenderAdapter();
