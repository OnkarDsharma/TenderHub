import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const verifyToken = async (req, res, next) => {
  // Test port / test mode bypass - STRICTLY allowed only when explicit ALLOW_TEST_BYPASS is set and on localhost during development
  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('localhost') || clientIp === '::ffff:127.0.0.1';
  if (process.env.ALLOW_TEST_BYPASS === 'true' && env.NODE_ENV === 'development' && isLocalhost && (
    req.headers['x-bypass-auth'] === 'true' || 
    req.headers.origin?.includes(':5175') || 
    req.headers.referer?.includes(':5175')
  )) {
    req.user = {
      userId: '6abe2b7f4ec335668fdc702a', // valid ObjectId for testing
      role: 'contractor',
      email: 'test-browser@tenderhub.local',
    };
    req.organizationId = '6abe2b7f4ec335668fdc702b';
    return next();
  }

  let token = null;

  // 1. Prefer HttpOnly secure cookie
  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } 
  // 2. Fall back to Authorization: Bearer header (ignore known dummy strings)
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const rawToken = req.headers.authorization.split(' ')[1];
    if (rawToken && rawToken.split('.').length === 3) {
      token = rawToken;
    }
  }

  // Helper for cookie options
  const getCookieOpts = (maxAgeSeconds) => ({
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: maxAgeSeconds * 1000,
    path: '/',
  });

  // Try verifying access token if present
  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
      req.user = {
        userId: decoded.userId,
        role: decoded.role || 'contractor',
        email: decoded.email,
      };
      req.organizationId = decoded.organizationId;
      return next();
    } catch (error) {
      // Access token invalid or expired: fall through to check refresh token
    }
  }

  // 3. Fallback: Check if user has a valid refreshToken cookie or header
  const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];
  if (refreshToken) {
    try {
      const decodedRefresh = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
      if (decodedRefresh?.userId) {
        // Dynamic import to prevent circular dependencies
        const { default: User } = await import('../models/User.js');
        const { default: OrganizationMember } = await import('../models/OrganizationMember.js');
        const { generateAccessToken } = await import('../utils/auth.utils.js');

        const user = await User.findById(decodedRefresh.userId).select('email role isActive');
        if (user && user.isActive) {
          const membership = await OrganizationMember.findOne({ userId: user._id });
          const userRole = membership?.role || user.role || 'contractor';
          const orgId = membership?.organizationId;

          req.user = {
            userId: user._id.toString(),
            role: userRole,
            email: user.email,
          };
          req.organizationId = orgId;

          // Issue fresh 15-minute access token cookie automatically
          const newAccessToken = generateAccessToken({
            userId: user._id.toString(),
            email: user.email,
            organizationId: orgId,
            role: userRole,
          });
          res.cookie('accessToken', newAccessToken, getCookieOpts(15 * 60));

          return next();
        }
      }
    } catch (refreshErr) {
      // Refresh token is also expired or invalid
    }
  }

  return res.status(401).json({ error: 'Access denied. Please sign in to continue.', requireLogin: true });
};

/**
 * Optional authentication middleware: if token exists and is valid, attaches req.user;
 * otherwise leaves req.user = null and continues without erroring.
 */
export const optionalAuth = (req, res, next) => {
  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('localhost') || clientIp === '::ffff:127.0.0.1';
  if (process.env.ALLOW_TEST_BYPASS === 'true' && env.NODE_ENV === 'development' && isLocalhost && (
    req.headers['x-bypass-auth'] === 'true' || 
    req.headers.origin?.includes(':5175') || 
    req.headers.referer?.includes(':5175')
  )) {
    req.user = {
      userId: '6abe2b7f4ec335668fdc702a',
      role: 'contractor',
      email: 'test-browser@tenderhub.local',
    };
    req.organizationId = '6abe2b7f4ec335668fdc702b';
    return next();
  }

  let token = null;

  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = {
      userId: decoded.userId,
      role: decoded.role || 'contractor',
      email: decoded.email,
    };
    req.organizationId = decoded.organizationId;
    next();
  } catch (error) {
    // Treat invalid/expired token gracefully as unauthenticated guest
    req.user = null;
    next();
  }
};