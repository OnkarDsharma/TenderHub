import mongoose from 'mongoose';

const companyDocumentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true, required: true },
  title: { type: String, required: true },
  type: { type: String }, // e.g., 'GST_Certificate', 'Balance_Sheet'
  key: { type: String, required: true },
  size: { type: Number, required: true },
  contentType: { type: String, required: true },
  
  // RAG / Vector DB Future-Proofing
  documentId: { type: String },
  page: { type: Number },
  section: { type: String },
  chunk: { type: Number },
  sourceText: { type: String }
}, { timestamps: true });

export default mongoose.model('CompanyDocument', companyDocumentSchema);
