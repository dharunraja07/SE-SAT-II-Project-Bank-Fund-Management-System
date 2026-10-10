const express = require('express');

function createTransferRoutes(txnService, authService, authMiddleware) {
  const router = express.Router();

  // All transfer routes require authentication
  router.use(authMiddleware.authenticate);

  // POST /api/transfers/initiate
  router.post('/initiate', (req, res) => {
    try {
      const { beneficiaryAccountId, amount, idempotencyKey } = req.body;
      const result = txnService.initiateTransfer(req.user, {
        beneficiaryAccountId,
        amount,
        idempotencyKey
      });

      return res.status(200).json({
        success: true,
        data: {
          isDuplicate: result.isDuplicate,
          transaction: result.transaction
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

  // POST /api/transfers/:ref/authorise
  router.post('/:ref/authorise', (req, res) => {
    try {
      const { pin } = req.body;
      const { ref } = req.params;
      const updatedTxn = txnService.authoriseTransfer(req.user, ref, pin, authService, req.sessionId);

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

  // POST /api/transfers/:ref/complete
  router.post('/:ref/complete', (req, res) => {
    try {
      const { ref } = req.params;
      const completedTxn = txnService.completeTransfer(req.user, ref);

      return res.status(200).json({
        success: true,
        data: {
          transaction: completedTxn
        }
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message
        },
        data: err.transaction ? { transaction: err.transaction } : undefined
      });
    }
  });

  // GET /api/transfers/mine
  router.get('/mine', (req, res) => {
    try {
      const transactions = txnService.getCustomerTransactions(req.user.id);
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

  // GET /api/transfers/:ref
  router.get('/:ref', (req, res) => {
    try {
      const { ref } = req.params;
      const result = txnService.getTransactionDetails(req.user, ref);
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

  // POST /api/transfers/:ref/reverse
  router.post('/:ref/reverse', (req, res) => {
    try {
      const { ref } = req.params;
      const reversedTxn = txnService.reverseTransfer(req.user, ref);
      return res.status(200).json({
        success: true,
        data: {
          transaction: reversedTxn
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

module.exports = { createTransferRoutes };
