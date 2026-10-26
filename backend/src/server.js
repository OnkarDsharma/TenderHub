import app from './app.js';
import { connectDB, closeDB } from './config/db.js';
import { redis } from './config/redis.js';
import { env } from './config/env.js';
import { schedulerService } from './services/scheduler.service.js';
import { keepAliveService } from './services/keepAlive.service.js';
import { tenderSyncWorker } from './workers/tenderSync.worker.js';
import { whatsappWorker } from './modules/notifications/workers/whatsapp.worker.js';
import pino from 'pino';

const logger = pino();

const startServer = async () => {
  try {
    // 1. Connect to MongoDB Atlas
    await connectDB();
    
    // 2. Start HTTP Express Server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      
      // Initialize 6 daily automated sync schedules (08:00, 10:00, 12:30, 15:00, 17:30, 20:00 IST)
      schedulerService.init().catch((err) => {
        logger.error(`Failed to initialize scheduler: ${err.message}`);
      });

      // Start proactive self-pinger to prevent Render free tier from sleeping (every 10m)
      keepAliveService.start();

      logger.info('✅ In-process BullMQ background workers (TenderSync & WhatsApp) active and ready.');
    });

    // 3. Attach worker failure listeners
    tenderSyncWorker.on('failed', (job, err) => {
      logger.error(`[Worker] TenderSync Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    whatsappWorker.on('failed', (job, err) => {
      logger.error(`[Worker] WhatsApp Alert Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    // 4. Graceful Shutdown Logic
    const shutdown = async () => {
      logger.info('SIGTERM/SIGINT received. Shutting down gracefully...');
      
      keepAliveService.stop();

      server.close(async () => {
        logger.info('HTTP server closed.');
        try {
          await tenderSyncWorker.close();
          await whatsappWorker.close();
          logger.info('Background workers closed.');

          await closeDB();
          logger.info('MongoDB connection closed.');
          
          await redis.quit();
          logger.info('Redis connection closed.');
          
          process.exit(0);
        } catch (error) {
          logger.error(`Error during shutdown: ${error.message}`);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error(`Critical error starting server: ${error.message}`);
    process.exit(1);
  }
};

startServer();