function createAuthMiddleware(authService) {
  function authenticate(req, res, next) {
    let sessionId = req.headers['x-session-id'];
    const authHeader = req.headers['authorization'];

    if (!sessionId && authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7).trim();
    }

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'Authentication required. Please provide a valid session ID.'
        }
      });
    }

    const session = authService.getSession(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'Session has expired or is invalid. Please log in again.'
        }
      });
    }

    req.user = session.user;
    req.sessionId = sessionId;
    req.session = session;
    next();
  }

  function requireAdmin(req, res, next) {
    authenticate(req, res, () => {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden: Administrator privileges required.'
          }
        });
      }
      next();
    });
  }

  return { authenticate, requireAdmin };
}

module.exports = { createAuthMiddleware };
