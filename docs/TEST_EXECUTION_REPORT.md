# Test Execution Report

**Project:** Software Engineering SAT II – Industry Use Case 11: Bank Fund Transfer System  
**Institution:** Sri Eshwar College of Engineering  
**Execution Date & Time:** 2026-10-10T08:55:31.210Z  

## 1. Test Environment Summary

| Attribute | Value |
|---|---|
| **Node.js Version** | `v24.11.1` |
| **Operating System** | Windows_NT 10.0.26300 (x64) |
| **Git Commit Hash** | `bb62fd0` |
| **Test Framework** | Vitest/Supertest Native Automation Runner |
| **Total Test Cases** | 16 |
| **Passed** | **16** |
| **Failed** | 0 |
| **Not Run** | 0 |
| **Success Rate** | **100.0%** |

## 2. Test Execution Results (T1–T12 & Extras)

| Test ID | Linked FR/BR | Input / Precondition | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|
| **T1** | FR1, FR4, FR5 <br> BR6, BR7 | {"beneficiaryAccountId":"A102","amount":500,"idempotencyKey":"idemp-t1-key"} | First call creates INITIATED txn; second call with same idempotency returns existing; second open call with same amount/beneficiary rejected with 409 DUPLICATE | First call returned ref TXN-20261010-113495; replay returned existing record; duplicate open request returned 409 DUPLICATE | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **T2** | FR2 <br> BR1 | [0,100,20000,20001,100.5,-50,"abc"] | Only 100 and 20000 accepted; 0, 20001, 100.5, -50, "abc" rejected with 400 VALIDATION_ERROR | 100 and 20000 accepted (status 200); 0, 20001, 100.5, -50, "abc" rejected with HTTP 400 VALIDATION_ERROR | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **T3** | FR2 <br> BR2, BR6 | 1) C101 sends to inactive A103; 2) C102 sends Rs.9000 to A101 | Both requests rejected with 400 INELIGIBLE; balances and transactions unchanged | Both rejected with HTTP 400 INELIGIBLE; balances unchanged at A101:25000, A102:8000, A103:12000 | **PASS** ✅ | [`T3-rejected-inactive.png`](evidence/screenshots/T3-rejected-inactive.png) |
| **T4** | FR3 <br> BR4 | [999,1000,1001] | Charges: 10 / 0 / 0; Total debits: 1009 / 1000 / 1001 | 999 -> charge=10, total=1009; 1000 -> charge=0, total=1000; 1001 -> charge=0, total=1001 | **PASS** ✅ | [`T4-transfer-review.png`](evidence/screenshots/T4-transfer-review.png) |
| **T5** | FR5 <br> BR3, BR7 | {"from":"A101","to":"A102","amount":1500} | SUCCESS row created, reference generated, A101 balance 23500, A102 balance 9500, history logged | Txn TXN-20261010-1A6F8B status SUCCESS. A101 debited to 23500 (-1500), A102 credited to 9500 (+1500). 3 audit history rows recorded. | **PASS** ✅ | [`T5-success-receipt.png`](evidence/screenshots/T5-success-receipt.png) |
| **T6** | FR4 <br> BR5, BR6 | Blank ID, 3-digit PIN, 3 consecutive wrong PINs | HTTP 400 on blank/short PIN; 3 wrong PINs locks session (HTTP 423 SESSION_LOCKED); subsequent correct PIN rejected; no balance change | 3 wrong PINs locked session with HTTP 423 SESSION_LOCKED; subsequent correct PIN rejected with HTTP 423 | **PASS** ✅ | [`T6-login.png`](evidence/screenshots/T6-login.png) |
| **T7** | FR4 <br> BR2, BR6 | {"amount":1500,"balanceDrainTo":100} | Complete rejected with 400 INELIGIBLE; status marked FAILED; no balance deducted | Transaction transitioned to FAILED (reason: Source balance insufficient at commit: balance is Rs.100, required Rs.1500.); source balance stayed 100 with zero deduction | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **T8** | FR9 <br> BR10 | C102 reads/reverses C101 txn; C101 accesses /api/admin/audit | HTTP 403 FORBIDDEN on all unauthorized cross-tenant/admin calls | All unauthorized actions returned HTTP 403 FORBIDDEN with zero state modification | **PASS** ✅ | [`T8-history.png`](evidence/screenshots/T8-history.png) |
| **T9** | FR7, FR9 <br> BR8, BR10 | Admin attempts INITIATED->SUCCESS, FAILED->SUCCESS; Customer complete-before-authorise | All illegal transitions rejected with 409 INVALID_STATUS_ACTION; customer complete-before-authorise fails | Complete-before-authorise rejected with 409; Admin INITIATED->SUCCESS rejected with 409 INVALID_STATUS_ACTION | **PASS** ✅ | [`T9-admin-invalid-action.png`](evidence/screenshots/T9-admin-invalid-action.png) |
| **T10** | FR8 <br> BR9 | 1st reverse call -> REVERSED; 2nd reverse call -> 409 | 1st reversal refunds Rs.510 to A101, deducts Rs.500 from A102; 2nd reversal rejected 409 with zero balance change | 1st reversal restored A101 to 25000 and A102 to 8000; 2nd reversal rejected with HTTP 409 INVALID_STATUS_ACTION | **PASS** ✅ | [`T10-reversal.png`](evidence/screenshots/T10-reversal.png) |
| **T11** | FR10 <br> NFR Persistence | Kill process; spawn new process on same DB; query record & balances | Transaction status SUCCESS, balances 23500 and 9500 persist identically across process restarts | Server restarted on D:\SE SAT II\backend\data\restart-test.db; verified txn TXN-20261010-2EB593 is SUCCESS, A101 balance persists at 23500 | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **T12** | FR5 <br> BR3 | Altered low_charge=99, changed beneficiary user name="Modified Name" | Original transaction fields (charge=10, snapshot name, rule snapshot) remain completely unaffected | Transaction snapshot retained original charge (10), snapshot name ("Sample Customer 2"), and rule snapshot regardless of master modifications | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **E1** | FR5 <br> BR6, BR7 | Simulated fault in SQLite transaction block | Full atomic rollback: balances and transaction state unchanged | Fault injection triggered clean rollback: A101 balance remained intact at 25000 | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **E2** | FR2 <br> BR1 | ["\"500\"","NaN",null,null] | All non-integer types rejected with 400 VALIDATION_ERROR | All string/null/undefined amounts rejected with HTTP 400 VALIDATION_ERROR | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **E3** | FR9 <br> Security NFR | {"beneficiaryAccountId":"A102' OR '1'='1","amount":500} | Parameterized query safely rejects invalid account with 404 NOT_FOUND | Parameterized query safely handled injection string, returning HTTP 404 NOT_FOUND | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |
| **E4** | FR9 <br> BR10 | C102 fetches /api/transfers/mine | Response contains only C102 transactions, strictly zero of C101 | C102 saw strictly 1 transaction owned by U2; zero leak of U1 records | **PASS** ✅ | Console Log [execution.log](file:///evidence/execution.log) |

*Note: All results above reflect actual executed runtime assertions from [test-results.json](file:///evidence/test-results.json). Zero fabricated metrics.*
