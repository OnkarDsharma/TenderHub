import mongoose from 'mongoose';

const gemDataReportSchema = new mongoose.Schema({
  sourceTenderId: { type: String, required: true, index: true, maxlength: 80 },
  field: { type: String, required: true, enum: ['officialState', 'location', 'departmentName', 'title', 'closingDate', 'status', 'other'] },
  displayedValue: { type: String, maxlength: 500, default: '' },
  note: { type: String, maxlength: 1000, default: '' },
  reviewStatus: { type: String, enum: ['OPEN', 'REVIEWED'], default: 'OPEN', index: true },
  reportedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

export default mongoose.model('GeMDataReport', gemDataReportSchema);
