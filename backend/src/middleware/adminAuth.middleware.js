/**
 * @file backend/src/middleware/adminAuth.middleware.js
 * @description Secure administrative authorization middleware.
 * Validates either:
 * 1. Dual-credential verification: Valid Admin Secret Key (`x-admin-key`) AND Authorized Admin Email (`x-admin-email`)
 * 2. Administrative JWT Token via `Authorization: Bearer <token>`
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ADMIN_SECRET = env.ADMIN_SECRET_KEY;
const ADMIN_EMAIL = (env.ADMIN_EMAIL || '').toLowerCase().trim();

/**
 * Constant-time string equality check to prevent side-channel timing attacks.
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const adminAuth = (req, res, next) => {
  try {
    const adminKeyHeader = req.headers['x-admin-key'];
    const adminEmailHeader = req.headers['x-admin-email'] || req.query.adminEmail;
    const authHeader = req.headers.authorization;

    // Method 1: Dual Verification (Admin Secret Key + Authorized Admin Email)
    if (adminKeyHeader) {
      if (!adminEmailHeader) {
        return res.status(401).json({
          error: 'Missing Admin Email',
          message: 'Both an authorized admin email (x-admin-email) and secret key (x-admin-key) are required.',
        });
      }

      if (!ADMIN_SECRET || !ADMIN_EMAIL) {
        return res.status(500).json({
          error: 'Server Misconfiguration',
          message: 'Administrative credentials are not properly configured on the server.',
        });
      }

      const isKeyValid = safeCompare(adminKeyHeader, ADMIN_SECRET);
      const isEmailValid = safeCompare(adminEmailHeader.toLowerCase().trim(), ADMIN_EMAIL);

      if (isKeyValid && isEmailValid) {
        req.adminUser = {
          email: ADMIN_EMAIL,
          role: 'SUPER_ADMIN',
          authMethod: 'KEY_AND_EMAIL',
        };
        return next();
      }

      return res.status(401).json({
        error: 'Unauthorized Administrative Access',
        message: 'Invalid administrative email or secret key. Access denied.',
      });
    }

    // Method 2: Bearer JWT Token signed with ADMIN_SECRET or JWT_ACCESS_SECRET
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        // Try verifying with ADMIN_SECRET first
        const decoded = jwt.verify(token, ADMIN_SECRET);
        if (
          (decoded.role === 'SUPER_ADMIN' || decoded.role === 'admin') &&
          (!ADMIN_EMAIL || (decoded.email && decoded.email.toLowerCase() === ADMIN_EMAIL))
        ) {
          req.adminUser = decoded;
          return next();
        }
      } catch (err1) {
        // Fallback to JWT_ACCESS_SECRET
        try {
          const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
          if (
            ADMIN_EMAIL &&
            decoded.email &&
            decoded.email.toLowerCase() === ADMIN_EMAIL &&
            (decoded.role === 'SUPER_ADMIN' || decoded.role === 'admin' || decoded.role === 'superadmin' || decoded.isAdmin)
          ) {
            req.adminUser = decoded;
            return next();
          }
        } catch (err2) {
          // Token invalid
        }
      }
    }

    return res.status(401).json({
      error: 'Unauthorized Administrative Access',
      message: 'Both a valid admin secret key (x-admin-key) and authorized admin email (x-admin-email), or an administrative JWT token, are required.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Admin authorization evaluation failed' });
  }
};

