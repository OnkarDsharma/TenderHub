import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import TenderAiDossier from '../models/TenderAiDossier.js';
import ContractorAgentProfile from '../models/ContractorAgentProfile.js';
import AiAgentChatSession from '../models/AiAgentChatSession.js';
import Tender from '../models/Tender.js';
import pino from 'pino';
import { collectTenderDocuments } from './tenderDocuments.service.js';
import { buildDossierPrompt } from './dossierPrompt.js';
import { computeContractorFit } from './contractorFit.js';

// About 100k tokens: what gpt-4o-mini's 128k context can take with room for output.
const OPENAI_PROMPT_CHARS = 300000;

/**
 * AI output often puts text in numeric fields ("As per BOQ", "30 days",
 * "1,250 cum"). Mongoose rejects the whole dossier if any Number field
 * cannot be cast, so coerce number-like text and drop the rest.
 */
const NUMBER_LIKE = /^[₹\s]*(-?\d+(?:\.\d+)?)\s*[a-zA-Z.%/\s]*$/;
const toNumberOrNull = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').trim().match(NUMBER_LIKE);
  return match ? Number(match[1]) : null;
};
const coerceNumber = (value) => toNumberOrNull(value) ?? undefined;
// Quantity keeps the AI's text (e.g. "As per BOQ") when no number is present.
const coerceQuantity = (value) => {
  const num = toNumberOrNull(value);
  if (num !== null) return num;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};
const mapArray = (value, fn) => (Array.isArray(value) ? value.map((item) => (item && typeof item === 'object' ? fn(item) : item)) : value);

export const sanitizePreBidAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const breakdown = analysis.boqMaterialBreakdown;
  return {
    ...analysis,
    mandatoryDocumentChecklist: mapArray(analysis.mandatoryDocumentChecklist, (doc) => ({ ...doc, sNo: coerceNumber(doc.sNo) })),
    boqMaterialBreakdown: breakdown && typeof breakdown === 'object'
      ? { ...breakdown, boqLineItems: mapArray(breakdown.boqLineItems, (item) => ({ ...item, quantity: coerceQuantity(item.quantity) })) }
      : breakdown,
  };
};

// The model sometimes fills an array with "Not stated" rows instead of leaving
// it empty; such rows would show as empty tiles.
const NOT_STATED_TEXT = /^\s*(not stated|n\/a|none|-)?[^a-z0-9]*$|not stated in the tender documents/i;
const isPlaceholderRow = (row) => row && typeof row === 'object'
  && Object.values(row).filter((v) => typeof v === 'string').every((v) => NOT_STATED_TEXT.test(v));
const dropPlaceholders = (value) => (Array.isArray(value) ? value.filter((row) => !isPlaceholderRow(row)) : value);

export const sanitizePostAwardAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== 'object') return analysis;
  return {
    ...analysis,
    qualityAndSafetyCompliance: dropPlaceholders(analysis.qualityAndSafetyCompliance),
    penaltyClauses: dropPlaceholders(analysis.penaltyClauses),
    milestones: mapArray(analysis.milestones, (m) => ({
      ...m,
      milestoneNo: coerceNumber(m.milestoneNo),
      targetDays: coerceNumber(m.targetDays),
      financialProgressPct: coerceNumber(m.financialProgressPct),
    })),
  };
};

const logger = pino();

class QuotaError extends Error {
  constructor(status, details) {
    super(details.message);
    this.status = status;
    Object.assign(this, details);
  }
}

// Initialize Gemini Client
const geminiClient = env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'dummy_key'
  ? new GoogleGenerativeAI(env.GEMINI_API_KEY)
  : null;

// Initialize OpenAI Client as secondary fallback
const openaiClient = env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'dummy_key'
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

export class ContractorAgentService {

  /**
   * Retrieves or creates default AI profile for a contractor
   */
  async getOrCreateContractorProfile(userId) {
    let profile = await ContractorAgentProfile.findOne({ userId });
    if (!profile) {
      profile = await ContractorAgentProfile.create({
        userId,
        companyName: 'Prime Infrastructure & Engineering',
        registrationClass: 'Class A Works',
        avgAnnualTurnoverInr: 65000000, // 6.5 Cr
        solvencyLimitInr: 25000000,      // 2.5 Cr
        ongoingCommitmentsInr: 12000000,
        largestSingleWorkDoneInr: 32000000,
        machineryInventory: [
          { name: 'JCB 3DX Excavator', category: 'Earthmoving', quantity: 2, isOwned: true },
          { name: 'Static Tandem Roller (8-10T)', category: 'Paving', quantity: 1, isOwned: true },
          { name: 'Transit Concrete Mixer 6m3', category: 'Concrete', quantity: 1, isOwned: true },
          { name: 'Water Tanker (5000L)', category: 'Transport', quantity: 2, isOwned: true },
        ],
        specialties: ['Road & Highway Construction', 'Civil Buildings', 'Drainage Works'],
        customInstructions: 'Strictly check liquidated damages, bank guarantee duration, and material price escalation.',
        credits: {
          planTier: 'free_trial',
          availableDossiers: 2,
          usedDossiers: 0,
          copilotQueriesLimit: 5,
          copilotQueriesUsed: 0,
        }
      });
    }
    return profile;
  }

  /**
   * Runs or retrieves full AI Dossier for a specific tender
   */
  async getOrGenerateTenderDossier(tenderId, userId, forceRefresh = false) {
    let tender = null;
    if (mongoose.isValidObjectId(tenderId)) {
      tender = await Tender.findById(tenderId).select('+gemRawText');
    }
    if (!tender) {
      tender = await Tender.findOne({ sourceTenderId: tenderId }).select('+gemRawText');
    }
    
    // Fallback for demo sample tenders
    if (!tender && typeof tenderId === 'string' && (tenderId.includes('_') || tenderId.startsWith('2026'))) {
      tender = {
        _id: new mongoose.Types.ObjectId(),
        sourceTenderId: tenderId,
        title: tenderId.includes('PWD') 
          ? 'Upgradation and Macadamization of Link Road via Bus Stand, Division I'
          : (tenderId.includes('JAL') ? 'Augmentation of Rural Water Supply Pipeline Network & Distribution Sump' : 'Construction of Additional Block at District Sub-District Hospital Complex'),
        departmentName: tenderId.includes('PWD') ? 'Public Works (R&B) Department' : (tenderId.includes('JAL') ? 'Jal Shakti / PHE Department' : 'Health & Medical Education'),
        estimatedValue: tenderId.includes('PWD') ? 4500000 : (tenderId.includes('JAL') ? 18000000 : 32000000),
        emdAmount: tenderId.includes('PWD') ? 90000 : (tenderId.includes('JAL') ? 360000 : 640000),
        tenderFee: 1500,
        location: 'Zone 1 Central District',
        periodOfWorkDays: tenderId.includes('PWD') ? 90 : 180,
        closingDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        contractType: 'Item Rate Contract',
        coversInfo: [
          { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: 'Technical Bid & Statutory Affidavits' },
          { coverNo: 2, coverType: 'Finance', description: 'BOQ Price Schedule' }
        ]
      };
    }

    if (!tender) {
      throw new Error('Tender not found with given identifier.');
    }

    // Check if a completed dossier already exists in DB (Global cache)
    let dossier = await TenderAiDossier.findOne({
      $or: [
        { tenderId: tender._id },
        { sourceTenderId: tender.sourceTenderId }
      ]
    });

    const domain = this.detectTenderDomain(tender);
    const hasDomainMismatch = dossier && (
      (domain === 'IT_HARDWARE' && dossier.summary?.toLowerCase().includes('cement')) ||
      (domain === 'CIVIL_WORKS' && (dossier.summary?.toLowerCase().includes('desktop') || dossier.summary?.toLowerCase().includes('pc (v2)')))
    );
    const hasOldParagraphFormat = dossier && (!dossier.summary || !dossier.summary.trim().startsWith('•'));
    // Dossiers made before document grounding, or from the template, are rebuilt.
    const isUngrounded = dossier && (!dossier.grounding?.mode || dossier.grounding.mode === 'TEMPLATE');
    const reusable = dossier && dossier.status === 'COMPLETED' && !hasDomainMismatch && !hasOldParagraphFormat && !isUngrounded;

    if (reusable && !forceRefresh) {
      // Calculate personalized match for requesting user
      const personalizedFit = await this.calculateContractorPersonalizedFit(tender, userId, dossier);
      return { dossier, personalizedFit };
    }

    const corpus = await collectTenderDocuments(tender);

    // Analysing the same documents again gives the same answer at a real cost,
    // so a refresh only re-runs the AI when the tender's documents changed.
    if (reusable && dossier.grounding.mode === 'DOCUMENTS' && corpus.documentHash && dossier.documentHash === corpus.documentHash) {
      const personalizedFit = await this.calculateContractorPersonalizedFit(tender, userId, dossier);
      return { dossier, personalizedFit };
    }

    // Dossier limits are temporarily disabled to support open testing.
    const profile = await this.getOrCreateContractorProfile(userId);

    // Create or mark dossier as PROCESSING
    if (!dossier) {
      dossier = new TenderAiDossier({
        tenderId: tender._id,
        sourceTenderId: tender.sourceTenderId,
        status: 'PROCESSING',
      });
      await dossier.save();
    } else {
      dossier.status = 'PROCESSING';
      await dossier.save();
    }

    const startTime = Date.now();
    try {
      // Generate through Gemini / OpenAI / Intelligent Fallback Engine
      const aiResult = await this.executeGeminiTenderAnalysis(tender, corpus);
      // Scraped listing values first, then values the AI read from the documents.
      // Nothing is guessed: an unknown value stays empty.
      const facts = aiResult.isTemplate ? {} : (aiResult.keyFacts || {});
      // Portals and NITs often print 0 for a value they do not disclose.
      const num = (value) => (value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

      // Save extracted dossier with normalized newline bullets
      if (typeof aiResult.summary === 'string' && aiResult.summary.trim()) {
        let normSummary = aiResult.summary.replace(/(?:\r?\n\s*|\s+)•\s*/g, '\n• ').trim();
        if (!normSummary.startsWith('•')) {
          normSummary = '• ' + normSummary;
        }
        dossier.summary = normSummary;
      } else {
        dossier.summary = aiResult.summary;
      }
      dossier.executiveOverview = {
        title: tender.title,
        department: tender.departmentName || tender.organisationChain || null,
        estimatedValue: num(tender.estimatedValue) ?? num(facts.estimatedValueInr),
        emdAmount: num(tender.emdAmount) ?? num(facts.emdAmountInr),
        tenderFee: num(tender.tenderFee) ?? num(facts.tenderFeeInr),
        submissionDeadline: tender.bidSubmissionEndDate || tender.closingDate,
        location: tender.location || facts.location || null,
        contractType: tender.contractType || facts.contractType || null,
        completionPeriodDays: num(tender.periodOfWorkDays) ?? num(facts.completionPeriodDays),
      };
      dossier.preBidAnalysis = sanitizePreBidAnalysis(aiResult.preBidAnalysis);
      dossier.postAwardAnalysis = sanitizePostAwardAnalysis(aiResult.postAwardAnalysis);
      const usedDocuments = corpus.summary.some((d) => d.method !== 'skipped');
      dossier.documentHash = corpus.documentHash;
      dossier.grounding = {
        mode: aiResult.isTemplate ? 'TEMPLATE' : (usedDocuments ? 'DOCUMENTS' : 'LISTING_ONLY'),
        provider: aiResult.provider,
        documents: corpus.summary,
        warnings: corpus.warnings,
        missingInformation: Array.isArray(aiResult.sourceNotes?.missingInformation)
          ? aiResult.sourceNotes.missingInformation.filter((item) => typeof item === 'string').slice(0, 20)
          : [],
      };
      // Token counts come from the provider's usage report (0 when none ran).
      dossier.aiEngine = {
        model: aiResult.provider,
        promptTokens: aiResult.tokens?.promptTokens || 0,
        completionTokens: aiResult.tokens?.completionTokens || 0,
        cachedTokens: aiResult.tokens?.cachedTokens || 0,
        latencyMs: Date.now() - startTime,
        processedAt: new Date(),
      };
      dossier.status = 'COMPLETED';
      await dossier.save();

      // Keep usage analytics, but do not enforce or deduct dossier credits while testing.
      profile.credits.usedDossiers += 1;
      if (tender._id && mongoose.isValidObjectId(tender._id) && !profile.analyzedTenders.includes(tender._id)) {
        profile.analyzedTenders.push(tender._id);
      }
      await profile.save();

      const personalizedFit = await this.calculateContractorPersonalizedFit(tender, userId, dossier);
      return { dossier, personalizedFit };
    } catch (err) {
      logger.error(`AI Dossier Generation Error: ${err.message}`);
      dossier.status = 'FAILED';
      await dossier.save();
      throw err;
    }
  }

  /**
   * Compares the contractor's profile with the eligibility the dossier read
   * from the tender documents (see contractorFit.js).
   */
  async calculateContractorPersonalizedFit(tender, userId, dossier) {
    const profile = await this.getOrCreateContractorProfile(userId);
    return computeContractorFit(profile, dossier, this.detectTenderDomain(tender));
  }

  /**
   * Executes Gemini LLM extraction pipeline with structured JSON schema
   */
  async executeGeminiTenderAnalysis(tender, corpus) {
    const prompt = buildDossierPrompt(tender, corpus);

    if (geminiClient) {
      const uploaded = [];
      try {
        const model = geminiClient.getGenerativeModel({
          model: env.GEMINI_MODEL || 'gemini-2.5-flash',
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 32768,
          }
        });

        // Scanned PDFs have no text layer; Gemini reads their pages directly.
        const fileParts = [];
        if (corpus.scannedPdfs.length) {
          const fileManager = new GoogleAIFileManager(env.GEMINI_API_KEY);
          for (const doc of corpus.scannedPdfs) {
            try {
              const upload = await fileManager.uploadFile(doc.buffer, { mimeType: 'application/pdf', displayName: doc.name.slice(0, 100) });
              let file = upload.file;
              for (let i = 0; file.state === 'PROCESSING' && i < 30; i += 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                file = await fileManager.getFile(file.name);
              }
              uploaded.push(file.name);
              if (file.state !== 'ACTIVE') throw new Error(`file state ${file.state}`);
              fileParts.push({ text: `Scanned document "${doc.name}" (${doc.category}, ${doc.pages} pages) follows:` });
              fileParts.push({ fileData: { mimeType: 'application/pdf', fileUri: file.uri } });
            } catch (uploadErr) {
              corpus.warnings.push(`${doc.name}: scanned PDF could not be sent to the AI (${uploadErr.message}).`);
              const entry = corpus.summary.find((d) => d.name === doc.name && d.method === 'scanned-pdf');
              if (entry) entry.method = 'skipped';
            }
          }
        }

        // Retry the brief 429/5xx "high demand" errors Gemini returns under load.
        let response;
        for (let attempt = 1; ; attempt += 1) {
          try {
            response = await model.generateContent([...fileParts, { text: prompt }]);
            break;
          } catch (err) {
            const transient = /\[(429|500|502|503|504)\b/.test(err.message || '');
            if (!transient || attempt >= 3) throw err;
            logger.warn(`Gemini busy (attempt ${attempt}): ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
          }
        }
        const parsed = JSON.parse(response.response.text());
        const usage = response.response.usageMetadata || {};
        parsed.tokens = {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
          cachedTokens: usage.cachedContentTokenCount || 0,
        };
        parsed.provider = env.GEMINI_MODEL || 'gemini-2.5-flash';
        return parsed;
      } catch (geminiErr) {
        logger.warn(`Gemini analysis failed (${geminiErr.message}), trying fallback...`);
      } finally {
        if (uploaded.length) {
          const fileManager = new GoogleAIFileManager(env.GEMINI_API_KEY);
          await Promise.all(uploaded.map((name) => fileManager.deleteFile(name).catch(() => {})));
        }
      }
    }

    if (openaiClient) {
      try {
        // gpt-4o-mini cannot read scanned PDFs here and has a smaller context window.
        const text = prompt.length > OPENAI_PROMPT_CHARS ? prompt.slice(0, OPENAI_PROMPT_CHARS - 2000) + prompt.slice(prompt.lastIndexOf('</tender-documents>')) : prompt;
        if (corpus.scannedPdfs.length) {
          corpus.warnings.push('Scanned PDFs were not analysed: the backup AI model cannot read them.');
          for (const entry of corpus.summary) if (entry.method === 'scanned-pdf') entry.method = 'skipped';
        }
        if (text.length < prompt.length) corpus.warnings.push('The backup AI model received a shortened copy of the documents.');
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You analyse Indian public procurement tenders strictly from the documents provided. Output strictly JSON.' },
            { role: 'user', content: text }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        });
        const parsed = JSON.parse(completion.choices[0].message.content);
        parsed.tokens = {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          cachedTokens: completion.usage?.prompt_tokens_details?.cached_tokens || 0
        };
        parsed.provider = 'gpt-4o-mini';
        return parsed;
      } catch (openAiErr) {
        logger.warn(`OpenAI analysis fallback failed (${openAiErr.message})`);
      }
    }

    // No AI model answered. The template below is generic for the tender's
    // domain and is flagged as TEMPLATE so the UI never presents it as analysis.
    const template = this.generateDeterministicEngineeringDossier(tender);
    template.isTemplate = true;
    template.provider = 'template';
    template.tokens = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
    return template;
  }

  /**
   * Intelligently detects the domain of the tender (IT Hardware, Medical, Logistics, Services, Civil)
   */
  detectTenderDomain(tender) {
    const combined = `${tender.title || ''} ${tender.workDescription || ''} ${tender.departmentName || ''} ${tender.organisationChain || ''} ${tender.tenderCategory || ''}`.toLowerCase();
    
    if (/\b(pc|desktop|laptop|computer|server|monitor|display|printer|scanner|cctv|ups|it hardware|software|networking|switch|router|all in one|workstation|tablet|biometric|smart class|projector)\b/i.test(combined)) {
      return 'IT_HARDWARE';
    }
    if (/\b(medicine|drug|pharma|medical|hospital|reagent|syringe|surgical|diagnostic|icu|ventilator|ambulance|x-ray|dialysis|biomedical)\b/i.test(combined)) {
      return 'MEDICAL_SUPPLIES';
    }
    if (/\b(vehicle|car|truck|bus|hiring of vehicle|commercial vehicle|transportation|taxi|tipper)\b/i.test(combined)) {
      return 'VEHICLE_LOGISTICS';
    }
    if (/\b(security guard|sanitation|housekeeping|manpower|canteen|catering|cleaning service|facility management|amc|pest control)\b/i.test(combined)) {
      return 'SERVICES_MANPOWER';
    }
    return 'CIVIL_WORKS';
  }

  /**
   * Deterministic engineering parser: generates realistic, highly accurate estimates tailored to the tender domain
   */
  generateDeterministicEngineeringDossier(tender) {
    const computedVal = tender.estimatedValue || (tender.gemData?.pdfData?.minTurnoverLakhs ? tender.gemData.pdfData.minTurnoverLakhs * 100000 : 4500000);
    const val = computedVal || 4500000;
    const title = tender.title || 'Government Procurement';
    const dept = tender.departmentName || tender.organisationChain || 'Government Department';
    const domain = this.detectTenderDomain(tender);

    if (domain === 'IT_HARDWARE') {
      return this.buildItHardwareDossier(tender, val, title, dept);
    }
    if (domain === 'MEDICAL_SUPPLIES') {
      return this.buildMedicalDossier(tender, val, title, dept);
    }
    if (domain === 'VEHICLE_LOGISTICS') {
      return this.buildVehicleLogisticsDossier(tender, val, title, dept);
    }
    if (domain === 'SERVICES_MANPOWER') {
      return this.buildServicesDossier(tender, val, title, dept);
    }
    return this.buildCivilWorksDossier(tender, val, title, dept);
  }

  /**
   * Builds IT Hardware & Computing Equipment Dossier (Desktops, Laptops, All-in-One PCs, Servers)
   */
  buildItHardwareDossier(tender, val, title, dept) {
    let qty = 50;
    const qtyMatch = (tender.workDescription || '').match(/Total Quantity:\s*(\d+)/i) || (tender.title || '').match(/(\d+)\s*(?:nos|units|pieces|qty)/i);
    if (qtyMatch && Number(qtyMatch[1]) > 0) {
      qty = Number(qtyMatch[1]);
    }
    const pcUnitRate = Math.max(35000, Math.min(85000, Math.round((val * 0.70) / qty)));
    const totalPcCost = pcUnitRate * qty;
    const emdAmount = tender.emdAmount || Math.round(val * 0.02);

    return {
      summary: `• Scope & Department: ${title} (${dept})\n• Procurement Category: GeM Goods Procurement (IT Hardware, All-in-One PCs & Workstations)\n• Outlay & Volume: ₹${(val / 1e5).toFixed(2)} Lakhs | Supply of ${qty} Desktop Units with 3-Year Onsite OEM Warranty\n• Crucial Qualifications: Bid-specific OEM Authorization Form (MAF), BIS Registration (CRS), and ISO 9001/20000\n• Strategic Advice: Lock pricing with authorized OEM distributor; ensure delivery challans and 48-hour SLA maintenance.`,
      preBidAnalysis: {
        eligibilityCriteria: {
          requiredTurnover: `₹${((val * 0.5) / 1e7).toFixed(2)} Crore (Average 3-year turnover under GeM Goods)`,
          solvencyRequired: `₹${((val * 0.3) / 1e7).toFixed(2)} Crore Banker Solvency / Working Capital Line`,
          experienceCriteria: `Must have supplied similar IT hardware costing min ₹${((val * 0.8) / 1e7).toFixed(2)} Cr (1 work) or ₹${((val * 0.5) / 1e7).toFixed(2)} Cr (2 works) to Govt/PSUs in last 3 years.`,
          minimumRegistrationClass: 'Authorized GeM OEM / Class-1 or Class-2 Local IT Reseller',
          jointVentureAllowed: false,
          emdExemptionPossible: true,
          keyRequirements: [
            'Bid-specific Manufacturer Authorization Form (MAF) from OEM',
            'Valid BIS Registration (CRS) Certificate under MeitY guidelines',
            'Make In India (MII) Local Content Declaration (Class-I >=50% or Class-II >=20%)',
            'Dedicated 24x7 OEM Technical Support & Escalation Matrix'
          ]
        },
        mandatoryDocumentChecklist: [
          {
            sNo: 1,
            title: 'Bid-Specific OEM Authorization (MAF)',
            description: 'Official authorization letter from OEM certifying bidder as authorized distributor with 3-year onsite warranty backing.',
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Must carry the exact GeM Bid Number and current date.'
          },
          {
            sNo: 2,
            title: 'BIS Registration Certificate (CRS)',
            description: 'Compulsory Registration Scheme certificate issued by Bureau of Indian Standards for Desktop/AIO PC models.',
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Verify that the quoted model number exactly matches the BIS CRS portal listing.'
          },
          {
            sNo: 3,
            title: 'Past Performance & Govt Supply Invoices',
            description: 'Copies of Supply Orders and Consignee Acceptance Certificates (CRAC) for similar IT supplies in last 3 years.',
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Purchase orders without consignee delivery proof or CRAC may be rejected.'
          },
          {
            sNo: 4,
            title: 'Make In India (MII) Local Content Affidavit',
            description: 'Self-certification indicating percentage of local content and location of local manufacturing/assembly facility.',
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Must specify Class-I (>=50%) or Class-II (>=20%) local supplier status.'
          },
          {
            sNo: 5,
            title: 'Bid Security / EMD Exemption Document',
            description: `EMD amount of ₹${emdAmount.toLocaleString('en-IN')} or valid Udyam / MSME Certificate for IT equipment supply category.`,
            stage: 'Fee Cover',
            isMandatory: true,
            complianceTip: 'Ensure Udyam registration covers Computer and Peripheral Equipment Manufacturing/Trade.'
          }
        ],
        boqMaterialBreakdown: {
          summary: `• Procurement Scope: All-in-One PC / Mid-Level Desktop Computers & Peripherals\n• Supply Volume: ${qty} Workstation Units with 3-Year Onsite OEM Warranty\n• Budget Allocation: ₹${(val * 0.85 / 1e5).toFixed(2)} Lakhs for hardware supply & ₹${(val * 0.15 / 1e5).toFixed(2)} Lakhs for installation & SLA.`,
          materials: [
            {
              name: 'All in One PC (V2) / Mid-Level Desktop',
              category: 'Computing Hardware',
              estimatedQuantity: `${qty} Units`,
              unit: 'Units',
              specCode: 'GeM Q2/V2 Specs (i5/i7, 16GB RAM, 512GB SSD)',
              approxRateInr: `₹ ${pcUnitRate.toLocaleString('en-IN')}`,
              totalEstCost: `₹ ${totalPcCost.toLocaleString('en-IN')}`
            },
            {
              name: 'OEM Wired Keyboard & Optical Mouse',
              category: 'Peripherals',
              estimatedQuantity: `${qty} Sets`,
              unit: 'Sets',
              specCode: 'BIS / USB Interface',
              approxRateInr: '₹ 1,200 / set',
              totalEstCost: `₹ ${(qty * 1200).toLocaleString('en-IN')}`
            },
            {
              name: 'Pre-Installed Genuine OS (Windows 11 Pro / Ubuntu)',
              category: 'Operating System',
              estimatedQuantity: `${qty} Licenses`,
              unit: 'Licenses',
              specCode: 'Factory Pre-Loaded OEM License',
              approxRateInr: '₹ 8,500 / license',
              totalEstCost: `₹ ${(qty * 8500).toLocaleString('en-IN')}`
            },
            {
              name: '3-Year Comprehensive On-Site OEM Warranty & SLA',
              category: 'Warranty & Support',
              estimatedQuantity: `${qty} Packs`,
              unit: 'Packs',
              specCode: '48-Hour NBD Resolution Guarantee',
              approxRateInr: '₹ 3,500 / unit',
              totalEstCost: `₹ ${(qty * 3500).toLocaleString('en-IN')}`
            }
          ],
          boqLineItems: [
            {
              itemNo: '1.01',
              description: 'Supply of All-in-One PC Desktop with FHD IPS Display, Core i5/i7 Processor, 16GB RAM, 512GB NVMe SSD',
              quantity: qty,
              unit: 'Nos',
              estimatedRate: pcUnitRate,
              estimatedAmount: totalPcCost
            },
            {
              itemNo: '1.02',
              description: 'Supply of OEM USB Wired Keyboard and Optical Scroll Mouse',
              quantity: qty,
              unit: 'Nos',
              estimatedRate: 1200,
              estimatedAmount: qty * 1200
            },
            {
              itemNo: '1.03',
              description: 'Pre-installed Genuine OEM Windows 11 Pro 64-bit National Academic / Professional License',
              quantity: qty,
              unit: 'Nos',
              estimatedRate: 8500,
              estimatedAmount: qty * 8500
            },
            {
              itemNo: '1.04',
              description: 'Onsite Unboxing, Assembly, OS Boot Test, Domain Joining, and Asset Tagging',
              quantity: qty,
              unit: 'Job',
              estimatedRate: 1000,
              estimatedAmount: qty * 1000
            }
          ]
        },
        riskAndRedFlags: [
          {
            severity: 'HIGH',
            title: 'Liquidated Damages for Delayed Supply',
            clauseReference: 'GeM GTC Clause 12.1',
            riskSummary: 'Deduction of 0.5% per week of delay or part thereof, up to a maximum cap of 10% of total contract value.',
            mitigationAction: 'Confirm factory production lead times and lock dispatch schedules before submitting final bid price.'
          },
          {
            severity: 'HIGH',
            title: 'Non-Genuine / Grey Market Component Rejection',
            clauseReference: 'GeM STC Technical Clause',
            riskSummary: 'Buyer quality inspection verifies serial numbers directly on OEM database; grey-market components trigger immediate contract cancellation and vendor debarment.',
            mitigationAction: 'Source strictly through authorized tier-1 OEM distributors with direct invoice linkage.'
          },
          {
            severity: 'MEDIUM',
            title: 'Onsite Warranty SLA Downtime Penalties',
            clauseReference: 'GeM SLA Clause 4.2',
            riskSummary: 'Penalty of ₹500 per desktop per calendar day if hardware issues are not resolved within 48 hours of ticket logging.',
            mitigationAction: 'Maintain buffer inventory of spare power adapters, RAM modules, and keyboards at regional service center.'
          }
        ]
      },
      postAwardAnalysis: {
        procurementSchedule: [
          {
            phase: 'Phase 1: OEM Order Booking & Factory Dispatch (Days 1 to 15)',
            timeframe: 'Weeks 1–2',
            materialsToMobilize: ['Confirmed OEM Purchase Order', 'Serial Number Allocation Sheet', 'Transit Insurance Coverage'],
            criticalPathItems: 'OEM production slot confirmation and dispatch tracking.'
          },
          {
            phase: 'Phase 2: Consignee Delivery & Unloading (Days 16 to 30)',
            timeframe: 'Weeks 3–4',
            materialsToMobilize: ['Original Delivery Challans', 'Tax Invoices in Triplicate', 'Warranty Cards'],
            criticalPathItems: 'Physical verification of box seals and receiving stamp on challans.'
          },
          {
            phase: 'Phase 3: Installation & Acceptance (Days 31 to 45)',
            timeframe: 'Weeks 5–6',
            materialsToMobilize: ['Peripherals & Power Cables', 'OS Activation Keys', 'Asset Tag Stickers'],
            criticalPathItems: 'Joint inspection and generation of GeM online CRAC certificate.'
          }
        ],
        milestones: [
          {
            milestoneNo: 1,
            description: 'Factory dispatch and delivery of full desktop consignment to all consignees',
            targetDays: 30,
            financialProgressPct: 70,
            penaltyIfDelayed: '0.5% per week of delay or part thereof up to 10% LD.'
          },
          {
            milestoneNo: 2,
            description: 'Unboxing, onsite desktop setup, network joining, and OS activation',
            targetDays: 40,
            financialProgressPct: 90,
            penaltyIfDelayed: '₹1,000 per day for installation delays exceeding 5 days from delivery.'
          },
          {
            milestoneNo: 3,
            description: 'Final user acceptance sign-off, asset tagging, and GeM CRAC approval',
            targetDays: 45,
            financialProgressPct: 100,
            penaltyIfDelayed: 'Payment release withheld pending online CRAC generation.'
          }
        ],
        qualityAndSafetyCompliance: [
          {
            standardCode: 'BIS IS 13252 (Part 1)',
            title: 'Information Technology Equipment Safety Compliance',
            testFrequency: 'Every manufactured model lot',
            inspectingAuthority: 'MeitY / BIS Authorized Test Lab'
          },
          {
            standardCode: 'BEE Star / Energy Star',
            title: 'Energy Consumption & Efficiency Rating',
            testFrequency: 'Standard OEM compliance certificate',
            inspectingAuthority: 'Bureau of Energy Efficiency'
          },
          {
            standardCode: 'ISO 9001:2015 & ISO 27001',
            title: 'Quality & Information Security Management',
            testFrequency: 'Annual certification validity',
            inspectingAuthority: 'Accredited Certification Body'
          }
        ],
        penaltyClauses: [
          {
            type: 'Liquidated Damages for Delayed Delivery',
            rate: '0.5% per week of delay or part thereof',
            maximumCap: '10.0% of total contract value',
            conditions: 'Triggered if delivery to consignee is not completed within stipulated 30-45 day window.'
          },
          {
            type: 'Warranty SLA Downtime Penalty',
            rate: '₹500 per desktop per calendar day of unresolved downtime',
            maximumCap: 'Performance Security (PBG) forfeiture',
            conditions: 'Applicable if hardware faults are not resolved within 48 hours of ticket logging.'
          }
        ]
      },
      tokens: { promptTokens: 9200, completionTokens: 2100, cachedTokens: 0 }
    };
  }

  /**
   * Builds Medical, Pharmaceuticals & Healthcare Supplies Dossier
   */
  buildMedicalDossier(tender, val, title, dept) {
    const emdAmount = tender.emdAmount || Math.round(val * 0.02);
    return {
      summary: `• Scope & Department: ${title} (${dept})\n• Category: Medical & Hospital Equipment / Pharmaceutical Supply\n• Estimated Outlay: ₹${(val / 1e5).toFixed(2)} Lakhs | Supply Window: ${tender.periodOfWorkDays || 30} Calendar Days\n• Key Certifications: CDSCO / Drug License, WHO-GMP, and USFDA / CE conformity\n• Winning Recommendation: Ensure batch testing reports and cold-chain logistics agreements are in place.`,
      preBidAnalysis: {
        eligibilityCriteria: {
          requiredTurnover: `₹${((val * 0.5) / 1e7).toFixed(2)} Crore (Average 3-year turnover)`,
          solvencyRequired: `₹${((val * 0.3) / 1e7).toFixed(2)} Crore Banker Solvency`,
          experienceCriteria: `Executed similar medical supplies of min ₹${((val * 0.5) / 1e7).toFixed(2)} Cr in last 3 years.`,
          minimumRegistrationClass: 'Licensed Pharmaceutical / Medical Device Supplier',
          jointVentureAllowed: false,
          emdExemptionPossible: true,
          keyRequirements: ['Valid Drug License / Medical Device Registration', 'WHO-GMP Manufacturing Certificate', 'Batch Analytical Test Reports']
        },
        mandatoryDocumentChecklist: [
          { sNo: 1, title: 'Valid Drug License / CDSCO Form', description: 'License for wholesale distribution or manufacture.', stage: 'Technical Cover', isMandatory: true, complianceTip: 'Ensure territorial jurisdiction is valid.' },
          { sNo: 2, title: 'WHO-GMP Certification', description: 'Good Manufacturing Practices certificate for drug manufacturing facility.', stage: 'Technical Cover', isMandatory: true, complianceTip: 'Certificate must not be expired.' },
          { sNo: 3, title: 'Batch Test & Shelf-Life Certificate', description: 'Certificate certifying minimum 5/6th unexpired shelf life at delivery.', stage: 'Technical Cover', isMandatory: true, complianceTip: 'Short-expiry consignments will be rejected.' }
        ],
        boqMaterialBreakdown: {
          summary: `• Medical Supplies Outlay: ₹${(val * 0.85 / 1e5).toFixed(2)} Lakhs\n• Logistics & Testing: ₹${(val * 0.15 / 1e5).toFixed(2)} Lakhs`,
          materials: [
            { name: 'Primary Medical Goods / Consumables', category: 'Medical', estimatedQuantity: 'As per Schedule', unit: 'Packs', specCode: 'IP / BP / USP Pharmacopoeia', approxRateInr: 'Schedule Rates', totalEstCost: `₹ ${(val * 0.85).toLocaleString('en-IN')}` }
          ],
          boqLineItems: [
            { itemNo: '1.01', description: 'Supply of Medical Goods according to departmental technical specifications', quantity: 1, unit: 'Lot', estimatedRate: Math.round(val * 0.85), estimatedAmount: Math.round(val * 0.85) }
          ]
        },
        riskAndRedFlags: [
          { severity: 'HIGH', title: 'Quality Failure / NSQ (Not of Standard Quality)', clauseReference: 'Drugs & Cosmetics Act', riskSummary: 'Batch failure triggers total recall, forfeiture of security deposit, and blacklisting.', mitigationAction: 'Conduct pre-dispatch NABL lab analysis.' }
        ]
      },
      postAwardAnalysis: {
        procurementSchedule: [
          { phase: 'Batch Production & Lab Testing (Days 1 to 15)', timeframe: 'Month 1', materialsToMobilize: ['Batch Inspection Reports'], criticalPathItems: 'NABL test clearance.' }
        ],
        milestones: [
          { milestoneNo: 1, description: 'Delivery of verified batches to central medical stores', targetDays: 30, financialProgressPct: 100, penaltyIfDelayed: '0.5% per week of delay.' }
        ],
        qualityAndSafetyCompliance: [
          { standardCode: 'IP / BP Pharmacopoeia', title: 'Drug Quality & Potency Assay', testFrequency: 'Every Batch Consignment', inspectingAuthority: 'State Drug Testing Laboratory' }
        ],
        penaltyClauses: [
          { type: 'Liquidated Damages for Delayed Supply', rate: '0.5% per week', maximumCap: '10%', conditions: 'Triggered upon late delivery to hospital stores.' }
        ]
      },
      tokens: { promptTokens: 8500, completionTokens: 1800, cachedTokens: 0 }
    };
  }

  /**
   * Builds Vehicle Hiring & Transport Logistics Dossier
   */
  buildVehicleLogisticsDossier(tender, val, title, dept) {
    return {
      summary: `• Scope & Department: ${title} (${dept})\n• Category: Commercial Vehicle Hiring / Transport Logistics\n• Estimated Outlay: ₹${(val / 1e5).toFixed(2)} Lakhs | Service Window: ${tender.periodOfWorkDays || 365} Calendar Days\n• Key Requirements: Commercial Yellow Plate Registration, Valid Fitness, All-J&K Permit, and Comprehensive Insurance\n• Winning Recommendation: Verify vehicle fleet model year (must not be older than 3 years) and driver background verifications.`,
      preBidAnalysis: {
        eligibilityCriteria: {
          requiredTurnover: `₹${((val * 0.4) / 1e7).toFixed(2)} Crore (Average 3-year turnover)`,
          solvencyRequired: `₹${((val * 0.2) / 1e7).toFixed(2)} Crore Solvency`,
          experienceCriteria: `Executed vehicle hiring / transport services of min ₹${((val * 0.5) / 1e7).toFixed(2)} Cr in last 3 years.`,
          minimumRegistrationClass: 'Registered Tour & Transport Operator / Fleet Owner',
          jointVentureAllowed: false,
          emdExemptionPossible: true,
          keyRequirements: ['Commercial RC Copies of Fleet', 'Valid Taxi / Commercial Permits', 'Pollution & Fitness Certificates']
        },
        mandatoryDocumentChecklist: [
          { sNo: 1, title: 'Commercial Registration Certificates (RC)', description: 'RC copies showing commercial registration.', stage: 'Technical Cover', isMandatory: true, complianceTip: 'Private number plates are strictly prohibited.' }
        ],
        boqMaterialBreakdown: {
          summary: `• Vehicle Fleet Fuel & Maintenance: ₹${(val * 0.70 / 1e5).toFixed(2)} Lakhs\n• Driver Wages & Statutory Compliance: ₹${(val * 0.30 / 1e5).toFixed(2)} Lakhs`,
          materials: [
            { name: 'Commercial Vehicle Hiring Services', category: 'Fleet', estimatedQuantity: 'As per NIT', unit: 'Months', specCode: 'AC / Non-AC Commercial Vehicles', approxRateInr: 'Monthly Rates', totalEstCost: `₹ ${(val).toLocaleString('en-IN')}` }
          ],
          boqLineItems: [
            { itemNo: '1.01', description: 'Providing Commercial Vehicles on Monthly Hiring Basis including Fuel, Maintenance, and Driver', quantity: 1, unit: 'Job', estimatedRate: val, estimatedAmount: val }
          ]
        },
        riskAndRedFlags: [
          { severity: 'HIGH', title: 'Vehicle Breakdown & Replacement Penalty', clauseReference: 'Special Conditions', riskSummary: 'Failure to provide alternative vehicle within 2 hours attracts ₹2,000 per day penalty.', mitigationAction: 'Keep 1 reserve vehicle on standby.' }
        ]
      },
      postAwardAnalysis: {
        procurementSchedule: [
          { phase: 'Fleet Deployment & Inspection (Days 1 to 7)', timeframe: 'Week 1', materialsToMobilize: ['Fleet Documents'], criticalPathItems: 'Vehicle inspection by RTO/Department.' }
        ],
        milestones: [
          { milestoneNo: 1, description: 'Successful fleet deployment and operational commencement', targetDays: 7, financialProgressPct: 10, penaltyIfDelayed: '₹2,000/day.' }
        ],
        qualityAndSafetyCompliance: [
          { standardCode: 'Motor Vehicles Act 1988', title: 'Commercial Vehicle Safety & Fitness', testFrequency: 'Annual', inspectingAuthority: 'Motor Vehicles Department (RTO)' }
        ],
        penaltyClauses: [
          { type: 'Service Deficiency Penalty', rate: '₹2,000 per day of vehicle unavailability', maximumCap: '10%', conditions: 'Applicable if vehicle is absent without substitute.' }
        ]
      },
      tokens: { promptTokens: 8200, completionTokens: 1700, cachedTokens: 0 }
    };
  }

  /**
   * Builds Services, Facility Management & Manpower Dossier
   */
  buildServicesDossier(tender, val, title, dept) {
    return {
      summary: `• Scope & Department: ${title} (${dept})\n• Category: Manpower Outsourcing / Facility Management / Security Services\n• Estimated Outlay: ₹${(val / 1e5).toFixed(2)} Lakhs | Execution Window: ${tender.periodOfWorkDays || 365} Calendar Days\n• Mandatory Compliance: PSARA License (for security), EPF & ESIC Registration, and Minimum Wages Compliance\n• Winning Recommendation: Calculate statutory EPF/ESIC and bonus strictly according to latest central/state wage notifications.`,
      preBidAnalysis: {
        eligibilityCriteria: {
          requiredTurnover: `₹${((val * 0.5) / 1e7).toFixed(2)} Crore`,
          solvencyRequired: `₹${((val * 0.25) / 1e7).toFixed(2)} Crore`,
          experienceCriteria: `Providing similar manpower/security services to Govt/PSU in last 3 years.`,
          minimumRegistrationClass: 'Registered Manpower / Security Agency',
          jointVentureAllowed: false,
          emdExemptionPossible: true,
          keyRequirements: ['Valid Labour Department Registration', 'EPF & ESIC Code with active payment track record', 'PSARA License (if security services)']
        },
        mandatoryDocumentChecklist: [
          { sNo: 1, title: 'EPF & ESIC Registration & Past Challans', description: 'ECR copies proving timely statutory deposit for deployed workers.', stage: 'Technical Cover', isMandatory: true, complianceTip: 'Upload last 6 months electronic challan cum returns.' }
        ],
        boqMaterialBreakdown: {
          summary: `• Manpower Wages (Minimum Wages): ₹${(val * 0.82 / 1e5).toFixed(2)} Lakhs\n• EPF, ESIC, Uniform & Service Charge: ₹${(val * 0.18 / 1e5).toFixed(2)} Lakhs`,
          materials: [
            { name: 'Outsourced Personnel & Service Operations', category: 'Manpower', estimatedQuantity: 'Monthly Staffing', unit: 'Months', specCode: 'Minimum Wages Act', approxRateInr: 'Monthly Rates', totalEstCost: `₹ ${(val).toLocaleString('en-IN')}` }
          ],
          boqLineItems: [
            { itemNo: '1.01', description: 'Providing outsourced security/sanitation/manpower personnel', quantity: 1, unit: 'Lot', estimatedRate: val, estimatedAmount: val }
          ]
        },
        riskAndRedFlags: [
          { severity: 'HIGH', title: 'Non-Payment of Minimum Wages / EPF Default', clauseReference: 'Labour Laws', riskSummary: 'Non-compliance leads to immediate contract termination and recovery from bills.', mitigationAction: 'Pay wages strictly via bank transfer before 7th of each month.' }
        ]
      },
      postAwardAnalysis: {
        procurementSchedule: [
          { phase: 'Personnel Mobilization & Police Verification (Days 1 to 10)', timeframe: 'Week 1', materialsToMobilize: ['Staff Badges', 'Uniforms'], criticalPathItems: 'Police verification certificates.' }
        ],
        milestones: [
          { milestoneNo: 1, description: 'Full staff deployment and biometrics setup', targetDays: 10, financialProgressPct: 15, penaltyIfDelayed: '₹3,000/day.' }
        ],
        qualityAndSafetyCompliance: [
          { standardCode: 'Contract Labour (R&A) Act', title: 'Minimum Wages & Statutory EPF/ESIC Verification', testFrequency: 'Monthly', inspectingAuthority: 'Labour Enforcement Officer' }
        ],
        penaltyClauses: [
          { type: 'Absenteeism Penalty', rate: 'Daily wage rate + 50% penalty per absent shift', maximumCap: '10%', conditions: 'Triggered if deployed strength is below mandated shift numbers.' }
        ]
      },
      tokens: { promptTokens: 8400, completionTokens: 1800, cachedTokens: 0 }
    };
  }

  /**
   * Builds Standard Civil Works & Infrastructure Dossier (Roads, Buildings, Bridges, Drainage)
   */
  buildCivilWorksDossier(tender, val, title, dept) {
    const isRoad = title.toLowerCase().includes('road') || title.toLowerCase().includes('bt') || title.toLowerCase().includes('macadam');
    const isWater = title.toLowerCase().includes('water') || title.toLowerCase().includes('pipe') || title.toLowerCase().includes('drain');

    // Material breakdowns scaled accurately by engineering norms
    const cementBags = Math.round(val * 0.00065);
    const steelMt = Math.max(8, Math.round(val * 0.0000075));
    const aggregateMt = Math.round(val * 0.00035);
    const bitumenMt = isRoad ? Math.max(12, Math.round(val * 0.000004)) : 0;

    const minClass = val > 100000000 ? 'Special Class' : (val > 30000000 ? 'Class A' : (val > 10000000 ? 'Class B' : (val > 2500000 ? 'Class C' : 'Class D')));

    return {
      summary: `• Scope & Department: ${title} (${dept})\n• Outlay & Timeline: ₹${(val / 1e5).toFixed(2)} Lakhs | ${tender.periodOfWorkDays || 90} Calendar Days execution window\n• Required Enlistment: Minimum J&K PWD ${minClass} Contractor Registration\n• Mandatory Financials: 2% EMD (CDR/FDR), 40% Banker Solvency (₹${((val * 0.4) / 1e5).toFixed(2)} Lakhs), and 100% 3-Yr Turnover\n• Winning Recommendation: Strong profitability profile; verify plant tie-ups and ensure timely bid submission before deadline.`,
      preBidAnalysis: {
        eligibilityCriteria: {
          requiredTurnover: `₹${((val * 1.0) / 1e7).toFixed(2)} Crore (Average 3-year turnover)`,
          solvencyRequired: `₹${((val * 0.4) / 1e7).toFixed(2)} Crore Banker Solvency Certificate`,
          experienceCriteria: `Must have completed 1 similar work of min ₹${((val * 0.8) / 1e7).toFixed(2)} Cr (80%) or 2 works of min ₹${((val * 0.5) / 1e7).toFixed(2)} Cr (50%) in last 5 years.`,
          minimumRegistrationClass: minClass,
          jointVentureAllowed: val > 50000000,
          emdExemptionPossible: tender.emdExemptionAllowed === 'Yes' || false,
          keyRequirements: [
            'Active GST Registration with updated GSTR-3B filings',
            'Valid EPF & ESIC Registration Certificates with latest payment challans',
            'Affidavit for non-blacklisting on ₹100 stamp paper attested by 1st Class Judicial Magistrate (dated after NIT)',
            'Machinery commitment undertaking on notarized legal paper'
          ]
        },
        mandatoryDocumentChecklist: [
          {
            sNo: 1,
            title: 'Earnest Money Deposit (EMD) / Bid Security',
            description: `EMD amount of ₹${(tender.emdAmount || val * 0.02).toLocaleString('en-IN')} in format of CDR/FDR/BG from any Scheduled Commercial Bank pledged to Executive Engineer.`,
            stage: 'Fee Cover',
            isMandatory: true,
            complianceTip: 'Ensure validity is minimum 180 days from the technical bid opening date.'
          },
          {
            sNo: 2,
            title: 'Valid Contractor Enlistment / Registration Card',
            description: `Certified copy of Class ${minClass} Works registration with current financial year renewal receipt.`,
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Must include the latest renewal receipt and territorial endorsement.'
          },
          {
            sNo: 3,
            title: 'Similar Work Experience Certificates',
            description: `Satisfactory completion certificates issued by an officer not below rank of Executive Engineer.`,
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Work order copies alone are NOT accepted; final completion and payment certificate is compulsory.'
          },
          {
            sNo: 4,
            title: 'Machinery & Equipment Undertaking',
            description: 'Affidavit affirming availability of required road rollers, mixers, excavators, and dumpers either owned or leased.',
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Provide RC copies for owned equipment or registered MoU for leased machinery.'
          },
          {
            sNo: 5,
            title: 'Non-Blacklisting & Integrity Pact Affidavit',
            description: 'Solemn affirmation on non-judicial stamp paper stating no debarment by any Central/State PSU.',
            stage: 'Technical Cover',
            isMandatory: true,
            complianceTip: 'Date of affidavit must be strictly after the NIT issuance date.'
          }
        ],
        boqMaterialBreakdown: {
          summary: `• Material Outlay: Estimated at ₹${(val * 0.62 / 1e5).toFixed(2)} Lakhs (~62% of tender budget)\n• Core Materials: Cement, TMT Rebars, Crushed Aggregate${isRoad ? ', Bitumen VG-30' : ''}\n• Phase 1 Staging: Mobilize 25% cement & shuttering formwork within 15 days of allotment.`,
          materials: [
            {
              name: 'Portland Pozzolana / OPC 43 Cement',
              category: 'Cement',
              estimatedQuantity: `${cementBags.toLocaleString('en-IN')} Bags`,
              unit: 'Bags',
              specCode: 'IS 1489 Part 1',
              approxRateInr: '₹ 385 / bag',
              totalEstCost: `₹ ${(cementBags * 385).toLocaleString('en-IN')}`
            },
            {
              name: 'TMT Thermo-Mechanically Treated Rebars (Fe 500D)',
              category: 'Steel',
              estimatedQuantity: `${steelMt} MT`,
              unit: 'MT',
              specCode: 'IS 1786:2008',
              approxRateInr: '₹ 54,500 / MT',
              totalEstCost: `₹ ${(steelMt * 54500).toLocaleString('en-IN')}`
            },
            {
              name: 'Coarse & Fine Stone Aggregate (20mm & 40mm)',
              category: 'Aggregate',
              estimatedQuantity: `${aggregateMt.toLocaleString('en-IN')} Metric Tonnes`,
              unit: 'MT',
              specCode: 'IS 383:2016',
              approxRateInr: '₹ 850 / MT',
              totalEstCost: `₹ ${(aggregateMt * 850).toLocaleString('en-IN')}`
            },
            ...(isRoad ? [{
              name: 'Paving Bitumen (Grade VG-30 / Emulsion)',
              category: 'Bitumen',
              estimatedQuantity: `${bitumenMt} MT`,
              unit: 'MT',
              specCode: 'IS 73:2013',
              approxRateInr: '₹ 48,000 / MT',
              totalEstCost: `₹ ${(bitumenMt * 48000).toLocaleString('en-IN')}`
            }] : [])
          ],
          boqLineItems: [
            {
              itemNo: '1.01',
              description: 'Earthwork in excavation including shoring, strutting and dressing of sides.',
              quantity: Math.round(val * 0.0018),
              unit: 'cum',
              estimatedRate: 195,
              estimatedAmount: Math.round(val * 0.0018 * 195)
            },
            {
              itemNo: '1.02',
              description: 'Providing and laying in position plain cement concrete 1:3:6 (1 cement : 3 coarse sand : 6 graded stone aggregate 20mm).',
              quantity: Math.round(val * 0.0003),
              unit: 'cum',
              estimatedRate: 5450,
              estimatedAmount: Math.round(val * 0.0003 * 5450)
            },
            {
              itemNo: '1.03',
              description: 'Reinforced cement concrete work in walls, retaining structures, suspended floors and beams (1:1.5:3).',
              quantity: Math.round(val * 0.00022),
              unit: 'cum',
              estimatedRate: 7850,
              estimatedAmount: Math.round(val * 0.00022 * 7850)
            }
          ]
        },
        riskAndRedFlags: [
          {
            severity: 'HIGH',
            title: 'Liquidated Damages Clause (Late Completion)',
            clauseReference: 'GCC Clause 32.1',
            riskSummary: 'Deduction of 0.5% per week of delay or part thereof, up to a maximum cap of 10% of total contract value.',
            mitigationAction: 'Ensure baseline CPM/PERT schedule is submitted within 14 days and record all delay handovers in site hindrance register.'
          },
          {
            severity: 'MEDIUM',
            title: 'Price Escalation Clause Inapplicability',
            clauseReference: 'SCC Clause 8.4',
            riskSummary: 'No price variation or escalation will be paid for cement, steel, or fuel if contract completion period is under 12 months.',
            mitigationAction: 'Lock in material rates with local dealers through advance booking agreements immediately upon bid award.'
          },
          {
            severity: 'MEDIUM',
            title: 'Extended Defect Liability Period (DLP)',
            clauseReference: 'GCC Clause 19.3',
            riskSummary: 'Bank guarantee and security deposit (3% to 5%) locked for 24 to 36 months after physical completion.',
            mitigationAction: 'Budget for bank commission guarantee rollover costs across the multi-year retention period.'
          }
        ]
      },
      postAwardAnalysis: {
        procurementSchedule: [
          {
            phase: 'Phase 1: Mobilization & Site Setup (Days 1 to 20)',
            timeframe: 'Month 1',
            materialsToMobilize: ['Initial Cement 500 Bags', 'Shuttering Formwork', 'Site Office & Store Setup'],
            criticalPathItems: 'Joint site survey with Junior Engineer and bench mark setting.'
          },
          {
            phase: 'Phase 2: Substructure & Foundation (Days 21 to 50)',
            timeframe: 'Month 2',
            materialsToMobilize: ['TMT Steel 50% lot', 'Aggregates 40mm & 20mm', 'Ready-mix or Batching materials'],
            criticalPathItems: 'Concrete cube compressive strength testing at 7 and 28 days.'
          },
          {
            phase: 'Phase 3: Superstructure & Finishing (Days 51 to End)',
            timeframe: 'Month 3 onwards',
            materialsToMobilize: ['Finishing Plaster/Paint', 'Expansion joint fillers', 'Drainage covers'],
            criticalPathItems: 'Preparation of final Running Account (RA) measurement book entries.'
          }
        ],
        milestones: [
          {
            milestoneNo: 1,
            description: 'Site clearance, soil compaction, and foundation base completion',
            targetDays: Math.round((tender.periodOfWorkDays || 90) * 0.3),
            financialProgressPct: 25,
            penaltyIfDelayed: '₹5,000 per day if milestone milestone slip exceeds 7 days.'
          },
          {
            milestoneNo: 2,
            description: 'Intermediate structural work and drainage completion',
            targetDays: Math.round((tender.periodOfWorkDays || 90) * 0.65),
            financialProgressPct: 65,
            penaltyIfDelayed: '0.25% of milestone value withheld from next RA bill.'
          },
          {
            milestoneNo: 3,
            description: 'Final physical completion, cleanup, and testing compliance',
            targetDays: tender.periodOfWorkDays || 90,
            financialProgressPct: 100,
            penaltyIfDelayed: 'Full liquidated damages applied from completion date.'
          }
        ],
        qualityAndSafetyCompliance: [
          {
            standardCode: 'IS 456:2000 & IS 516',
            title: 'Concrete Compressive Cube Testing',
            testFrequency: 'Minimum 3 cubes for every 15 cum of structural concreting',
            inspectingAuthority: 'Department Quality Control Division (EE QC)'
          },
          {
            standardCode: 'IS 1786 / IS 2062',
            title: 'Steel Mill Test Certificates',
            testFrequency: 'Each consignment/truckload delivered to site',
            inspectingAuthority: 'Third Party Government Engineering College Lab'
          },
          {
            standardCode: 'IS 2720 / MORTH Section 300',
            title: 'Soil Compaction & Field Dry Density',
            testFrequency: 'Core cutter test every 500 sqm of compacted layer',
            inspectingAuthority: 'Sub-Divisional Officer (Assistant Executive Engineer)'
          }
        ],
        penaltyClauses: [
          {
            type: 'Liquidated Damages for Delayed Completion',
            rate: '0.5% per week of delay or part thereof',
            maximumCap: '10.0% of total accepted contract value',
            conditions: 'Triggered automatically unless time extension is officially recommended by Superintending Engineer.'
          },
          {
            type: 'Defective Workmanship Rectification Penalty',
            rate: 'Cost of departmental rectification + 20% departmental supervision charge',
            maximumCap: 'Security Deposit forfeiture',
            conditions: 'Triggered if contractor fails to rectify defect notice within 14 days of written warning.'
          }
        ]
      },
      tokens: { promptTokens: 11500, completionTokens: 2600, cachedTokens: 0 }
    };
  }

  /**
   * Interactive Copilot chat grounded in tender dossier and contractor memory
   */
  async processCopilotChat(userId, tenderId, userQuestion) {
    const profile = await this.getOrCreateContractorProfile(userId);
    const isFree = profile.credits.planTier === 'free_trial';
    if (isFree) {
      const now = new Date();
      if (profile.credits.chatLockedUntil && now < profile.credits.chatLockedUntil) {
        throw new QuotaError(429, { success: false, error: 'CHAT_LOCKED_24H', message: 'Free Copilot limit reached (5/5 queries). Chat is locked for 24 hours.', lockedUntil: profile.credits.chatLockedUntil.toISOString(), remainingSeconds: Math.ceil((profile.credits.chatLockedUntil - now) / 1000), upgradeUrl: '/services#pricing' });
      }
      if (profile.credits.chatLockedUntil && now >= profile.credits.chatLockedUntil) {
        profile.credits.chatQueriesUsed = 0;
        profile.credits.chatLockedUntil = null;
      }
      if (profile.credits.chatQueriesUsed + 1 >= profile.credits.chatQueriesLimit) {
        profile.credits.chatQueriesUsed = profile.credits.chatQueriesLimit;
        profile.credits.chatLockedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      } else profile.credits.chatQueriesUsed += 1;
      profile.credits.copilotQueriesUsed = profile.credits.chatQueriesUsed;
      profile.credits.copilotQueriesLimit = profile.credits.chatQueriesLimit;
      await profile.save();
    }
    // Check query quota
    const isDev = !env.NODE_ENV || env.NODE_ENV === 'development';
    if (!isFree && profile.credits.copilotQueriesLimit - profile.credits.copilotQueriesUsed <= 0) {
      if (isDev) {
        profile.credits.copilotQueriesLimit += 50;
        await profile.save();
      } else {
        throw new Error('AI Copilot query balance exhausted. Please recharge your credit pack.');
      }
    }

    const { dossier, personalizedFit } = await this.getOrGenerateTenderDossier(tenderId, userId);

    // Fetch or create chat session
    const resolvedTenderId = dossier.tenderId || (mongoose.isValidObjectId(tenderId) ? tenderId : null);
    let session = await AiAgentChatSession.findOne({ userId, tenderId: resolvedTenderId });
    if (!session) {
      session = new AiAgentChatSession({
        userId,
        tenderId: resolvedTenderId,
        messages: [
          {
            role: 'system',
            content: `You are TenderHub's Personalized Contractor AI Copilot. You are advising ${profile.companyName} (Class: ${profile.registrationClass}, Turnover: ₹${(profile.avgAnnualTurnoverInr / 1e7).toFixed(2)} Cr). Answer practical contracting questions precisely with tender clauses, material numbers, and winning strategies.`
          }
        ]
      });
    }

    // Append user question
    session.messages.push({
      role: 'user',
      content: userQuestion,
      timestamp: new Date()
    });

    let assistantResponse = '';

    // Generate response using Gemini / OpenAI or contextual reasoning
    if (geminiClient) {
      try {
        const model = geminiClient.getGenerativeModel({ model: env.GEMINI_MODEL || 'gemini-1.5-flash' });
        const contextPrompt = `
CONTRACTOR PROFILE:
Company: ${profile.companyName}
Registration: ${profile.registrationClass}
Turnover: ₹${(profile.avgAnnualTurnoverInr / 1e7).toFixed(2)} Cr
Solvency: ₹${(profile.solvencyLimitInr / 1e7).toFixed(2)} Cr
Machinery: ${profile.machineryInventory.map(m => m.name).join(', ')}

TENDER DOSSIER SNAPSHOT:
Title: ${dossier.executiveOverview?.title}
Value: ${dossier.executiveOverview?.estimatedValue ? `₹${(dossier.executiveOverview.estimatedValue / 1e5).toFixed(2)} Lakhs` : 'Not stated'}
EMD: ${dossier.executiveOverview?.emdAmount ? `₹${dossier.executiveOverview.emdAmount}` : 'Not stated'}
Eligibility Criteria: ${JSON.stringify(dossier.preBidAnalysis?.eligibilityCriteria)}
BOQ Materials: ${JSON.stringify(dossier.preBidAnalysis?.boqMaterialBreakdown?.materials?.map(m => `${m.name}: ${m.estimatedQuantity}`) || [])}
Risk Red Flags: ${JSON.stringify(dossier.preBidAnalysis?.riskAndRedFlags?.map(r => r.title) || [])}
Personalized Fit: ${personalizedFit.matchScore === null ? 'Not assessed' : `${personalizedFit.matchScore}%`} (${personalizedFit.verdict}), Gaps: ${JSON.stringify(personalizedFit.identifiedGaps)}

CONTRACTOR QUESTION:
"${userQuestion}"

RESPONSE RULES (STRICT):
- Be strictly CONCISE and POINTWISE (maximum 3 to 5 short bullets).
- Do NOT output long paragraphs or walls of text.
- Use '• **[Topic]**: [Direct Fact / Rule / Number]' format.
- Use the dossier above for this tender's clauses, amounts and dates. If the dossier says something is not stated, say so instead of guessing.
- Give immediate actionable next steps.
- If asked in Hindi or Hinglish, reply with the same concise pointwise structure in Hindi/Hinglish.
`;
        const res = await model.generateContent(contextPrompt);
        assistantResponse = res.response.text();
      } catch (chatErr) {
        logger.warn(`Gemini chat call failed: ${chatErr.message}`);
      }
    }

    // Contextual fallback response if API is unreachable
    if (!assistantResponse) {
      assistantResponse = this.generateFallbackChatResponse(userQuestion, dossier, profile, personalizedFit);
    }

    session.messages.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date()
    });
    session.totalQueries += 1;
    await session.save();

    // Deduct user query quota
    if (!isFree) { profile.credits.copilotQueriesUsed += 1; await profile.save(); }

    return {
      reply: assistantResponse,
      remainingQueries: isFree ? profile.credits.chatQueriesLimit - profile.credits.chatQueriesUsed : profile.credits.copilotQueriesLimit - profile.credits.copilotQueriesUsed,
      chatLockedUntil: isFree ? profile.credits.chatLockedUntil : null,
      session
    };
  }

  generateFallbackChatResponse(question, dossier, profile, fit) {
    const q = question.toLowerCase();
    const overview = dossier.executiveOverview || {};
    const estVal = overview.estimatedValue || null;
    const describe = (check, okText) => {
      if (!check || check.status === 'NOT_REQUIRED') return 'Not required by this tender';
      if (check.status === 'NOT_ASSESSED') return 'Not assessed';
      if (check.status === 'CONFIRM') return `Confirm: ${check.detail}`;
      return check.passed ? `✅ ${okText}` : `⚠️ ${check.detail}`;
    };

    // 1. Turnover & Financial Eligibility Check (Catches "Check my turnover eligibility", solvency, fit)
    if (q.includes('turnover') || q.includes('solvency') || q.includes('eligib') || q.includes('qualif') || q.includes('fit') || q.includes('chance') || q.includes('score')) {
      return [
        `• **Bid Match**: ${fit.matchScore === null ? '' : `${fit.matchScore}% `}(${fit.verdict})`,
        `• **Turnover**: ${describe(fit.turnoverCheck, 'Meets the stated minimum')}`,
        `• **Bank Solvency**: ${describe(fit.solvencyCheck, 'Meets the stated minimum')}`,
        `• **Registration**: ${describe(fit.classCheck, `Matches (${fit.registrationClass || profile.registrationClass})`)}`,
        ...(fit.licenceChecks || []).map((c) => `• **${c.label}**: ${c.passed ? '✅ In your profile' : '⚠️ Not in your profile, the bid is rejected without it'}`),
        `• **Key Next Step**: ${fit.identifiedGaps.length > 0 ? fit.identifiedGaps[0].recommendation : 'Check the submission checklist and upload every listed document.'}`
      ].join('\n');
    }

    // 2. EMD & Deposits Check
    if (q.includes('emd') || q.includes('fee') || q.includes('fdr') || q.includes('deposit') || q.includes('cdr')) {
      const checklist = dossier.preBidAnalysis?.mandatoryDocumentChecklist || [];
      const feeItems = checklist.filter((doc) => /emd|bid security|earnest|fee|epbg|performance security/i.test(`${doc.title} ${doc.description}`));
      return [
        `• **EMD**: ${overview.emdAmount ? `₹${overview.emdAmount.toLocaleString('en-IN')}` : 'Not stated in the tender documents'}`,
        `• **Tender Fee**: ${overview.tenderFee ? `₹${overview.tenderFee.toLocaleString('en-IN')}` : 'Not stated in the tender documents'}`,
        ...feeItems.slice(0, 3).map((doc) => `• **${doc.title}**: ${doc.description}${doc.complianceTip ? ` ${doc.complianceTip}` : ''}`),
        `• **Exemption**: ${dossier.preBidAnalysis?.eligibilityCriteria?.emdExemptionPossible === true ? 'The documents allow an exemption; check the conditions in the Pre-bid tab.' : dossier.preBidAnalysis?.eligibilityCriteria?.emdExemptionPossible === false ? 'Not allowed by the documents.' : 'Not stated in the tender documents.'}`
      ].join('\n');
    }

    // 3. Materials, Hardware & BOQ Items Check
    if (q.includes('cement') || q.includes('steel') || q.includes('material') || q.includes('boq') || q.includes('quantity') || q.includes('item') || q.includes('pc') || q.includes('desktop') || q.includes('hardware') || q.includes('unit') || q.includes('supply')) {
      const materials = dossier.preBidAnalysis?.boqMaterialBreakdown?.materials || [];
      const matBullets = materials.map(m => `• **${m.name}**: ${m.estimatedQuantity} (${m.approxRateInr} | Total: ${m.totalEstCost})`);
      return [
        `**Key Bill of Quantities / Scope Estimates:**`,
        ...(matBullets.length > 0 ? matBullets : [`• Complete line item breakdown available in Tab 2`]),
        `• **Supply Staging**: See Tab 3 for detailed delivery schedule & milestone targets.`
      ].join('\n');
    }

    // 4. Delay & Penalties Check
    if (q.includes('penalty') || q.includes('delay') || q.includes('risk') || q.includes('late') || q.includes('ld')) {
      const penalties = dossier.postAwardAnalysis?.penaltyClauses || [];
      const risks = (dossier.preBidAnalysis?.riskAndRedFlags || []).filter((r) => r.severity === 'HIGH').slice(0, 2);
      return [
        ...(penalties.length
          ? penalties.slice(0, 3).map((p) => `• **${p.type}**: ${p.rate}${p.maximumCap ? `, cap ${p.maximumCap}` : ''}. ${p.conditions || ''}`.trim())
          : ['• **Penalties**: No delay penalty is stated in the tender documents.']),
        ...risks.map((r) => `• **${r.title}** (${r.clauseReference}): ${r.mitigationAction}`)
      ].join('\n');
    }

    // 5. Default Fallback
    return [
      `• **Project Value**: ${estVal ? `₹${(estVal / 1e5).toFixed(2)} Lakhs` : 'Not stated in the tender'}${overview.completionPeriodDays ? ` (${overview.completionPeriodDays} days)` : ''}`,
      `• **Contractor Compatibility**: ${fit.matchScore === null ? fit.verdict : `${fit.matchScore}% for ${profile.companyName} (${fit.verdict})`}`,
      `• **Immediate Action**: Check Tab 1 for mandatory document checklist and compliance certificates`,
      `• **Detailed Tabs**: Use tabs above for BOQ Breakdown, Delivery Milestones, and Risk Analysis.`
    ].join('\n');
  }
}

export const contractorAgentService = new ContractorAgentService();
