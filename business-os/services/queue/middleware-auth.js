'use strict';

/**
 * Staff Authentication Middleware for Queue Service
 *
 * Protects staff-only endpoints (call, skip, complete, GPS update, etc.)
 * from unauthorized access.
 *
 * Authentication methods (in order):
 * 1. X-Staff-Key header or X-API-Key header matching STAFF_API_KEY
 * 2. Bearer token (any in dev mode; JWT validation in production)
 * 3. Localhost/kiosk requests (internal network trust)
 */

const STAFF_API_KEY = process.env.STAFF_API_KEY || 'queue-staff-key-change-me';

function requireStaffAuth(req, res, next) {
  const apiKey = req.headers['x-staff-key'] || req.headers['x-api-key'];
  const authHeader = req.headers.authorization;

  // 1. Check X-Staff-Key or X-API-Key header
  if (apiKey && apiKey === STAFF_API_KEY) {
    req.staff = { role: 'staff' };
    return next();
  }

  // 2. Check Bearer token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // In dev mode, accept any Bearer token
    if (process.env.NODE_ENV !== 'production') {
      req.staff = { role: 'staff', auth: 'bearer' };
      return next();
    }
    // In production, validate JWT here
  }

  // 3. Allow requests from local network ONLY in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const origin = req.headers.origin || '';
    const host = req.headers.host || '';
    if (origin.includes('localhost') || origin.includes('127.0.0.1') ||
        host.includes('localhost') || host.includes('127.0.0.1')) {
      req.staff = { role: 'kiosk' };
      return next();
    }
  }

  return res.status(401).json({
    error: 'Staff authentication required',
    message: 'Provide X-Staff-Key header matching STAFF_API_KEY',
  });
}

module.exports = { requireStaffAuth, STAFF_API_KEY };
