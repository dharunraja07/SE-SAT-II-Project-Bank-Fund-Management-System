const express = require('express');

function createAdminRoutes(txnService, authMiddleware) {
  const router = express.Router();

  // All admin routes require admin privileges
  router.use(authMiddleware.requireAdmin);

  // GET /api/admin/transactions
  router.get('/transactions', (req, res) => {
    try {
      const transactions = txnService.getAllTransactions(req.user);
      return res.status(200).json({
        success: true,
        data: {
          transactions
        }
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

  // GET /api/admin/audit
  router.get('/audit', (req, res) => {
    try {
      const history = txnService.getAllAuditHistory(req.user);
      return res.status(200).json({
        success: true,
        data: {
          history
        }
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

  // POST /api/admin/transactions/:ref/status
  router.post('/transactions/:ref/status', (req, res) => {
    try {
      const { ref } = req.params;
      const { targetStatus } = req.body;
      const updatedTxn = txnService.adminChangeStatus(req.user, ref, targetStatus);
      return res.status(200).json({
        success: true,
        data: {
          transaction: updatedTxn
        }
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

  return router;
}

module.exports = { createAdminRoutes };
