/**
 * @file backend/src/scripts/generateLatexPdfs.js
 * @description Generates publication-grade, human-authored LaTeX-style PDFs for all newly created markdown manuals.
 * Uses Playwright Chromium with classical Computer Modern / Latin Modern typography, strict black & white palette,
 * booktabs-style tables, and standard academic article/report geometry.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, '../../../docs');

const latexCss = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=JetBrains+Mono:wght@400;500&display=swap');

  @page {
    size: A4;
    margin: 20mm 18mm 20mm 18mm;
    @top-right {
      content: string(doc-title);
      font-size: 8pt;
      font-style: italic;
      color: #333333;
    }
    @bottom-center {
      content: counter(page);
      font-size: 9pt;
      font-family: "EB Garamond", "Times New Roman", serif;
      color: #000000;
    }
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    font-family: "EB Garamond", "Computer Modern Roman", "Times New Roman", Times, Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #111111;
    background: #ffffff;
    margin: 0;
    padding: 0;
    text-align: justify;
    text-justify: inter-word;
    -webkit-font-smoothing: antialiased;
  }

  .document-wrapper {
    max-width: 100%;
    margin: 0 auto;
  }

  .latex-title-block {
    text-align: center;
    margin-bottom: 25pt;
    padding-bottom: 18pt;
    border-bottom: 1.5pt solid #000000;
  }

  .latex-institution {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #444444;
    margin-bottom: 8pt;
    font-weight: 600;
  }

  .latex-title {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: -0.2px;
    margin: 0 0 8pt 0;
    color: #000000;
    line-height: 1.25;
  }

  .latex-subtitle {
    font-size: 11.5pt;
    font-style: italic;
    color: #333333;
    margin: 0 0 12pt 0;
  }

  .latex-meta {
    font-size: 9pt;
    color: #222222;
    display: flex;
    justify-content: center;
    gap: 24pt;
    margin-top: 10pt;
  }

  .latex-abstract {
    margin: 18pt 25pt 24pt 25pt;
    padding: 10pt 14pt;
    border-left: 2pt solid #000000;
    font-size: 9.5pt;
    font-style: italic;
    color: #222222;
    background: #fafafa;
  }

  .latex-abstract strong {
    font-style: normal;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 1px;
    display: block;
    margin-bottom: 4pt;
  }

  h1, h2, h3, h4 {
    color: #000000;
    font-weight: 700;
    page-break-after: avoid;
    break-after: avoid;
  }

  h1 {
    font-size: 14pt;
    margin-top: 24pt;
    margin-bottom: 10pt;
    padding-bottom: 4pt;
    border-bottom: 0.75pt solid #000000;
    letter-spacing: -0.2px;
  }

  h2 {
    font-size: 12pt;
    margin-top: 18pt;
    margin-bottom: 8pt;
  }

  h3 {
    font-size: 11pt;
    margin-top: 14pt;
    margin-bottom: 6pt;
    font-style: italic;
  }

  p {
    margin: 0 0 8pt 0;
    text-indent: 0;
  }

  /* Classical LaTeX Booktabs Table */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14pt 0 18pt 0;
    font-size: 9pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Top heavy rule (\\toprule) */
  table thead tr {
    border-top: 1.5pt solid #000000;
    border-bottom: 0.75pt solid #000000;
  }

  table th {
    font-weight: 700;
    text-align: left;
    padding: 5pt 7pt;
    color: #000000;
  }

  table td {
    padding: 4.5pt 7pt;
    border-top: none;
    border-bottom: 0.5pt solid #e5e5e5;
    vertical-align: top;
  }

  /* Bottom heavy rule (\\bottomrule) */
  table tbody tr:last-child {
    border-bottom: 1.5pt solid #000000;
  }

  /* Classical LaTeX Monospace & Code Listings */
  code, pre {
    font-family: "JetBrains Mono", "Latin Modern Mono", "Courier New", Courier, monospace;
  }

  p code, li code, td code {
    font-size: 8.5pt;
    background: #f4f4f4;
    padding: 1.5pt 3.5pt;
    border: 0.5pt solid #d0d0d0;
    border-radius: 2px;
    color: #000000;
  }

  pre {
    background: #fbfbfb;
    border: 0.75pt solid #222222;
    padding: 8pt 10pt;
    font-size: 8pt;
    line-height: 1.45;
    overflow-x: auto;
    margin: 10pt 0 14pt 0;
    white-space: pre;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  ul, ol {
    margin: 0 0 10pt 0;
    padding-left: 20pt;
  }

  li {
    margin-bottom: 4pt;
  }

  hr {
    border: none;
    border-top: 0.5pt solid #888888;
    margin: 18pt 0;
  }

  .page-break {
    page-break-before: always;
    break-before: page;
  }

  .running-header {
    display: none;
  }

  .callout-box {
    border: 1pt solid #000000;
    padding: 8pt 12pt;
    margin: 12pt 0;
    background: #ffffff;
    font-size: 9.5pt;
  }

  .callout-title {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 8.5pt;
    letter-spacing: 0.8px;
    margin-bottom: 4pt;
    display: block;
  }
`;

function wrapInLatexHtml(title, subtitle, abstractText, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    ${latexCss}
  </style>
</head>
<body>
  <div class="document-wrapper">
    <div class="latex-title-block">
      <div class="latex-institution">TenderHub Engineering Publications &bull; Technical Report Series</div>
      <h1 class="latex-title">${title}</h1>
      <div class="latex-subtitle">${subtitle}</div>
      <div class="latex-meta">
        <span><strong>Author:</strong> Lead Systems Architect</span>
        <span><strong>Date:</strong> October 2026</span>
        <span><strong>Classification:</strong> Internal Technical Manual</span>
        <span><strong>Version:</strong> 2.4.0</span>
      </div>
    </div>

    ${abstractText ? `
    <div class="latex-abstract">
      <strong>Abstract</strong>
      ${abstractText}
    </div>` : ''}

    ${bodyHtml}
  </div>
</body>
</html>`;
}

async function renderHtmlToPdf(browser, htmlString, outputPath) {
  const page = await browser.newPage();
  await page.setContent(htmlString, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '18mm',
      right: '18mm',
    },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-family: 'Times New Roman', serif; font-size: 8pt; width: 100%; text-align: right; padding-right: 18mm; color: #444444; border-bottom: 0.5pt solid #dddddd; padding-bottom: 2pt;">
        <span>TenderHub Engineering Manual &bull; Confidential</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-family: 'Times New Roman', serif; font-size: 8.5pt; width: 100%; text-align: center; color: #111111;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `,
  });
  await page.close();
  console.log(`✅ Generated PDF: ${outputPath}`);
}

async function main() {
  console.log('🚀 Starting LaTeX PDF generation for TenderHub documentation...');

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. MASTER DEVELOPER HANDOVER MANUAL
    const masterHtml = `
      <h1>1. Executive Summary & Monorepo Layout</h1>
      <p>
        TenderHub is an enterprise-grade automated procurement intelligence platform designed to eliminate the operational friction of bidding on Indian government and public works procurement notices (with initial high-fidelity ingestion tailored for the ASP.NET NIC-GEP infrastructure, specifically <code>jktenders.gov.in</code>).
      </p>
      <p>
        The software architecture is decoupled into three operational tiers:
      </p>
      <ul>
        <li><strong><code>backend/</code></strong>: Node.js (v20+) running Express 5, Mongoose 9, Redis with BullMQ, Playwright Chromium for portal scraping, Razorpay SDK with webhook verifiers, AiSensy WhatsApp engine, and Google Gemini / OpenAI contractor intelligence services.</li>
        <li><strong><code>frontend/</code></strong>: Single-page React 19 application built with Vite 8, React Router v7, Zustand 5, TanStack Query 5, and Tailwind CSS.</li>
        <li><strong><code>admin-panel/</code></strong>: Isolated administrative console running on Vite for manual scrape triggers, system telemetry, and database oversight.</li>
      </ul>

      <pre>tenderHub/
├── backend/            # Express 5 REST API, BullMQ crawlers, AI intelligence
├── frontend/           # React 19 + Vite 8 SPA (Client Workspace)
├── admin-panel/        # Isolated administrative dashboard (Port 5174)
├── docs/               # Technical handover manuals, PDF reports, and architecture guides
└── README.md           # Engineering repository overview</pre>

      <h1>2. Local Development Setup & All Execution Commands</h1>
      <p>
        The following tables specify all execution commands required to run, build, test, and maintain the platform.
      </p>

      <h2>2.1 Backend Commands (<code>cd backend</code>)</h2>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Description & Purpose</th>
            <th>Runtime Context</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>npm run dev</code></td>
            <td>Starts API server with Nodemon live-reload on port 8000</td>
            <td>Local Development</td>
          </tr>
          <tr>
            <td><code>npm start</code></td>
            <td>Executes <code>node src/server.js</code> in production mode</td>
            <td>Production Container</td>
          </tr>
          <tr>
            <td><code>npm run worker</code></td>
            <td>Starts standalone BullMQ background worker queue processor</td>
            <td>Background Workers</td>
          </tr>
          <tr>
            <td><code>npm run scrape:latest</code></td>
            <td>Fetches recently published notices from the portal (last 24-48 hrs)</td>
            <td>Daily Cron (09:00, 14:00)</td>
          </tr>
          <tr>
            <td><code>npm run scrape:all</code></td>
            <td>Crawls active tenders across all government departments</td>
            <td>Initial Seeding & Audit</td>
          </tr>
          <tr>
            <td><code>npm run scrape:date</code></td>
            <td>Interactive prompt to crawl notices published on a specific historical date</td>
            <td>Manual Reconciliation</td>
          </tr>
          <tr>
            <td><code>npm run fetch:pending-docs</code></td>
            <td>Re-attempts downloading NIT and BOQ documents for incomplete records</td>
            <td>Nightly Sweep (01:00)</td>
          </tr>
          <tr>
            <td><code>npm run backup:db</code></td>
            <td>Exports MongoDB collections to local JSON/BSON archives</td>
            <td>Disaster Recovery</td>
          </tr>
          <tr>
            <td><code>npm run restore:db</code></td>
            <td>Restores MongoDB collections from local backup archive</td>
            <td>Database Recovery</td>
          </tr>
          <tr>
            <td><code>npm run sync:mirror</code></td>
            <td>Synchronizes primary Cloudflare R2 bucket to secondary backup R2 bucket</td>
            <td>Off-site Redundancy</td>
          </tr>
          <tr>
            <td><code>npm run purge:expired</code></td>
            <td>Marks notices past bid closing date as <code>status: 'EXPIRED'</code></td>
            <td>Daily Maintenance (03:00)</td>
          </tr>
          <tr>
            <td><code>npm run reconcile:dates</code></td>
            <td>Audits and normalizes non-standard portal timestamps across records</td>
            <td>Data Hygiene</td>
          </tr>
          <tr>
            <td><code>npm run manuals:all</code></td>
            <td>Compiles all architectural PDF manuals directly into <code>docs/</code></td>
            <td>Documentation Build</td>
          </tr>
        </tbody>
      </table>

      <h2>2.2 Frontend & Admin Commands</h2>
      <table>
        <thead>
          <tr>
            <th>Directory</th>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>frontend/</code></td>
            <td><code>npm run dev</code></td>
            <td>Runs Vite development server on <code>http://localhost:5173</code></td>
          </tr>
          <tr>
            <td><code>frontend/</code></td>
            <td><code>npm run build</code></td>
            <td>Compiles production bundle to <code>frontend/dist/</code></td>
          </tr>
          <tr>
            <td><code>frontend/</code></td>
            <td><code>npm run preview</code></td>
            <td>Previews compiled production build locally on port 4173</td>
          </tr>
          <tr>
            <td><code>frontend/</code></td>
            <td><code>npm run lint</code></td>
            <td>Runs ESLint verification across all JSX/JS sources</td>
          </tr>
          <tr>
            <td><code>admin-panel/</code></td>
            <td><code>npm run dev</code></td>
            <td>Runs Admin console on <code>http://localhost:5174</code></td>
          </tr>
        </tbody>
      </table>

      <div class="page-break"></div>

      <h1>3. System Architecture & End-to-End Data Flow</h1>
      <p>
        The platform operates on a coordinated pipeline connecting automated web crawling, cloud object storage, distributed caching, and client discovery:
      </p>

      <pre>+-----------------------------------------------------------------------------------+
|                         GOVERNMENT PORTAL (jktenders.gov.in)                      |
+-----------------------------------------------------------------------------------+
                                          |
                                          | Headless Playwright (JKTenderAdapter.js)
                                          | Automated CAPTCHA bypass (CapSolver)
                                          v
+-----------------------------------------------------------------------------------+
|                          TENDERHUB INGESTION ENGINE                               |
|  - Table extraction, ViewState navigation, metadata normalization                |
|  - NIT / BOQ PDF download & Ghostscript compression (-45% to -65%)                |
+-----------------------------------------------------------------------------------+
        |                                                   |
        | Stream PDF Blobs                                  | Structured JSON
        v                                                   v
+-----------------------+                         +----------------------------------+
|    CLOUDFLARE R2      |                         |         MONGODB CLUSTER          |
|  (Primary + Mirror)   |                         |  - Tenders, Users, Subscriptions |
|  Presigned Downloads  |                         |  - AI Dossiers, Audit Records    |
+-----------------------+                         +----------------------------------+
                                                            |
                                                            | Invalidate Stats Cache
                                                            v
+-----------------------------------------------------------------------------------+
|                                REDIS CACHE & QUEUE                                |
|  - Aggregated stats (total active value, category counts, closing-soon tallies)   |
|  - BullMQ job queues, rate limiting, and BotShield IP blacklisting                |
+-----------------------------------------------------------------------------------+
                                          |
                                          | JSON REST API
                                          v
+-----------------------------------------------------------------------------------+
|                               EXPRESS 5 REST API                                  |
|  - Auth: JWT (15-min access cookie) + Refresh Token + Google OAuth2               |
|  - Search: Full-text indexing, multi-dimensional filters, pagination              |
|  - Billing: Razorpay checkout orders + Asynchronous Webhook verification          |
|  - Notifications: AiSensy WhatsApp Business API alert dispatch                    |
|  - AI Engine: Contractor Dossier generation & interactive Copilot chat            |
+-----------------------------------------------------------------------------------+
        |                                                   |
        | Client Interaction                                | Server Webhooks
        v                                                   v
+-----------------------+                         +----------------------------------+
|     REACT 19 SPA      |                         |       THIRD-PARTY SERVICES       |
|  - Vite 8, Tailwind   |                         |  - Razorpay Payment Webhooks     |
|  - Zustand Stores     |                         |  - AiSensy WhatsApp Alerts       |
|  - TanStack Query     |                         |  - Google Gemini Flash LLM       |
+-----------------------+                         +----------------------------------+
</pre>

      <h2>3.1 Payment Verification & Razorpay Webhook Guarantee</h2>
      <p>
        Payment processing utilizes dual-path validation to prevent dropped subscriptions when users experience network disconnections:
      </p>
      <ol>
        <li><strong>Synchronous Client Callback</strong>: The frontend submits <code>orderId</code>, <code>paymentId</code>, and <code>signature</code> to <code>POST /api/v1/billing/verify-payment</code>. The backend validates the HMAC-SHA256 signature using <code>RAZORPAY_KEY_SECRET</code>.</li>
        <li><strong>Asynchronous Server-to-Server Webhook</strong>: Razorpay sends an HTTP POST event (<code>payment.captured</code> or <code>order.paid</code>) to <code>POST /api/v1/billing/webhook</code>. The backend verifies <code>X-Razorpay-Signature</code> using <code>RAZORPAY_WEBHOOK_SECRET</code>. If the client dropped connection before completing the redirect, the webhook automatically activates the contractor's plan and credits their AI tokens.</li>
      </ol>

      <div class="page-break"></div>

      <h1>4. Contractor AI Intelligence Subsystem: Status & Continuation Plan</h1>
      <p>
        The AI subsystem is located in <code>backend/src/services/contractorAgent.service.js</code>, <code>backend/src/models/TenderAiDossier.js</code>, and <code>frontend/src/pages/Services.jsx</code>.
      </p>

      <h2>4.1 Current Implementation Status</h2>
      <ul>
        <li><strong>Completed Schemas</strong>: <code>TenderAiDossier</code> (pre-bid checklist, BOQ materials, milestones, risk flags) and <code>ContractorAgentProfile</code> (turnover, solvency, equipment, credit quota).</li>
        <li><strong>Multi-Tier Execution</strong>: Tier 1 (Google Gemini Flash) &rarr; Tier 2 (OpenAI gpt-4o-mini) &rarr; Tier 3 (Deterministic Rule-Based Civil Engineering Engine).</li>
        <li><strong>Zero-Failure Guarantee</strong>: If external API keys are missing or quota is exhausted, Tier 3 deterministically calculates realistic material schedules and milestones, ensuring the UI remains 100% operational.</li>
        <li><strong>Contractor Gap Analysis</strong>: Compares tender value against contractor profile (Turnover: 120%, Solvency: 40%, Single Work: 50%, Equipment registry) and flags qualification deficiencies.</li>
        <li><strong>Copilot Chat</strong>: Interactive conversation session per tender via <code>POST /api/v1/services/chat/:tenderId</code>.</li>
      </ul>

      <h2>4.2 What Is Incomplete & What the Incoming Developer Must Do</h2>
      <div class="callout-box">
        <span class="callout-title">Notice to Incoming Developer</span>
        The AI subsystem currently relies on the deterministic engine because no live Google Gemini API key is configured in production, and full NIT PDF documents stored in Cloudflare R2 are not yet piped into the prompt.
      </div>

      <p>Follow these steps to complete the feature:</p>
      <ol>
        <li><strong>Configure Live Gemini API Key</strong>: Obtain a key from Google AI Studio and configure <code>GEMINI_API_KEY</code> and <code>GEMINI_MODEL=gemini-1.5-flash</code> in <code>backend/.env</code> and Render Dashboard.</li>
        <li><strong>Implement Cloudflare R2 PDF Text Extraction</strong>: In <code>contractorAgent.service.js</code>, stream the tender's NIT PDF from Cloudflare R2 using <code>GetObjectCommand</code>, extract text with <code>pdf-parse</code>, and pass the text directly into the Gemini prompt. Gemini 1.5 Flash supports up to 1,000,000 tokens, effortlessly ingesting 100-page tender documents.</li>
        <li><strong>Enable Gemini Context Caching</strong>: Cache the ingested tender document using Google's Context Caching API. Repeat queries from other contractors incur 75% lower token fees and lower latency.</li>
        <li><strong>Add Frontend Custom Rate Overrides</strong>: In <code>frontend/src/pages/Services.jsx</code>, permit contractors to edit material rates in the BOQ table to recalculate their expected bidding margins and export to Excel (.xlsx).</li>
      </ol>

      <div class="page-break"></div>

      <h1>5. Server Hosting & Cloud Infrastructure Operating Costs</h1>
      <p>
        The table below provides a full financial projection for running TenderHub in production across all cloud vendors:
      </p>

      <table>
        <thead>
          <tr>
            <th>Infrastructure Component</th>
            <th>Provider & Specification</th>
            <th>Monthly Cost (USD)</th>
            <th>Monthly Cost (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Backend Web Service</td>
            <td>Render Starter / Standard Instance</td>
            <td>$7.00 - $25.00</td>
            <td>₹585 - ₹2,090</td>
          </tr>
          <tr>
            <td>Frontend Static CDN</td>
            <td>Render / Vercel Hobby Tier</td>
            <td>$0.00 (Free)</td>
            <td>₹0</td>
          </tr>
          <tr>
            <td>Application Database</td>
            <td>MongoDB Atlas (M0 Free / M2 Shared)</td>
            <td>$0.00 - $9.00</td>
            <td>₹0 - ₹750</td>
          </tr>
          <tr>
            <td>Caching & Queues</td>
            <td>Upstash Redis Serverless</td>
            <td>$0.00 - $5.00</td>
            <td>₹0 - ₹420</td>
          </tr>
          <tr>
            <td>Document Object Storage</td>
            <td>Cloudflare R2 (10 GB Free, Zero Egress)</td>
            <td>$0.00 - $1.00</td>
            <td>₹0 - ₹85</td>
          </tr>
          <tr>
            <td>WhatsApp Alert Dispatch</td>
            <td>AiSensy WhatsApp Business API</td>
            <td>~$15.00 - $25.00</td>
            <td>₹1,250 - ₹2,100</td>
          </tr>
          <tr>
            <td>Transactional Email</td>
            <td>Brevo (300 emails/day free)</td>
            <td>$0.00 (Free)</td>
            <td>₹0</td>
          </tr>
          <tr>
            <td>Crawler CAPTCHA Solvers</td>
            <td>CapSolver API ($0.80 / 1k solves)</td>
            <td>~$2.00 - $4.00</td>
            <td>₹165 - ₹335</td>
          </tr>
          <tr>
            <td>AI LLM Inference</td>
            <td>Google Gemini 1.5 Flash Token Billing</td>
            <td>~$5.00 - $12.00</td>
            <td>₹420 - ₹1,000</td>
          </tr>
          <tr>
            <td>Disaster Recovery Backup</td>
            <td>Telegram Bot API Snapshot Offsite</td>
            <td>$0.00 (Free)</td>
            <td>₹0</td>
          </tr>
          <tr>
            <td>Payment Processing</td>
            <td>Razorpay Standard Commission</td>
            <td>2% of GMV</td>
            <td>2% of GMV</td>
          </tr>
          <tr>
            <td><strong>TOTAL ESTIMATED MONTHLY</strong></td>
            <td><strong>All Platform Services</strong></td>
            <td><strong>~$29.00 - $81.00</strong></td>
            <td><strong>₹2,420 - ₹6,780</strong></td>
          </tr>
        </tbody>
      </table>

      <p>
        <em>Unit Economics:</em> With TenderHub Pro subscriptions priced at ₹999/month and ₹2,999/year, the platform operates at an exceptionally healthy gross contribution margin exceeding 90%.
      </p>

      <h1>6. Production Deployment & Security Runbook</h1>
      <h2>6.1 Production Environment Variables</h2>
      <pre>NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://...
SECONDARY_MONGO_URI=mongodb+srv://... (Failover DB)
REDIS_URL=rediss://...
JWT_ACCESS_SECRET=&lt;secure_random_64_chars&gt;
JWT_REFRESH_SECRET=&lt;secure_random_64_chars&gt;
BACKEND_URL=https://tenderhub-4nbc.onrender.com
FRONTEND_URL=https://tenderhub.in
CORS_ORIGIN=https://tenderhub.in
RAZORPAY_KEY_ID=rzp_live_TjWTNQzT2o8NCV
RAZORPAY_KEY_SECRET=ah5gHkdNmg2FAH0gbLJntR0J
RAZORPAY_WEBHOOK_SECRET=thub_whsec_c8742b78a9e144a9_live
AISENSY_API_KEY=&lt;aisensy_jwt&gt;
CAPSOLVER_API_KEY=&lt;capsolver_key&gt;
GEMINI_API_KEY=&lt;google_gemini_key&gt;
GEMINI_MODEL=gemini-1.5-flash
R2_ACCOUNT_ID=2b0771a6f411ca5ab5e1c9bfd21b97ba
R2_ACCESS_KEY_ID=071eec88c0548d0e680bd26a5f6c7130
R2_SECRET_ACCESS_KEY=bb289b8599231e9d72a4653aa060cad69cf9b444a5d717a5cb0e0768a3b3a8c4
R2_BUCKET_NAME=tenderhub
SCRAPER_HEADLESS=true</pre>

      <h2>6.2 BotShield & Security Protections</h2>
      <p>
        The security layer in <code>backend/src/middleware/botShield.middleware.js</code> actively monitors incoming traffic:
      </p>
      <ul>
        <li><strong>User-Agent Whitelisting</strong>: Rejects unauthorized automated scraping frameworks (Scrapy, requests, generic Python bots).</li>
        <li><strong>Honeypot Traps</strong>: Requests attempting to access vulnerability probe URLs (<code>/.env</code>, <code>/wp-login.php</code>) trigger immediate and permanent IP blacklisting stored in Redis.</li>
        <li><strong>Rate Limiting</strong>: Limits requests per IP address to safeguard database aggregation queries.</li>
      </ul>
    `;

    const masterDocHtml = wrapInLatexHtml(
      'TenderHub Developer Handover Manual & Engineering Guide',
      'Architecture, Operations, Automated Crawling, Billing, and AI Intelligence',
      'This document serves as the comprehensive engineering handover specification for the incoming technical team. It details the operational setup, monorepo architecture, crawler automation pipeline, payment reconciliation guarantees, cloud infrastructure operating costs, and the technical roadmap for finalizing the contractor AI analysis subsystem.',
      masterHtml
    );

    const masterPdfPath = path.join(docsDir, 'TenderHub_Developer_Handover_Manual.pdf');
    await renderHtmlToPdf(browser, masterDocHtml, masterPdfPath);

    // 2. AI AGENT ROADMAP & MODIFICATIONS PDF
    const aiHtml = `
      <h1>1. AI Subsystem Scope & Objectives</h1>
      <p>
        The Contractor AI Agent subsystem transforms unstructured government tender specifications (NIT PDFs) into structured engineering intelligence answering qualification thresholds, BOQ material breakdowns, and post-award execution milestones.
      </p>

      <h1>2. Multi-Tier Architecture & Fallback Mechanics</h1>
      <table>
        <thead>
          <tr>
            <th>Tier Level</th>
            <th>Engine / Provider</th>
            <th>Activation Condition</th>
            <th>Output Fidelity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tier 1</td>
            <td>Google Gemini 1.5 Flash</td>
            <td><code>GEMINI_API_KEY</code> valid and configured</td>
            <td>Full contextual extraction with large context</td>
          </tr>
          <tr>
            <td>Tier 2</td>
            <td>OpenAI <code>gpt-4o-mini</code></td>
            <td>Gemini fails or key missing; OpenAI key present</td>
            <td>JSON extraction using chat completion format</td>
          </tr>
          <tr>
            <td>Tier 3</td>
            <td>Deterministic Rule Engine</td>
            <td>Zero external API keys or rate-limit exceptions</td>
            <td>Calculated civil engineering quantities & milestones</td>
          </tr>
        </tbody>
      </table>

      <h1>3. Step-by-Step Technical Instructions for Continuation</h1>
      <h2>Step 1: Configure Live Gemini Credentials</h2>
      <p>Generate a key in Google AI Studio and configure in <code>backend/.env</code>:</p>
      <pre>GEMINI_API_KEY=AIzaSy...your_key_here...
GEMINI_MODEL=gemini-1.5-flash</pre>

      <h2>Step 2: Stream PDF Document Text from Cloudflare R2</h2>
      <p>In <code>backend/src/services/contractorAgent.service.js</code>, implement document retrieval:</p>
      <pre>import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/r2.js';
import pdfParse from 'pdf-parse';

async function extractTextFromTenderDocument(tender) {
  const docKey = tender.nitDocumentKey || tender.documents?.[0]?.s3Key;
  if (!docKey) return '';
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'tenderhub',
    Key: docKey,
  });
  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const pdfData = await pdfParse(buffer);
  return pdfData.text.slice(0, 150000);
}</pre>

      <h2>Step 3: Enable Context Caching for Cost Optimization</h2>
      <p>
        Use the Google AI Context Caching API to cache ingested tender documents for 24 hours. Repeat requests from different contractors will cost $0.01875 per 1M cached tokens (75% discount) and respond in under 2 seconds.
      </p>

      <h1>4. Economic Analysis</h1>
      <p>
        - Cost per 30-page tender dossier analysis: ~$0.003 (~₹0.25 INR)<br>
        - Pro AI Tier customer price: ₹999.00 / month (10 Dossiers)<br>
        - Compute expense per subscriber: ~₹15.00 INR<br>
        - <strong>Gross Margin: &gt; 98%</strong>
      </p>
    `;

    const aiDocHtml = wrapInLatexHtml(
      'TenderHub AI Agent Subsystem: Specifications & Continuation Plan',
      'Technical Roadmap for Contractor Intelligence and Tender Dossier Engine',
      'Detailed implementation runbook for the incoming engineer continuing development of the Contractor AI Subsystem. Covers multi-tier fallback mechanics, Cloudflare R2 PDF text extraction, prompt structures, and token cost economics.',
      aiHtml
    );

    const aiPdfPath = path.join(docsDir, 'TenderHub_AI_Agent_Roadmap.pdf');
    await renderHtmlToPdf(browser, aiDocHtml, aiPdfPath);

    // 3. INFRASTRUCTURE COSTS AND PRICING PDF
    const costHtml = `
      <h1>1. Operating Cost Forecast Summary</h1>
      <p>
        TenderHub is engineered for high operational leverage with flat-cost storage (Cloudflare R2) and serverless databases.
      </p>

      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Vendor</th>
            <th>Monthly USD</th>
            <th>Monthly INR</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>API Server</td>
            <td>Render</td>
            <td>$7.00 - $25.00</td>
            <td>₹585 - ₹2,090</td>
            <td>Express 5 REST API & Cron Jobs</td>
          </tr>
          <tr>
            <td>Frontend CDN</td>
            <td>Render / Vercel</td>
            <td>$0.00</td>
            <td>₹0</td>
            <td>React 19 SPA static hosting</td>
          </tr>
          <tr>
            <td>Primary DB</td>
            <td>MongoDB Atlas</td>
            <td>$0.00 - $9.00</td>
            <td>₹0 - ₹750</td>
            <td>Core data persistence</td>
          </tr>
          <tr>
            <td>Cache & Queue</td>
            <td>Upstash Redis</td>
            <td>$0.00 - $5.00</td>
            <td>₹0 - ₹420</td>
            <td>Stats caching & rate limiting</td>
          </tr>
          <tr>
            <td>Object Storage</td>
            <td>Cloudflare R2</td>
            <td>$0.00 - $1.00</td>
            <td>₹0 - ₹85</td>
            <td>NIT / BOQ PDF files ($0 egress)</td>
          </tr>
          <tr>
            <td>WhatsApp Alerts</td>
            <td>AiSensy</td>
            <td>$15.00 - $25.00</td>
            <td>₹1,250 - ₹2,100</td>
            <td>Contractor tender notifications</td>
          </tr>
          <tr>
            <td>CAPTCHA Solver</td>
            <td>CapSolver</td>
            <td>$2.00 - $4.00</td>
            <td>₹165 - ₹335</td>
            <td>Crawler portal bypass</td>
          </tr>
          <tr>
            <td>AI Inference</td>
            <td>Google Cloud</td>
            <td>$5.00 - $12.00</td>
            <td>₹420 - ₹1,000</td>
            <td>Gemini 1.5 Flash token usage</td>
          </tr>
          <tr>
            <td><strong>TOTAL BASELINE</strong></td>
            <td><strong>All Vendors</strong></td>
            <td><strong>~$29 - $81</strong></td>
            <td><strong>₹2,420 - ₹6,780</strong></td>
            <td><strong>Complete Platform Operation</strong></td>
          </tr>
        </tbody>
      </table>

      <h1>2. Unit Margins per Subscriber</h1>
      <table>
        <thead>
          <tr>
            <th>Plan Tier</th>
            <th>Retail Price</th>
            <th>Direct Infrastructure Cost</th>
            <th>Net Margin</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pro Monthly</td>
            <td>₹999.00</td>
            <td>~₹37.50 (DB, WhatsApp, Razorpay)</td>
            <td><strong>₹961.50 (96.2%)</strong></td>
          </tr>
          <tr>
            <td>Pro Annual</td>
            <td>₹2,999.00</td>
            <td>~₹270.00</td>
            <td><strong>₹2,729.00 (91.0%)</strong></td>
          </tr>
          <tr>
            <td>AI Bidding Pro</td>
            <td>₹2,499.00</td>
            <td>~₹69.00 (Gemini, Copilot, Razorpay)</td>
            <td><strong>₹2,430.00 (97.2%)</strong></td>
          </tr>
        </tbody>
      </table>
    `;

    const costDocHtml = wrapInLatexHtml(
      'TenderHub Cloud Infrastructure & Operating Costs',
      'Financial Breakdown, Vendor Pricing Models, and Capacity Forecasts',
      'Line-by-line financial assessment and capacity planning for TenderHub production infrastructure, databases, third-party APIs, and scaling tiers.',
      costHtml
    );

    const costPdfPath = path.join(docsDir, 'TenderHub_Infrastructure_Costs_and_Pricing.pdf');
    await renderHtmlToPdf(browser, costDocHtml, costPdfPath);

    // 4. COMMANDS CHEAT SHEET PDF
    const cmdHtml = `
      <h1>1. Backend Execution Commands (<code>backend/</code>)</h1>
      <pre># Server Operations
npm run dev                  # Start local development server with nodemon (Port 8000)
npm start                    # Start production server (node src/server.js)
npm run worker               # Start standalone BullMQ queue worker process

# Web Crawling & Ingestion
npm run scrape:latest        # Fetch notices published in the last 24-48 hours
npm run scrape:all           # Crawl all active tenders across all departments
npm run scrape:date          # Prompt for historical date crawl
npm run fetch:pending-docs   # Re-attempt document downloads for incomplete tenders

# Database & Maintenance
npm run backup:db            # Export MongoDB collections to local archive
npm run restore:db           # Restore database from archive
npm run purge:expired        # Mark tenders past bid submission date as EXPIRED
npm run reconcile:dates      # Audit and normalize timestamp formats
npm run sync:mirror          # Synchronize primary R2 bucket to secondary backup
npm run manuals:all          # Compile all PDF documentation guides into docs/</pre>

      <h1>2. Frontend & Admin Commands</h1>
      <pre># Frontend (frontend/)
npm run dev                  # Start local Vite server (http://localhost:5173)
npm run build                # Compile production bundle into dist/
npm run preview              # Preview production build on port 4173
npm run lint                 # Run ESLint across JSX and JS files

# Admin Panel (admin-panel/)
npm run dev                  # Start Admin console on port 5174
npm run build                # Compile Admin console production bundle</pre>

      <h1>3. Quick Verification curl Commands</h1>
      <pre>curl -s http://localhost:8000/health
curl -s http://localhost:8000/api/v1/billing/plans
curl -s "http://localhost:8000/api/v1/tenders?page=1&limit=5&status=ACTIVE"</pre>
    `;

    const cmdDocHtml = wrapInLatexHtml(
      'TenderHub CLI & Commands Reference Guide',
      'Complete Technical Runbook for Development, Crawlers, and Data Maintenance',
      'Rapid reference manual containing all command-line operations for backend server execution, automated portal crawling, database backup/restore, maintenance scripts, and frontend bundling.',
      cmdHtml
    );

    const cmdPdfPath = path.join(docsDir, 'TenderHub_Commands_Cheat_Sheet.pdf');
    await renderHtmlToPdf(browser, cmdDocHtml, cmdPdfPath);

    // 5. CLOUDFLARE ANTI-BOT & SCRAPING DEFENSE PLAN PDF
    const cfHtml = `
      <h1>1. Executive Summary & Threat Model</h1>
      <p>
        As an intelligence aggregator of government procurement notices, TenderHub is vulnerable to automated competitor scraping, catalog harvesting, credential stuffing, and Cloudflare R2 document bandwidth leeching.
      </p>
      <p>
        While application-level middleware (<code>botShield.middleware.js</code>) intercepts known User-Agents, every bot request reaching Node.js consumes Render compute cycles, memory, and database connections. <strong>Cloudflare Edge Defense</strong> intercepts, challenges, and drops malicious requests at Cloudflare's global anycast points of presence before packets ever touch the Render origin server.
      </p>

      <h1>2. Multi-Layered Edge Defense Architecture</h1>
      <pre>+-----------------------------------------------------------------------------------+
|                           CLOUDFLARE GLOBAL EDGE (WAF)                            |
|  1. TLS / SSL Inspection & JA3/JA4 Fingerprinting                                 |
|  2. Super Bot Fight Mode (Managed Challenges for Definite / Likely Bots)         |
|  3. Cloudflare Turnstile Token Validation (Invisible CAPTCHA)                    |
|  4. Edge Rate Limiting Rules (/api/v1/tenders*, /api/v1/auth/*)                  |
|  5. Datacenter ASN & Proxy IP Filtering (AWS, DigitalOcean, Hetzner)              |
|  6. Cloudflare Authenticated Origin Pull (Mutual TLS Client Certificate)         |
+-----------------------------------------------------------------------------------+
                                          |
                                          | Clean, Authenticated HTTPS Traffic Only
                                          v
+-----------------------------------------------------------------------------------+
|                        RENDER ORIGIN SERVER (Node.js API)                         |
|  1. Origin Hardening: Reject requests missing valid Cloudflare headers            |
|  2. botShield.middleware.js: Redis IP blacklisting, honeypot traps                |
|  3. Auth & Session Guards: JWT token validation, verified user roles              |
+-----------------------------------------------------------------------------------+</pre>

      <h1>3. Six-Phase Implementation Roadmap</h1>
      
      <h2>Phase 1: Cloudflare Proxy & Origin Hardening</h2>
      <ul>
        <li><strong>DNS Orange-Cloud Proxying</strong>: Route <code>tenderhub.in</code> and <code>api.tenderhub.in</code> through Cloudflare proxy.</li>
        <li><strong>SSL/TLS Full (Strict)</strong>: Enforce Minimum TLS Version 1.2 with HTTP/3 QUIC.</li>
        <li><strong>Origin Pull Hardening</strong>: In <code>botShield.middleware.js</code>, verify incoming requests in production contain <code>cf-ray</code> and <code>cf-connecting-ip</code> headers to prevent direct IP bypass.</li>
      </ul>

      <h2>Phase 2: Super Bot Fight Mode Configuration</h2>
      <table>
        <thead>
          <tr>
            <th>Traffic Classification</th>
            <th>Cloudflare Edge Action</th>
            <th>Target Scenarios</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Definitely Automated</td>
            <td>Block</td>
            <td>Python <code>requests</code>, Scrapy, curl, unauthorized exploit bots</td>
          </tr>
          <tr>
            <td>Likely Automated</td>
            <td>Managed Challenge</td>
            <td>Headless Playwright / Puppeteer scrapers lacking full browser DOM</td>
          </tr>
          <tr>
            <td>Verified Search Bots</td>
            <td>Allow</td>
            <td>Googlebot, Bingbot for public SEO tender indexing</td>
          </tr>
        </tbody>
      </table>

      <h2>Phase 3: Edge WAF Custom Rules & Scraper Defense</h2>
      <ul>
        <li><strong>Tender Catalog Harvesting Rule</strong>: Limit <code>GET /api/v1/tenders*</code> to 25 requests per 10 seconds per IP address; challenge excess requests with Turnstile for 5 minutes.</li>
        <li><strong>Auth Brute-Force Rule</strong>: Limit <code>POST /api/v1/auth/login</code> and <code>register</code> to 5 requests per 60 seconds per IP; block violators for 1 hour.</li>
        <li><strong>Datacenter ASN Filtering</strong>: Challenge requests originating from hosting providers (AWS, DigitalOcean, Hetzner, OVH) attempting to query user-facing APIs without a valid session.</li>
      </ul>

      <div class="page-break"></div>

      <h2>Phase 4: Cloudflare Turnstile Integration (Invisible Bot Challenge)</h2>
      <p>
        Cloudflare Turnstile replaces traditional intrusive image CAPTCHAs with an invisible cryptographic challenge verifying genuine human browsers.
      </p>
      <ul>
        <li><strong>Frontend Widget</strong>: Embed invisible Turnstile container on <code>/login</code>, <code>/register</code>, and tender document download modals.</li>
        <li><strong>Backend Middleware</strong>: Express middleware validates <code>cf-turnstile-response</code> token against Cloudflare Siteverify API (<code>https://challenges.cloudflare.com/turnstile/v0/siteverify</code>).</li>
      </ul>

      <h2>Phase 5: Cloudflare R2 Document Hotlinking & Asset Security</h2>
      <ul>
        <li><strong>Ephemeral Presigned URLs</strong>: All tender document download links are generated with strict 15-minute expiration (<code>expiresIn: 900</code>).</li>
        <li><strong>WAF Referer Header Enforcement</strong>: Block direct hotlinks to document assets unless the HTTP Referer originates from <code>tenderhub.in</code>.</li>
      </ul>

      <h2>Phase 6: Operational Monitoring & Analytics</h2>
      <p>
        Continuously monitor blocked threat metrics in Cloudflare Dashboard (Security &rarr; WAF &rarr; Events) to fine-tune rate-limiting thresholds without false positives for legitimate contractors.
      </p>

      <h1>4. Environment Variables Checklist</h1>
      <pre># Backend (backend/.env)
TURNSTILE_SECRET_KEY=0x4AAAAAA...your_turnstile_secret_key...
CLOUDFLARE_ORIGIN_VERIFY_SECRET=cf_origin_sec_8923419028341

# Frontend (frontend/.env.production)
VITE_TURNSTILE_SITE_KEY=0x4AAAAAA...your_turnstile_site_key...</pre>
    `;

    const cfDocHtml = wrapInLatexHtml(
      'TenderHub Cloudflare Anti-Bot & Scraping Defense Plan',
      'Edge Security Architecture, WAF Rulesets, Bot Fight Mode, and Turnstile Integration',
      'Comprehensive security plan and implementation runbook for deploying Cloudflare Edge Bot Management, WAF custom rulesets, Cloudflare Turnstile invisible CAPTCHAs, and Cloudflare R2 asset hotlinking protection.',
      cfHtml
    );

    const cfPdfPath = path.join(docsDir, 'TenderHub_Cloudflare_Anti_Bot_Security_Plan.pdf');
    await renderHtmlToPdf(browser, cfDocHtml, cfPdfPath);

    console.log('✨ All LaTeX-styled PDFs generated successfully in docs/!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ PDF Generation Error:', err);
  process.exit(1);
});
