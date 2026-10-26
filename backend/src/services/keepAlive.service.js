/**
 * @file backend/src/services/keepAlive.service.js
 * @description Proactive keep-alive service to prevent Render free-tier web services
 * from spinning down after 15 minutes of inactivity. Pings /health every 10 minutes.
 */
import pino from 'pino';
import { env } from '../config/env.js';

const logger = pino();

export class KeepAliveService {
  constructor() {
    this.intervalId = null;
    this.pingIntervalMs = 10 * 60 * 1000; // 10 minutes (Render sleeps at 15m)
  }

  /**
   * Resolves the public or local health check endpoint
   */
  getPingUrl() {
    // 1. Standard Render external URL environment variable (injected automatically on Render)
    if (process.env.RENDER_EXTERNAL_URL) {
      return `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/health`;
    }

    // 2. BACKEND_URL from environment
    if (env.BACKEND_URL && !env.BACKEND_URL.includes('localhost')) {
      return `${env.BACKEND_URL.replace(/\/$/, '')}/health`;
    }

    // 3. Fallback to local port
    return `http://127.0.0.1:${env.PORT || 5000}/health`;
  }

  /**
   * Starts periodic keep-alive pinging
   */
  start() {
    if (this.intervalId) return;

    const targetUrl = this.getPingUrl();
    logger.info(`[KeepAlive] 💓 Keep-alive service active. Target: ${targetUrl} (Interval: 10 mins)`);

    // Perform initial ping 30 seconds after boot once HTTP server is settled
    setTimeout(() => {
      this.ping().catch(() => {});
    }, 30000);

    // Schedule regular 10-minute heartbeat
    this.intervalId = setInterval(() => {
      this.ping().catch(() => {});
    }, this.pingIntervalMs);
  }

  /**
   * Performs an HTTP GET request to /health to refresh activity timestamp
   */
  async ping() {
    const targetUrl = this.getPingUrl();
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'TenderHub-KeepAlive-Heartbeat/1.0',
        },
      });

      if (response.ok) {
        logger.info(`[KeepAlive] 💓 Heartbeat ping to ${targetUrl} succeeded (Status: ${response.status}). Inactivity timer reset.`);
      } else {
        logger.warn(`[KeepAlive] ⚠️ Heartbeat ping returned status ${response.status} from ${targetUrl}`);
      }
    } catch (err) {
      logger.warn(`[KeepAlive] ⚠️ Heartbeat ping failed to ${targetUrl}: ${err.message}`);
    }
  }

  /**
   * Stops the keep-alive timer on server shutdown
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[KeepAlive] Keep-alive service stopped.');
    }
  }
}

export const keepAliveService = new KeepAliveService();
