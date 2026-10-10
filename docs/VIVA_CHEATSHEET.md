# Software Engineering SAT II – Viva Cheatsheet
**System:** Bank Fund Transfer System (Industry Use Case 11)  
**Institution:** Sri Eshwar College of Engineering  

---

## 1. Quick Traceability for FR5 (Atomic Transfer Execution)
- **UML Element:** 
  - Use Case: *Complete Transaction (Atomic Commit)*
  - Class Diagram: `TransactionService.completeTransfer` & `TransactionRepository.executeTransaction`
- **Code File & Function:** 
  - [`backend/src/services/TransactionService.js`](file:///backend/src/services/TransactionService.js) -> `completeTransfer(user, reference)`
  - [`backend/src/repositories/TransactionRepository.js`](file:///backend/src/repositories/TransactionRepository.js) -> `executeTransaction(fn)`
  - [`backend/src/routes/transferRoutes.js`](file:///backend/src/routes/transferRoutes.js) -> `POST /api/transfers/:ref/complete`
- **Automated Verification Test ID:** **T5** (and fault-injection **E1**)

---

## 2. Where Each Business Rule (BR1–BR10) is Enforced in Code

| Rule ID | Rule Summary | Enforcing Code Location | Function / Method |
|---|---|---|---|
| **BR1** | Amount: Integer Rs.100–Rs.20,000 | `backend/src/services/TransactionService.js` | `validateAmount(amount)` |
| **BR2** | Account Eligibility (Active + Balance ≥ Total) | `backend/src/services/TransactionService.js` | `initiateTransfer` & re-check in `completeTransfer` |
| **BR3** | Master Data Snapshot Immutability | `backend/src/services/TransactionService.js` | `initiateTransfer` (saves snapshot in `transactions` row) |
| **BR4** | Service Charge (<1000: Rs.10, ≥1000: Rs.0) | `backend/src/services/TransactionService.js` | `calculateCharge(amount)` reading `service_config` |
| **BR5** | Authentication: 3 Failed PIN Lockout (423) | `backend/src/services/AuthenticationService.js` | `login` & `verifyPinForAuthorise` |
| **BR6** | Rejection Atomicity (No balance change on fail) | `backend/src/services/TransactionService.js` | `completeTransfer` (status FAILED, balance untouched) |
| **BR7** | Atomic Debit/Credit & History Logging | `backend/src/services/TransactionService.js` | `completeTransfer` (inside `executeTransaction`) |
| **BR8** | Status Transition Matrix (`INITIATED`→`AUTHORISED`→`SUCCESS`) | `backend/src/services/TransactionService.js` | `validateStatusTransition` & `ALLOWED_TRANSITIONS` |
| **BR9** | Once-Only Reversal & Balance Restoration | `backend/src/services/TransactionService.js` | `reverseTransfer` (via atomic `updateStatusIfCurrent`) |
| **BR10** | Tenant Isolation & Administrator Gates | `backend/src/middleware/auth.js` | `authenticate` & `requireAdmin` |

---

## 3. How Atomicity is Implemented
- Handled via `better-sqlite3`'s native transaction executor: `db.transaction(fn)()`.
- Executes inside an `IMMEDIATE` transaction in SQLite with write-ahead logging (`PRAGMA journal_mode = WAL`).
- In `completeTransfer`:
  1. Re-verifies source balance and beneficiary status immediately prior to ledger mutation.
  2. Executes debit (`accountRepo.decrementBalance`), credit (`accountRepo.incrementBalance`), status update (`txnRepo.updateStatus('SUCCESS')`), and history recording (`historyRepo.create`) in one atomic block.
  3. If any uncaught error or database constraint occurs, SQLite triggers an automatic `ROLLBACK`, guaranteeing that zero partial updates or balance discrepancies can occur.

---

## 4. How Once-Only Reversal is Guaranteed (BR9)
1. Central Transition Matrix Check: `validateStatusTransition` permits `REVERSED` status only from `SUCCESS`.
2. Atomic Conditional SQL Update:
   ```sql
   UPDATE transactions
   SET status = 'REVERSED', updated_at = ?
   WHERE reference = ? AND status = 'SUCCESS'
   ```
3. If a duplicate reversal request arrives, `changes === 0` because status is already `REVERSED`. The service immediately halts and returns HTTP 409 `INVALID_STATUS_ACTION`, modifying zero balances.

---

## 5. Genuine AI Suggestion Reviewed and Corrected (DEF-001)
- **The Issue:** The initial AI draft of `TransactionService.completeTransfer` placed the pre-commit revalidation failure inside the single `db.transaction` block:
  ```js
  if (failureReason) {
    this.txnRepo.updateStatus(reference, 'FAILED', failureReason);
    throw error;
  }
  ```
- **Review Finding During T7 Execution:** Throwing the error inside the SQLite transaction caused SQLite to roll back the entire transaction block, reverting the status back to `AUTHORISED` instead of leaving it recorded as `FAILED`.
- **Engineering Correction:** Refactored `completeTransfer` so pre-commit revalidation checks are evaluated before entering the balance mutation transaction. If revalidation fails, zero balance adjustments are made, and the `FAILED` state and failure audit row are committed cleanly. Re-test T7 passed 100%.
