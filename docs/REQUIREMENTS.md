# Software Engineering SAT II – Requirements Specification

## Project: Bank Fund Transfer System (Industry Use Case 11)
**Institution:** Sri Eshwar College of Engineering  
**Academic Year:** 2025–2026

---

## 1. Problem Summary
Modern banking solutions require robust, fault-tolerant, and atomic fund transfer processing. In concurrent banking environments, partial ledger updates, double debits, race conditions, or unvalidated state mutations directly compromise financial integrity. The **Bank Fund Transfer System** implements a strict three-layer architecture with ACID-compliant SQLite transactions, immutable master-data snapshots, centralized state flow transitions, and defense-in-depth security to guarantee error-free fund transfers between customer accounts.

---

## 2. System Actors
1. **Customer (User):** An authenticated individual account holder eligible to initiate fund transfers, review charges, authorise transfers using a 4-digit PIN, execute transfers, inspect their own transaction lifecycle history, and request reversals for eligible transactions.
2. **Administrator:** A privileged supervisor authorized to inspect system-wide transactions, examine complete non-repudiable audit logs, and execute permitted administrative actions (such as initiating or authorizing valid reversals).

---

## 3. Functional Requirements (FR1 – FR10)

- **FR1 (Initiate Transfer):** The system shall allow an authenticated customer to initiate a fund transfer request by supplying beneficiary account ID, transfer amount, and an idempotency key.
- **FR2 (Validate Transfer Eligibility):** The system shall validate transfer rules (amount constraints, source account active status, beneficiary account active status, and source balance sufficiency) before advancing a transfer.
- **FR3 (Service Charge Calculation):** The system shall calculate dynamic service charges based on system configuration thresholds and present the charge and total debit to the user for review.
- **FR4 (Transfer Authorisation):** The system shall require the customer to authorise the transfer by supplying their 4-digit PIN. The system shall enforce a maximum limit of 3 consecutive invalid attempts per session before locking further attempts.
- **FR5 (Atomic Transfer Execution):** The system shall atomically debit the source account, credit the beneficiary account, record immutable transaction snapshot details, update the status to `SUCCESS`, and generate an audit history record in a single atomic transaction.
- **FR6 (Transaction Lifecycle Tracking):** The system shall track and log every transaction status transition (`INITIATED`, `AUTHORISED`, `SUCCESS`, `FAILED`, `REVERSED`) along with timestamp, actor, and contextual notes.
- **FR7 (Administrative Supervision):** The system shall provide administrators with a complete view of all system-wide transactions and full audit trails.
- **FR8 (Transaction Reversal):** The system shall permit the owner or an administrator to reverse a `SUCCESS` transaction exactly once, returning debited funds to the source and deducting the amount from the beneficiary, provided the beneficiary possesses sufficient balance.
- **FR9 (Role & Ownership Access Control):** The system shall restrict customers to accessing only their own records and restrict administrative actions to administrators, returning clear error codes and messages upon unauthorized attempts.
- **FR10 (Persistent Ledger Storage):** The system shall store all accounts, users, transactions, snapshots, and audit records in persistent storage that survives application and server restarts.

---

## 4. Non-Functional Requirements (NFRs)

- **NFR-Reliability (Atomicity):** No partial state or balance updates may ever occur. If any step fails during authorization or commit, balances remain untouched.
- **NFR-Persistence:** All data persists across server restarts in a durable, foreign-key-enforced SQLite database file.
- **NFR-Maintainability (3-Layer Separation):**
  - **Presentation Layer:** React UI and Express HTTP controllers/routers (free of core banking logic).
  - **Business Layer:** `AuthenticationService.js` and `TransactionService.js` (housing all domain rules).
  - **Data Access Layer:** `repositories/*.js` (housing all database SQL queries).
- **NFR-Usability:** Clear, descriptive error messages with standardized error codes (`VALIDATION_ERROR`, `INELIGIBLE`, `AUTH_FAILED`, `SESSION_LOCKED`, `FORBIDDEN`, `INVALID_STATUS_ACTION`, `DUPLICATE`, `NOT_FOUND`).
- **NFR-Security:** Passwords and PINs are stored exclusively as salted bcrypt hashes. Strict tenant isolation prevents cross-customer data leakage. Parameterized queries prevent SQL injection.

---

## 5. Business Rules (BR1 – BR10)

- **BR1 (Amount Constraints):** Whole integer rupees only, from Rs.100 to Rs.20,000 inclusive. Rejects 0, negatives, decimals, strings, and values exceeding Rs.20,000.
- **BR2 (Account Eligibility):** Source and beneficiary accounts must be Active. Source balance must be greater than or equal to total debit. Re-checked immediately before commit within the database transaction.
- **BR3 (Master Data Snapshot):** Authorised amount, reference, charge, total debit, beneficiary account ID, beneficiary name, and charge rules must be copied into the transaction record snapshot so future master-data modifications never distort historical records.
- **BR4 (Dynamic Service Charge):** Sourced from `service_config`: Rs.10 if amount < 1000; Rs.0 if amount >= 1000. Total debit = amount + charge.
- **BR5 (Authentication & PIN Lockout):** Customer ID cannot be blank. PIN must be exactly 4 digits. Three consecutive invalid attempts lock the session with HTTP 423. A successful PIN resets the counter. Applies to login and transfer authorization.
- **BR6 (All-or-Nothing Rejection Atomicity):** If any validation or authorization fails, no `SUCCESS` record is created and no balances are modified.
- **BR7 (Atomic Ledger Commit):** On valid commit, one `SUCCESS` transaction, source debit by total debit, beneficiary credit by amount, and audit history row are committed together in one database transaction.
- **BR8 (Status State Flow):** Customer flow is strictly `INITIATED` -> `AUTHORISED` -> `SUCCESS`. Pre-commit failures transition to `FAILED`. `SUCCESS` may transition to `REVERSED`. All invalid transitions are rejected with HTTP 409 `INVALID_STATUS_ACTION`.
- **BR9 (Once-Only Reversal):** Allowed only for `SUCCESS` transactions. Restores source balance by total debit and deducts amount from beneficiary (if sufficient). Enforced via atomic database update (`UPDATE ... WHERE status='SUCCESS'`). Repeated reversal returns HTTP 409.
- **BR10 (Access Isolation):** Customers access only their own transactions (HTTP 403 otherwise). Only administrators access audit trails and admin status actions (HTTP 403 otherwise).

---

## 6. Assumptions & Scope
- **Currency:** Single currency system (Indian Rupees, INR), stored as whole integers.
- **Scope:** Academic demonstration with synthetic demo users and accounts. Real payment gateways, third-party SMS/banking networks, external analytics, and production OAuth2/OpenID providers are out-of-scope and cataloged as future extensions.
