import Bid from '../models/Bid.js';
import Tender from '../models/Tender.js';

export const getBids = async (req, res, next) => {
  try {
    const bids = await Bid.find({ organizationId: req.organizationId })
      .populate('tenderId', 'title closingDate bidSubmissionEndDate status estimatedValue');
      
    res.status(200).json(bids);
  } catch (error) {
    next(error);
  }
};

export const createBid = async (req, res, next) => {
  try {
    const { tenderId } = req.body;
    
    // 1. Verify target tender exists and is active
    const tender = await Tender.findById(tenderId);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found.' });
    }

    if (tender.isDelisted || tender.status === 'ARCHIVED' || tender.status === 'CANCELLED') {
      return res.status(400).json({ error: 'This tender is no longer active for bidding.' });
    }

    // 2. Server-side deadline validation (immune to client device clock tampering)
    const now = new Date();
    const deadline = tender.bidSubmissionEndDate || tender.closingDate;
    if (deadline && now > new Date(deadline)) {
      return res.status(400).json({ error: 'Bidding for this tender has closed. Late submissions are strictly prohibited.' });
    }

    // 3. Prevent duplicate bid submissions for the same tender by this organization
    const existingBid = await Bid.findOne({ organizationId: req.organizationId, tenderId });
    if (existingBid) {
      return res.status(409).json({ error: 'A bid record for this tender already exists in your workspace.' });
    }

    const bid = await Bid.create({
      organizationId: req.organizationId,
      tenderId,
      status: 'draft',
    });

    res.status(201).json(bid);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A bid record for this tender already exists in your workspace.' });
    }
    next(error);
  }
};

export const updateBidStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    
    const bid = await Bid.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    }).populate('tenderId', 'closingDate bidSubmissionEndDate status isDelisted');

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found or access denied.' });
    }

    // Terminal status protections
    if (bid.status === 'won' || bid.status === 'lost') {
      return res.status(400).json({ error: 'Terminal bid states (won/lost) cannot be modified.' });
    }

    // If attempting to submit or re-submit, verify tender deadline on server clock
    if (status === 'submitted') {
      const tender = bid.tenderId;
      if (!tender || tender.isDelisted || tender.status === 'ARCHIVED') {
        return res.status(400).json({ error: 'Tender is no longer active.' });
      }

      const now = new Date();
      const deadline = tender.bidSubmissionEndDate || tender.closingDate;
      if (deadline && now > new Date(deadline)) {
        return res.status(400).json({ error: 'The bid submission deadline has elapsed on the official server clock.' });
      }

      bid.submissionDate = now;
    }

    // Valid state transitions
    const allowedTransitions = {
      draft: ['review', 'submitted'],
      review: ['draft', 'submitted'],
      submitted: ['withdrawn'],
      withdrawn: ['draft'],
    };

    if (allowedTransitions[bid.status] && !allowedTransitions[bid.status].includes(status)) {
      return res.status(400).json({
        error: `Cannot transition bid from "${bid.status}" to "${status}".`,
      });
    }

    bid.status = status;
    await bid.save();

    res.status(200).json(bid);
  } catch (error) {
    next(error);
  }
};