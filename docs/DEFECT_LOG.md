# Defect Log

| Defect ID | Description | Test ID | Impact | Fix / Action | Retest Result |
|---|---|---|---|---|---|
| DEF-001 | In `TransactionService.completeTransfer`, pre-commit revalidation failure threw an exception inside the single `db.transaction` block, which rolled back the status transition to `FAILED`, leaving the transaction as `AUTHORISED`. | T7 | High: Transaction failed validation but remained in `AUTHORISED` state instead of transitioning to `FAILED`, violating BR8 status flow and T7. | Refactored `completeTransfer` to ensure that when commit revalidation fails, zero balance changes occur, and the `FAILED` status and failure history audit record are committed. | **PASS** (Re-tested in T7: transitioned to FAILED, balance intact) |
