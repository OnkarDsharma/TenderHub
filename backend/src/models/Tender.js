import mongoose from 'mongoose';

const tenderSchema = new mongoose.Schema({
  // --- Core Identification ---
  sourcePortal: { type: String, required: true, default: 'JK_TENDERS', index: true },
  // Government scheme the tender belongs to (e.g. PMGSY rural roads); unset for general state tenders.
  scheme: { type: String, enum: ['PMGSY'], index: true },
  state: { 
    type: String, 
    required: true, 
    enum: [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
      'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
      'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
      'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
      'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Jammu & Kashmir', 'Ladakh',
      'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
      'Delhi', 'Lakshadweep', 'Puducherry', 'Other'
    ],
    default: 'Jammu & Kashmir', 
    index: true 
  },
  // GeM discovery keyword is not authoritative geography. officialState stores
  // the PDF's raw "Ministry/State Name" value; sourceSearchRegions is diagnostic only.
  officialState: { type: String, index: true },
  officialStateConfidence: { type: String, enum: ['verified', 'partial', 'unverified', 'unknown'], default: 'unknown' },
  sourceSearchRegions: [{ type: String }],
  rawLegacyState: { type: String },
  rawMinistryStateName: { type: String },
  // GeM only. States whose official GeM "Search by Consignee Location" list
  // returned this bid, i.e. where the goods are delivered. This (not the PDF's
  // Ministry/State, which is often a central ministry) is GeM geography.
  consigneeStates: { type: [String], default: undefined, index: true },
  // NOT_LISTED: absent from a complete consignee-state pass (closed, cancelled
  // or withdrawn on GeM).
  gemStatus: { type: String, enum: ['ACTIVE', 'CLOSED_BY_DATE', 'NOT_LISTED', 'STALE', 'UNCONFIRMED', 'CANCELLED', 'UNKNOWN'], index: true },
  gemPdfRefreshDue: { type: Boolean },
  gemPdfFailCount: { type: Number },
  gemFieldConfidence: { type: mongoose.Schema.Types.Mixed, default: {} },
  gemValidationFlags: [{ type: String }],
  lastSeenInListingAt: { type: Date, index: true },
  lastCheckedAt: { type: Date, index: true },
  gemPdfUrl: { type: String },
  gemPdfFetchedAt: { type: Date },
  gemPdfError: { type: String, maxlength: 500 },
  gemPdfSha256: { type: String },
  gemDocumentType: { type: String, enum: ['BID', 'RA', 'UNKNOWN'] },
  gemParserVersion: { type: String },
  gemRawText: { type: String, select: false },
  gemRawTextTruncated: { type: Boolean, default: false },
  rawDeliverySection: { type: String },
  deliveryStations: [{ type: String }],
  locationVerificationStatus: {
    type: String,
    enum: ['VERIFIED', 'UNVERIFIED', 'NOT_PROVIDED', 'PARSE_FAILED'],
    default: 'UNVERIFIED'
  },
  geographyEvidence: { type: String },
  geographyCorrectedAt: { type: Date },
  pdfParsedAt: { type: Date },
  pdfParseStatus: { type: String, enum: ['COMPLETED', 'FAILED', 'PENDING'] },
  sourceTenderId: { type: String, required: true, index: true }, // e.g. 2026_APD_321986_1
  isMultiTender: { type: Boolean, default: false, index: true },
  baseTenderId: { type: String, index: true }, // e.g. 2026_RDPR_325394
  relatedTenderIds: [{ type: String }],       // Sibling sourceTenderIds under same NIT
  detailsUrl: { type: String },

  // --- Basic Details ---
  departmentCode: { type: String, index: true }, // e.g. APD, PDD, PWD
  departmentName: { type: String, index: true }, // e.g. Agriculture Production Department
  organisationChain: { type: String, index: true }, // Filter key for Home Page
  tenderReferenceNumber: { type: String },
  withdrawalAllowed: { type: String },
  tenderType: { type: String },
  formOfContract: { type: String },
  tenderCategory: { type: String, index: true },
  noOfCovers: { type: Number },
  generalTechnicalEvaluationAllowed: { type: String },
  itemWiseTechnicalEvaluationAllowed: { type: String },
  paymentMode: { type: String },
  isMultiCurrencyAllowedForBOQ: { type: String },
  isMultiCurrencyAllowedForFee: { type: String },
  allowTwoStageBidding: { type: String },

  // --- Payment Instruments (Offline Instruments) ---
  offlineInstruments: [{
    sNo: { type: Number },
    instrumentType: { type: String } // e.g. Bank Guarantee, Fixed deposit, CDR
  }],

  // --- Covers Information ---
  coversInfo: [{
    coverNo: { type: Number },
    coverType: { type: String },
    description: { type: String },
    documentType: { type: String }
  }],

  // --- Other Important Documents List (Mandatory Bidder Checklist) ---
  otherImportantDocuments: [{
    sNo: { type: Number },
    category: { type: String },
    subCategory: { type: String },
    description: { type: String },
    format: { type: String }
  }],

  // --- Fee & EMD Details ---
  tenderFee: { type: Number, default: 0 },
  feePayableTo: { type: String },
  feePayableAt: { type: String },
  tenderFeeExemptionAllowed: { type: String },
  
  emdAmount: { type: Number, default: 0 },
  emdExemptionAllowed: { type: String },
  emdFeeType: { type: String },
  emdPercentage: { type: String },
  emdPayableTo: { type: String },
  emdPayableAt: { type: String },

  // --- Work Item Details ---
  title: { type: String, required: true },
  workDescription: { type: String },
  ndaPreQualification: { type: String },
  independentExternalMonitorRemarks: { type: String },
  estimatedValue: { type: Number }, // Tender Value in ₹
  productCategory: { type: String },
  subCategory: { type: String },
  contractType: { type: String },
  bidValidityDays: { type: Number },
  periodOfWorkDays: { type: Number },
  location: { type: String },
  pincode: { type: String },
  preBidMeetingPlace: { type: String },
  preBidMeetingAddress: { type: String },
  preBidMeetingDate: { type: Date },
  bidOpeningPlace: { type: String },
  shouldAllowNDATender: { type: String },
  allowPreferentialBidder: { type: String },
  tendererClass: { type: String },

  // --- Critical Dates (Both raw portal string, formatted standard time, and parsed Date for IST accuracy) ---
  publishedDate: { type: Date },
  publishedDateStr: { type: String }, // e.g. "19-Sep-2026 06:30 PM"
  publishedTime: { type: String },    // e.g. "6:30 PM"
  publishedDateOnly: { type: String },// e.g. "19-Sep-2026"
  bidOpeningDate: { type: Date },
  bidOpeningDateStr: { type: String },
  bidOpeningTime: { type: String },
  documentDownloadStartDate: { type: Date },
  documentDownloadStartDateStr: { type: String },
  documentDownloadStartTime: { type: String },
  documentDownloadEndDate: { type: Date },
  documentDownloadEndDateStr: { type: String },
  documentDownloadEndTime: { type: String },
  clarificationStartDate: { type: Date },
  clarificationStartDateStr: { type: String },
  clarificationEndDate: { type: Date },
  clarificationEndDateStr: { type: String },
  bidSubmissionStartDate: { type: Date },
  bidSubmissionStartDateStr: { type: String },
  bidSubmissionStartTime: { type: String },
  bidSubmissionEndDate: { type: Date },
  bidSubmissionEndDateStr: { type: String },
  bidSubmissionEndTime: { type: String },
  closingDate: { type: Date, index: true },
  closingDateStr: { type: String },
  closingTime: { type: String },

  // --- Documents & Storage (Cloudflare R2 mapped) ---
  isDocumentAvailable: { type: Boolean, default: true },
  pdfFetchStatus: { 
    type: String, 
    enum: ['COMPLETED', 'PENDING', 'NOT_AVAILABLE', 'FAILED'], 
    default: 'PENDING',
    index: true 
  },
  pdfRetryCount: { type: Number, default: 0 },
  nitDocuments: [{
    sNo: { type: Number },
    documentName: { type: String },
    description: { type: String },
    documentSizeKb: { type: Number },
    fileUrl: { type: String } // R2 URL
  }],
  workItemDocuments: [{
    sNo: { type: Number },
    documentType: { type: String }, // e.g. BOQ, Other Document
    documentName: { type: String },
    description: { type: String },
    documentSizeKb: { type: Number },
    fileUrl: { type: String } // R2 URL
  }],
  pdfUrls: [{ type: String }], // Consolidated array for quick frontend linking
  boqFileUrl: { type: String }, // Backwards compatibility / direct file URL
  boqZipUrl: { type: String }, // Direct Cloudflare R2 URL to the uploaded .zip archive
  zipFileName: { type: String }, // Original .zip filename
  zipFileSizeKb: { type: Number }, // Size of .zip file in KB
  r2StorageKey: { type: String, index: true }, // Composite folder key: {departmentCode}/{sourceTenderId}_{publishedDate}
  boqFetchStatus: { 
    type: String, 
    enum: ['COMPLETED', 'PENDING', 'NOT_AVAILABLE', 'FAILED'], 
    default: 'PENDING',
    index: true 
  },

  // --- Tender Inviting Authority ---
  invitingAuthorityName: { type: String },
  invitingAuthorityAddress: { type: String },

  status: { type: String, default: 'ACTIVE', index: true },
  isDelisted: { type: Boolean, default: false, index: true },
  cancelledAt: { type: Date, index: true },
  delistReason: { type: String },
  archivedAt: { type: Date, index: true },

  // --- Post-closing Tender Status (portal "Tenders Status" page, NIC portals) ---
  // Scraped by JKTenderStatusAdapter after bidding closes; re-checked daily until AOC is reached.
  tenderStatusInfo: {
    currentStage: { type: String },          // "Tender Stage" column on the search result, e.g. "Financial Bid Opening"
    stages: [{
      process: { type: String },             // e.g. "Process 1"
      name: { type: String },                // e.g. "Technical Bid Opening"
      completed: { type: Boolean, default: false }
    }],
    isAocDone: { type: Boolean, default: false, index: true },
    stageDetails: [{                         // Text of each stage's "View" page and the "View More Details" page
      stage: { type: String },
      content: { type: String }
    }],
    documents: [{
      documentName: { type: String },
      source: { type: String, enum: ['STAGE_SUMMARY', 'EMBEDDED_IN_PDF', 'LINKED_IN_PDF', 'STAGE_PAGE'] },
      parentDocument: { type: String },      // For files found inside another PDF
      documentSizeKb: { type: Number },
      fileUrl: { type: String }              // R2 URL
    }],
    stageSignature: { type: String },        // Completed-stage fingerprint; documents are re-downloaded only when it changes
    fetchStatus: { type: String, enum: ['COMPLETED', 'NOT_FOUND', 'FAILED'] },
    lastError: { type: String },
    failCount: { type: Number, default: 0 },
    checkedAt: { type: Date, index: true }
  }
}, { timestamps: true });

tenderSchema.index({ sourcePortal: 1, gemStatus: 1, lastCheckedAt: 1 });

// Indexes for fast filtering, deduplication, and retention management
tenderSchema.index({ sourcePortal: 1, sourceTenderId: 1 }, { unique: true });
tenderSchema.index({ state: 1, status: 1, closingDate: 1 });
tenderSchema.index({ state: 1, sourcePortal: 1, closingDate: 1 });
tenderSchema.index({ state: 1, location: 1 });
tenderSchema.index({ departmentCode: 1, closingDate: 1 });
tenderSchema.index({ organisationChain: 1, closingDate: 1 });
tenderSchema.index({ status: 1, isDelisted: 1, closingDate: 1 });
tenderSchema.index({ status: 1, closingDate: 1 });
tenderSchema.index({ pdfFetchStatus: 1, closingDate: 1 });
tenderSchema.index({ publishedDate: -1, createdAt: -1 });
tenderSchema.index({ tenderReferenceNumber: 1, sourceTenderId: 1 });

export default mongoose.model('Tender', tenderSchema);
