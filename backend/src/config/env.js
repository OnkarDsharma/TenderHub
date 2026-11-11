import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),
  MONGO_URI: Joi.string().required().description('Mongo DB Connection URL'),
  SECONDARY_MONGO_URI: Joi.string().allow('').optional().description('Fallback Secondary Mongo DB Connection URL'),
  REDIS_URL: Joi.string().required().description('Redis Connection URL or Host'),
  JWT_ACCESS_SECRET: Joi.string().min(32).when('NODE_ENV', { is: 'production', then: Joi.required() }).description('JWT Access Token Secret'),
  JWT_REFRESH_SECRET: Joi.string().min(32).when('NODE_ENV', { is: 'production', then: Joi.required() }).description('JWT Refresh Token Secret'),
  JWT_ACCESS_TTL: Joi.string().default('1d'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  OPENAI_API_KEY: Joi.string().allow('').optional(), // Make optional until AI is integrated
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  GEMINI_MODEL: Joi.string().default('gemini-2.5-flash'),
  S3_BUCKET: Joi.string().allow('').optional(),
  UPLOAD_DIR: Joi.string().default('uploads'),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  SITE_URL: Joi.string().allow('').optional().description('Public frontend origin used in sitemaps, e.g. https://www.tndrr.com (falls back to FRONTEND_URL)'),
  BACKEND_URL: Joi.string().default('https://tenderhub-4nbc.onrender.com'),
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_CALLBACK_URL: Joi.string().default('http://localhost:8000/api/v1/auth/google/callback'),
  EMAIL_PROVIDER: Joi.string().valid('resend', 'brevo', 'smtp', 'console').default('resend'),
  EMAIL_FROM: Joi.string().default('TenderHub <no-reply@tenderhub.in>'),
  EMAIL_API_KEY: Joi.string().allow('').optional(),
  R2_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  R2_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  R2_ACCOUNT_ID: Joi.string().allow('').optional(),
  R2_BUCKET_NAME: Joi.string().allow('').optional(),
  ADMIN_SECRET_KEY: Joi.string().min(32).when('NODE_ENV', { is: 'production', then: Joi.required() }).description('Master Admin Secret Key'),
  ADMIN_EMAIL: Joi.string().email().when('NODE_ENV', { is: 'production', then: Joi.required() }).description('Authorized Master Admin Email'),
  BACKUP_R2_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  BACKUP_R2_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  BACKUP_R2_ACCOUNT_ID: Joi.string().allow('').optional(),
  BACKUP_R2_BUCKET_NAME: Joi.string().allow('').optional(),
  RAZORPAY_KEY_ID: Joi.string().allow('').optional(),
  RAZORPAY_KEY_SECRET: Joi.string().allow('').optional(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  WHATSAPP_API_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: Joi.string().allow('').optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().allow('').optional(),
  AISENSY_API_KEY: Joi.string().allow('').optional(),
  AISENSY_CAMPAIGN_NAME: Joi.string().default('tender_alert'),
}).unknown();

const { value: envVars, error } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

export const env = envVars;
