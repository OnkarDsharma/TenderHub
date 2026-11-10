import { Worker } from 'bullmq';
import crypto from 'node:crypto';
import pino from 'pino';
import { analyzeTenderDocument } from '../services/ai.service.js';
import AiAnalysis from '../models/AiAnalysis.js';
import { getTenderR2Object } from '../utils/r2Storage.js';
import { buildRedisConnectionOptions } from '../config/redisConnection.js';

const logger = pino();
const connection = buildRedisConnectionOptions();

export const aiSummaryWorker = new Worker('AIQueue', async (job) => {
  logger.info(`Processing AI Summary Job: ${job.id}`);

  const { tenderId, documentUrl } = job.data;

  try {
    const document = await getTenderR2Object(documentUrl);
    if (!document.ContentType?.includes('pdf') || (document.ContentLength && document.ContentLength > 20 * 1024 * 1024)) {
      throw new Error('Tender document is not a supported PDF or exceeds 20 MB.');
    }
    const chunks = [];
    for await (const chunk of document.Body) chunks.push(Buffer.from(chunk));
    const pdfBuffer = Buffer.concat(chunks);
    if (pdfBuffer.length > 20 * 1024 * 1024 || pdfBuffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Tender document is not a valid PDF or exceeds 20 MB.');
    }
    const documentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer });
    let documentText;
    try { documentText = (await parser.getText()).text; } finally { await parser.destroy(); }
    if (!documentText?.trim()) throw new Error('No readable text was found in the tender PDF.');

    const analysis = await analyzeTenderDocument(documentText);

    await AiAnalysis.create({
      tenderId,
      documentHash,
      summary: analysis.summary,
      extractedEligibility: analysis.extractedEligibility,
      rawAiResponse: analysis.rawAiResponse
    });

  } catch (error) {
    logger.error(`AI Worker Failed: ${error.message}`);
    throw error;
  }
}, { connection, autorun: false });

export const startAiSummaryWorker = () => {
  aiSummaryWorker.run().catch((error) => {
    logger.error(`AI Summary Worker stopped unexpectedly: ${error.message}`);
  });
};
