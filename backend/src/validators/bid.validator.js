import Joi from 'joi';

export const createBidSchema = Joi.object({
  tenderId: Joi.string().hex().length(24).required() // Validates MongoDB ObjectId
});

export const updateBidSchema = Joi.object({
  status: Joi.string().valid('draft', 'review', 'submitted', 'won', 'lost', 'withdrawn').required()
});