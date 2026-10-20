import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { env } from './config/env.js';

// --- Import All Routes ---
import authRoutes from './routes/auth.routes.js';
import tenderRoutes from './routes/tender.routes.js';  
import bidRoutes from './routes/bid.routes.js';        
import organizationRoutes from './routes/organization.routes.js';
import documentRoutes from './routes/document.routes.js';
import contractorRoutes from './routes/contractor.routes.js';
import adminRoutes from './routes/admin.routes.js';
import bidScoreRoutes from './routes/bidScore.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import servicesRoutes from './routes/services.routes.js';
import gemRoutes from './routes/gem.routes.js';
import waitlistRoutes from './routes/waitlist.routes.js';
import { globalErrorHandler } from './middleware/errorHandler.middleware.js';

import { apiLimiter } from './middleware/rateLimiter.middleware.js';
import { 
  checkIpBlacklist, 
  blockScraperUserAgents, 
  handleHoneypotTrap 
} from './middleware/botShield.middleware.js';

const app = express();
app.set('trust proxy', 1);

const logger = pino({
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

// 1. Security & Parsers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const configuredOrigins = env.CORS_ORIGIN 
  ? env.CORS_ORIGIN.split(',').map((o) => o.trim()) 
  : [];

if (env.FRONTEND_URL && !configuredOrigins.includes(env.FRONTEND_URL)) {
  configuredOrigins.push(env.FRONTEND_URL.trim());
}

const defaultDevOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const allowedOrigins = [
  ...(env.NODE_ENV !== 'production' ? defaultDevOrigins : []),
  ...configuredOrigins
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, server-to-server, curl)
    if (!origin) return callback(null, true);

    const isDevLocalhost = (
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    );

    const isExplicitlyAllowed = allowedOrigins.some((allowed) => {
      if (allowed === '*' || allowed === origin) return true;
      if (allowed.startsWith('*.')) {
        const rootDomain = allowed.slice(2);
        try {
          const originHost = new URL(origin).hostname;
          return originHost === rootDomain || originHost.endsWith(`.${rootDomain}`);
        } catch {
          return false;
        }
      }
      return false;
    });

    if (isExplicitlyAllowed || isDevLocalhost) {
      return callback(null, true);
    }

    // Cleanly reject unauthorized origins without throwing 500 exceptions
    return callback(null, false);
  },
  credentials: true, // Required for httpOnly cookies
}));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

// Apply BotShield IP Blacklist globally
app.use(checkIpBlacklist);

// Apply rate limiting globally to prevent DoS attacks across all endpoints
app.use(apiLimiter);

// 2. Base Routes & Honeypot Traps
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Honeypot traps: Bots that follow hidden links get banned in Redis for 24 hours
app.get('/api/v1/internal/crawler-trap', handleHoneypotTrap);
app.get('/api/v1/feed/tenders-bulk', handleHoneypotTrap);
app.get('/internal/crawler-trap', handleHoneypotTrap);

// 🚀 3. Mount Business Logic Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenders', blockScraperUserAgents, tenderRoutes);
app.use('/api/v1/bids', bidRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/contractor', contractorRoutes);
app.use('/api/v1/bid-score', bidScoreRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/services', servicesRoutes);
app.use('/api/v1/gem', gemRoutes);
app.use('/api/v1/waitlist', waitlistRoutes);

// Fallback aliases (ensures frontend works whether VITE_API_URL includes /api/v1 or just the domain)
app.use('/auth', authRoutes);
app.use('/tenders', blockScraperUserAgents, tenderRoutes);
app.use('/bids', bidRoutes);
app.use('/organizations', organizationRoutes);
app.use('/documents', documentRoutes);
app.use('/contractor', contractorRoutes);
app.use('/bid-score', bidScoreRoutes);
app.use('/admin', adminRoutes);
app.use('/services', servicesRoutes);
app.use('/gem', gemRoutes);
app.use('/waitlist', waitlistRoutes);

// 4. 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// 5. Global Error Handler (must be last)
app.use(globalErrorHandler);

export default app;
