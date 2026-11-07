/**
 * @file backend/src/services/retention.service.js
 * @description Retention Service for Expired Tenders.
 * Marks expired tenders as EXPIRED in MongoDB but retains all data (no deletion).
 * Status transitions (ACTIVE → EXPIRED) continue to work normally.
 * R2 storage data is also preserved.
 */
import Tender from '../models/Tender.js';
import SystemLog from '../models/SystemLog.js';
import { 
  deleteTenderFolderFromR2, 
  deleteFolderFromBackupR2, 
  getBackupR2Client 
} from '../utils/r2Storage.js';
import { connectDB } from '../config/db.js';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import pino from 'pino';

const logger = pino();

export class RetentionService {
  /**
   * Evaluates all tenders against current Indian Standard Time.
   * Marks status as 'EXPIRED' if current time is greater than closing date and time.
   * 
   * Safety guard: A tender is NEVER marked expired if its bidOpeningDate is still
   * in the future. This prevents incorrect closingDate scrapes (e.g. Sep vs Oct month
   * confusion) from archiving live tenders.
   */
  async markExpiredTenders() {
    const now = new Date();
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    const result = await Tender.updateMany(
      {
        closingDate: { $lt: now },
        status: { $ne: 'EXPIRED' },
        // Strict guard: only mark expired if BOTH bid submission deadline has ended
        // AND bid opening date has passed (or not set).
        // If bid submission is still open OR bid opening is pending, tender belongs in ARCHIVED.
        $and: [
          { $or: [{ bidSubmissionEndDate: { $exists: false } }, { bidSubmissionEndDate: null }, { bidSubmissionEndDate: { $lte: now } }] },
          { $or: [{ bidOpeningDate: { $exists: false } }, { bidOpeningDate: null }, { bidOpeningDate: { $lte: now } }] }
        ]
      },
      { $set: { status: 'EXPIRED' } }
    );

    if (result.modifiedCount > 0) {
      logger.info(`[RetentionService] 🏷️ Marked ${result.modifiedCount} tender(s) as EXPIRED (Current time > BID END & opening date).`);
    }
    return result.modifiedCount;
  }

  /**
   * Purges all expired tenders (bid submission deadline and opening both concluded)
   * from MongoDB, Primary Cloudflare R2, and Secondary Backup Cloudflare R2.
   * Ensures that expired tender data is deleted on a daily basis while keeping
   * archived tenders safe.
   */
  async purgeExpiredTenders(triggeredBy = 'MANUAL') {
    const now = new Date();
    logger.info(`[RetentionService] 🧹 Starting daily purge of expired tenders partition...`);

    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    // Mark any newly expired tenders first
    await this.markExpiredTenders().catch(() => {});

    const filter = {
      $or: [
        { 
          status: 'EXPIRED',
          $or: [
            { bidOpeningDate: { $exists: false } },
            { bidOpeningDate: null },
            { bidOpeningDate: { $lte: now } }
          ]
        },
        { 
          $or: [
            { bidSubmissionEndDate: { $lt: now } },
            { closingDate: { $lt: now } }
          ],
          $and: [
            { $or: [{ bidSubmissionEndDate: { $exists: false } }, { bidSubmissionEndDate: null }, { bidSubmissionEndDate: { $lte: now } }] },
            { $or: [{ bidOpeningDate: { $exists: false } }, { bidOpeningDate: null }, { bidOpeningDate: { $lte: now } }] }
          ]
        }
      ]
    };

    const expiredTenders = await Tender.find(filter, {
      _id: 1,
      sourceTenderId: 1,
      publishedDate: 1,
      closingDate: 1,
      r2StorageKey: 1,
      departmentCode: 1,
      organisationChain: 1,
      title: 1,
      status: 1,
    });

    const totalFound = expiredTenders.length;
    logger.info(`[RetentionService] Identified ${totalFound} expired tender(s) in MongoDB to purge.`);

    let purgedMongoCount = 0;
    let totalPrimaryFilesDeleted = 0;
    let totalBackupFilesDeleted = 0;
    const errors = [];

    for (const tender of expiredTenders) {
      try {
        // Ensure the tender is marked as EXPIRED in MongoDB (no deletion)
        if (tender.status !== 'EXPIRED') {
          await Tender.updateOne({ _id: tender._id }, { $set: { status: 'EXPIRED' } });
        }
        purgedMongoCount++;

        logger.info(`[RetentionService] Marked tender ${tender.sourceTenderId} as EXPIRED (data retained in database & R2).`);
      } catch (err) {
        logger.error(`[RetentionService] Error marking tender ${tender.sourceTenderId}: ${err.message}`);
        errors.push({ tenderId: tender.sourceTenderId, error: err.message });
      }
    }

    // --- DISABLED: Backup server sweep skipped to preserve all tender data ---
    // let backupSweepResult = { sweptFoldersCount: 0, sweptFilesCount: 0 };
    // try {
    //   backupSweepResult = await this.purgeExpiredFromBackupServer(now);
    //   ...
    // }

    // 4. Log audit entry to SystemLog
    await SystemLog.create({
      level: 'INFO',
      source: 'DATABASE',
      message: `Expired Tenders Retention: Marked ${purgedMongoCount} tender(s) as EXPIRED in MongoDB (no data deleted). Triggered by ${triggeredBy}.`,
      metadata: {
        markedExpiredCount: purgedMongoCount,
        triggeredBy,
      },
    }).catch(() => {});

    logger.info(`✅ [RetentionService] Retention pass complete! Marked ${purgedMongoCount}/${totalFound} tenders as EXPIRED (data preserved in MongoDB & R2).`);

    return {
      success: true,
      totalFound,
      purgedCount: purgedMongoCount,
      primaryFilesDeleted: 0,
      backupFilesDeleted: 0,
      totalR2FilesDeleted: 0,
      backupSweptFolders: 0,
      errors,
    };
  }

  /**
   * Sweeps the secondary backup Cloudflare R2 bucket for any tender folders
   * where tender data has expired (closingDate < now or marked EXPIRED / removed from MongoDB).
   * Ensures that expired JSON and documents never linger in backup storage for 14 days.
   */
  async purgeExpiredFromBackupServer(cutoffDate = new Date()) {
    const backupClient = getBackupR2Client();
    const backupBucket = process.env.BACKUP_R2_BUCKET_NAME;

    if (!backupClient || !backupBucket) {
      return { sweptFoldersCount: 0, sweptFilesCount: 0 };
    }

    logger.info('[RetentionService] 🔍 Scanning Secondary Backup R2 for expired tender folders...');
    let sweptFoldersCount = 0;
    let sweptFilesCount = 0;

    try {
      // Step 1: List all tender.json files in the backup bucket
      let isTruncated = true;
      let continuationToken = undefined;
      const tenderJsonKeys = [];

      while (isTruncated) {
        const listRes = await backupClient.send(new ListObjectsV2Command({
          Bucket: backupBucket,
          Prefix: 'tenders/',
          ContinuationToken: continuationToken,
        }));

        if (listRes.Contents) {
          for (const item of listRes.Contents) {
            if (item.Key.endsWith('/tender.json') || item.Key.endsWith('tender.json')) {
              tenderJsonKeys.push(item.Key);
            }
          }
        }

        isTruncated = listRes.IsTruncated || false;
        continuationToken = listRes.NextContinuationToken;
      }

      logger.info(`[RetentionService] Found ${tenderJsonKeys.length} tender metadata file(s) in backup server to audit.`);

      // Step 2: For each tender.json, inspect its closingDate
      for (const jsonKey of tenderJsonKeys) {
        try {
          const folderPrefix = jsonKey.substring(0, jsonKey.lastIndexOf('/') + 1);

          const getRes = await backupClient.send(new GetObjectCommand({
            Bucket: backupBucket,
            Key: jsonKey,
          }));
          const bytes = await getRes.Body.transformToByteArray();
          const jsonText = Buffer.from(bytes).toString('utf-8');
          const tenderData = JSON.parse(jsonText);

          const rawClosing = tenderData.closingDate || tenderData.ClosingDate || tenderData.tenderClosingDate;
          let isExpired = false;

          if (rawClosing) {
            const closingTime = new Date(rawClosing).getTime();
            if (!isNaN(closingTime) && closingTime < cutoffDate.getTime()) {
              isExpired = true;
            }
          }

          // If closingDate in tender.json is expired, or if status is EXPIRED
          if (isExpired || tenderData.status === 'EXPIRED') {
            logger.info(`[RetentionService] Expired tender detected in backup server: ${folderPrefix} (Closing: ${rawClosing}). Purging...`);
            const delRes = await deleteFolderFromBackupR2(folderPrefix);
            sweptFoldersCount++;
            sweptFilesCount += delRes.deletedCount;
          }
        } catch (readErr) {
          logger.warn(`[RetentionService] Could not audit ${jsonKey} on backup server: ${readErr.message}`);
        }
      }

      return { sweptFoldersCount, sweptFilesCount };
    } catch (err) {
      logger.error(`[RetentionService] Backup server sweep error: ${err.message}`);
      return { sweptFoldersCount, sweptFilesCount, error: err.message };
    }
  }
}

export const retentionService = new RetentionService();
