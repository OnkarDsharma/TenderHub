import mongoose from 'mongoose';

const waitlistSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, index: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  firmName: { type: String, trim: true, maxlength: 160 },
  contractorClass: { type: String, enum: ['Class Special', 'Class A', 'Class B', 'Class C', 'Class D', 'Supplier/Other'], default: 'Class A' },
  interestedPlan: { type: String, enum: ['contractor_pro', 'bidding_pro_enterprise'], required: true },
  ipAddress: { type: String },
  status: { type: String, enum: ['pending', 'notified', 'converted'], default: 'pending' },
}, { timestamps: true });

export default mongoose.model('Waitlist', waitlistSchema);
