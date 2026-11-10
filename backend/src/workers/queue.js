import { Queue } from 'bullmq';
import { buildRedisConnectionOptions } from '../config/redisConnection.js';

const connection = buildRedisConnectionOptions();

export const tenderQueue = new Queue('TenderQueue', { connection });
export const aiQueue = new Queue('AIQueue', { connection });
export const documentQueue = new Queue('DocumentQueue', { connection });
export const notificationQueue = new Queue('NotificationQueue', { connection });