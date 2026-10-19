import { contractorAgentService } from '../services/contractorAgent.service.js';
import ContractorAgentProfile from '../models/ContractorAgentProfile.js';
import TenderAiDossier from '../models/TenderAiDossier.js';
import Tender from '../models/Tender.js';
import mongoose from 'mongoose';
import pino from 'pino';

const logger = pino();

export const AI_SERVICE_PLANS = [
  {
    id: 'pay_per_tender',
    name: 'Pay-Per-Tender Dossier',
    badge: 'On-Demand',
    price: 299,
    originalPrice: 499,
    unit: 'per tender',
    periodDays: 30,
    popular: false,
    description: 'Instant full AI analysis for occasional bidders and specific high-stakes tenders.',
    features: [
      '1 Full Comprehensive AI Tender Dossier',
      'Instant Bill of Quantities (BOQ) Raw Material Extractor',
      'Personalized Turnover & Solvency Gap Check',
      'Mandatory Document & Affidavit Checklist',
      'Post-Award Milestone & Penalty Alert Sheet',
      '48-Hour Interactive Tender Copilot Access',
      'Downloadable Material Schedule (Excel / PDF)'
    ],
    ctaText: 'Analyze Single Tender',
    dossierCredits: 1,
    chatQueries: 20
  },
  {
    id: 'copilot_starter',
    name: 'Contractor Copilot Starter',
    badge: 'Most Popular',
    price: 999,
    originalPrice: 1999,
    unit: '/ month',
    periodDays: 30,
    popular: true,
    description: 'Continuous AI quantity surveying & bid advisory for active local contractors.',
    features: [
      '10 Full AI Tender Dossiers every month',
      'Personalized Contractor Profile Memory',
      'Turnover, Machinery & Solvency Gap Analysis',
      'Complete Raw Material BOQ Schedule & Rates',
      'Unlimited Re-checks & Post-Award Timeline Tracker',
      '100 Interactive Copilot AI Queries',
      'Email & WhatsApp Summary Alerts',
      'Priority Email Support'
    ],
    ctaText: 'Activate Starter Plan',
    dossierCredits: 10,
    chatQueries: 100
  },
  {
    id: 'bidding_pro',
    name: 'Bidding Pro & Execution Suite',
    badge: 'Maximum Value',
    price: 2499,
    originalPrice: 4999,
    unit: '/ month',
    periodDays: 30,
    popular: false,
    description: 'For Class A/B engineering firms executing multiple simultaneous public works.',
    features: [
      '35 Full AI Tender Dossiers per month',
      'Advanced Multi-Agent Engineering Intelligence',
      'Auto-generated Excel BOQ Line Items & Rates',
      'Subcontractor Work Packaging & Safety Specs',
      'Direct WhatsApp AI Copilot Query Assistant',
      '350 Interactive Copilot AI Queries',
      'Multi-User Access (up to 3 Estimators)',
      'Direct WhatsApp Priority Desk Support'
    ],
    ctaText: 'Upgrade to Bidding Pro',
    dossierCredits: 35,
    chatQueries: 350
  }
];

export const getAiPlans = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      plans: AI_SERVICE_PLANS
    });
  } catch (error) {
    logger.error(`Error fetching AI plans: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getContractorProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || '6abe2b7f4ec335668fdc702a';
    const profile = await contractorAgentService.getOrCreateContractorProfile(userId);
    return res.status(200).json({ success: true, profile });
  } catch (error) {
    logger.error(`Error fetching contractor profile: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateContractorProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || '6abe2b7f4ec335668fdc702a';
    let profile = await contractorAgentService.getOrCreateContractorProfile(userId);

    const {
      companyName,
      registrationClass,
      primaryJurisdiction,
      avgAnnualTurnoverInr,
      solvencyLimitInr,
      ongoingCommitmentsInr,
      largestSingleWorkDoneInr,
      machineryInventory,
      specialties,
      customInstructions
    } = req.body;

    if (companyName) profile.companyName = companyName;
    if (registrationClass) profile.registrationClass = registrationClass;
    if (primaryJurisdiction) profile.primaryJurisdiction = primaryJurisdiction;
    if (avgAnnualTurnoverInr !== undefined) profile.avgAnnualTurnoverInr = Number(avgAnnualTurnoverInr);
    if (solvencyLimitInr !== undefined) profile.solvencyLimitInr = Number(solvencyLimitInr);
    if (ongoingCommitmentsInr !== undefined) profile.ongoingCommitmentsInr = Number(ongoingCommitmentsInr);
    if (largestSingleWorkDoneInr !== undefined) profile.largestSingleWorkDoneInr = Number(largestSingleWorkDoneInr);
    if (machineryInventory) profile.machineryInventory = machineryInventory;
    if (specialties) profile.specialties = specialties;
    if (customInstructions) profile.customInstructions = customInstructions;

    await profile.save();
    return res.status(200).json({ success: true, profile, message: 'Contractor AI memory updated successfully.' });
  } catch (error) {
    logger.error(`Error updating contractor profile: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Safely extracts tender identifier from body, query, splat array, or route param
 */
export function extractTenderId(req) {
  if (req.body?.tenderId) return String(req.body.tenderId).trim();
  if (req.query?.tenderId) return String(req.query.tenderId).trim();
  if (req.params?.splat) {
    const raw = Array.isArray(req.params.splat) ? req.params.splat.join('/') : String(req.params.splat);
    return decodeURIComponent(raw).trim().replace(/^\/+|\/+$/g, '');
  }
  if (req.params?.tenderId) {
    return decodeURIComponent(String(req.params.tenderId)).trim().replace(/^\/+|\/+$/g, '');
  }
  return '';
}

export const analyzeTender = async (req, res) => {
  try {
    const tenderId = extractTenderId(req);
    const userId = req.user?.userId || req.user?._id || '6abe2b7f4ec335668fdc702a';

    if (!tenderId) {
      return res.status(400).json({ success: false, error: 'Tender identifier is required.' });
    }

    const result = await contractorAgentService.getOrGenerateTenderDossier(tenderId, userId, true);
    return res.status(200).json({
      success: true,
      dossier: result.dossier,
      personalizedFit: result.personalizedFit,
      message: 'AI Tender Dossier generated successfully'
    });
  } catch (error) {
    logger.error(`Error analyzing tender: ${error.message}`);
    return res.status(error.status || 500).json({ success: false, error: error.error || error.message, message: error.message, resetsAt: error.resetsAt, lockedUntil: error.lockedUntil, remainingSeconds: error.remainingSeconds, upgradeUrl: error.upgradeUrl });
  }
};

export const getTenderDossier = async (req, res) => {
  try {
    const tenderId = extractTenderId(req);
    const userId = req.user?.userId || req.user?._id || '6abe2b7f4ec335668fdc702a';

    if (!tenderId) {
      return res.status(400).json({ success: false, error: 'Tender identifier is required.' });
    }

    let tender = null;
    if (mongoose.isValidObjectId(tenderId)) {
      tender = await Tender.findById(tenderId);
    }
    if (!tender) {
      tender = await Tender.findOne({
        $or: [
          { sourceTenderId: tenderId },
          { tenderReferenceNumber: tenderId }
        ]
      });
    }

    if (!tender) {
      return res.status(404).json({ success: false, error: 'Tender not found' });
    }

    const dossier = await TenderAiDossier.findOne({
      $or: [
        { tenderId: tender._id },
        { sourceTenderId: tenderId }
      ]
    });
    if (!dossier) {
      return res.status(404).json({ success: false, error: 'No AI Dossier exists yet for this tender. Click "Analyze" to generate.' });
    }

    const personalizedFit = await contractorAgentService.calculateContractorPersonalizedFit(tender, userId, dossier);
    return res.status(200).json({ success: true, dossier, personalizedFit });
  } catch (error) {
    logger.error(`Error fetching tender dossier: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const postCopilotChat = async (req, res) => {
  try {
    const tenderId = extractTenderId(req);
    const { message } = req.body;
    const userId = req.user?.userId || req.user?._id || '6abe2b7f4ec335668fdc702a';

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Question message is required' });
    }

    const result = await contractorAgentService.processCopilotChat(userId, tenderId, message.trim());
    return res.status(200).json({
      success: true,
      reply: result.reply,
      remainingQueries: result.remainingQueries,
      chatLockedUntil: result.chatLockedUntil
    });
  } catch (error) {
    logger.error(`Error in copilot chat: ${error.message}`);
    return res.status(error.status || 500).json({ success: false, error: error.error || error.message, message: error.message, resetsAt: error.resetsAt, lockedUntil: error.lockedUntil, remainingSeconds: error.remainingSeconds, upgradeUrl: error.upgradeUrl });
  }
};

export const getMyDossiers = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || '6abe2b7f4ec335668fdc702a';
    const profile = await contractorAgentService.getOrCreateContractorProfile(userId);
    
    const dossiers = await TenderAiDossier.find({
      tenderId: { $in: profile.analyzedTenders }
    }).populate('tenderId', 'title departmentName estimatedValue location closingDate');

    return res.status(200).json({ success: true, dossiers, count: dossiers.length });
  } catch (error) {
    logger.error(`Error fetching user dossiers: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};
