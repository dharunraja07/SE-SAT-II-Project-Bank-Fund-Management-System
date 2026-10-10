# AI Prompts & Interaction Log

## Representative Prompt 1: Project Build Specification

**Role:** Senior Software Engineer  
**Task:** Build a COMPLETE, WORKING academic project for "Software Engineering SAT II – Industry Use Case 11: Bank Fund Transfer System" (Sri Eshwar College of Engineering) in phases.  
**Constraints:** 3-layer architecture, SQLite atomicity, BR1–BR10 exact rules, automated test suite T1–T12 without fabricated metrics, Playwright screenshots, reports.  
**Outcome / Evaluation:** Accepted. Fully implemented with exact schema, repositories, services, tests, UI, and reports.

## Representative Prompt 2: Defect Remediation (DEF-001)

**Context:** Automated test T7 failed: `completeTransfer` did not persist `FAILED` status when pre-commit revalidation failed because the error threw inside the transaction block and rolled back the status update.  
**Prompt / Correction Applied:** Refactor `completeTransfer` to perform pre-commit revalidation before entering the balance mutation transaction. If revalidation fails, zero balance adjustments occur, while the `FAILED` status and audit log are committed.  
**Outcome / Evaluation:** Accepted & Verified. Re-test T7 passed cleanly, with 16/16 test suite success rate.

## Student Lab Custom Prompts
`<<STUDENT TO FILL: Additional prompts used during lab session>>`
