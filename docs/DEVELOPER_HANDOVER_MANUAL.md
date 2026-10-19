# TENDERHUB DEVELOPER HANDOVER MANUAL
Engineering Architecture, System Operations, Data Flow, and Implementation Roadmap

Document Version: 2.4.0  
Prepared for: Incoming Lead Developer / Engineering Team  
Date: October 2026  
Status: Active Production Baseline  

---

## TABLE OF CONTENTS

1. Executive Summary & Repository Structure
2. Local Development Setup & All Execution Commands
3. Complete System Architecture & End-to-End Data Flow
4. Comprehensive Feature Inventory (Web Application & Backend)
5. Security, BotShield, & Resilience Infrastructure
6. AI Contractor Intelligence & Tender Analysis Engine
   6.1 What Has Been Completed
   6.2 Current Limitations & Missing Components
   6.3 Step-by-Step Technical Plan for Continuation
7. Server Hosting, Cloud Infrastructure, & Monthly Operating Costs
8. Production Deployment & Operational Runbook
9. Critical Gotchas, Known Edge Cases, & Developer FAQs

---

## 1. EXECUTIVE SUMMARY & REPOSITORY STRUCTURE

TenderHub is a procurement intelligence platform designed to eliminate the operational overhead of searching, qualifying, and bidding for public works and government tenders in India (with primary production ingestion tailored for the NIC-GEP / `jktenders.gov.in` portal infrastructure).

The system consists of three operational software tiers:
1. `backend/`: Node.js (v20+) running Express 5, Mongoose 9, BullMQ with Redis, Playwright for portal automation, Razorpay SDK, AiSensy WhatsApp integration, and Gemini/OpenAI analytical services.
2. `frontend/`: React 19 single-page application built on Vite 8, React Router v7, Zustand 5, TanStack Query 5, and Tailwind CSS.
3. `admin-panel/`: Isolated administrative console on Vite for manual ingestion triggers, system monitoring, and database management.

### Monorepo Directory Layout

```
tenderHub/
├── backend/
│   ├── src/
│   │   ├── app.js                         # Express application middleware, routes, security
│   │   ├── server.js                      # HTTP server initialization, DB & Redis connect
│   │   ├── config/
│   │   │   ├── db.js                      # Mongoose connection with secondary failover
│   │   │   ├── env.js                     # Joi-validated environment configuration schema
│   │   │   ├── redis.js                   # Redis client for caching and rate limiting
│   │   │   └── r2.js                      # Cloudflare R2 / AWS S3 client configuration
│   │   ├── controllers/                   # Route handler controllers (Auth, Tenders, etc.)
│   │   ├── middleware/                    # Auth, BotShield, Rate Limiter, Error Handlers
│   │   ├── models/                        # Mongoose data models
│   │   ├── modules/
│   │   │   ├── billing/                   # Razorpay orders, subscriptions, and webhooks
│   │   │   └── notifications/             # AiSensy WhatsApp engine and user preferences
│   │   ├── routes/                        # Express API route endpoints (/api/v1/...)
│   │   ├── scripts/                       # Maintenance, scraping, backup, and PDF tools
│   │   ├── services/                      # Business logic (Crawler, Scraper, AI Agent, etc.)
│   │   ├── utils/                         # Token helpers, response formatters, encryption
│   │   └── workers/                       # BullMQ background job consumers
│   ├── .env                               # Server environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/                    # Reusable UI components (Navbar, Footer, Modal)
│   │   ├── context/                       # Authentication and global context providers
│   │   ├── pages/                         # Route views (Home, Tenders, Services, Pricing, etc.)
│   │   ├── services/                      # Axios API clients (api.js, billingApi.js, etc.)
│   │   ├── store/                         # Zustand state stores (bookmarks, preferences)
│   │   ├── App.jsx                        # Root React component and route definitions
│   │   └── main.jsx                       # React DOM entry point
│   ├── .env                               # Local development environment variables
│   ├── .env.production                    # Production environment variables (Render API)
│   └── package.json
├── admin-panel/
│   ├── src/                               # Admin interface source
│   └── package.json
├── docs/                                  # Architectural manuals, PDF guides, and reports
└── README.md                              # Repository overview
```

---

## 2. LOCAL DEVELOPMENT SETUP & ALL EXECUTION COMMANDS

### 2.1 Prerequisites
- Node.js: v20.12.0 or higher
- MongoDB: Local instance or MongoDB Atlas connection string (Mongoose 9.x)
- Redis: Local instance on `redis://127.0.0.1:6379` or Upstash Redis URL
- Chromium / Playwright: Required for scraper execution

### 2.2 First-Time Installation

```bash
# 1. Clone the repository
git clone <repository_url>
cd tenderHub

# 2. Install backend dependencies
cd backend
npm install
npx playwright install chromium

# 3. Install frontend dependencies
cd ../frontend
npm install

# 4. Install admin panel dependencies (optional)
cd ../admin-panel
npm install
```

### 2.3 Master Commands Reference

All commands are executed from the respective directory indicated.

#### Backend Commands (`cd backend`)

| Command | Purpose | When to Use |
| :--- | :--- | :--- |
| `npm run dev` | Starts backend with `nodemon` watching file changes on port `8000` | Local backend development |
| `npm start` | Starts backend in production mode (`node src/server.js`) | Deployment container / Render start command |
| `npm run worker` | Starts isolated BullMQ worker process | Offloading heavy crawlers to separate background process |
| `npm run scrape:latest` | Fetches recently published tenders published in the last 24-48 hours | Daily incremental portal synchronization |
| `npm run scrape:all` | Crawls all active tenders across all departments from the portal | Initial database seeding or monthly audit |
| `npm run scrape:date` | Prompts for a specific date or date range to scrape tenders | Recovering specific tenders missed due to downtime |
| `npm run fetch:pending-docs` | Re-attempts downloads for tenders missing NIT / BOQ PDF attachments | Scheduled document recovery job |
| `npm run scrape:complete` | Performs full end-to-end sync including document attachments | Complete sync of department catalogs |
| `npm run backup:db` | Exports MongoDB collections to local JSON/BSON archives | Pre-migration or routine daily database snapshot |
| `npm run restore:db` | Restores database collections from local backup archive | Disaster recovery or local database reproduction |
| `npm run backup:full` | Full backup combining DB export and Cloudflare R2 metadata | Complete platform backup |
| `npm run restore:full` | Full platform restoration from archived state | Major disaster recovery |
| `npm run sync:mirror` | Synchronizes primary Cloudflare R2 bucket to secondary backup R2 | Off-site asset redundancy |
| `npm run purge:expired` | Marks tenders past their bid submission deadline as Expired | Automated retention and cleanup maintenance |
| `npm run reconcile:dates` | Audits and normalizes date formats across all tender documents | Data migration and normalization |
| `npm run migrate:dept` | Normalizes department keys and taxonomy | After portal structure changes |
| `npm run manuals:all` | Compiles all PDF architectural guides into `docs/` | Generating documentation deliverables |

#### Frontend Commands (`cd frontend`)

| Command | Purpose | When to Use |
| :--- | :--- | :--- |
| `npm run dev` | Runs Vite development server on `http://localhost:5173` | Local frontend UI development |
| `npm run dev:test` | Runs Vite development server on port `5175` with test environment | Multi-client or automated testing |
| `npm run build` | Compiles production assets into `frontend/dist/` | Production build validation and deployment |
| `npm run preview` | Serves the production build locally on `http://localhost:4173` | Verifying production build before pushing |
| `npm run lint` | Executes ESLint across all JavaScript/JSX source files | Code quality and style checks |

#### Admin Panel Commands (`cd admin-panel`)

| Command | Purpose | When to Use |
| :--- | :--- | :--- |
| `npm run dev` | Runs Admin console on `http://localhost:5174` | Managing database and triggering jobs via UI |
| `npm run build` | Compiles admin console production assets | Deployment |

---

## 3. COMPLETE SYSTEM ARCHITECTURE & END-TO-END DATA FLOW

### 3.1 High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                              GOVERNMENT TENDER PORTAL                              |
|                           (jktenders.gov.in / NIC-GEP)                            |
+-----------------------------------------------------------------------------------+
                                          |
                                          | Headless Playwright Ingestion
                                          v
+-----------------------------------------------------------------------------------+
|                             TENDERHUB CRAWLER ENGINE                              |
|  - Multi-department table traversal                                               |
|  - Anti-bot / session management                                                  |
|  - CAPTCHA bypass (CapSolver / TrueCaptcha)                                       |
|  - NIT / BOQ PDF extraction & Ghostscript compression                             |
+-----------------------------------------------------------------------------------+
        |                                                   |
        | Document Blobs                                    | Structured JSON Data
        v                                                   v
+-----------------------+                         +----------------------------------+
|    CLOUDFLARE R2      |                         |         MONGODB CLUSTER          |
|  (Primary + Mirror)   |                         |  - Tenders, Users, Subscriptions |
|  Presigned Downloads  |                         |  - AI Dossiers, Audit Logs       |
+-----------------------+                         +----------------------------------+
                                                            |
                                                            | Cached Queries & Stats
                                                            v
+-----------------------------------------------------------------------------------+
|                                REDIS CACHE & QUEUE                                |
|  - Aggregated stats (total value, active counts, department summaries)            |
|  - BullMQ job queues (crawlers, notification dispatch)                            |
|  - Rate limiting & BotShield IP tracking                                          |
+-----------------------------------------------------------------------------------+
                                          |
                                          | REST API (JSON)
                                          v
+-----------------------------------------------------------------------------------+
|                               EXPRESS 5 REST API                                  |
|  - Auth: JWT + Google OAuth2                                                      |
|  - Tenders: Search, filters, pagination, saved tenders                            |
|  - Billing: Razorpay checkout, subscription management, webhooks                  |
|  - Notifications: AiSensy WhatsApp alerts dispatch                                |
|  - AI Services: Contractor dossier generation, Copilot chat                       |
+-----------------------------------------------------------------------------------+
        |                                                   |
        | Client Interactions                               | Server-to-Server Hooks
        v                                                   v
+-----------------------+                         +----------------------------------+
|     REACT 19 SPA      |                         |       THIRD-PARTY SERVICES       |
|  (Vite + Tailwind)    |                         |  - Razorpay (Webhooks)           |
|  Desktop & Mobile     |                         |  - AiSensy (WhatsApp Business)   |
+-----------------------+                         |  - Brevo (Transactional Email)   |
                                                  |  - Telegram Bot (Backups)        |
                                                  |  - Google Gemini / OpenAI (LLM)  |
                                                  +----------------------------------+
```

### 3.2 End-to-End Data Lifecycle

#### Step 1: Automated Crawler Ingestion
1. The background scheduler (`backend/src/server.js` using `node-cron`) initiates crawling routines:
   - Hourly office-hours polling: checks newest published notices.
   - Evening sweep (19:00 IST): captures all late-day tenders.
   - Nightly document recovery (01:00 IST): downloads any missed NIT documents.
   - Nightly purge (03:00 IST): flags tenders past closing dates as `status: 'EXPIRED'`.
2. The crawler (`JKTenderAdapter.js`) utilizes Playwright to navigate the portal ASP.NET viewstate tables.
3. If an ASP.NET CAPTCHA appears, the image is passed to CapSolver API or solved locally.
4. Extracted fields (Tender ID, Title, Reference Number, EMD, Tender Fee, Opening Date, Closing Date, Department, Work Location) are validated against the Mongoose `Tender` schema.
5. If NIT or BOQ documents exist, they are streamed to disk, compressed with Ghostscript if oversized, and uploaded to Cloudflare R2 via presigned PUT requests. The resulting S3 keys are stored on the `Tender` document.

#### Step 2: Database Ingestion & Cache Invalidation
1. Tenders are upserted into MongoDB using `sourceTenderId` as the unique deduplication key.
2. Redis cache keys representing global statistics (`tenders:stats:all`) and page listings are invalidated to ensure fresh data delivery.
3. MongoDB text indexes on `title`, `sourceTenderId`, `tenderId`, and `tenderReferenceNumber` provide full-text search capability.

#### Step 3: Notification Dispatch (WhatsApp & Email)
1. When a new tender is inserted, the notification engine queries `ContractorPreference` records.
2. If a contractor's configured filters (e.g. Department = "Public Works", District = "Srinagar", Min Value = 10,00,000) match the tender, a job is added to the notification queue.
3. The AiSensy WhatsApp adapter formats the message template and dispatches an alert with a direct link to the tender and attached BOQ.

#### Step 4: Contractor Discovery & Interaction
1. The contractor opens `frontend` (`/tenders`).
2. Search and filter queries hit `/api/v1/tenders` with query parameters (`page`, `limit`, `search`, `department`, `status`, `minValue`, `maxValue`, `sort`).
3. Results are returned with pagination metadata.
4. The contractor can save tenders to their profile (`/api/v1/contractor/saved-tenders`) or download verified documents directly via Cloudflare R2 URLs.

#### Step 5: Checkout & Subscription Activation
1. The contractor navigates to `/pricing` or `/services` and chooses a plan.
2. The frontend calls `/api/v1/billing/create-order`. The backend creates a Razorpay Order and attaches metadata notes (`userId`, `planId`).
3. Razorpay Checkout modal opens. Upon payment completion, verification occurs in two parallel paths:
   - Synchronous Path: Frontend submits `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature` to `/api/v1/billing/verify-payment`. The backend computes HMAC-SHA256 signature and activates the subscription.
   - Asynchronous Webhook Path: Razorpay sends a `payment.captured` or `order.paid` event to `/api/v1/billing/webhook`. The backend validates the `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` and ensures activation even if the user closed the browser during redirect.
4. AI credits (`dossierCredits`, `chatQueries`) are credited to the contractor's profile in MongoDB.

---

## 4. COMPREHENSIVE FEATURE INVENTORY

### 4.1 Public Tender Directory (`/tenders`)
- Advanced Search: Full-text search across tender title, tender ID, reference number, and work description.
- Multi-Faceted Filters:
  - Department / Organisation Chain filter.
  - Value Range slider (Min Value to Max Value).
  - Tender Status (Active, Closing Soon, Expired, All).
  - District / Location filter.
  - Date sorting (Closing Date Ascending/Descending, Tender Value High/Low).
- Dynamic Statistics Dashboard: Top cards showing total live tenders, total active contract value (in Crores INR), tenders closing in 48 hours, and indexed departments.
- Document Direct Downloads: Instant downloads for verified Notice Inviting Tender (NIT) and Price Schedule (BOQ) files.

### 4.2 Contractor Workspace & Profile (`/profile`)
- Company Information Management: Company name, registration class (Class A/B/C/D), PAN, GSTIN, and registration certificates.
- Financial Qualifications: Average annual turnover, bank solvency limit, largest single completed work, and ongoing commitment values.
- Machinery & Equipment Inventory: Registry of owned and leased heavy machinery (excavators, pavers, rollers, batching plants) used for automated gap analysis.
- Saved Tenders Library: Bookmark and track tenders through various stages (Shortlisted, Under Analysis, Bid Submitted, Won, Archived).

### 4.3 Bid Score Calculator (`/check-score`)
- Algorithmic qualification assessment comparing a tender's financial and technical requirements against the contractor's profile.
- Calculates an empirical eligibility score (0 to 100) and displays:
  - Turnover adequacy ratio.
  - Solvency compliance check.
  - Equipment availability flags.
  - Recommended bid adjustments.

### 4.4 Billing & Subscription Management (`/pricing`)
- Transparent Tiered Plans:
  - TenderHub Pro Monthly (₹999/month, temporarily ₹10 for sandbox validation).
  - TenderHub Pro Quarterly (₹999/quarter).
  - TenderHub Pro Annual (₹2,999/year).
  - Contractor AI Bundles (₹999/month for 10 Dossiers, ₹2,499/month for 35 Dossiers).
- Payment Infrastructure: Razorpay payment gateway supporting UPI, Credit/Debit cards, NetBanking, and Wallets.
- Auto-Reconciliation: Webhook listeners ensuring zero dropped activations on network disconnects.

### 4.5 Services & Contractor AI Hub (`/services`)
- Dedicated contractor intelligence center combining automated engineering analysis with personalized profile memory.
- Pre-Bid Tender Dossier:
  - Executive Brief: High-level overview of scope, timelines, EMD, and tender fee.
  - Eligibility Checklist: Financial thresholds, mandatory licenses, joint venture allowances, and EMD exemption rules.
  - Mandatory Document Matrix: Table of required technical certificates, stage requirements (Fee/PreQual/Technical/Finance), and compliance tips.
  - Raw Material & BOQ Schedule: Itemized breakdown of cement, steel rebars, bitumen, aggregate, and labor requirements with approximate market rates.
  - Risks and Red Flags: Critical identification of high-risk clauses, stringent liquidated damages, and price variation stipulations.
- Post-Award Execution Roadmap:
  - Phase-by-phase procurement schedule (Mobilization, Substructure, Superstructure, Finishing).
  - Milestone schedule with financial progress targets and delay penalties.
  - Quality compliance standards (IS codes, MoRTH specifications).
- Interactive Tender Copilot: Live chat interface permitting contractors to ask specific contractual and engineering questions about the tender.

---

## 5. SECURITY, BOTSHIELD, & RESILIENCE INFRASTRUCTURE

### 5.1 BotShield & Anti-Scraping Protection
Located in `backend/src/middleware/botShield.middleware.js`:
- User-Agent Inspection: Automatically blocks aggressive headless scrapers, generic Python scripts, and unauthorized scraping bots.
- Honeypot Endpoints: Hidden routes (e.g. `/wp-login.php`, `/.env`) that permanently blacklist offending IP addresses in Redis upon access.
- IP Blacklisting: Instant IP lookup in Redis on every incoming request.

### 5.2 Rate Limiting
Configured in `backend/src/middleware/rateLimiter.middleware.js`:
- Standard API rate limiting via `express-rate-limit` with Redis store backend.
- Prevents denial-of-service attempts and credential stuffing on authentication endpoints.

### 5.3 Authentication & Authorization
- Double-token architecture: Short-lived JWT Access Tokens (15 minutes, httpOnly cookie) and long-lived Refresh Tokens (7 days).
- Google OAuth2 integration with automatic account provisioning.
- Role-based route guards (`user`, `contractor`, `admin`, `owner`).

### 5.4 Database Failover
Configured in `backend/src/config/db.js`:
- Primary connection attempts `MONGO_URI`.
- If the primary cluster becomes unreachable, the connection automatically falls back to `SECONDARY_MONGO_URI` without crashing the application.

---

## 6. AI CONTRACTOR INTELLIGENCE & TENDER ANALYSIS ENGINE

### 6.1 What Has Been Completed

The AI subsystem is located in:
- `backend/src/services/contractorAgent.service.js`
- `backend/src/models/TenderAiDossier.js`
- `backend/src/models/ContractorAgentProfile.js`
- `backend/src/models/AiAgentChatSession.js`
- `backend/src/controllers/services.controller.js`
- `backend/src/routes/services.routes.js`
- `frontend/src/pages/Services.jsx`

#### Accomplishments:
1. Complete Schema Design: Full data models for `TenderAiDossier` (pre-bid analysis, material BOQ breakdown, post-award milestones, risk flags) and `ContractorAgentProfile` (turnover, solvency, equipment inventory, credit quotas).
2. Multi-Tiered AI Execution Engine:
   - Primary: Google Gemini client initialized via `@google/generative-ai` (`gemini-1.5-flash`).
   - Secondary: OpenAI client initialized via `openai` (`gpt-4o-mini`).
   - Tertiary Deterministic Engine: `generateDeterministicEngineeringDossier()`. A rule-based civil engineering estimation algorithm that generates structured BOQs, material schedules, and risk flags even when external AI API keys are missing or rate-limited.
3. Copilot Chat Endpoint: `/api/v1/services/chat/:tenderId` maintaining session history in `AiAgentChatSession`.
4. Front-End Interface: Production-ready UI in `Services.jsx` with tabbed views (Executive Brief, Eligibility, Materials & BOQ, Milestones & Safety, Copilot Chat).

---

### 6.2 Current Limitations & Missing Components

To enable full production AI capabilities, the incoming developer must address the following three items:

1. Missing Live Gemini API Key:
   - In `backend/.env`, `GEMINI_API_KEY` is currently unset or contains a placeholder.
   - Without a valid key, the service falls back to the deterministic estimation engine. While the deterministic engine produces realistic estimates, it cannot extract nuanced text from unstandardized tender specifications.

2. Document Ingestion Pipeline for Full NIT PDFs:
   - Currently, `executeGeminiTenderAnalysis()` passes metadata fields (`title`, `department`, `estimatedValue`, `workDescription`, `coversInfo`) into the LLM context.
   - The actual downloaded PDF text stored in Cloudflare R2 is not yet being piped into the prompt.
   - For complex tenders where qualification criteria are hidden within 50-page PDF clauses, the text extracted by `pdf-parse` needs to be passed to Gemini Flash using context caching or a chunked embedding search.

3. BOQ Item Rate Customization:
   - BOQ material rates (cement, steel, bitumen) are currently based on regional schedule-of-rates (SoR) estimates. The ability for contractors to override material base prices and recalculate margins in real-time is not yet wired to a backend persistence endpoint.

---

### 6.3 Step-by-Step Technical Plan for Continuation

The incoming developer should follow this sequence to finalize the AI engine:

#### Phase 1: Activate Live Gemini API Key & Validate Live LLM Path (1 Day)
1. Obtain an API key from Google AI Studio (`aistudio.google.com`).
2. Add the key to `backend/.env`:
   ```env
   GEMINI_API_KEY=AIzaSy...your_actual_key...
   GEMINI_MODEL=gemini-1.5-flash
   ```
3. Restart the backend and run an analysis via `POST /api/v1/services/analyze/:tenderId`.
4. Verify in `backend/src/services/contractorAgent.service.js` that `dossier.aiEngine.model` saves as `gemini-1.5-flash` rather than `deterministic-rules-engine`.

#### Phase 2: Connect Cloudflare R2 PDF Text Ingestion (2-3 Days)
1. In `backend/src/services/contractorAgent.service.js`, check if `tender.nitDocumentUrl` or `tender.documents` contains an S3 key.
2. If present, stream the file from Cloudflare R2 via `backend/src/config/r2.js` using `GetObjectCommand`.
3. Pass the buffer to `pdf-parse` to extract raw text (limit to the first 40 pages or 100,000 tokens).
4. Supply this extracted text to Gemini's prompt:
   ```javascript
   const pdfText = await this.extractTextFromR2Document(tender.nitDocumentKey);
   const prompt = `Here is the full text of the tender specification:\n${pdfText}\n\nAnalyze and extract...`;
   ```
5. Utilize Gemini 1.5 Flash's large context window (up to 1,000,000 tokens) which easily accommodates full 100-page tender documents without needing vector chunking.

#### Phase 3: Implement Context Caching for Cost Optimization (1 Day)
1. Since multiple contractors may analyze the same high-value tender, cache the ingested tender document using the Gemini Context Caching API.
2. Store the `cacheName` on `TenderAiDossier`. Subsequent queries (or Copilot chat questions) will incur 75% lower token fees and run with lower latency.

#### Phase 4: Frontend BOQ Rate Override & Excel Export (2 Days)
1. In `frontend/src/pages/Services.jsx`, add an edit mode to the Materials & BOQ table allowing the contractor to update market rates (e.g. changing Cement from ₹380 to ₹360).
2. Implement client-side export to Excel (.xlsx) using the existing `jszip` / spreadsheet utility so contractors can submit their price bids directly.

---

## 7. SERVER HOSTING, CLOUD INFRASTRUCTURE, & MONTHLY OPERATING COSTS

The following table details all infrastructure components, active tiers, and estimated monthly costs to run TenderHub in production.

### Detailed Cost Breakdown

| Component | Provider & Tier | Purpose | Estimated Monthly Cost (USD) | Estimated Monthly Cost (INR) |
| :--- | :--- | :--- | :--- | :--- |
| **Backend Web Service** | Render Standard ($7 - $25/mo) | Express 5 API server, background cron tasks | $7.00 - $25.00 | ₹600 - ₹2,100 |
| **Frontend Web Hosting** | Render Static / Vercel Hobby (Free) | React SPA global CDN delivery | $0.00 (Free) | ₹0 |
| **Primary Database** | MongoDB Atlas M0 Free / M2 Shared | Application database (tenders, users, subscriptions) | $0.00 - $9.00 | ₹0 - ₹750 |
| **Cache & Queue** | Upstash Redis Serverless / Local | Rate limiting, BotShield, stats caching, BullMQ | $0.00 - $10.00 | ₹0 - ₹850 |
| **Document Storage** | Cloudflare R2 (10 GB Free tier) | NIT and BOQ PDF document storage (zero egress fees) | $0.00 - $1.50 | ₹0 - ₹125 |
| **WhatsApp Business API** | AiSensy (Platform + Meta conversation fee) | Tender alert dispatches and payment receipts | ~$15.00 - $30.00 | ₹1,250 - ₹2,500 |
| **Transactional Email** | Brevo (Free tier: 300 emails/day) | Password resets, account verifications | $0.00 (Free) | ₹0 |
| **CAPTCHA Solving** | CapSolver / TrueCaptcha API | Portal CAPTCHA bypass for crawler automation | ~$3.00 - $5.00 | ₹250 - ₹420 |
| **AI LLM API** | Google Gemini (Gemini 1.5 Flash) | Tender summarization, BOQ extraction, Copilot chat | ~$5.00 - $15.00 | ₹420 - ₹1,250 |
| **Payment Gateway** | Razorpay Standard (Pay-per-transaction) | 2% per successful transaction (deducted from revenue) | No fixed fee | 2% of GMV |
| **Disaster Recovery** | Telegram Bot API | Automated database snapshot notifications and off-site backup | $0.00 (Free) | ₹0 |
| **TOTAL ESTIMATED MONTHLY COST** | — | — | **~$30.00 - $95.00** | **₹2,500 - ₹8,000** |

### Recommendations for Cost Efficiency:
1. Cloudflare R2 provides zero egress fees, saving significant bandwidth costs compared to AWS S3 when contractors download 20 MB tender drawings.
2. Gemini 1.5 Flash is priced at $0.075 per 1M input tokens, making each full 50-page tender dossier analysis cost less than ₹0.50 (50 paise), preserving healthy profit margins on the ₹999/month subscription.

---

## 8. PRODUCTION DEPLOYMENT & OPERATIONAL RUNBOOK

### 8.1 Production Environment Variables Checklist

#### Backend (`Render Dashboard -> Environment Variables`)
```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/tenderhub?retryWrites=true&w=majority
SECONDARY_MONGO_URI=mongodb+srv://<user>:<password>@cluster1.mongodb.net/tenderhub
REDIS_URL=rediss://default:<password>@<endpoint>.upstash.io:6379
JWT_ACCESS_SECRET=<generate_secure_random_string_64_chars>
JWT_REFRESH_SECRET=<generate_secure_random_string_64_chars>
ADMIN_SECRET_KEY=<master_admin_passkey_minimum_8_chars>
ADMIN_EMAIL=admin@tenderhub.in
CORS_ORIGIN=https://tenderhub.in,https://tenderhub-frontend.onrender.com
FRONTEND_URL=https://tenderhub.in
BACKEND_URL=https://tenderhub-4nbc.onrender.com
GOOGLE_CLIENT_ID=<google_oauth_client_id>
GOOGLE_CLIENT_SECRET=<google_oauth_client_secret>
GOOGLE_CALLBACK_URL=https://tenderhub-4nbc.onrender.com/api/v1/auth/google/callback
EMAIL_PROVIDER=brevo
EMAIL_API_KEY=<brevo_api_key>
EMAIL_FROM=TenderHub <no-reply@tenderhub.in>
R2_ACCOUNT_ID=<cloudflare_account_id>
R2_ACCESS_KEY_ID=<cloudflare_r2_access_key>
R2_SECRET_ACCESS_KEY=<cloudflare_r2_secret_key>
R2_BUCKET_NAME=tenderhub
RAZORPAY_KEY_ID=rzp_live_TjWTNQzT2o8NCV
RAZORPAY_KEY_SECRET=ah5gHkdNmg2FAH0gbLJntR0J
RAZORPAY_WEBHOOK_SECRET=thub_whsec_c8742b78a9e144a9_live
AISENSY_API_KEY=<aisensy_jwt_token>
AISENSY_CAMPAIGN_NAME=tender_alert
CAPSOLVER_API_KEY=<capsolver_key>
GEMINI_API_KEY=<google_gemini_api_key>
GEMINI_MODEL=gemini-1.5-flash
SCRAPER_HEADLESS=true
```

#### Frontend (`Render / Vercel -> Environment Variables`)
```env
VITE_API_URL=https://tenderhub-4nbc.onrender.com/api/v1
VITE_RAZORPAY_KEY_ID=rzp_live_TjWTNQzT2o8NCV
```

### 8.2 Build Commands

- Backend Build Command: `npm install`
- Backend Start Command: `npm start`
- Frontend Build Command: `npm run build`
- Frontend Publish Directory: `dist`

---

## 9. CRITICAL GOTCHAS, KNOWN EDGE CASES, & DEVELOPER FAQS

### Q1: The crawler stalls or throws timeout errors during portal scraping. Why?
Government ASP.NET portals often undergo maintenance late at night or throttle connections after frequent rapid queries.
- Ensure `SCRAPER_HEADLESS=true` in production.
- If scraping locally from an IP with frequent CAPTCHAs, verify `CAPSOLVER_API_KEY` has active balance.
- Check `backend/src/services/JKTenderAdapter.js` to ensure the table selector matches any recent portal UI modifications.

### Q2: Why are Razorpay payments marked successful in the Razorpay dashboard, but the user is not activated in the database?
This happens if the user closes their browser window immediately upon completing payment before the client-side redirect completes.
- Verify that the Razorpay Webhook is active in the Razorpay dashboard pointing to:
  `https://tenderhub-4nbc.onrender.com/api/v1/billing/webhook`
- Ensure `RAZORPAY_WEBHOOK_SECRET` matches between Render environment variables and the Razorpay Webhook settings.
- The webhook listener will automatically process `payment.captured` and activate the subscription independently of the browser.

### Q3: Why does `express.json()` use a custom `verify` function in `backend/src/app.js`?
Razorpay webhook signature verification requires computing an HMAC-SHA256 signature against the raw, unparsed request payload buffer. The custom verify function attaches `req.rawBody = buf`, ensuring cryptographic verification succeeds without formatting mismatches.

### Q4: How are AI credits tracked and prevented from being abused?
Credits are stored on the `ContractorAgentProfile` model in the `credits` object:
- `availableDossiers`: Decremented by 1 every time a new tender is analyzed.
- Completed dossiers are cached globally in `TenderAiDossier`. If Contractor B requests an analysis for a tender that Contractor A already analyzed, the cached dossier is served immediately, and personalized fit calculations are performed locally without consuming additional LLM tokens.

---

End of Developer Handover Manual.  
Refer to `docs/` for specialized architectural guides, PDF crawl audits, and disaster recovery procedures.
