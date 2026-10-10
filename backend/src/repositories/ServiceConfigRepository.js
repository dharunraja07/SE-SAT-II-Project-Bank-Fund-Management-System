const { getDatabase } = require('../db/connection');

class ServiceConfigRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  get(key) {
    const stmt = this.db.prepare('SELECT value FROM service_config WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  }

  getAll() {
    const stmt = this.db.prepare('SELECT key, value FROM service_config');
    const rows = stmt.all();
    const config = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    return config;
  }

  set(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO service_config (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    return stmt.run(key, String(value));
  }
}

module.exports = ServiceConfigRepository;
