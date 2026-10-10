const { getDatabase } = require('../db/connection');

class AccountRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE id = ?');
    return stmt.get(id);
  }

  findByOwnerUserId(ownerUserId) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE owner_user_id = ?');
    return stmt.all(ownerUserId);
  }

  findPrimaryByOwnerUserId(ownerUserId) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE owner_user_id = ? LIMIT 1');
    return stmt.get(ownerUserId);
  }

  updateBalance(id, newBalance) {
    const stmt = this.db.prepare('UPDATE accounts SET balance = ? WHERE id = ?');
    return stmt.run(newBalance, id);
  }

  decrementBalance(id, amount) {
    const stmt = this.db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?');
    return stmt.run(amount, id);
  }

  incrementBalance(id, amount) {
    const stmt = this.db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?');
    return stmt.run(amount, id);
  }
}

module.exports = AccountRepository;
