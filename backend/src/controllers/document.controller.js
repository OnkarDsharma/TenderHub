import CompanyDocument from '../models/CompanyDocument.js';
import crypto from 'crypto';
import path from 'path';
import { HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2 } from '../utils/r2Storage.js';
import { env } from '../config/env.js';

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const safeName = (name) => path.basename(name).replace(/[^\w.-]/g, '_').slice(0, 180);
const documentKey = (organizationId, id, name) => `company-documents/${organizationId}/${id}/${name}`;

export const getPresignedUrl = async (req, res, next) => {
  try {
    const { fileName, fileType, size } = req.body;
    if (!env.R2_BUCKET_NAME || !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      return res.status(503).json({ error: 'Document storage is not configured.' });
    }
    const id = crypto.randomUUID();
    const key = documentKey(req.organizationId, id, safeName(fileName));
    const uploadUrl = await getSignedUrl(r2, new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME, Key: key, ContentType: fileType, ContentLength: size,
      Metadata: { organizationid: String(req.organizationId), expectedsize: String(size) },
    }), { expiresIn: 300 });
    res.status(200).json({
      uploadUrl,
      key,
      fileType,
      size,
      maxBytes: MAX_DOCUMENT_BYTES,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmDocumentUpload = async (req, res, next) => {
  try {
    const { title, key, type } = req.body;
    const prefix = `company-documents/${req.organizationId}/`;
    if (typeof key !== 'string' || !key.startsWith(prefix)) {
      return res.status(403).json({ error: 'Invalid document ownership.' });
    }
    const head = await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
    if (head.Metadata?.organizationid !== String(req.organizationId) ||
        head.Metadata?.expectedsize !== String(head.ContentLength) ||
        !head.ContentLength || head.ContentLength > MAX_DOCUMENT_BYTES) {
      return res.status(400).json({ error: 'Uploaded document is invalid or exceeds the size limit.' });
    }
    const document = await CompanyDocument.create({
      organizationId: req.organizationId,
      title,
      key,
      type,
      size: head.ContentLength,
      contentType: head.ContentType,
    });
    
    res.status(201).json({ message: 'Document saved successfully', document });
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (req, res, next) => {
  try {
    const documents = await CompanyDocument.find({
      organizationId: req.organizationId
    }).sort({ createdAt: -1 });

    const withDownloadUrls = await Promise.all(documents.map(async (document) => ({
      ...document.toObject(),
      downloadUrl: await getSignedUrl(r2, new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: document.key, ResponseContentDisposition: 'attachment' }), { expiresIn: 60 }),
    })));
    res.status(200).json({ success: true, documents: withDownloadUrls });
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await CompanyDocument.findOne({
      _id: id,
      organizationId: req.organizationId
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: document.key }));
    await document.deleteOne();
    res.status(200).json({ success: true, message: 'Document deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
