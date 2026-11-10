/**
 * @file backend/src/services/adapters/DelhiTenderAdapter.js
 * @description Dedicated scraper adapter for Government of NCT of Delhi e-Procurement Portal
 * (govtprocurement.delhi.gov.in).
 * Inherits all NIC-GEP crawler mechanics, Gemini captcha solving, PDF extraction,
 * Ghostscript compression, and Cloudflare R2 ingestion from JKTenderAdapter.
 */

import { JKTenderAdapter } from './JKTenderAdapter.js';

export const DELHI_PORTAL = 'DL_TENDERS';
export const DELHI_BASE_URL = 'https://govtprocurement.delhi.gov.in';
export const DELHI_STATE = 'Delhi';

export class DelhiTenderAdapter extends JKTenderAdapter {
  constructor() {
    super(DELHI_PORTAL, DELHI_BASE_URL, DELHI_STATE);
  }
}

export const delhiTenderAdapter = new DelhiTenderAdapter();
