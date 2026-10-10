const { getDatabase } = require('../db/connection');

class TransactionHistoryRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  create({ referenceId, actorId, oldStatus, newStatus, note = null }) {
    const eventAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO transaction_history (
        reference_id,
        actor_id,
        old_status,
        new_status,
        event_at,
        note
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(referenceId, actorId, oldStatus, newStatus, eventAt, note);
  }

  findByReference(referenceId) {
    const stmt = this.db.prepare(`
      SELECT * FROM transaction_history
      WHERE reference_id = ?
      ORDER BY id ASC
    `);
    return stmt.all(referenceId);
  }

  findAll() {
    const stmt = this.db.prepare(`
      SELECT * FROM transaction_history
      ORDER BY id DESC
    `);
    return stmt.all();
  }
}

module.exports = TransactionHistoryRepository;
