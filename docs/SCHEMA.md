# Database Schema & Architectural Specification

## Project: Bank Fund Transfer System (Industry Use Case 11)
**Database Engine:** SQLite 3 (via `better-sqlite3`)  
**Storage Location:** `backend/data/bank.db`  
**Integrity Pragma:** `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`

---

## 1. Three-Layer Architectural Separation

```
+-------------------------------------------------------------------------+
|                         PRESENTATION LAYER                              |
|  - React Single-Page Application (Vite + Tailwind/Custom Design Tokens) |
|  - Express HTTP Controllers & Routers (routes/*.js, middleware/auth.js)  |
|  (Role: Request parsing, session retrieval, HTTP status & JSON delivery)|
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                           BUSINESS LAYER                                |
|  - services/AuthenticationService.js (BR5 PIN validation, session lock) |
|  - services/TransactionService.js (BR1-BR4, BR6-BR10 business rules)   |
|  (Role: Eligibility verification, charge calculation, snapshots,        |
|         state transition matrix enforcement, atomicity orchestration)   |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                         DATA ACCESS LAYER                               |
|  - repositories/UserRepository.js                                       |
|  - repositories/AccountRepository.js                                    |
|  - repositories/ServiceConfigRepository.js                              |
|  - repositories/TransactionRepository.js                                |
|  - repositories/TransactionHistoryRepository.js                         |
|  (Role: Parameterized SQL queries, SQLite atomic transaction execution) |
+-------------------------------------------------------------------------+
```

---

## 2. Entity-Relationship (ER) Overview

- **users (1) ———< (N) accounts:** A user owns one or more bank accounts.
- **users (1) ———< (N) transactions:** A user initiates transfer transactions.
- **accounts (1) ———< (N) transactions [as source]:** Debited during successful transfers.
- **accounts (1) ———< (N) transactions [as beneficiary]:** Credited during successful transfers.
- **transactions (1) ———< (N) transaction_history:** Non-repudiable audit lifecycle event logs.

---

## 3. SQL DDL Statements (`schema.sql`)

```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'ADMIN')),
  status TEXT NOT NULL CHECK(status IN ('Active', 'Inactive')),
  login_id TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('Active', 'Inactive')),
  balance INTEGER NOT NULL CHECK(balance >= 0),
  created_at TEXT NOT NULL
);

-- Service Configuration Table
CREATE TABLE IF NOT EXISTS service_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Transactions Table (Core Ledger & Snapshot)
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

-- Transaction History Table (Audit Trail)
CREATE TABLE IF NOT EXISTS transaction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  event_at TEXT NOT NULL,
  note TEXT
);

-- Indexes for Query Optimization
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON transactions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_history_ref ON transaction_history(reference_id);
```

---

## 4. Snapshot Storage Rationale (BR3)
In core banking ledgers, when a transaction succeeds, it must remain historically invariant regardless of subsequent changes to customer names, fee schedules, or account reassignments.
- `beneficiary_name_snapshot`: Preserves beneficiary identity at the point of initiation.
- `charge_rule_snapshot`: Preserves JSON snapshot of `{threshold, low_charge, high_charge}` so future fee updates cannot alter prior accounting records.
- `charge` and `total_debit`: Explicitly stored as integers in INR.
