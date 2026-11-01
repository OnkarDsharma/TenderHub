import mongoose from 'mongoose';

const aiAnalysisSchema = new mongoose.Schema({
  tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true, index: true },
  documentHash: { type: String, required: true, index: true }, // To cache responses against pdf hashes
  summary: { type: String, required: true },
  extractedEligibility: { type: Array },
  rawAiResponse: { type: String },
  rawOpenAiResponse: { type: Object } // Legacy OpenAI analysis records
}, { timestamps: true });

export default mongoose.model('AiAnalysis', aiAnalysisSchema);
