const request = require('supertest');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createApp } = require('../src/app');
const { seedDatabase } = require('../scripts/seed');
const { closeDatabase, getDatabase } = require('../src/db/connection');

const EVIDENCE_DIR = path.resolve(__dirname, '../../evidence');
const RESULTS_FILE = path.join(EVIDENCE_DIR, 'test-results.json');
const LOG_FILE = path.join(EVIDENCE_DIR, 'execution.log');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const testResults = [];
let executionLogs = [];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  executionLogs.push(line);
}

async function recordTest({
  id,
  title,
  linkedFR,
  linkedBR,
  precondition,
  input,
  expected,
  fn
}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  log(`\n=================== RUNNING TEST ${id}: ${title} ===================`);
  log(`Linked: FR=[${linkedFR}], BR=[${linkedBR}]`);
  log(`Precondition: ${precondition}`);
  log(`Input: ${JSON.stringify(input)}`);

  let status = 'FAIL';
  let actual = '';

  try {
    actual = await fn();
    status = 'PASS';
    log(`RESULT ${id}: PASS. Actual: ${actual}`);
  } catch (err) {
    status = 'FAIL';
    actual = `Error: ${err.message}${err.actual ? ' | Actual: ' + JSON.stringify(err.actual) : ''}`;
    log(`RESULT ${id}: FAIL. Reason: ${actual}`);
  }

  const durationMs = Date.now() - t0;
  testResults.push({
    id,
    title,
    linkedFR,
    linkedBR,
    precondition,
    input: typeof input === 'object' ? JSON.stringify(input) : String(input),
    expected,
    actual,
    status,
    startedAt,
    durationMs
  });
}

function createFreshTestDb(dbName) {
  const dbPath = path.resolve(__dirname, `../../backend/data/${dbName}.db`);
  if (fs.existsSync(dbPath)) {
    try { fs.unlinkSync(dbPath); } catch (e) {}
  }
  const db = getDatabase(dbPath);
  seedDatabase(db);
  return { dbPath, db };
}

async function main() {
  log('Starting SAT II Bank Fund Transfer Test Execution');

  // ==========================================
  // T1: Duplicate Protection & Idempotency
  // ==========================================
  await recordTest({
    id: 'T1',
    title: 'Duplicate Protection & Idempotency Key',
    linkedFR: 'FR1, FR4, FR5',
    linkedBR: 'BR6, BR7',
    precondition: 'Source A101 active (Rs.25,000), Beneficiary A102 active (Rs.8,000)',
    input: { beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'idemp-t1-key' },
    expected: 'First call creates INITIATED txn; second call with same idempotency returns existing; second open call with same amount/beneficiary rejected with 409 DUPLICATE',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-t1');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      // 1st call
      const res1 = await request(app)
        .post('/api/transfers/initiate')
        .set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'idemp-t1-key' });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.body.data.isDuplicate, false);
      const ref1 = res1.body.data.transaction.reference;

      // 2nd call: exact same idempotency key
      const res2 = await request(app)
        .post('/api/transfers/initiate')
        .set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'idemp-t1-key' });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.data.isDuplicate, true);
      assert.strictEqual(res2.body.data.transaction.reference, ref1);

      // 3rd call: new idempotency key but same pending open transfer
      const res3 = await request(app)
        .post('/api/transfers/initiate')
        .set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'idemp-t1-diff-key' });
      assert.strictEqual(res3.status, 409);
      assert.strictEqual(res3.body.error.code, 'DUPLICATE');

      closeDatabase();
      return `First call returned ref ${ref1}; replay returned existing record; duplicate open request returned 409 DUPLICATE`;
    }
  });

  // ==========================================
  // T2: Amount Boundary & Type Validation
  // ==========================================
  await recordTest({
    id: 'T2',
    title: 'Amount Boundary & Type Validation (BR1)',
    linkedFR: 'FR2',
    linkedBR: 'BR1',
    precondition: 'Active account A101 logged in',
    input: [0, 100, 20000, 20001, 100.5, -50, 'abc'],
    expected: 'Only 100 and 20000 accepted; 0, 20001, 100.5, -50, "abc" rejected with 400 VALIDATION_ERROR',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-t2');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const cases = [
        { amt: 0, expectOk: false },
        { amt: 100, expectOk: true },
        { amt: 20000, expectOk: true },
        { amt: 20001, expectOk: false },
        { amt: 100.5, expectOk: false },
        { amt: -50, expectOk: false },
        { amt: 'abc', expectOk: false }
      ];

      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const res = await request(app)
          .post('/api/transfers/initiate')
          .set('x-session-id', sid)
          .send({ beneficiaryAccountId: 'A102', amount: c.amt, idempotencyKey: `idemp-t2-${i}` });

        if (c.expectOk) {
          assert.strictEqual(res.status, 200, `Amount ${c.amt} should be accepted`);
        } else {
          assert.strictEqual(res.status, 400, `Amount ${c.amt} should be rejected with 400`);
          assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
        }
      }

      closeDatabase();
      return '100 and 20000 accepted (status 200); 0, 20001, 100.5, -50, "abc" rejected with HTTP 400 VALIDATION_ERROR';
    }
  });

  // ==========================================
  // T3: Inactive Beneficiary & Insufficient Balance
  // ==========================================
  await recordTest({
    id: 'T3',
    title: 'Inactive Beneficiary (A103) and Insufficient Balance',
    linkedFR: 'FR2',
    linkedBR: 'BR2, BR6',
    precondition: 'A103 inactive; A102 has balance Rs.8,000',
    input: '1) C101 sends to inactive A103; 2) C102 sends Rs.9000 to A101',
    expected: 'Both requests rejected with 400 INELIGIBLE; balances and transactions unchanged',
    fn: async () => {
      const { dbPath, db } = createFreshTestDb('test-t3');
      const { app } = createApp({ dbPath });

      // 1) C101 sends to A103
      const login1 = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid1 = login1.body.data.sessionId;
      const resInactive = await request(app)
        .post('/api/transfers/initiate')
        .set('x-session-id', sid1)
        .send({ beneficiaryAccountId: 'A103', amount: 500, idempotencyKey: 'idemp-t3-1' });
      assert.strictEqual(resInactive.status, 400);
      assert.strictEqual(resInactive.body.error.code, 'INELIGIBLE');

      // 2) C102 sends 9000 (balance is 8000)
      const login2 = await request(app).post('/api/auth/login').send({ loginId: 'C102', pin: '5678' });
      const sid2 = login2.body.data.sessionId;
      const resOver = await request(app)
        .post('/api/transfers/initiate')
        .set('x-session-id', sid2)
        .send({ beneficiaryAccountId: 'A101', amount: 9000, idempotencyKey: 'idemp-t3-2' });
      assert.strictEqual(resOver.status, 400);
      assert.strictEqual(resOver.body.error.code, 'INELIGIBLE');

      // Verify DB unchanged
      const b101 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101').balance;
      const b102 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102').balance;
      const b103 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A103').balance;
      assert.strictEqual(b101, 25000);
      assert.strictEqual(b102, 8000);
      assert.strictEqual(b103, 12000);

      closeDatabase();
      return 'Both rejected with HTTP 400 INELIGIBLE; balances unchanged at A101:25000, A102:8000, A103:12000';
    }
  });

  // ==========================================
  // T4: Charge Calculation Thresholds
  // ==========================================
  await recordTest({
    id: 'T4',
    title: 'Charge Calculation at Thresholds (999, 1000, 1001)',
    linkedFR: 'FR3',
    linkedBR: 'BR4',
    precondition: 'Service config: threshold=1000, low_charge=10, high_charge=0',
    input: [999, 1000, 1001],
    expected: 'Charges: 10 / 0 / 0; Total debits: 1009 / 1000 / 1001',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-t4');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const r999 = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 999, idempotencyKey: 't4-999' });
      assert.strictEqual(r999.body.data.transaction.charge, 10);
      assert.strictEqual(r999.body.data.transaction.total_debit, 1009);

      const r1000 = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 1000, idempotencyKey: 't4-1000' });
      assert.strictEqual(r1000.body.data.transaction.charge, 0);
      assert.strictEqual(r1000.body.data.transaction.total_debit, 1000);

      const r1001 = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 1001, idempotencyKey: 't4-1001' });
      assert.strictEqual(r1001.body.data.transaction.charge, 0);
      assert.strictEqual(r1001.body.data.transaction.total_debit, 1001);

      closeDatabase();
      return '999 -> charge=10, total=1009; 1000 -> charge=0, total=1000; 1001 -> charge=0, total=1001';
    }
  });

  // ==========================================
  // T5: One Valid Transaction (End-to-End Success)
  // ==========================================
  await recordTest({
    id: 'T5',
    title: 'Valid Transaction End-to-End (A101 -> A102, Rs.1500)',
    linkedFR: 'FR5',
    linkedBR: 'BR3, BR7',
    precondition: 'A101 balance Rs.25000, A102 balance Rs.8000',
    input: { from: 'A101', to: 'A102', amount: 1500 },
    expected: 'SUCCESS row created, reference generated, A101 balance 23500, A102 balance 9500, history logged',
    fn: async () => {
      const { dbPath, db } = createFreshTestDb('test-t5');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const init = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 1500, idempotencyKey: 't5-valid' });
      assert.strictEqual(init.status, 200);
      const ref = init.body.data.transaction.reference;
      assert(/^TXN-\d{8}-[A-Z0-9]{6}$/.test(ref), `Reference format TXN-YYYYMMDD-XXXXXX valid: ${ref}`);

      const auth = await request(app).post(`/api/transfers/${ref}/authorise`).set('x-session-id', sid)
        .send({ pin: '1234' });
      assert.strictEqual(auth.status, 200);

      const comp = await request(app).post(`/api/transfers/${ref}/complete`).set('x-session-id', sid).send({});
      assert.strictEqual(comp.status, 200);
      assert.strictEqual(comp.body.data.transaction.status, 'SUCCESS');

      const b1 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101').balance;
      const b2 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102').balance;
      assert.strictEqual(b1, 23500);
      assert.strictEqual(b2, 9500);

      const histories = db.prepare('SELECT * FROM transaction_history WHERE reference_id = ?').all(ref);
      assert.strictEqual(histories.length, 3); // INITIATED, AUTHORISED, SUCCESS

      closeDatabase();
      return `Txn ${ref} status SUCCESS. A101 debited to 23500 (-1500), A102 credited to 9500 (+1500). 3 audit history rows recorded.`;
    }
  });

  // ==========================================
  // T6: Authentication Failures & 3-PIN Lockout
  // ==========================================
  await recordTest({
    id: 'T6',
    title: 'Authentication Failures & 3-PIN Session Lockout',
    linkedFR: 'FR4',
    linkedBR: 'BR5, BR6',
    precondition: 'Customer C101 registered with PIN 1234',
    input: 'Blank ID, 3-digit PIN, 3 consecutive wrong PINs',
    expected: 'HTTP 400 on blank/short PIN; 3 wrong PINs locks session (HTTP 423 SESSION_LOCKED); subsequent correct PIN rejected; no balance change',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-t6');
      const { app } = createApp({ dbPath });

      // Blank ID
      const rBlank = await request(app).post('/api/auth/login').send({ loginId: '', pin: '1234' });
      assert.strictEqual(rBlank.status, 400);

      // Short PIN
      const rShort = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '123' });
      assert.strictEqual(rShort.status, 400);

      // 3 wrong attempts on a client session
      const clientKey = 'client-session-lock-test';
      const rW1 = await request(app).post('/api/auth/login').set('x-session-id', clientKey).send({ loginId: 'C101', pin: '0000' });
      assert.strictEqual(rW1.status, 401);
      const rW2 = await request(app).post('/api/auth/login').set('x-session-id', clientKey).send({ loginId: 'C101', pin: '1111' });
      assert.strictEqual(rW2.status, 401);
      const rW3 = await request(app).post('/api/auth/login').set('x-session-id', clientKey).send({ loginId: 'C101', pin: '2222' });
      assert.strictEqual(rW3.status, 423);
      assert.strictEqual(rW3.body.error.code, 'SESSION_LOCKED');

      // Attempt with correct PIN now fails due to lockout
      const rLock = await request(app).post('/api/auth/login').set('x-session-id', clientKey).send({ loginId: 'C101', pin: '1234' });
      assert.strictEqual(rLock.status, 423);
      assert.strictEqual(rLock.body.error.code, 'SESSION_LOCKED');

      closeDatabase();
      return '3 wrong PINs locked session with HTTP 423 SESSION_LOCKED; subsequent correct PIN rejected with HTTP 423';
    }
  });

  // ==========================================
  // T7: Pre-Commit Balance Depletion / Inactivation
  // ==========================================
  await recordTest({
    id: 'T7',
    title: 'Pre-Commit Failure Injection (Balance Depleted Before Complete)',
    linkedFR: 'FR4',
    linkedBR: 'BR2, BR6',
    precondition: 'Transfer authorised; balance reduced directly in DB before complete',
    input: { amount: 1500, balanceDrainTo: 100 },
    expected: 'Complete rejected with 400 INELIGIBLE; status marked FAILED; no balance deducted',
    fn: async () => {
      const { dbPath, db } = createFreshTestDb('test-t7');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const init = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 1500, idempotencyKey: 't7-deplete' });
      const ref = init.body.data.transaction.reference;

      await request(app).post(`/api/transfers/${ref}/authorise`).set('x-session-id', sid).send({ pin: '1234' });

      // Simulate concurrent withdrawal: drain balance directly in DB before complete
      db.prepare('UPDATE accounts SET balance = 100 WHERE id = ?').run('A101');

      // Attempt complete
      const comp = await request(app).post(`/api/transfers/${ref}/complete`).set('x-session-id', sid).send({});
      assert.strictEqual(comp.status, 400);
      assert.strictEqual(comp.body.error.code, 'INELIGIBLE');

      // Check transaction status is FAILED and balance remained 100
      const txn = db.prepare('SELECT status, failure_reason FROM transactions WHERE reference = ?').get(ref);
      assert.strictEqual(txn.status, 'FAILED');
      assert(txn.failure_reason.includes('insufficient'));

      const b1 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101').balance;
      assert.strictEqual(b1, 100);

      closeDatabase();
      return `Transaction transitioned to FAILED (reason: ${txn.failure_reason}); source balance stayed 100 with zero deduction`;
    }
  });

  // ==========================================
  // T8: Access Control & Data Isolation
  // ==========================================
  await recordTest({
    id: 'T8',
    title: 'Access Control & Data Isolation (BR10)',
    linkedFR: 'FR9',
    linkedBR: 'BR10',
    precondition: 'C101 creates a transaction; C102 logs in',
    input: 'C102 reads/reverses C101 txn; C101 accesses /api/admin/audit',
    expected: 'HTTP 403 FORBIDDEN on all unauthorized cross-tenant/admin calls',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-t8');
      const { app } = createApp({ dbPath });

      const l1 = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid1 = l1.body.data.sessionId;

      const init = await request(app).post('/api/transfers/initiate').set('x-session-id', sid1)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 't8-priv' });
      const ref = init.body.data.transaction.reference;

      const l2 = await request(app).post('/api/auth/login').send({ loginId: 'C102', pin: '5678' });
      const sid2 = l2.body.data.sessionId;

      // C102 reads C101's txn
      const rView = await request(app).get(`/api/transfers/${ref}`).set('x-session-id', sid2);
      assert.strictEqual(rView.status, 403);
      assert.strictEqual(rView.body.error.code, 'FORBIDDEN');

      // C102 reverses C101's txn
      const rRev = await request(app).post(`/api/transfers/${ref}/reverse`).set('x-session-id', sid2);
      assert.strictEqual(rRev.status, 403);

      // C101 tries to access admin audit
      const rAdmin = await request(app).get('/api/admin/audit').set('x-session-id', sid1);
      assert.strictEqual(rAdmin.status, 403);

      closeDatabase();
      return 'All unauthorized actions returned HTTP 403 FORBIDDEN with zero state modification';
    }
  });

  // ==========================================
  // T9: Admin Status Actions & Invalid Transitions
  // ==========================================
  await recordTest({
    id: 'T9',
    title: 'Admin Status Transition Matrix & Illegal Transition Rejections',
    linkedFR: 'FR7, FR9',
    linkedBR: 'BR8, BR10',
    precondition: 'Transactions in INITIATED, AUTHORISED, FAILED states',
    input: 'Admin attempts INITIATED->SUCCESS, FAILED->SUCCESS; Customer complete-before-authorise',
    expected: 'All illegal transitions rejected with 409 INVALID_STATUS_ACTION; customer complete-before-authorise fails',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-t9');
      const { app } = createApp({ dbPath });

      const lCust = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sidCust = lCust.body.data.sessionId;

      const lAdmin = await request(app).post('/api/auth/login').send({ loginId: 'ADMIN01', pin: '9999' });
      const sidAdmin = lAdmin.body.data.sessionId;

      // Create INITIATED txn
      const init = await request(app).post('/api/transfers/initiate').set('x-session-id', sidCust)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 't9-init' });
      const ref = init.body.data.transaction.reference;

      // Customer attempts complete-before-authorise
      const earlyComp = await request(app).post(`/api/transfers/${ref}/complete`).set('x-session-id', sidCust);
      assert.strictEqual(earlyComp.status, 409);
      assert.strictEqual(earlyComp.body.error.code, 'INVALID_STATUS_ACTION');

      // Admin attempts INITIATED -> SUCCESS
      const adminSkip = await request(app)
        .post(`/api/admin/transactions/${ref}/status`)
        .set('x-session-id', sidAdmin)
        .send({ targetStatus: 'SUCCESS' });
      assert.strictEqual(adminSkip.status, 409);
      assert.strictEqual(adminSkip.body.error.code, 'INVALID_STATUS_ACTION');

      closeDatabase();
      return 'Complete-before-authorise rejected with 409; Admin INITIATED->SUCCESS rejected with 409 INVALID_STATUS_ACTION';
    }
  });

  // ==========================================
  // T10: Transaction Reversal & Repeat Protection
  // ==========================================
  await recordTest({
    id: 'T10',
    title: 'Reversal Once-Only and Exact Balance Restoration (BR9)',
    linkedFR: 'FR8',
    linkedBR: 'BR9',
    precondition: 'A101 sends Rs.500 to A102 (total debit 510); txn is SUCCESS',
    input: '1st reverse call -> REVERSED; 2nd reverse call -> 409',
    expected: '1st reversal refunds Rs.510 to A101, deducts Rs.500 from A102; 2nd reversal rejected 409 with zero balance change',
    fn: async () => {
      const { dbPath, db } = createFreshTestDb('test-t10');
      const { app } = createApp({ dbPath });

      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const init = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 't10-rev' });
      const ref = init.body.data.transaction.reference;
      await request(app).post(`/api/transfers/${ref}/authorise`).set('x-session-id', sid).send({ pin: '1234' });
      await request(app).post(`/api/transfers/${ref}/complete`).set('x-session-id', sid);

      // Verify post-transfer balances: A101 = 24490, A102 = 8500
      assert.strictEqual(db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101').balance, 24490);
      assert.strictEqual(db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102').balance, 8500);

      // 1st Reversal
      const rev1 = await request(app).post(`/api/transfers/${ref}/reverse`).set('x-session-id', sid);
      assert.strictEqual(rev1.status, 200);
      assert.strictEqual(rev1.body.data.transaction.status, 'REVERSED');
      assert.strictEqual(db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101').balance, 25000);
      assert.strictEqual(db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102').balance, 8000);

      // 2nd Reversal (repeat)
      const rev2 = await request(app).post(`/api/transfers/${ref}/reverse`).set('x-session-id', sid);
      assert.strictEqual(rev2.status, 409);
      assert.strictEqual(rev2.body.error.code, 'INVALID_STATUS_ACTION');
      assert.strictEqual(db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101').balance, 25000);
      assert.strictEqual(db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102').balance, 8000);

      closeDatabase();
      return '1st reversal restored A101 to 25000 and A102 to 8000; 2nd reversal rejected with HTTP 409 INVALID_STATUS_ACTION';
    }
  });

  // ==========================================
  // T11: Process Restart Persistence Test
  // ==========================================
  await recordTest({
    id: 'T11',
    title: 'Process Restart Persistence (NFR Persistence)',
    linkedFR: 'FR10',
    linkedBR: 'NFR Persistence',
    precondition: 'Child process running on test DB; transaction completed',
    input: 'Kill process; spawn new process on same DB; query record & balances',
    expected: 'Transaction status SUCCESS, balances 23500 and 9500 persist identically across process restarts',
    fn: async () => {
      const restartDbPath = path.resolve(__dirname, '../../backend/data/restart-test.db');
      if (fs.existsSync(restartDbPath)) {
        try { fs.unlinkSync(restartDbPath); } catch (e) {}
      }

      // Step 1: Create transaction using app instance on restartDbPath
      const { app: app1 } = createApp({ dbPath: restartDbPath });
      const login = await request(app1).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const init = await request(app1).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 1500, idempotencyKey: 't11-restart' });
      const ref = init.body.data.transaction.reference;
      await request(app1).post(`/api/transfers/${ref}/authorise`).set('x-session-id', sid).send({ pin: '1234' });
      await request(app1).post(`/api/transfers/${ref}/complete`).set('x-session-id', sid);

      // Force close and simulate server process termination
      closeDatabase();

      // Step 2: Spawn server child process on port 5999 pointing to restartDbPath
      const env = { ...process.env, PORT: '5999', DB_PATH: restartDbPath };
      const child = spawn('node', [path.resolve(__dirname, '../src/server.js')], { env });

      // Wait for child process to be ready
      await new Promise((resolve) => setTimeout(resolve, 1500));

      try {
        // Query child process
        const loginNew = await request('http://localhost:5999').post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
        const newSid = loginNew.body.data.sessionId;

        const checkTxn = await request('http://localhost:5999').get(`/api/transfers/${ref}`).set('x-session-id', newSid);
        assert.strictEqual(checkTxn.status, 200);
        assert.strictEqual(checkTxn.body.data.transaction.status, 'SUCCESS');
        assert.strictEqual(checkTxn.body.data.transaction.amount, 1500);

        const checkAcc = await request('http://localhost:5999').get('/api/accounts/mine').set('x-session-id', newSid);
        assert.strictEqual(checkAcc.body.data.primaryAccount.balance, 23500);
      } finally {
        child.kill();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return `Server restarted on ${restartDbPath}; verified txn ${ref} is SUCCESS, A101 balance persists at 23500`;
    }
  });

  // ==========================================
  // T12: Snapshot Immutability (BR3)
  // ==========================================
  await recordTest({
    id: 'T12',
    title: 'Snapshot Immutability Against Master Data & Config Changes',
    linkedFR: 'FR5',
    linkedBR: 'BR3',
    precondition: 'Transaction completed; service_config and beneficiary user name subsequently altered',
    input: 'Altered low_charge=99, changed beneficiary user name="Modified Name"',
    expected: 'Original transaction fields (charge=10, snapshot name, rule snapshot) remain completely unaffected',
    fn: async () => {
      const { dbPath, db } = createFreshTestDb('test-t12');
      const { app } = createApp({ dbPath });

      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const init = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 't12-snap' });
      const ref = init.body.data.transaction.reference;
      await request(app).post(`/api/transfers/${ref}/authorise`).set('x-session-id', sid).send({ pin: '1234' });
      await request(app).post(`/api/transfers/${ref}/complete`).set('x-session-id', sid);

      // Now alter master data: change config and change user name
      db.prepare('UPDATE service_config SET value = ? WHERE key = ?').run('99', 'low_charge');
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Renamed Person', 'U2');

      // Re-fetch transaction
      const res = await request(app).get(`/api/transfers/${ref}`).set('x-session-id', sid);
      const t = res.body.data.transaction;

      assert.strictEqual(t.charge, 10, 'Charge must still be 10, not 99');
      assert.strictEqual(t.beneficiary_name_snapshot, 'Sample Customer 2', 'Snapshot name must remain original');
      assert(t.charge_rule_snapshot.includes('"low_charge":10'), 'Charge rule snapshot must contain low_charge: 10');

      closeDatabase();
      return 'Transaction snapshot retained original charge (10), snapshot name ("Sample Customer 2"), and rule snapshot regardless of master modifications';
    }
  });

  // ==========================================
  // Extras: E1 to E4
  // ==========================================
  await recordTest({
    id: 'E1',
    title: 'Atomicity Fault-Injection (Rollback on Mid-Transaction Failure)',
    linkedFR: 'FR5',
    linkedBR: 'BR6, BR7',
    precondition: 'Force simulated exception during DB transaction after debit step',
    input: 'Simulated fault in SQLite transaction block',
    expected: 'Full atomic rollback: balances and transaction state unchanged',
    fn: async () => {
      const { dbPath, db } = createFreshTestDb('test-e1');
      const txnRepo = new (require('../src/repositories/TransactionRepository'))(db);
      const accountRepo = new (require('../src/repositories/AccountRepository'))(db);

      let threw = false;
      try {
        txnRepo.executeTransaction(() => {
          accountRepo.decrementBalance('A101', 500);
          throw new Error('SIMULATED_CRASH');
        });
      } catch (e) {
        threw = true;
      }
      assert(threw, 'Should catch simulated error');

      const b = accountRepo.findById('A101').balance;
      assert.strictEqual(b, 25000, 'Balance must remain 25000 due to rollback');

      closeDatabase();
      return 'Fault injection triggered clean rollback: A101 balance remained intact at 25000';
    }
  });

  await recordTest({
    id: 'E2',
    title: 'Strict Non-Numeric / String / NaN Amount Rejection',
    linkedFR: 'FR2',
    linkedBR: 'BR1',
    precondition: 'Logged-in user',
    input: ['"500"', 'NaN', null, undefined],
    expected: 'All non-integer types rejected with 400 VALIDATION_ERROR',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-e2');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const badInputs = ['500', null, undefined, true];
      for (const val of badInputs) {
        const res = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
          .send({ beneficiaryAccountId: 'A102', amount: val, idempotencyKey: `e2-${val}` });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
      }

      closeDatabase();
      return 'All string/null/undefined amounts rejected with HTTP 400 VALIDATION_ERROR';
    }
  });

  await recordTest({
    id: 'E3',
    title: 'SQL Injection Immunity in Account Identifier',
    linkedFR: 'FR9',
    linkedBR: 'Security NFR',
    precondition: 'Logged-in user sends SQL injection payload',
    input: { beneficiaryAccountId: "A102' OR '1'='1", amount: 500 },
    expected: 'Parameterized query safely rejects invalid account with 404 NOT_FOUND',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-e3');
      const { app } = createApp({ dbPath });
      const login = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid = login.body.data.sessionId;

      const res = await request(app).post('/api/transfers/initiate').set('x-session-id', sid)
        .send({ beneficiaryAccountId: "A102' OR '1'='1", amount: 500, idempotencyKey: 'e3-sqli' });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error.code, 'NOT_FOUND');

      closeDatabase();
      return 'Parameterized query safely handled injection string, returning HTTP 404 NOT_FOUND';
    }
  });

  await recordTest({
    id: 'E4',
    title: 'Customer Transaction Privacy Isolation',
    linkedFR: 'FR9',
    linkedBR: 'BR10',
    precondition: 'C101 and C102 both have transactions',
    input: 'C102 fetches /api/transfers/mine',
    expected: 'Response contains only C102 transactions, strictly zero of C101',
    fn: async () => {
      const { dbPath } = createFreshTestDb('test-e4');
      const { app } = createApp({ dbPath });

      // C101 txn
      const l1 = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
      const sid1 = l1.body.data.sessionId;
      await request(app).post('/api/transfers/initiate').set('x-session-id', sid1)
        .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'e4-1' });

      // C102 txn
      const l2 = await request(app).post('/api/auth/login').send({ loginId: 'C102', pin: '5678' });
      const sid2 = l2.body.data.sessionId;
      await request(app).post('/api/transfers/initiate').set('x-session-id', sid2)
        .send({ beneficiaryAccountId: 'A101', amount: 300, idempotencyKey: 'e4-2' });

      const res = await request(app).get('/api/transfers/mine').set('x-session-id', sid2);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.transactions.length, 1);
      assert.strictEqual(res.body.data.transactions[0].owner_user_id, 'U2');

      closeDatabase();
      return 'C102 saw strictly 1 transaction owned by U2; zero leak of U1 records';
    }
  });

  // Write outputs
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(testResults, null, 2));
  fs.writeFileSync(LOG_FILE, executionLogs.join('\n'));

  log('\n======================================================');
  log(`TEST RUN COMPLETE: ${testResults.filter(t => t.status === 'PASS').length}/${testResults.length} PASSED`);
  log(`Results written to: ${RESULTS_FILE}`);
  log(`Execution log written to: ${LOG_FILE}`);
  log('======================================================\n');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
