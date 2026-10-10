const { getDatabase } = require('../db/connection');

class UserRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  findByLoginId(loginId) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE login_id = ?');
    return stmt.get(loginId);
  }

  findAll() {
    const stmt = this.db.prepare('SELECT id, name, role, status, login_id, created_at FROM users');
    return stmt.all();
  }
}

module.exports = UserRepository;
