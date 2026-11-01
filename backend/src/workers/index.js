import 'dotenv/config';
import { connectDB } from '../config/db.js';
import pino from 'pino';
import { tenderSyncWorker } from './tenderSync.worker.js';
import { whatsappWorker } from '../modules/notifications/workers/whatsapp.worker.js';
import { aiSummaryWorker, startAiSummaryWorker } from './aiSummary.worker.js';

const logger = pino();

const startWorkers = async () => {
  try {
    // 1. Establish MongoDB Atlas connection for the worker process first
    await connectDB();
    startAiSummaryWorker();
    logger.info('Background Worker Process successfully connected to MongoDB Atlas.');

    logger.info('Background Workers initialized and waiting for jobs...');

    // 2. Attach error listeners safely
    tenderSyncWorker.on('failed', (job, err) => {
      logger.error(`TenderSync Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    whatsappWorker.on('failed', (job, err) => {
      logger.error(`WhatsApp Alert Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    aiSummaryWorker.on('failed', (job, err) => {
      logger.error(`AISummary Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });
    aiSummaryWorker.on('error', (err) => {
      logger.error(`AI Summary Worker error: ${err.message}`);
    });

  } catch (error) {
    logger.error(`Worker startup failed: ${error.message}`);
    process.exit(1);
  }
};

startWorkers();
