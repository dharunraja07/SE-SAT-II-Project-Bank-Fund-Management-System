const crypto = require('crypto');
const TransactionRepository = require('../repositories/TransactionRepository');
const AccountRepository = require('../repositories/AccountRepository');
const UserRepository = require('../repositories/UserRepository');
const ServiceConfigRepository = require('../repositories/ServiceConfigRepository');
const TransactionHistoryRepository = require('../repositories/TransactionHistoryRepository');

// Central transition matrix (BR8)
const ALLOWED_TRANSITIONS = {
  INITIATED: ['AUTHORISED', 'FAILED'],
  AUTHORISED: ['SUCCESS', 'FAILED'],
  SUCCESS: ['REVERSED'],
  FAILED: [],
  REVERSED: []
};

class TransactionService {
  constructor({
    txnRepo = null,
    accountRepo = null,
    userRepo = null,
    configRepo = null,
    historyRepo = null
  } = {}) {
    this.txnRepo = txnRepo || new TransactionRepository();
    this.accountRepo = accountRepo || new AccountRepository();
    this.userRepo = userRepo || new UserRepository();
    this.configRepo = configRepo || new ServiceConfigRepository();
    this.historyRepo = historyRepo || new TransactionHistoryRepository();
  }

  generateReference() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `TXN-${today}-${randomHex}`;
  }

  validateAmount(amount) {
    // BR1: whole rupees, Rs.100 to Rs.20,000 inclusive. Reject 0, negative, decimal, non-numeric, string-decimals, above-limit.
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 20000
    ) {
      const error = new Error('Amount must be a whole rupee value between Rs.100 and Rs.20,000 inclusive.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }
    return amount;
  }

  calculateCharge(amount) {
    // BR4: Charge rule values come from service_config table
    const config = this.configRepo.getAll();
    const threshold = parseInt(config.threshold || '1000', 10);
    const lowCharge = parseInt(config.low_charge || '10', 10);
    const highCharge = parseInt(config.high_charge || '0', 10);

    const charge = amount < threshold ? lowCharge : highCharge;
    const totalDebit = amount + charge;

    const chargeRuleSnapshot = JSON.stringify({
      threshold,
      low_charge: lowCharge,
      high_charge: highCharge
    });

    return { charge, totalDebit, chargeRuleSnapshot };
  }

  validateStatusTransition(currentStatus, targetStatus) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      const error = new Error(`Invalid status action: cannot transition from ${currentStatus} to ${targetStatus}.`);
      error.code = 'INVALID_STATUS_ACTION';
      error.statusCode = 409;
      throw error;
    }
  }

  initiateTransfer(user, { beneficiaryAccountId, amount, idempotencyKey }) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      const error = new Error('Idempotency key is required.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    // T1: Idempotency check
    const existingByIdemp = this.txnRepo.findByIdempotencyKey(idempotencyKey);
    if (existingByIdemp) {
      if (existingByIdemp.owner_user_id === user.id) {
        return {
          isDuplicate: true,
          transaction: existingByIdemp
        };
      } else {
        const error = new Error('Idempotency key conflict.');
        error.code = 'DUPLICATE';
        error.statusCode = 409;
        throw error;
      }
    }

    // BR1: Validate Amount
    this.validateAmount(amount);

    if (!beneficiaryAccountId || typeof beneficiaryAccountId !== 'string') {
      const error = new Error('Beneficiary account ID is required.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    // Source account check
    const sourceAccount = this.accountRepo.findPrimaryByOwnerUserId(user.id);
    if (!sourceAccount) {
      const error = new Error('Source account not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    if (sourceAccount.id === beneficiaryAccountId) {
      const error = new Error('Source and beneficiary accounts cannot be the same.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    // BR2: Source account must be Active
    if (sourceAccount.status !== 'Active') {
      const error = new Error('Source account is not active.');
      error.code = 'INELIGIBLE';
      error.statusCode = 400;
      throw error;
    }

    // Beneficiary account check
    const beneficiaryAccount = this.accountRepo.findById(beneficiaryAccountId);
    if (!beneficiaryAccount) {
      const error = new Error('Beneficiary account not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // BR2: Beneficiary account must be Active
    if (beneficiaryAccount.status !== 'Active') {
      const error = new Error('Beneficiary account is inactive.');
      error.code = 'INELIGIBLE';
      error.statusCode = 400;
      throw error;
    }

    // Calculate charge & total
    const { charge, totalDebit, chargeRuleSnapshot } = this.calculateCharge(amount);

    // BR2: Source balance >= total_debit
    if (sourceAccount.balance < totalDebit) {
      const error = new Error(`Insufficient balance in source account. Available: Rs.${sourceAccount.balance}, Required: Rs.${totalDebit}.`);
      error.code = 'INELIGIBLE';
      error.statusCode = 400;
      throw error;
    }

    // T1: Check for identical open request (same owner, beneficiary, amount in INITIATED or AUTHORISED)
    const openTxn = this.txnRepo.findOpenTransaction(user.id, beneficiaryAccountId, amount);
    if (openTxn) {
      const error = new Error('An identical transfer request is already pending authorization or completion.');
      error.code = 'DUPLICATE';
      error.statusCode = 409;
      throw error;
    }

    // Fetch beneficiary owner name for snapshot (BR3)
    const beneficiaryOwner = this.userRepo.findById(beneficiaryAccount.owner_user_id);
    const beneficiaryNameSnapshot = beneficiaryOwner ? beneficiaryOwner.name : 'Unknown';

    // Generate guaranteed unique reference
    let reference = this.generateReference();
    while (this.txnRepo.findByReference(reference)) {
      reference = this.generateReference();
    }

    // Create transaction in INITIATED state
    const transaction = this.txnRepo.create({
      reference,
      idempotencyKey,
      ownerUserId: user.id,
      sourceAccountId: sourceAccount.id,
      beneficiaryAccountId: beneficiaryAccount.id,
      beneficiaryNameSnapshot,
      amount,
      charge,
      totalDebit,
      chargeRuleSnapshot,
      status: 'INITIATED'
    });

    // Record initial history
    this.historyRepo.create({
      referenceId: reference,
      actorId: user.id,
      oldStatus: null,
      newStatus: 'INITIATED',
      note: 'Transfer initiated by customer'
    });

    return {
      isDuplicate: false,
      transaction
    };
  }

  authoriseTransfer(user, reference, pin, authService, sessionId) {
    const txn = this.txnRepo.findByReference(reference);
    if (!txn) {
      const error = new Error('Transaction not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // BR10: Customer sees ONLY own transactions
    if (txn.owner_user_id !== user.id) {
      const error = new Error('Forbidden: You do not have permission to access this transaction.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    // BR8: Check transition from current status to AUTHORISED
    this.validateStatusTransition(txn.status, 'AUTHORISED');

    // BR5: Verify PIN with session lockout enforcement
    authService.verifyPinForAuthorise(sessionId, pin);

    // Update status
    this.txnRepo.updateStatus(reference, 'AUTHORISED');

    this.historyRepo.create({
      referenceId: reference,
      actorId: user.id,
      oldStatus: txn.status,
      newStatus: 'AUTHORISED',
      note: 'Customer authorised transfer with valid PIN'
    });

    return this.txnRepo.findByReference(reference);
  }

  completeTransfer(user, reference) {
    const txn = this.txnRepo.findByReference(reference);
    if (!txn) {
      const error = new Error('Transaction not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // BR10: Ownership check
    if (txn.owner_user_id !== user.id) {
      const error = new Error('Forbidden: You do not have permission to access this transaction.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    // Check transition
    this.validateStatusTransition(txn.status, 'SUCCESS');

    // Pre-commit revalidation (BR2)
    const sourceAccount = this.accountRepo.findById(txn.source_account_id);
    const beneficiaryAccount = this.accountRepo.findById(txn.beneficiary_account_id);

    let failureReason = null;
    if (!sourceAccount || sourceAccount.status !== 'Active') {
      failureReason = 'Source account is inactive or not found during final validation.';
    } else if (!beneficiaryAccount || beneficiaryAccount.status !== 'Active') {
      failureReason = 'Beneficiary account is inactive or not found during final validation.';
    } else if (sourceAccount.balance < txn.total_debit) {
      failureReason = `Source balance insufficient at commit: balance is Rs.${sourceAccount.balance}, required Rs.${txn.total_debit}.`;
    }

    // BR6 & BR8: If commit revalidation fails -> mark FAILED, write history, NO balance change
    if (failureReason) {
      this.txnRepo.updateStatus(reference, 'FAILED', failureReason);
      this.historyRepo.create({
        referenceId: reference,
        actorId: 'SYSTEM',
        oldStatus: txn.status,
        newStatus: 'FAILED',
        note: failureReason
      });
      const error = new Error(failureReason);
      error.code = 'INELIGIBLE';
      error.statusCode = 400;
      error.transaction = this.txnRepo.findByReference(reference);
      throw error;
    }

    // BR7 & BR6: Atomic DB Transaction with commit
    return this.txnRepo.executeTransaction(() => {
      const currentTxn = this.txnRepo.findByReference(reference);
      if (currentTxn.status !== 'AUTHORISED') {
        const error = new Error('Invalid status action: transaction is not in AUTHORISED state.');
        error.code = 'INVALID_STATUS_ACTION';
        error.statusCode = 409;
        throw error;
      }

      const freshSource = this.accountRepo.findById(currentTxn.source_account_id);
      const freshBeneficiary = this.accountRepo.findById(currentTxn.beneficiary_account_id);

      if (!freshSource || freshSource.status !== 'Active' || !freshBeneficiary || freshBeneficiary.status !== 'Active' || freshSource.balance < currentTxn.total_debit) {
        throw new Error('Pre-commit revalidation failed inside transaction.');
      }

      // BR7: Atomic balance update & success transition
      this.accountRepo.decrementBalance(freshSource.id, currentTxn.total_debit);
      this.accountRepo.incrementBalance(freshBeneficiary.id, currentTxn.amount);

      this.txnRepo.updateStatus(reference, 'SUCCESS');
      this.historyRepo.create({
        referenceId: reference,
        actorId: user.id,
        oldStatus: 'AUTHORISED',
        newStatus: 'SUCCESS',
        note: 'Funds transferred successfully'
      });

      return this.txnRepo.findByReference(reference);
    });
  }

  reverseTransfer(actor, reference) {
    const txn = this.txnRepo.findByReference(reference);
    if (!txn) {
      const error = new Error('Transaction not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // BR10: Customer can only reverse OWN transactions; Admin can reverse any
    if (actor.role === 'CUSTOMER' && txn.owner_user_id !== actor.id) {
      const error = new Error('Forbidden: You can only reverse your own transactions.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    // BR8 & BR9: Central transition table check (only SUCCESS -> REVERSED)
    this.validateStatusTransition(txn.status, 'REVERSED');

    // BR9: Atomic reversal with once-only status check (UPDATE ... WHERE status='SUCCESS')
    return this.txnRepo.executeTransaction(() => {
      const updateResult = this.txnRepo.updateStatusIfCurrent(reference, 'SUCCESS', 'REVERSED');
      if (updateResult.changes === 0) {
        const error = new Error('Transaction is not in SUCCESS status or has already been reversed.');
        error.code = 'INVALID_STATUS_ACTION';
        error.statusCode = 409;
        throw error;
      }

      // Check beneficiary balance sufficiency
      const beneficiaryAccount = this.accountRepo.findById(txn.beneficiary_account_id);
      if (!beneficiaryAccount || beneficiaryAccount.balance < txn.amount) {
        const currentBal = beneficiaryAccount ? beneficiaryAccount.balance : 0;
        const error = new Error(`Beneficiary has insufficient funds for reversal. Available: Rs.${currentBal}, Required: Rs.${txn.amount}.`);
        error.code = 'INELIGIBLE';
        error.statusCode = 400;
        // Rollback is triggered by throwing inside executeTransaction
        throw error;
      }

      // Refund source by total_debit, deduct amount from beneficiary
      this.accountRepo.decrementBalance(txn.beneficiary_account_id, txn.amount);
      this.accountRepo.incrementBalance(txn.source_account_id, txn.total_debit);

      this.historyRepo.create({
        referenceId: reference,
        actorId: actor.id,
        oldStatus: 'SUCCESS',
        newStatus: 'REVERSED',
        note: `Reversed by ${actor.role}: refunded Rs.${txn.total_debit} to source, deducted Rs.${txn.amount} from beneficiary.`
      });

      return this.txnRepo.findByReference(reference);
    });
  }

  getTransactionDetails(actor, reference) {
    const txn = this.txnRepo.findByReference(reference);
    if (!txn) {
      const error = new Error('Transaction not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // BR10: Customer sees ONLY own transactions
    if (actor.role === 'CUSTOMER' && txn.owner_user_id !== actor.id) {
      const error = new Error('Forbidden: You do not have permission to view this transaction.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    const history = this.historyRepo.findByReference(reference);
    return {
      transaction: txn,
      history
    };
  }

  getCustomerTransactions(userId) {
    return this.txnRepo.findByOwnerUserId(userId);
  }

  getAllTransactions(actor) {
    // BR10: Admin only
    if (actor.role !== 'ADMIN') {
      const error = new Error('Forbidden: Administrator access required.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }
    return this.txnRepo.findAll();
  }

  getAllAuditHistory(actor) {
    // BR10: Admin only
    if (actor.role !== 'ADMIN') {
      const error = new Error('Forbidden: Administrator access required.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }
    return this.historyRepo.findAll();
  }

  adminChangeStatus(actor, reference, targetStatus) {
    // BR10: Admin only
    if (actor.role !== 'ADMIN') {
      const error = new Error('Forbidden: Administrator access required.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    const txn = this.txnRepo.findByReference(reference);
    if (!txn) {
      const error = new Error('Transaction not found.');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // BR8: Admin can NEVER convert INITIATED or FAILED (or anything except via valid transition) to SUCCESS.
    // In fact, only SUCCESS -> REVERSED is permitted for admin status actions.
    if (targetStatus === 'REVERSED' && txn.status === 'SUCCESS') {
      return this.reverseTransfer(actor, reference);
    }

    // For any other action attempted by admin, reject with 409
    this.validateStatusTransition(txn.status, targetStatus);
    const error = new Error(`Admin cannot transition transaction from ${txn.status} to ${targetStatus}.`);
    error.code = 'INVALID_STATUS_ACTION';
    error.statusCode = 409;
    throw error;
  }
}

module.exports = TransactionService;
