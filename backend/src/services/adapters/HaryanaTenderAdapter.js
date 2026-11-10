/**
 * @file backend/src/services/adapters/HaryanaTenderAdapter.js
 * @description Dedicated scraper adapter for Haryana e-Procurement Portal (etenders.hry.nic.in).
 * Inherits all NIC-GEP crawler mechanics, Gemini captcha solving, PDF extraction,
 * Ghostscript compression, and Cloudflare R2 ingestion from JKTenderAdapter.
 */

import { JKTenderAdapter } from './JKTenderAdapter.js';

export const HARYANA_PORTAL = 'HR_TENDERS';
export const HARYANA_BASE_URL = 'https://etenders.hry.nic.in';
export const HARYANA_STATE = 'Haryana';

export class HaryanaTenderAdapter extends JKTenderAdapter {
  constructor() {
    super(HARYANA_PORTAL, HARYANA_BASE_URL, HARYANA_STATE);
  }
}

export const haryanaTenderAdapter = new HaryanaTenderAdapter();
