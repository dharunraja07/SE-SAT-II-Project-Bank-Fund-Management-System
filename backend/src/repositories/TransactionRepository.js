const { getDatabase } = require('../db/connection');

class TransactionRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  create({
    reference,
    idempotencyKey,
    ownerUserId,
    sourceAccountId,
    beneficiaryAccountId,
    beneficiaryNameSnapshot,
    amount,
    charge,
    totalDebit,
    chargeRuleSnapshot,
    status = 'INITIATED',
    failureReason = null
  }) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO transactions (
        reference,
        idempotency_key,
        owner_user_id,
        source_account_id,
        beneficiary_account_id,
        beneficiary_name_snapshot,
        amount,
        charge,
        total_debit,
        charge_rule_snapshot,
        status,
        failure_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      reference,
      idempotencyKey,
      ownerUserId,
      sourceAccountId,
      beneficiaryAccountId,
      beneficiaryNameSnapshot,
      amount,
      charge,
      totalDebit,
      chargeRuleSnapshot,
      status,
      failureReason,
      now,
      now
    );

    return this.findByReference(reference);
  }

  findByReference(reference) {
    const stmt = this.db.prepare('SELECT * FROM transactions WHERE reference = ?');
    return stmt.get(reference);
  }

  findByIdempotencyKey(idempotencyKey) {
    const stmt = this.db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?');
    return stmt.get(idempotencyKey);
  }

  findOpenTransaction(ownerUserId, beneficiaryAccountId, amount) {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE owner_user_id = ?
        AND beneficiary_account_id = ?
        AND amount = ?
        AND status IN ('INITIATED', 'AUTHORISED')
      LIMIT 1
    `);
    return stmt.get(ownerUserId, beneficiaryAccountId, amount);
  }

  findByOwnerUserId(ownerUserId) {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE owner_user_id = ?
      ORDER BY id DESC
    `);
    return stmt.all(ownerUserId);
  }

  findAll() {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      ORDER BY id DESC
    `);
    return stmt.all();
  }

  updateStatus(reference, newStatus, failureReason = null) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE transactions
      SET status = ?,
          failure_reason = ?,
          updated_at = ?
      WHERE reference = ?
    `);
    return stmt.run(newStatus, failureReason, now, reference);
  }

  updateStatusIfCurrent(reference, currentStatus, newStatus, failureReason = null) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE transactions
      SET status = ?,
          failure_reason = ?,
          updated_at = ?
      WHERE reference = ? AND status = ?
    `);
    return stmt.run(newStatus, failureReason, now, reference, currentStatus);
  }

  executeTransaction(fn) {
    return this.db.transaction(fn)();
  }
}

module.exports = TransactionRepository;
