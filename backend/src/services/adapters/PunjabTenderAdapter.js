/**
 * @file backend/src/services/adapters/PunjabTenderAdapter.js
 * @description Dedicated scraper adapter for Punjab e-Procurement Portal (eproc.punjab.gov.in).
 * Inherits all NIC-GEP crawler mechanics, Gemini captcha solving, PDF extraction,
 * Ghostscript compression, and Cloudflare R2 ingestion from JKTenderAdapter.
 */

import { JKTenderAdapter } from './JKTenderAdapter.js';

export class PunjabTenderAdapter extends JKTenderAdapter {
  constructor() {
    super('PB_TENDERS', 'https://eproc.punjab.gov.in', 'Punjab');
  }
}

export const punjabTenderAdapter = new PunjabTenderAdapter();
