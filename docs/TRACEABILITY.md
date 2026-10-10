# Requirements Traceability Matrix (RTM)

| Requirement ID | Requirement Description | UML Element | Implementation File / Endpoint | Verified By Test ID |
|---|---|---|---|---|
| **FR1** | Transfer Initiation & Idempotency | Use Case: Initiate Transfer | `POST /api/transfers/initiate` <br> `TransactionService.initiateTransfer` | T1 |
| **FR2** | Transfer Validation (Amount & Eligibility) | Use Case: Validate Amount & Eligibility | `TransactionService.validateAmount` <br> `AccountRepository.findById` | T2, T3 |
| **FR3** | Dynamic Service Charge Calculation | Use Case: View Charge/Total | `TransactionService.calculateCharge` <br> `ServiceConfigRepository.getAll` | T4 |
| **FR4** | Customer PIN Authorisation & Lockout | Use Case: Authorise (PIN) | `POST /api/transfers/:ref/authorise` <br> `AuthenticationService.verifyPinForAuthorise` | T6, T7 |
| **FR5** | Atomic Transfer Execution & Ledger Commit | Use Case: Complete Transaction | `POST /api/transfers/:ref/complete` <br> `TransactionService.completeTransfer` | T5, T12, E1 |
| **FR6** | Transaction Detail & History Retrieval | Use Case: View Own History/Details | `GET /api/transfers/:ref` <br> `TransactionService.getTransactionDetails` | T5, T8, E4 |
| **FR7** | System-Wide Admin Supervision | Use Case: View All Transactions | `GET /api/admin/transactions` <br> `TransactionService.getAllTransactions` | T9 |
| **FR8** | Transaction Reversal & Restoration | Use Case: Reverse Eligible Transaction | `POST /api/transfers/:ref/reverse` <br> `TransactionService.reverseTransfer` | T10 |
| **FR9** | Role-Based Access Control & Error Codes | Use Case: Login & Security Guards | `authMiddleware` <br> `POST /api/auth/login` | T6, T8, T9, E3 |
| **FR10** | Persistent Database & Snapshot Storage | Class Diagram: Entity Layer | `backend/src/db/connection.js` <br> `backend/data/bank.db` | T11, T12 |
| **BR1** | Whole Rupees [100, 20000] | `validateAmount` | `TransactionService.js:validateAmount` | T2, E2 |
| **BR2** | Account Eligibility (Active + Sufficient Balance) | `initiateTransfer`, `completeTransfer` | `TransactionService.js:initiateTransfer` | T3, T7 |
| **BR3** | Master Data Snapshot Immutability | Entity: Transaction | `TransactionRepository.create` | T5, T12 |
| **BR4** | Charge Rule (<1000: Rs.10, >=1000: Rs.0) | `calculateCharge` | `TransactionService.js:calculateCharge` | T4 |
| **BR5** | 3-PIN Attempt Lockout (HTTP 423) | `AuthenticationService` | `AuthenticationService.js:login` | T6 |
| **BR6** | All-or-Nothing Atomicity on Rejection | `executeTransaction` | `TransactionService.js:completeTransfer` | T3, T6, T7, E1 |
| **BR7** | Atomic Balance Debit & Credit on Success | `completeTransfer` | `TransactionService.js:completeTransfer` | T5, E1 |
| **BR8** | Status Transition Matrix Enforcement | `validateStatusTransition` | `TransactionService.js:validateStatusTransition` | T9 |
| **BR9** | Once-Only Reversal & Balance Restoration | `reverseTransfer` | `TransactionService.js:reverseTransfer` | T10 |
| **BR10** | Tenant Data Isolation & Administrator Gates | `authMiddleware` | `auth.js` & `TransactionService.js` | T8, T9, E4 |
| **NFR-P** | Persistence across Process Restarts | Database Connection Manager | SQLite `backend/data/bank.db` | T11 |
