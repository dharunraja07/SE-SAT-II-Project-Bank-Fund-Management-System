# AI-Assisted Testing & Verification Report

**Institution:** Sri Eshwar College of Engineering  
**Course / Assessment:** Software Engineering SAT II – Industry Use Case 11  
**System:** Bank Fund Transfer System  

## 1. Testing Summary

- **Total Automated Cases:** 16
- **Passed:** 16
- **Failed:** 0
- **Not Run:** 0
- **Pass Rate:** 100.0%

## 2. AI-Assisted Analysis & Genuine Correction

| Field | Details |
|---|---|
| **AI Assistant / Model** | Antigravity AI (DeepMind Gemini 3.8 Flash) |
| **Representative Prompt** | *"Build the entire project in phases with exact business rules BR1–BR10, atomic SQLite transactions, and execute tests T1–T12 without fabricated results."* |
| **AI Initial Code Suggestion** | In `TransactionService.completeTransfer`, pre-commit revalidation failure threw an exception inside the single `db.transaction` block: `if (failureReason) { txnRepo.updateStatus('FAILED'); throw error; }`. |
| **Engineering Review & Defect Identification** | During runtime execution of **T7** (*Pre-Commit Failure Injection*), throwing an error inside the `better-sqlite3` transaction rolled back ALL operations within that block—including the `FAILED` status update! Consequently, the transaction was left in `AUTHORISED` rather than `FAILED`, failing assertion T7. |
| **Correction & Verification** | Refactored `completeTransfer` to perform pre-commit revalidation before entering the balance mutation transaction. If revalidation fails, zero balance adjustments occur, while the `FAILED` status and audit log are committed. Re-test passed 100%. |
| **Student Prompt Entry** | `<<STUDENT TO FILL: Your prompt/correction during lab viva>>` |
| **Student Review Notes** | `<<STUDENT TO FILL: Your observations on test execution>>` |

## 3. Defect Analysis

# Defect Log

| Defect ID | Description | Test ID | Impact | Fix / Action | Retest Result |
|---|---|---|---|---|---|
| DEF-001 | In `TransactionService.completeTransfer`, pre-commit revalidation failure threw an exception inside the single `db.transaction` block, which rolled back the status transition to `FAILED`, leaving the transaction as `AUTHORISED`. | T7 | High: Transaction failed validation but remained in `AUTHORISED` state instead of transitioning to `FAILED`, violating BR8 status flow and T7. | Refactored `completeTransfer` to ensure that when commit revalidation fails, zero balance changes occur, and the `FAILED` status and failure history audit record are committed. | **PASS** (Re-tested in T7: transitioned to FAILED, balance intact) |


## 4. System Limitations

1. **Single-Node SQLite Architecture:** Uses embedded SQLite with file locking. Does not support horizontal multi-node distributed write clustering.
2. **In-Memory Session Lockout:** Consecutive failed PIN attempt tracking is stored in process memory; in a clustered deployment, a distributed store (e.g. Redis) would be required.
3. **Single Currency Model:** Stored strictly in integer Indian Rupees (INR); multi-currency foreign exchange is not supported.
4. **Synthetic Authentication:** Role-based access control uses demonstration PIN hashes without production multi-factor (MFA/OTP) authentication.
5. **No External Payment Gateway:** Transfers are executed as ledger movements within the core banking system; external NEFT/RTGS/UPI gateways are simulated as internal clearing.

## 5. Future Extensions

- Multi-factor authentication (SMS/TOTP 2FA) for transfer authorization.
- NPCI UPI and IMPS payment gateway integrations.
- Distributed high-availability database cluster (PostgreSQL with read-replicas).
- Automated suspicious transaction alerting and AML (Anti-Money Laundering) fraud detection.
- Real-time customer push notifications and webhook events.
