import mongoose from 'mongoose';

const contractorAgentProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  
  // Organization / Firm Details
  // Empty until the contractor fills them in. AI analysis is refused until
  // profileConfiguredAt is set, so the fit check never uses made-up figures.
  companyName: { type: String, default: '' },
  registrationClass: { type: String, default: '' },
  primaryJurisdiction: { type: String, default: 'Jammu & Kashmir / North Zone' },
  gstin: { type: String, default: '' },
  panNumber: { type: String, default: '' },
  
  // Financial Baselines
  avgAnnualTurnoverInr: { type: Number, default: null },
  solvencyLimitInr: { type: Number, default: null },
  ongoingCommitmentsInr: { type: Number, default: null },
  largestSingleWorkDoneInr: { type: Number, default: null },
  // Set when the contractor saves a complete profile (see isProfileComplete).
  profileConfiguredAt: { type: Date, default: null },
  
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

  // Licences and registrations the firm holds (e.g. 'Drug License', 'Electrical
  // Contractor Licence A-Grade'), matched against a tender's mandatory licences.
  licences: [{ type: String }],
  
  // Contractor Custom Prompt Instructions
  customInstructions: { 
    type: String, 
    default: ''
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

/** A profile is complete when the fields the fit check compares are filled in. */
export const PROFILE_REQUIRED_FIELDS = ['companyName', 'registrationClass', 'avgAnnualTurnoverInr', 'solvencyLimitInr', 'largestSingleWorkDoneInr'];
export function isProfileComplete(profile) {
  if (!profile) return false;
  return PROFILE_REQUIRED_FIELDS.every((field) => {
    const value = profile[field];
    return typeof value === 'string' ? value.trim().length > 0 : Number.isFinite(value) && value >= 0;
  });
}

export default mongoose.model('ContractorAgentProfile', contractorAgentProfileSchema);
