import mongoose from 'mongoose';

const tenderAiDossierSchema = new mongoose.Schema({
  tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true, index: true },
  sourceTenderId: { type: String, index: true },
  documentHash: { type: String, index: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], 
    default: 'PENDING',
    index: true 
  },
  
  // High-level Tender Snapshot
  summary: { type: String, default: '' },
  executiveOverview: {
    title: { type: String },
    department: { type: String },
    estimatedValue: { type: Number },
    emdAmount: { type: Number },
    tenderFee: { type: Number },
    submissionDeadline: { type: Date },
    location: { type: String },
    contractType: { type: String },
    completionPeriodDays: { type: Number }
  },

  // 1. PRE-BID: WINNING THE TENDER
  preBidAnalysis: {
    eligibilityCriteria: {
      requiredTurnover: { type: String },
      solvencyRequired: { type: String },
      experienceCriteria: { type: String },
      minimumRegistrationClass: { type: String },
      jointVentureAllowed: { type: Boolean, default: false },
      emdExemptionPossible: { type: Boolean, default: false },
      keyRequirements: [{ type: String }]
    },
    mandatoryDocumentChecklist: [{
      sNo: { type: Number },
      title: { type: String },
      description: { type: String },
      stage: { type: String, enum: ['Technical Cover', 'Fee Cover', 'Financial Cover'], default: 'Technical Cover' },
      isMandatory: { type: Boolean, default: true },
      complianceTip: { type: String }
    }],
    boqMaterialBreakdown: {
      summary: { type: String },
      materials: [{
        name: { type: String },
        category: { type: String }, // e.g. 'Cement', 'Steel', 'Aggregate', 'Bitumen', 'Machinery'
        estimatedQuantity: { type: String },
        unit: { type: String },
        specCode: { type: String },
        approxRateInr: { type: String },
        totalEstCost: { type: String }
      }],
      boqLineItems: [{
        itemNo: { type: String },
        description: { type: String },
        quantity: { type: Number },
        unit: { type: String },
        // AI may return a numeric estimate or a bidder-entered note such as
        // "To be quoted by bidder" when the tender does not publish rates.
        estimatedRate: { type: mongoose.Schema.Types.Mixed },
        estimatedAmount: { type: mongoose.Schema.Types.Mixed }
      }]
    },
    riskAndRedFlags: [{
      severity: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' },
      title: { type: String },
      clauseReference: { type: String },
      riskSummary: { type: String },
      mitigationAction: { type: String }
    }]
  },

  // 2. POST-AWARD: COMPLETING THE WON TENDER
  postAwardAnalysis: {
    procurementSchedule: [{
      phase: { type: String },
      timeframe: { type: String },
      materialsToMobilize: [{ type: String }],
      criticalPathItems: { type: String }
    }],
    milestones: [{
      milestoneNo: { type: Number },
      description: { type: String },
      targetDays: { type: Number },
      financialProgressPct: { type: Number },
      penaltyIfDelayed: { type: String }
    }],
    qualityAndSafetyCompliance: [{
      standardCode: { type: String }, // e.g. 'IS 456:2000', 'MORTH 500'
      title: { type: String },
      testFrequency: { type: String },
      inspectingAuthority: { type: String }
    }],
    penaltyClauses: [{
      type: { type: String },
      rate: { type: String },
      maximumCap: { type: String },
      conditions: { type: String }
    }]
  },

  // AI Inference Metadata & Cost Tracking
  aiEngine: {
    model: { type: String, default: 'gemini-1.5-flash' },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    cachedTokens: { type: Number, default: 0 },
    estimatedCostPaise: { type: Number, default: 0 }, // in paise (₹1 = 100 paise)
    latencyMs: { type: Number, default: 0 },
    processedAt: { type: Date, default: Date.now }
  }
}, { timestamps: true });

export default mongoose.model('TenderAiDossier', tenderAiDossierSchema);
