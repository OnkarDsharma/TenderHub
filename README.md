# TENDERHUB (Tender Intelligence & Management Platform)

Enterprise Web Platform for Automated Government Tender Discovery, Cloud Document Archival, and Contractor AI Engineering Intelligence.

---

## 1. QUICK START

```bash
# Clone the repository
git clone <repository_url>
cd tenderHub

# Backend setup & development server
cd backend
npm install
npx playwright install chromium
npm run dev

# Frontend setup (in a separate terminal)
cd ../frontend
npm install
npm run dev
```

- Backend API: `http://localhost:8000`
- Frontend UI: `http://localhost:5173`
- Admin Console: `http://localhost:5174` (`cd admin-panel && npm run dev`)

---

## 2. REPOSITORY ARCHITECTURE

TenderHub is organized as a decoupled monorepo:

- `backend/`: Express 5 REST API, MongoDB (Mongoose 9), Redis (Upstash / local), BullMQ job queues, Playwright browser crawler, Ghostscript PDF compressor, Cloudflare R2 object storage, Razorpay checkout & webhook listeners, AiSensy WhatsApp engine, and Google Gemini / OpenAI contractor intelligence services.
- `frontend/`: React 19 single-page application built on Vite 8, Tailwind CSS, Zustand, and TanStack React Query.
- `admin-panel/`: Isolated administrative interface on Vite for database monitoring and manual crawl triggers.
- `docs/`: Comprehensive developer handover manuals, architecture diagrams, cost analyses, and compiled PDF engineering guides.

---

## 3. DEVELOPER HANDOVER & DOCUMENTATION INDEX

For detailed onboarding, technical architecture, and roadmap items, consult the dedicated guides in `docs/`:

1. [Developer Handover Manual](docs/DEVELOPER_HANDOVER_MANUAL.md) — Master handover document covering architecture, end-to-end data flows, feature inventories, security, runbooks, and developer FAQs.
2. [AI Agent Status & Continuation Roadmap](docs/AI_AGENT_ROADMAP_AND_MODIFICATIONS.md) — Technical guide detailing the completed AI Dossier engine, current limitations, and exact steps to activate live Gemini Flash keys and PDF text ingestion from Cloudflare R2.
3. [Infrastructure Costs & Server Pricing](docs/INFRASTRUCTURE_COSTS_AND_PRICING.md) — Transparent financial breakdown of server hosting (Render), databases (MongoDB Atlas, Redis), APIs (AiSensy, CapSolver, Gemini), and storage (Cloudflare R2).
4. [System Architecture & Data Flow](docs/SYSTEM_DATA_FLOW_AND_ARCHITECTURE.md) — Visual and ASCII sequence diagrams of crawler pipelines, payment reconciliation, and contractor gap analysis.
5. [CLI & Commands Cheat Sheet](docs/ALL_COMMANDS_CHEAT_SHEET.md) — Quick command reference for local development, background workers, database backup/restore, and maintenance scripts.

---

## 4. MASTER COMMANDS REFERENCE

### Backend (`cd backend`)
- `npm run dev`: Start development server with file watch on port 8000.
- `npm start`: Start production server (`node src/server.js`).
- `npm run scrape:latest`: Incremental scrape of tenders published in the last 24-48 hours.
- `npm run scrape:all`: Full crawl of all active tenders across all departments.
- `npm run fetch:pending-docs`: Re-attempt downloads for missing NIT/BOQ PDF attachments.
- `npm run backup:db`: Export MongoDB collections to local archive.
- `npm run restore:db`: Restore MongoDB collections from backup archive.
- `npm run purge:expired`: Flag expired tenders past closing date.
- `npm run reconcile:dates`: Standardize date formats across records.
- `npm run manuals:all`: Compile all PDF engineering guides into `docs/`.

### Frontend (`cd frontend`)
- `npm run dev`: Start Vite development server on port 5173.
- `npm run build`: Compile production bundle into `dist/`.
- `npm run preview`: Preview production build locally.
- `npm run lint`: Run ESLint checks.

---

## 5. ENVIRONMENT CONFIGURATION

### Key Backend Environment Variables (`backend/.env`)
```env
PORT=8000
NODE_ENV=development
MONGO_URI=mongodb+srv://...
SECONDARY_MONGO_URI=mongodb+srv://...
REDIS_URL=redis://127.0.0.1:6379
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
BACKEND_URL=https://tenderhub-4nbc.onrender.com
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=thub_whsec_c8742b78a9e144a9_live
AISENSY_API_KEY=...
CAPSOLVER_API_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=tenderhub
```

### Key Frontend Environment Variables (`frontend/.env.production`)
```env
VITE_API_URL=https://tenderhub-4nbc.onrender.com/api/v1
VITE_RAZORPAY_KEY_ID=rzp_live_TjWTNQzT2o8NCV
```

---

## 6. SYSTEM STATUS & ROADMAP

- Automated Ingestion: Active and operational with automated daily crons, Ghostscript compression, and Cloudflare R2 uploads.
- Public Search & Filters: Fully operational with text search, department filters, and dynamic aggregation metrics.
- Contractor Profiles & Saved Tenders: Fully operational with local and database persistence.
- Billing & Subscriptions: Production-ready with Razorpay checkout and dual-path signature verification (client callback + server webhook).
- AI Contractor Dossier: Functional with multi-tier execution (Gemini -> OpenAI -> Rule-based civil engineering engine). Awaiting live Gemini API key and full R2 PDF text streaming as detailed in [AI Agent Status & Continuation Roadmap](docs/AI_AGENT_ROADMAP_AND_MODIFICATIONS.md).

---

End of README.
