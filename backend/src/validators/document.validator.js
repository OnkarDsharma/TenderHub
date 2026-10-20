import Joi from 'joi';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/zip',
  'application/x-zip-compressed'
];

export const presignSchema = Joi.object({
  fileName: Joi.string().max(255).regex(/^[\w\-. ]+$/).required().messages({
    'string.pattern.base': 'Filename contains invalid characters.'
  }),
  fileType: Joi.string().valid(...ALLOWED_MIME_TYPES).required().messages({
    'any.only': 'Invalid or unpermitted document MIME type.'
  })
});

export const confirmDocumentSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  type: Joi.string().trim().max(100).optional()
});