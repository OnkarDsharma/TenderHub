/**
 * @file backend/src/controllers/admin.controller.js
 * @description Controller actions servicing the isolated Admin Dashboard Panel.
 */
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { diagnosticService } from '../services/diagnostic.service.js';
import { schedulerService } from '../services/scheduler.service.js';
import { backupService } from '../services/backup.service.js';
import { retentionService } from '../services/retention.service.js';
import { reconciliationService } from '../services/reconciliation.service.js';
import { syncR2Buckets } from '../scripts/syncR2Mirror.js';
import SystemLog from '../models/SystemLog.js';
import SyncJob from '../models/SyncJob.js';
import CronConfig from '../models/CronConfig.js';
import Tender from '../models/Tender.js';
import PendingDocumentTender from '../models/PendingDocumentTender.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import Bid from '../models/Bid.js';
import ContractorProfile from '../models/ContractorProfile.js';
import Subscription from '../modules/billing/models/Subscription.js';
import TenderDocument from '../models/TenderDocument.js';
import TenderRequirement from '../models/TenderRequirement.js';

/**
 * Validate admin credentials
 */
export const verifyAdminSession = async (req, res) => {
  return res.status(200).json({
    authenticated: true,
    user: req.adminUser,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Real-time network latency, memory, and services telemetry
 */
export const getTelemetry = async (req, res) => {
  try {
    const telemetry = await diagnosticService.getSystemTelemetry();
    return res.status(200).json(telemetry);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve telemetry', message: err.message });
  }
};

/**
 * Database overview, tender counts, missing PDFs, and sync status
 */
export const getOverview = async (req, res) => {
  try {
    const overview = await diagnosticService.getDatabaseOverview();
    return res.status(200).json(overview);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve overview', message: err.message });
  }
};

/**
 * Intelligent error diagnostics with root-cause analysis and remediation steps
 */
export const getDiagnostics = async (req, res) => {
  try {
    const diagnostics = await diagnosticService.getDiagnosticsAndActiveIssues();
    return res.status(200).json({ issues: diagnostics, count: diagnostics.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate diagnostics', message: err.message });
  }
};

/**
 * Query persistent system logs with pagination & filtering
 */
export const getLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const { level, source, search } = req.query;

    const query = {};
    if (level && level !== 'ALL') query.level = level;
    if (source && source !== 'ALL') query.source = source;
    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    const [logs, total] = await Promise.all([
      SystemLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      SystemLog.countDocuments(query),
    ]);

    return res.status(200).json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch logs', message: err.message });
  }
};

/**
 * Clear or mark logs as resolved
 */
export const resolveLog = async (req, res) => {
  try {
    const { id } = req.params;
    await SystemLog.findByIdAndUpdate(id, { resolved: true });
    return res.status(200).json({ success: true, message: 'Log marked as resolved' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve log', message: err.message });
  }
};

/**
 * Ingestion Run History
 */
export const getSyncHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));

    const [jobs, total] = await Promise.all([
      SyncJob.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      SyncJob.countDocuments(),
    ]);

    return res.status(200).json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch sync history', message: err.message });
  }
};

let activeCrawlerProcess = null;

/**
 * Trigger immediate manual ingestion (supports mode: 'ALL' | 'LATEST', limit, reset)
 */
export const triggerManualSync = async (req, res) => {
  try {
    const { mode = 'LATEST', limit = 100, reset = false } = req.body || {};

    // Check if a sync job is already actively running
    const existingRunning = await SyncJob.findOne({ status: 'running' }).lean();
    if (existingRunning || activeCrawlerProcess) {
      return res.status(400).json({
        error: 'A scraper job is already running in the background.',
        jobId: existingRunning?._id,
      });
    }

    const scriptPath = mode === 'ALL'
      ? path.join(process.cwd(), 'src/scripts/fetchAllActiveTenders.js')
      : path.join(process.cwd(), 'src/scripts/fetchLatestDailyTenders.js');

    const args = [scriptPath, String(limit)];
    if (reset) args.push('--reset');

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, SCRAPER_HEADLESS: process.env.SCRAPER_HEADLESS || 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeCrawlerProcess = child;

    child.stdout.on('data', async (data) => {
      const text = data.toString().trim();
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.includes('✅') || line.includes('🏛️') || line.includes('⏩') || line.includes('👉') || line.includes('🎉') || line.includes('🚀') || line.includes('🛑') || line.includes('📊')) {
          await SystemLog.create({
            level: 'INFO',
            source: 'WORKER_SCRAPER',
            message: line
          }).catch(() => {});
        }
      }
    });

    child.stderr.on('data', async (data) => {
      const text = data.toString().trim();
      if (text) {
        await SystemLog.create({
          level: 'WARN',
          source: 'WORKER_SCRAPER',
          message: text.substring(0, 300)
        }).catch(() => {});
      }
    });

    child.on('close', (code) => {
      activeCrawlerProcess = null;
    });

    return res.status(200).json({
      success: true,
      message: `${mode === 'ALL' ? 'Full Active Tenders' : 'Daily Latest Tenders'} crawl started in background.`,
      mode,
      limit,
      pid: child.pid
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to dispatch manual sync', message: err.message });
  }
};

/**
 * Stop actively running crawler process
 */
export const stopActiveSync = async (req, res) => {
  try {
    if (activeCrawlerProcess) {
      activeCrawlerProcess.kill('SIGINT');
      activeCrawlerProcess = null;
    }
    await SyncJob.updateMany({ status: 'running' }, { status: 'failed', errorMessage: 'Stopped manually by Admin' });
    await SystemLog.create({
      level: 'WARN',
      source: 'WORKER_SCRAPER',
      message: 'Crawl process stopped manually by Admin.'
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Active crawl stopped.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stop sync', message: err.message });
  }
};

/**
 * Get real-time sync progress, active job status, checkpoint, and live logs
 */
export const getLiveSyncStatus = async (req, res) => {
  try {
    const runningJob = await SyncJob.findOne({ status: 'running' }).sort({ createdAt: -1 }).lean();

    let checkpoint = null;
    const checkpointPath = path.join(process.cwd(), '.crawl_checkpoint.json');
    if (fs.existsSync(checkpointPath)) {
      try {
        checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
      } catch (e) {}
    }

    const logs = await SystemLog.find({
      source: 'WORKER_SCRAPER'
    })
    .sort({ createdAt: -1 })
    .limit(35)
    .lean();

    const isRunning = !!runningJob || !!activeCrawlerProcess;

    return res.status(200).json({
      isRunning,
      activeJob: runningJob || (activeCrawlerProcess ? { status: 'running' } : null),
      checkpoint,
      logs: logs.reverse()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get live sync status', message: err.message });
  }
};

/**
 * Reset crawler checkpoint file
 */
export const resetCrawlCheckpoint = async (req, res) => {
  try {
    const checkpointPath = path.join(process.cwd(), '.crawl_checkpoint.json');
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }
    await SystemLog.create({
      level: 'INFO',
      source: 'WORKER_SCRAPER',
      message: 'Admin manually reset crawl checkpoint.'
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Checkpoint reset successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset checkpoint', message: err.message });
  }
};

/**
 * Trigger dedicated missing PDF recovery pass
 */
export const triggerMissingPdfRecovery = async (req, res) => {
  try {
    const job = await schedulerService.triggerMissingPdfSync('Admin');
    return res.status(200).json({
      success: true,
      message: 'Missing PDF recovery pass dispatched.',
      jobId: job.id,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to trigger PDF recovery', message: err.message });
  }
};

/**
 * Toggle automated cron scheduling permission
 */
export const updateScheduleConfig = async (req, res) => {
  try {
    const { isAutomatedSyncEnabled } = req.body;

    const config = await CronConfig.findOneAndUpdate(
      { configKey: 'GLOBAL_CRON_SETTINGS' },
      { $set: { isAutomatedSyncEnabled: Boolean(isAutomatedSyncEnabled) } },
      { new: true, upsert: true }
    );

    await SystemLog.create({
      level: 'INFO',
      source: 'CRON',
      message: `Admin updated automated ingestion setting: isAutomatedSyncEnabled = ${config.isAutomatedSyncEnabled}`,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      config,
      message: `Automated data scraping ${config.isAutomatedSyncEnabled ? 'ENABLED' : 'PAUSED'}.`,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update schedule config', message: err.message });
  }
};

/**
 * Manually trigger 30-Day Archive Purge
 */
export const purgeExpiredArchive = async (req, res) => {
  try {
    const result = await schedulerService.purgeExpiredArchivedTenders('ADMIN_MANUAL');
    return res.status(200).json({
      success: true,
      message: `Successfully purged ${result.deletedCount} expired archived tenders.`,
      deletedCount: result.deletedCount,
      cutoffDate: result.cutoffDate,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Archive purge failed', message: err.message });
  }
};

/**
 * Manually trigger immediate Expired Tenders Purge across MongoDB, Primary R2 & Backup Server
 */
export const purgeExpiredTendersNow = async (req, res) => {
  try {
    const adminUser = req.adminUser?.email || 'ADMIN_MANUAL';
    const result = await retentionService.purgeExpiredTenders(adminUser);
    return res.status(200).json({
      success: true,
      message: `Purge completed: removed ${result.purgedCount} tender(s) from MongoDB, ${result.primaryFilesDeleted} file(s) from Primary R2, and ${result.backupFilesDeleted} file(s) from Backup Server.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Expired tenders purge failed', message: err.message });
  }
};

/**
 * Manually trigger on-demand Portal Parity Reconciliation
 */
export const triggerPortalReconciliation = async (req, res) => {
  try {
    const adminUser = req.adminUser?.email || 'ADMIN_MANUAL';
    const result = await reconciliationService.reconcileActiveTenders(adminUser);
    if (result.error) {
      return res.status(500).json({ error: 'Reconciliation failed', message: result.error });
    }
    return res.status(200).json({
      success: true,
      message: `Reconciliation complete. Portal active tenders: ${result.portalTotal}, Marked delisted: ${result.delistedCount}. Parity achieved.`,
      result
    });
  } catch (err) {
    return res.status(500).json({ error: 'Portal reconciliation failed', message: err.message });
  }
};

/**
 * Telemetry and list of backups for the Admin Panel
 */
export const getBackupStatus = async (req, res) => {
  try {
    const status = backupService.getBackupStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve backup telemetry', message: err.message });
  }
};

/**
 * On-demand backup trigger from the Admin Panel
 * Body: { type: 'database' | 'full' }
 */
export const triggerBackup = async (req, res) => {
  try {
    const type = req.body.type || 'database';
    let result;

    if (type === 'full') {
      result = await backupService.createFullBackup();
    } else {
      result = await backupService.createDatabaseBackup();
    }

    return res.status(200).json({
      success: true,
      message: `Backup (${type}) completed successfully.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Backup execution failed',
      message: err.message,
    });
  }
};

/**
 * Securely stream and download a backup archive from disk
 */
export const downloadBackupArchive = async (req, res) => {
  try {
    const fileName = path.basename(req.params.fileName);
    const filePath = path.join(backupService.localBackupDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found on server disk.' });
    }

    const contentType = fileName.endsWith('.zip') ? 'application/zip' : 'application/gzip';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream backup archive', message: err.message });
  }
};

/**
 * Download the Disaster Recovery & Backup Instruction PDF manual
 */
export const downloadDisasterRecoveryGuide = async (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../docs/TenderHub_Disaster_Recovery_and_Backup_Manual.pdf'),
      path.resolve(process.cwd(), 'docs/TenderHub_Disaster_Recovery_and_Backup_Manual.pdf'),
      path.resolve(process.cwd(), 'backups/TenderHub_Disaster_Recovery_and_Backup_Manual.pdf'),
    ];

    const targetPath = candidates.find(p => fs.existsSync(p));

    if (!targetPath) {
      return res.status(404).json({ error: 'Disaster recovery guide PDF has not been generated yet.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TenderHub_Disaster_Recovery_and_Backup_Manual.pdf"');

    const stream = fs.createReadStream(targetPath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream guide PDF', message: err.message });
  }
};

/**
 * Download the Production Deployment & Operations PDF manual
 */
export const downloadDeploymentGuide = async (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../docs/TenderHub_Production_Deployment_Manual.pdf'),
      path.resolve(process.cwd(), 'docs/TenderHub_Production_Deployment_Manual.pdf'),
      path.resolve(process.cwd(), 'backups/TenderHub_Production_Deployment_Manual.pdf'),
    ];

    const targetPath = candidates.find(p => fs.existsSync(p));

    if (!targetPath) {
      return res.status(404).json({ error: 'Deployment manual PDF has not been generated yet.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TenderHub_Production_Deployment_Manual.pdf"');

    const stream = fs.createReadStream(targetPath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream deployment manual', message: err.message });
  }
};

/**
 * Download the Future Configurations & Render Upgrade Manual PDF
 */
export const downloadFutureConfigGuide = async (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../docs/TenderHub_Future_Configurations_Render_and_Failover.pdf'),
      path.resolve(process.cwd(), 'docs/TenderHub_Future_Configurations_Render_and_Failover.pdf'),
      path.resolve(process.cwd(), 'backups/TenderHub_Future_Configurations_Render_and_Failover.pdf'),
    ];

    const targetPath = candidates.find(p => fs.existsSync(p));

    if (!targetPath) {
      return res.status(404).json({ error: 'Future configurations guide PDF has not been generated yet.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TenderHub_Future_Configurations_Render_and_Failover.pdf"');

    const stream = fs.createReadStream(targetPath);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stream future configuration manual', message: err.message });
  }
};


/**
 * Trigger Cloudflare R2 Document Mirror Synchronization
 */
export const triggerMirrorSync = async (req, res) => {
  try {
    const result = await syncR2Buckets();
    return res.status(200).json({
      success: true,
      message: `Mirror synchronization complete. Replicated ${result.syncedCount} missing document(s) (${result.totalMb} MB). ${result.skippedCount} already in sync.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Mirror synchronization failed', message: err.message });
  }
};

/**
 * Get overview metrics for pending document tenders
 */
export const getPendingDocsOverview = async (req, res) => {
  try {
    const now = new Date();
    const totalPending = await PendingDocumentTender.countDocuments({ status: { $ne: 'DOWNLOADED' } });
    const readyToDownload = await PendingDocumentTender.countDocuments({
      status: { $in: ['AWAITING_DOWNLOAD_DATE', 'READY_TO_DOWNLOAD'] },
      $or: [
        { documentDownloadStartDate: { $lte: now } },
        { documentDownloadStartDate: null },
        { status: 'READY_TO_DOWNLOAD' }
      ]
    });
    const downloaded = await PendingDocumentTender.countDocuments({ status: 'DOWNLOADED' });
    const upcoming = await PendingDocumentTender.find({
      status: 'AWAITING_DOWNLOAD_DATE',
      documentDownloadStartDate: { $gt: now }
    })
    .sort({ documentDownloadStartDate: 1 })
    .limit(10)
    .lean();

    return res.status(200).json({
      success: true,
      totalPending,
      readyToDownload,
      downloaded,
      upcoming
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get pending docs overview', message: err.message });
  }
};

/**
 * Trigger background worker to fetch documents for pending document tenders
 */
export const triggerPendingDocsFetch = async (req, res) => {
  try {
    const { limit = 50, all = false } = req.body || {};

    if (activeCrawlerProcess) {
      return res.status(400).json({
        error: 'Another crawl or sync process is already actively running.'
      });
    }

    const scriptPath = path.join(process.cwd(), 'src/scripts/fetchPendingDocTenders.js');
    const args = [scriptPath, '--limit', String(limit)];
    if (all) args.push('--all');

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, SCRAPER_HEADLESS: process.env.SCRAPER_HEADLESS || 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeCrawlerProcess = child;

    child.stdout.on('data', async (data) => {
      const text = data.toString().trim();
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.includes('✅') || line.includes('🎉') || line.includes('🏛️') || line.includes('👉') || line.includes('⏳') || line.includes('🚀') || line.includes('🏁') || line.includes('📋') || line.includes('🔐')) {
          await SystemLog.create({
            level: 'INFO',
            source: 'WORKER_SCRAPER',
            message: line
          }).catch(() => {});
        }
      }
    });

    child.stderr.on('data', async (data) => {
      const text = data.toString().trim();
      if (text) {
        await SystemLog.create({
          level: 'WARN',
          source: 'WORKER_SCRAPER',
          message: text.substring(0, 300)
        }).catch(() => {});
      }
    });

    child.on('close', () => {
      activeCrawlerProcess = null;
    });

    return res.status(200).json({
      success: true,
      message: 'Pending documents recovery crawl started in background.',
      pid: child.pid
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to dispatch pending docs recovery', message: err.message });
  }
};

/**
 * Safely escape regex special characters
 */
const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// ==============================================================================
// 1. DASHBOARD STATISTICS
// ==============================================================================

/**
 * Aggregate counts: total users, role breakdown, active/inactive,
 * tender status breakdown, total organizations, total bids, recent users & tenders (7 days).
 */
export const getDashboardStats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [userAggregation, tenderAggregation, totalOrganizations, totalBids] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
            byActive: [{ $group: { _id: '$isActive', count: { $sum: 1 } } }],
            recent7Days: [
              { $match: { createdAt: { $gte: sevenDaysAgo } } },
              { $count: 'count' },
            ],
          },
        },
      ]),
      Tender.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            recent7Days: [
              { $match: { createdAt: { $gte: sevenDaysAgo } } },
              { $count: 'count' },
            ],
          },
        },
      ]),
      Organization.countDocuments(),
      Bid.countDocuments(),
    ]);

    const userFacet = userAggregation[0] || {};
    const totalUsers = userFacet.total?.[0]?.count || 0;
    const recentUsers = userFacet.recent7Days?.[0]?.count || 0;

    const usersByRole = {
      user: 0,
      contractor: 0,
      admin: 0,
      owner: 0,
    };
    (userFacet.byRole || []).forEach((item) => {
      if (item._id) {
        usersByRole[item._id] = item.count;
      }
    });

    let activeUsers = 0;
    let inactiveUsers = 0;
    (userFacet.byActive || []).forEach((item) => {
      if (item._id === true || item._id === 'true') {
        activeUsers = item.count;
      } else {
        inactiveUsers = item.count;
      }
    });

    const tenderFacet = tenderAggregation[0] || {};
    const totalTenders = tenderFacet.total?.[0]?.count || 0;
    const recentTenders = tenderFacet.recent7Days?.[0]?.count || 0;

    const tendersByStatus = {
      ACTIVE: 0,
      EXPIRED: 0,
      ARCHIVED: 0,
      CANCELLED: 0,
    };
    (tenderFacet.byStatus || []).forEach((item) => {
      if (item._id) {
        tendersByStatus[item._id] = item.count;
      }
    });

    return res.status(200).json({
      success: true,
      totalUsers,
      usersByRole,
      activeUsers,
      inactiveUsers,
      totalTenders,
      tendersByStatus,
      totalOrganizations,
      totalBids,
      recentUsers,
      recentTenders,
      users: {
        total: totalUsers,
        byRole: usersByRole,
        active: activeUsers,
        inactive: inactiveUsers,
        recent7Days: recentUsers,
      },
      tenders: {
        total: totalTenders,
        byStatus: tendersByStatus,
        recent7Days: recentTenders,
      },
      organizations: {
        total: totalOrganizations,
      },
      bids: {
        total: totalBids,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve dashboard statistics',
      message: err.message,
    });
  }
};

// ==============================================================================
// 2. USER MANAGEMENT
// ==============================================================================

/**
 * Paginated user list with search, role, and active status filters
 */
export const getUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { search, role, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const query = {};

    // 1. Search filter (name, email, firstName, lastName)
    if (search && search.trim()) {
      const sanitized = escapeRegex(search);
      const searchRegex = new RegExp(sanitized, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
      ];
    }

    // 2. Role filter
    if (role && role !== 'ALL') {
      query.role = role;
    }

    // 3. isActive filter
    if (isActive !== undefined && isActive !== 'ALL') {
      if (isActive === 'true' || isActive === true) {
        query.isActive = true;
      } else if (isActive === 'false' || isActive === false) {
        query.isActive = false;
      }
    }

    // 4. Sorting
    const allowedSortFields = ['createdAt', 'name', 'email', 'role', 'lastLoginAt', 'isActive'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = (sortOrder === 'asc' || sortOrder === '1') ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash')
        .sort({ [sortField]: sortDirection })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Attach subscription status
    const userIds = users.map((u) => u._id);
    const subscriptions = await Subscription.find({ userId: { $in: userIds } })
      .sort({ createdAt: -1 })
      .lean();

    const subMap = new Map();
    for (const sub of subscriptions) {
      const uIdStr = sub.userId.toString();
      if (!subMap.has(uIdStr)) {
        subMap.set(uIdStr, sub);
      }
    }

    const now = new Date();
    const enrichedUsers = users.map((user) => {
      const sub = subMap.get(user._id.toString());
      return {
        ...user,
        subscription: sub
          ? {
              status: sub.status,
              planId: sub.planId,
              billingCycle: sub.billingCycle,
              currentPeriodEnd: sub.currentPeriodEnd,
              isValid: (sub.status === 'active' || sub.status === 'trialing') && new Date(sub.currentPeriodEnd) > now,
            }
          : null,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      users: enrichedUsers,
      total,
      page,
      totalPages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch users',
      message: err.message,
    });
  }
};

/**
 * Single user details with organization memberships, contractor profile, and subscription
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const user = await User.findById(id).select('-passwordHash').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [organizationMemberships, contractorProfile, subscription] = await Promise.all([
      OrganizationMember.find({ userId: id }).populate('organizationId').lean(),
      ContractorProfile.findOne({ userId: id }).lean(),
      Subscription.findOne({ userId: id }).sort({ createdAt: -1 }).lean(),
    ]);

    const userDetails = {
      ...user,
      organizationMemberships: organizationMemberships || [],
      contractorProfile: contractorProfile || null,
      subscription: subscription || null,
    };

    return res.status(200).json({
      success: true,
      user: userDetails,
      organizationMemberships: organizationMemberships || [],
      contractorProfile: contractorProfile || null,
      subscription: subscription || null,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve user details',
      message: err.message,
    });
  }
};

/**
 * Update user fields (role, isActive, emailVerified, name)
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { role, isActive, emailVerified, name } = req.body || {};
    const updates = {};

    if (role !== undefined) {
      const allowedRoles = ['user', 'contractor', 'admin', 'owner'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${allowedRoles.join(', ')}`,
        });
      }
      updates.role = role;
      user.role = role;
    }

    if (isActive !== undefined) {
      const boolIsActive = isActive === true || isActive === 'true';
      updates.isActive = boolIsActive;
      user.isActive = boolIsActive;
    }

    if (emailVerified !== undefined) {
      const boolVerified = emailVerified === true || emailVerified === 'true';
      updates.emailVerified = boolVerified;
      user.emailVerified = boolVerified;
    }

    if (name !== undefined) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      updates.name = trimmedName;
      user.name = trimmedName;
      const parts = trimmedName.split(/\s+/);
      user.firstName = parts[0] || '';
      user.lastName = parts.slice(1).join(' ') || '';
    }

    await user.save();

    await SystemLog.create({
      level: 'INFO',
      source: 'API',
      message: `Admin ${req.adminUser?.email || 'Unknown'} updated user ${user.email} (${user._id})`,
      metadata: {
        adminUser: req.adminUser,
        targetUserId: user._id,
        targetUserEmail: user.email,
        updates,
      },
    }).catch(() => {});

    const userObj = user.toObject();
    delete userObj.passwordHash;

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: userObj,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update user',
      message: err.message,
    });
  }
};

/**
 * Soft delete user (set isActive: false)
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isActive = false;
    await user.save();

    await SystemLog.create({
      level: 'WARN',
      source: 'API',
      message: `Admin ${req.adminUser?.email || 'Unknown'} soft-deleted user ${user.email} (${user._id})`,
      metadata: {
        adminUser: req.adminUser,
        targetUserId: user._id,
        targetUserEmail: user.email,
        action: 'DEACTIVATE_USER',
      },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      user: {
        _id: user._id,
        email: user.email,
        isActive: false,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to delete user',
      message: err.message,
    });
  }
};

// ==============================================================================
// 3. TENDER MANAGEMENT
// ==============================================================================

/**
 * Paginated tender list for admin
 */
export const getAdminTenders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { search, status, departmentName, sortBy = 'publishedDate', sortOrder = 'desc' } = req.query;

    const query = {};

    // 1. Search filter (title, tenderReferenceNumber)
    if (search && search.trim()) {
      const sanitized = escapeRegex(search);
      const searchRegex = new RegExp(sanitized, 'i');
      query.$or = [
        { title: searchRegex },
        { tenderReferenceNumber: searchRegex },
      ];
    }

    // 2. Status filter
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // 3. Department filter
    if (departmentName && departmentName !== 'ALL') {
      query.departmentName = new RegExp(escapeRegex(departmentName), 'i');
    }

    // 4. Sorting
    const allowedSortFields = ['publishedDate', 'closingDate', 'estimatedValue', 'createdAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'publishedDate';
    const sortDirection = (sortOrder === 'asc' || sortOrder === '1') ? 1 : -1;

    const selectedFields = '_id title tenderReferenceNumber departmentName status estimatedValue publishedDate closingDate pdfFetchStatus sourcePortal';

    const [tenders, total] = await Promise.all([
      Tender.find(query)
        .select(selectedFields)
        .sort({ [sortField]: sortDirection })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tender.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      tenders,
      total,
      page,
      totalPages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch admin tenders',
      message: err.message,
    });
  }
};

/**
 * Single tender with full details and related document / requirement counts
 */
export const getAdminTenderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid tender ID format' });
    }

    const tender = await Tender.findById(id).lean();
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const [tenderDocumentsCount, tenderRequirementsCount] = await Promise.all([
      TenderDocument.countDocuments({ tenderId: id }),
      TenderRequirement.countDocuments({ tenderId: id }),
    ]);

    return res.status(200).json({
      success: true,
      tender: {
        ...tender,
        tenderDocumentsCount,
        tenderRequirementsCount,
      },
      tenderDocumentsCount,
      tenderRequirementsCount,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve tender details',
      message: err.message,
    });
  }
};

/**
 * Update tender fields (status, isDelisted, delistReason)
 */
export const updateAdminTender = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid tender ID format' });
    }

    const tender = await Tender.findById(id);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const { status, isDelisted, delistReason } = req.body || {};
    const updates = {};

    if (status !== undefined) {
      updates.status = status;
      tender.status = status;
      if (status === 'CANCELLED' && !tender.cancelledAt) {
        tender.cancelledAt = new Date();
        updates.cancelledAt = tender.cancelledAt;
      }
    }

    if (isDelisted !== undefined) {
      const boolDelisted = isDelisted === true || isDelisted === 'true';
      updates.isDelisted = boolDelisted;
      tender.isDelisted = boolDelisted;
    }

    if (delistReason !== undefined) {
      updates.delistReason = typeof delistReason === 'string' ? delistReason.trim() : '';
      tender.delistReason = updates.delistReason;
    }

    await tender.save();

    await SystemLog.create({
      level: 'INFO',
      source: 'API',
      message: `Admin ${req.adminUser?.email || 'Unknown'} updated tender ${tender.sourceTenderId || tender._id}`,
      metadata: {
        adminUser: req.adminUser,
        targetTenderId: tender._id,
        sourceTenderId: tender.sourceTenderId,
        updates,
      },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Tender updated successfully',
      tender,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update tender',
      message: err.message,
    });
  }
};

/**
 * Soft delete tender (status = CANCELLED, isDelisted = true)
 */
export const deleteAdminTender = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid tender ID format' });
    }

    const tender = await Tender.findById(id);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    tender.status = 'CANCELLED';
    tender.isDelisted = true;
    tender.cancelledAt = new Date();
    if (req.body?.reason) {
      tender.delistReason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    }

    await tender.save();

    await SystemLog.create({
      level: 'WARN',
      source: 'API',
      message: `Admin ${req.adminUser?.email || 'Unknown'} soft-deleted tender ${tender.sourceTenderId || tender._id} (marked CANCELLED, delisted)`,
      metadata: {
        adminUser: req.adminUser,
        targetTenderId: tender._id,
        sourceTenderId: tender.sourceTenderId,
        action: 'SOFT_DELETE_TENDER',
        delistReason: tender.delistReason,
      },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Tender delisted and marked as CANCELLED successfully',
      tender: {
        _id: tender._id,
        sourceTenderId: tender.sourceTenderId,
        status: tender.status,
        isDelisted: tender.isDelisted,
        cancelledAt: tender.cancelledAt,
        delistReason: tender.delistReason,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to delete tender',
      message: err.message,
    });
  }
};



