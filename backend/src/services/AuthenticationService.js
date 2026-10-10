const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const UserRepository = require('../repositories/UserRepository');

class AuthenticationService {
  constructor(userRepo = null) {
    this.userRepo = userRepo || new UserRepository();
    // In-memory session store & failed attempt counters
    this.sessions = new Map(); // sessionId -> { user, failedAttempts, createdAt }
    this.clientLockouts = new Map(); // key (loginId or clientKey) -> failedAttempts
  }

  generateSessionId() {
    return crypto.randomUUID();
  }

  getClientKey(loginId, clientSessionId = null) {
    return clientSessionId || (loginId ? `user:${loginId}` : null);
  }

  isSessionLocked(clientKey) {
    if (!clientKey) return false;
    const attempts = this.clientLockouts.get(clientKey) || 0;
    return attempts >= 3;
  }

  recordFailedAttempt(clientKey) {
    if (!clientKey) return 1;
    const current = this.clientLockouts.get(clientKey) || 0;
    const updated = current + 1;
    this.clientLockouts.set(clientKey, updated);
    return updated;
  }

  resetFailedAttempts(clientKey) {
    if (clientKey) {
      this.clientLockouts.delete(clientKey);
    }
  }

  login({ loginId, pin, clientSessionId = null }) {
    // BR5: Customer ID must not be blank
    if (!loginId || typeof loginId !== 'string' || loginId.trim() === '') {
      const error = new Error('Customer ID must not be blank.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const trimmedLoginId = loginId.trim();
    const clientKey = clientSessionId || `login:${trimmedLoginId}`;

    // BR5: Check if session / client is locked after 3 consecutive invalid attempts
    if (this.isSessionLocked(clientKey)) {
      const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
      error.code = 'SESSION_LOCKED';
      error.statusCode = 423;
      throw error;
    }

    // BR5: PIN must be exactly 4 digits
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      const attempts = this.recordFailedAttempt(clientKey);
      if (attempts >= 3) {
        const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
        error.code = 'SESSION_LOCKED';
        error.statusCode = 423;
        throw error;
      }
      const error = new Error('PIN must be exactly 4 digits.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const user = this.userRepo.findByLoginId(trimmedLoginId);
    if (!user) {
      const attempts = this.recordFailedAttempt(clientKey);
      if (attempts >= 3) {
        const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
        error.code = 'SESSION_LOCKED';
        error.statusCode = 423;
        throw error;
      }
      const error = new Error('Invalid login credentials.');
      error.code = 'AUTH_FAILED';
      error.statusCode = 401;
      throw error;
    }

    if (user.status !== 'Active') {
      const error = new Error('Account is inactive. Access denied.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    const isMatch = bcrypt.compareSync(pin, user.pin_hash);
    if (!isMatch) {
      const attempts = this.recordFailedAttempt(clientKey);
      if (attempts >= 3) {
        const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
        error.code = 'SESSION_LOCKED';
        error.statusCode = 423;
        throw error;
      }
      const remaining = 3 - attempts;
      const error = new Error(`Invalid PIN. ${remaining} attempt(s) remaining before session lockout.`);
      error.code = 'AUTH_FAILED';
      error.statusCode = 401;
      throw error;
    }

    // Successful PIN resets counter
    this.resetFailedAttempts(clientKey);

    const sessionId = this.generateSessionId();
    const sessionData = {
      sessionId,
      clientKey,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        status: user.status,
        loginId: user.login_id
      },
      failedAuthoriseAttempts: 0,
      createdAt: new Date()
    };
    this.sessions.set(sessionId, sessionData);

    return {
      sessionId,
      user: sessionData.user
    };
  }

  getSession(sessionId) {
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  logout(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
    return true;
  }

  verifyPinForAuthorise(sessionId, pin) {
    const session = this.getSession(sessionId);
    if (!session) {
      const error = new Error('Session expired or invalid.');
      error.code = 'AUTH_FAILED';
      error.statusCode = 401;
      throw error;
    }

    const clientKey = session.clientKey || session.sessionId;

    if (this.isSessionLocked(clientKey) || session.failedAuthoriseAttempts >= 3) {
      const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
      error.code = 'SESSION_LOCKED';
      error.statusCode = 423;
      throw error;
    }

    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      session.failedAuthoriseAttempts = (session.failedAuthoriseAttempts || 0) + 1;
      this.recordFailedAttempt(clientKey);
      if (session.failedAuthoriseAttempts >= 3 || this.isSessionLocked(clientKey)) {
        const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
        error.code = 'SESSION_LOCKED';
        error.statusCode = 423;
        throw error;
      }
      const error = new Error('PIN must be exactly 4 digits.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const user = this.userRepo.findById(session.user.id);
    if (!user) {
      const error = new Error('User not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const isMatch = bcrypt.compareSync(pin, user.pin_hash);
    if (!isMatch) {
      session.failedAuthoriseAttempts = (session.failedAuthoriseAttempts || 0) + 1;
      const attempts = this.recordFailedAttempt(clientKey);
      if (session.failedAuthoriseAttempts >= 3 || attempts >= 3) {
        const error = new Error('Session is locked due to 3 consecutive invalid PIN attempts. All further attempts are blocked.');
        error.code = 'SESSION_LOCKED';
        error.statusCode = 423;
        throw error;
      }
      const remaining = 3 - session.failedAuthoriseAttempts;
      const error = new Error(`Invalid PIN. ${remaining} attempt(s) remaining before session lockout.`);
      error.code = 'AUTH_FAILED';
      error.statusCode = 401;
      throw error;
    }

    // Reset attempt counters on success
    session.failedAuthoriseAttempts = 0;
    this.resetFailedAttempts(clientKey);
    return true;
  }
}

module.exports = AuthenticationService;
