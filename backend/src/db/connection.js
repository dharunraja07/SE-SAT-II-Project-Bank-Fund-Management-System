const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let currentDb = null;
let currentDbPath = null;

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/bank.db');

function getDatabase(customPath = null) {
  const dbPath = customPath || process.env.DB_PATH || DEFAULT_DB_PATH;

  if (currentDb && currentDbPath === dbPath) {
    return currentDb;
  }

  if (currentDb) {
    try {
      currentDb.close();
    } catch (e) {
      // ignore
    }
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  currentDb = new Database(dbPath);
  currentDbPath = dbPath;

  currentDb.pragma('foreign_keys = ON');
  currentDb.pragma('journal_mode = WAL');

  initSchema(currentDb);

  return currentDb;
}

function initSchema(db) {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

function closeDatabase() {
  if (currentDb) {
    try {
      currentDb.close();
    } catch (e) {
      // ignore
    }
    currentDb = null;
    currentDbPath = null;
  }
}

module.exports = {
  getDatabase,
  initSchema,
  closeDatabase,
  DEFAULT_DB_PATH
};
