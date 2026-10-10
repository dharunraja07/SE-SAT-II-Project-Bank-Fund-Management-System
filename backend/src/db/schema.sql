-- Software Engineering SAT II: Bank Fund Transfer System
-- Schema Definition

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'ADMIN')),
  status TEXT NOT NULL CHECK(status IN ('Active', 'Inactive')),
  login_id TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('Active', 'Inactive')),
  balance INTEGER NOT NULL CHECK(balance >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  source_account_id TEXT NOT NULL REFERENCES accounts(id),
  beneficiary_account_id TEXT NOT NULL REFERENCES accounts(id),
  beneficiary_name_snapshot TEXT NOT NULL,
  amount INTEGER NOT NULL,
  charge INTEGER NOT NULL,
  total_debit INTEGER NOT NULL,
  charge_rule_snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('INITIATED', 'AUTHORISED', 'SUCCESS', 'FAILED', 'REVERSED')),
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  event_at TEXT NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_owner ON transactions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_history_ref ON transaction_history(reference_id);
