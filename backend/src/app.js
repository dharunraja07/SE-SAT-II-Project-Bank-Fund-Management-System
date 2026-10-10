const express = require('express');
const cors = require('cors');
const { getDatabase } = require('./db/connection');
const { seedDatabase } = require('../scripts/seed');
const UserRepository = require('./repositories/UserRepository');
const AccountRepository = require('./repositories/AccountRepository');
const ServiceConfigRepository = require('./repositories/ServiceConfigRepository');
const TransactionRepository = require('./repositories/TransactionRepository');
const TransactionHistoryRepository = require('./repositories/TransactionHistoryRepository');
const AuthenticationService = require('./services/AuthenticationService');
const TransactionService = require('./services/TransactionService');
const { createAuthMiddleware } = require('./middleware/auth');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createTransferRoutes } = require('./routes/transferRoutes');
const { createAccountRoutes } = require('./routes/accountRoutes');
const { createAdminRoutes } = require('./routes/adminRoutes');

function createApp({
  dbPath = null,
  authService = null,
  txnService = null
} = {}) {
  const db = getDatabase(dbPath);

  // Auto-seed on first run if database is empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    seedDatabase(db);
  }

  const userRepo = new UserRepository(db);
  const accountRepo = new AccountRepository(db);
  const configRepo = new ServiceConfigRepository(db);
  const txnRepo = new TransactionRepository(db);
  const historyRepo = new TransactionHistoryRepository(db);

  const authSvc = authService || new AuthenticationService(userRepo);
  const txnSvc = txnService || new TransactionService({
    txnRepo,
    accountRepo,
    userRepo,
    configRepo,
    historyRepo
  });

  const authMiddleware = createAuthMiddleware(authSvc);

  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API routers
  app.use('/api/auth', createAuthRoutes(authSvc));
  app.use('/api/transfers', createTransferRoutes(txnSvc, authSvc, authMiddleware));
  app.use('/api/accounts', createAccountRoutes(accountRepo, authMiddleware));
  app.use('/api/admin', createAdminRoutes(txnSvc, authMiddleware));

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString()
    });
  });

  // Serve frontend static assets in production/standalone mode
  const path = require('path');
  const fs = require('fs');
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      next();
    });
  }

  // Global 404 handler for API
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found.'
      }
    });
  });

  return {
    app,
    db,
    authService: authSvc,
    txnService: txnSvc,
    repositories: {
      userRepo,
      accountRepo,
      configRepo,
      txnRepo,
      historyRepo
    }
  };
}

module.exports = { createApp };
