# Bank Fund Transfer System
### Software Engineering SAT II – Industry Use Case 11
**Institution:** Sri Eshwar College of Engineering  
**Academic Year:** 2025–2026

---

## 1. Project Overview
A robust, resilient, full-stack banking fund transfer system engineered according to industry best practices and strict software engineering principles. The application incorporates a **3-layer architecture** (Presentation, Business Rules, Data Access), **ACID-compliant SQLite transactions**, **centralized state-machine status flows**, **tamper-proof master-data snapshots**, and **defense-in-depth security** to eliminate partial ledger updates, race conditions, and duplicate transfers.

---

## 2. Technology Stack & Architecture
- **Backend:** Node.js (v18+), Express.js, SQLite 3 via `better-sqlite3` (stored at `backend/data/bank.db`).
- **Frontend:** React 19, Vite, Modern Design System with Plus Jakarta Sans & JetBrains Mono typography.
- **Testing:** Vitest/Supertest test harness (`run-all-tests.js`), Process-restart persistence validator, Playwright end-to-end browser automation.
- **Architecture Layers:**
  - **Presentation Layer (`frontend/`, `backend/src/routes/`):** React dashboard and Express endpoints.
  - **Business Layer (`backend/src/services/`):** `AuthenticationService.js` and `TransactionService.js` enforcing all domain rules (BR1–BR10).
  - **Data Access Layer (`backend/src/repositories/`):** Parameterized SQL queries in repository modules.

---

## 3. Synthetic Demo Seed Data & Credentials
All demo credentials and accounts are strictly synthetic. PINs are stored exclusively as salted bcrypt hashes in the SQLite database.

| User ID | Role | Customer / Login ID | Synthetic Demo PIN | Assigned Account | Status | Initial Balance |
|---|---|---|---|---|---|---|
| **U1** | CUSTOMER | `C101` | `1234` | `A101` | Active | **₹25,000** |
| **U2** | CUSTOMER | `C102` | `5678` | `A102` | Active | **₹8,000** |
| **U0** | ADMIN | `ADMIN01` | `9999` | N/A | Active | N/A |
| **U3** | CUSTOMER | `C103` | `0000` | `A103` | **Inactive** | ₹12,000 |

*Note: Account A103 is purposefully set to Inactive to test boundary and eligibility rejections (BR2).*

---

## 4. Quick Start & Execution Guide

### Step 1: Install Dependencies
```bash
npm install
cd frontend && npm install && npm run build && cd ..
```

### Step 2: Seed the Database
```bash
npm run seed
```
*(Seeds 4 users, 3 accounts, and default service config into `backend/data/bank.db`).*

### Step 3: Run the Application
```bash
npm start
```
Open **`http://localhost:5000`** in any browser. The Express server serves both the REST API and the built production frontend seamlessly.

---

## 5. Running Automated Verification & Evidence

### A. Run All Automated Test Cases (T1–T12 + Extras)
```bash
npm test
```
- Executes 16 automated tests against fresh isolated databases.
- Writes structured results to `evidence/test-results.json`.
- Logs timestamped request/response pairs to `evidence/execution.log`.

### B. Capture Playwright Browser Evidence Screenshots
```bash
npm run evidence:screenshots
```
Drives headless Chromium through the complete user and admin journeys, saving timestamped PNG screenshots into `evidence/screenshots/`:
- `T6-login.png`: Login interface with credentials selector.
- `T3-rejected-inactive.png`: Inactive beneficiary error message.
- `T4-transfer-review.png`: Transfer review with dynamic service charge breakdown.
- `T5-success-receipt.png`: Success receipt displaying guaranteed unique reference.
- `T8-history.png`: Customer personal transaction history.
- `T10-reversal.png`: Atomic reversal restoring account balance.
- `T8-admin-audit.png`: System-wide transactions and complete audit history log.
- `T9-admin-invalid-action.png`: Rejection of illegal admin status transition (HTTP 409).

### C. Generate Real Execution Reports
```bash
npm run report
```
Generates markdown reports from genuine execution evidence:
- `docs/TEST_EXECUTION_REPORT.md`
- `docs/AI_TEST_REPORT.md`
- `docs/TRACEABILITY.md`
- `docs/AI_PROMPTS_LOG.md`

---

## 6. Live Interactive Demo Script (Examiner Walkthrough)

1. **Login & Session Lockout Demo (BR5):**
   - Click "C101" quick-fill button, enter incorrect PIN `0000` three times.
   - Observe HTTP 423 `SESSION_LOCKED` message: *"Session is locked due to 3 consecutive invalid PIN attempts."*
   - Refresh or select C101 and enter valid PIN `1234` to log in successfully.
2. **Account Balance Display (FR2):**
   - Confirm available balance is **₹25,000** for account `A101`.
3. **Boundary & Eligibility Rejection Demo (BR1 & BR2):**
   - In "New Transfer", pick inactive account `A103`, enter `500`. Click Proceed.
   - Error displayed: *"Beneficiary account is inactive."* Balance remains untouched at ₹25,000.
4. **Service Charge Calculation Review (BR4):**
   - Enter beneficiary `A102` and amount `500`. Click Proceed.
   - Observe service charge calculated as **₹10** (amount < ₹1000 threshold), total debit **₹510**.
5. **Authorisation & Atomic Commit (BR5, BR7):**
   - Click Proceed to Authorise, input PIN `1234`. Click Authorise.
   - Click Execute Transfer Now.
   - Success receipt displayed with unique reference (e.g. `TXN-YYYYMMDD-XXXXXX`).
   - Account balance automatically debited by ₹510 to **₹24,490**.
6. **Transaction Detail & Audit Trail (BR3, BR6):**
   - Click "Details" in My Transfer History.
   - Inspect immutable snapshot (saved amount, snapshot name, charge rule snapshot) and sequential lifecycle events.
7. **Reversal Once-Only Demo (BR9):**
   - Click "Reverse" button on the completed transfer.
   - Status changes to `REVERSED`. Account balance is instantly restored to **₹25,000**.
   - Attempting to reverse again triggers HTTP 409 `INVALID_STATUS_ACTION`.
8. **Admin Supervision & Transition Matrix Protection (BR8, BR10):**
   - Click Logout, log in as `ADMIN01` with PIN `9999`.
   - Inspect system-wide transactions and non-repudiable audit logs.
   - Try to force an invalid status transition (e.g. `INITIATED` -> `SUCCESS`).
   - Observe HTTP 409 rejection: *"Invalid status action: cannot transition from INITIATED to SUCCESS."*

---

## 7. System Limitations & Future Extensions
- **Single-Node SQLite:** Optimized for atomic local ledger operations; clustered deployments would employ PostgreSQL with connection pooling.
- **In-Memory Lockout Counter:** Failed PIN counters are stored in process memory; distributed environments would use Redis.
- **Future Extensions:** Real-time NPCI UPI gateway integrations, Multi-Factor Authentication (TOTP 2FA), automated AML (Anti-Money Laundering) fraud detection, and multi-currency foreign exchange.

---

## 8. Git Commit Reference
- Current HEAD Commit: `bb62fd0` (inspect via `git rev-parse --short HEAD`).
