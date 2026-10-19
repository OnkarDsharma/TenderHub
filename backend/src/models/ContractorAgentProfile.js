import mongoose from 'mongoose';

const contractorAgentProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  
  // Organization / Firm Details
  companyName: { type: String, default: 'My Contracting Enterprise' },
  registrationClass: { type: String, default: 'Class A Works' },
  primaryJurisdiction: { type: String, default: 'Jammu & Kashmir / North Zone' },
  gstin: { type: String, default: '' },
  panNumber: { type: String, default: '' },
  
  // Financial Baselines
  avgAnnualTurnoverInr: { type: Number, default: 50000000 }, // Default 5 Cr
  solvencyLimitInr: { type: Number, default: 20000000 },      // Default 2 Cr
  ongoingCommitmentsInr: { type: Number, default: 10000000 }, // Default 1 Cr
  largestSingleWorkDoneInr: { type: Number, default: 30000000 }, // Default 3 Cr
  
  // Plant & Machinery Inventory (Key for technical eligibility)
  machineryInventory: [{
    name: { type: String },
    category: { type: String }, // 'Earthmoving', 'Concrete', 'Paving', 'Transport'
    quantity: { type: Number, default: 1 },
    isOwned: { type: Boolean, default: true },
    condition: { type: String, default: 'Good Operating Condition' }
  }],

  // Work Categories & Specialties
  specialties: [{ type: String }], // 'Road Construction', 'Bridges', 'Water Supply', 'Civil Buildings'
  
  // Contractor Custom Prompt Instructions
  customInstructions: { 
    type: String, 
    default: 'Highlight strict liquidated damages, calculate exact cement and TMT steel tons, and flag if equipment lease is required.'
  },

  // AI Usage & Credit Balances
  credits: {
    planTier: { 
      type: String, 
      enum: ['free_trial', 'pay_per_tender', 'copilot_starter', 'bidding_pro', 'enterprise'],
      default: 'free_trial' 
    },
    dailyDossiersLimit: { type: Number, default: 2 },
    dailyDossiersUsed: { type: Number, default: 0 },
    lastDossierDate: { type: Date, default: null },
    chatQueriesLimit: { type: Number, default: 5 },
    chatQueriesUsed: { type: Number, default: 0 },
    chatLockedUntil: { type: Date, default: null },
    weeklyWhatsAppLimit: { type: Number, default: 2 },
    weeklyWhatsAppUsed: { type: Number, default: 0 },
    weekStartDate: { type: Date, default: () => new Date() },
    availableDossiers: { type: Number, default: 2 }, // 2 free trial analyses
    usedDossiers: { type: Number, default: 0 },
    copilotQueriesLimit: { type: Number, default: 30 },
    copilotQueriesUsed: { type: Number, default: 0 },
    planExpiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  },

  // Analyzed Tenders history
  analyzedTenders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tender' }]
}, { timestamps: true });

export default mongoose.model('ContractorAgentProfile', contractorAgentProfileSchema);
