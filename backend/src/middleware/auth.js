const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Main auth middleware (used as authMiddleware)
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    req.user = { id: decoded.userId || decoded.id };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Protect middleware (alias for authMiddleware)
const protect = authMiddleware;

// Export both
module.exports = authMiddleware;
module.exports.protect = protect;
module.exports.authMiddleware = authMiddleware;