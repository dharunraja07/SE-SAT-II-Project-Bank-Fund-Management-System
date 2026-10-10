const express = require('express');

function createAccountRoutes(accountRepo, authMiddleware) {
  const router = express.Router();

  router.use(authMiddleware.authenticate);

  router.get('/mine', (req, res) => {
    try {
      const accounts = accountRepo.findByOwnerUserId(req.user.id);
      return res.status(200).json({
        success: true,
        data: {
          accounts,
          primaryAccount: accounts.length > 0 ? accounts[0] : null
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message
        }
      });
    }
  });

  return router;
}

module.exports = { createAccountRoutes };
