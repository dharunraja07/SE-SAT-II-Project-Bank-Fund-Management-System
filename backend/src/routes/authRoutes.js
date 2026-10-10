const express = require('express');

function createAuthRoutes(authService) {
  const router = express.Router();

  router.post('/login', (req, res, next) => {
    try {
      const { loginId, pin } = req.body;
      const clientSessionId = req.headers['x-client-session-id'] || req.headers['x-session-id'];
      const result = authService.login({ loginId, pin, clientSessionId });
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message
        }
      });
    }
  });

  router.post('/logout', (req, res) => {
    let sessionId = req.headers['x-session-id'];
    const authHeader = req.headers['authorization'];
    if (!sessionId && authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7).trim();
    }
    if (sessionId) {
      authService.logout(sessionId);
    }
    return res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully.' }
    });
  });

  router.get('/me', (req, res) => {
    let sessionId = req.headers['x-session-id'];
    const authHeader = req.headers['authorization'];
    if (!sessionId && authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7).trim();
    }
    const session = authService.getSession(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'Not logged in.'
        }
      });
    }
    return res.status(200).json({
      success: true,
      data: { user: session.user }
    });
  });

  return router;
}

module.exports = { createAuthRoutes };
