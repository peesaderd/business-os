const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'business-os-gateway-secret-change-in-production';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'bos-internal-dev-key-2026';

function authMiddleware(req, res, next) {
  // Allow internal API key for service-to-service calls
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === INTERNAL_API_KEY) {
    req.user = { sub: 'internal', role: 'service' };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header. Use Bearer <token> or X-API-Key' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid Authorization header format. Expected: Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET, INTERNAL_API_KEY };
