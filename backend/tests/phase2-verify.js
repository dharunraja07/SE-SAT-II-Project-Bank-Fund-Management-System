const request = require('supertest');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../src/app');
const { seedDatabase } = require('../scripts/seed');
const { closeDatabase } = require('../src/db/connection');

async function runPhase2Tests() {
  console.log('=== Running Phase 2 Verification ===');

  const testDbPath = path.resolve(__dirname, '../../backend/data/test-phase2.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const { app, db } = createApp({ dbPath: testDbPath });
  seedDatabase(db);

  // 1. Auth Tests
  console.log('Testing Auth...');
  // Blank Customer ID
  const blankRes = await request(app).post('/api/auth/login').send({ loginId: '', pin: '1234' });
  assert.strictEqual(blankRes.status, 400);
  assert.strictEqual(blankRes.body.error.code, 'VALIDATION_ERROR');

  // Non-4-digit PIN
  const pinLenRes = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '12' });
  assert.strictEqual(pinLenRes.status, 400);
  assert.strictEqual(pinLenRes.body.error.code, 'VALIDATION_ERROR');

  // Valid Login C101
  const loginRes = await request(app).post('/api/auth/login').send({ loginId: 'C101', pin: '1234' });
  assert.strictEqual(loginRes.status, 200);
  assert(loginRes.body.data.sessionId);
  const session1 = loginRes.body.data.sessionId;

  // Valid Login C102
  const login2Res = await request(app).post('/api/auth/login').send({ loginId: 'C102', pin: '5678' });
  assert.strictEqual(login2Res.status, 200);
  const session2 = login2Res.body.data.sessionId;

  // Valid Login ADMIN01
  const adminLoginRes = await request(app).post('/api/auth/login').send({ loginId: 'ADMIN01', pin: '9999' });
  assert.strictEqual(adminLoginRes.status, 200);
  const adminSession = adminLoginRes.body.data.sessionId;

  // 2. Account balance check
  console.log('Testing Account balance...');
  const accRes = await request(app).get('/api/accounts/mine').set('x-session-id', session1);
  assert.strictEqual(accRes.status, 200);
  assert.strictEqual(accRes.body.data.primaryAccount.balance, 25000);

  // 3. Initiate Transfer validations
  console.log('Testing Transfer validations (BR1, BR2, BR4)...');
  // Amount < 100
  const lowAmt = await request(app)
    .post('/api/transfers/initiate')
    .set('x-session-id', session1)
    .send({ beneficiaryAccountId: 'A102', amount: 50, idempotencyKey: 'k1' });
  assert.strictEqual(lowAmt.status, 400);
  assert.strictEqual(lowAmt.body.error.code, 'VALIDATION_ERROR');

  // Decimal amount
  const decAmt = await request(app)
    .post('/api/transfers/initiate')
    .set('x-session-id', session1)
    .send({ beneficiaryAccountId: 'A102', amount: 100.5, idempotencyKey: 'k2' });
  assert.strictEqual(decAmt.status, 400);

  // Inactive beneficiary account A103
  const inactBeneficiary = await request(app)
    .post('/api/transfers/initiate')
    .set('x-session-id', session1)
    .send({ beneficiaryAccountId: 'A103', amount: 500, idempotencyKey: 'k3' });
  assert.strictEqual(inactBeneficiary.status, 400);
  assert.strictEqual(inactBeneficiary.body.error.code, 'INELIGIBLE');

  // Valid Initiate: Amount 500 (< 1000, charge should be 10)
  const init1 = await request(app)
    .post('/api/transfers/initiate')
    .set('x-session-id', session1)
    .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'k4' });
  assert.strictEqual(init1.status, 200);
  assert.strictEqual(init1.body.data.transaction.charge, 10);
  assert.strictEqual(init1.body.data.transaction.total_debit, 510);
  assert.strictEqual(init1.body.data.transaction.status, 'INITIATED');
  const ref1 = init1.body.data.transaction.reference;

  // Duplicate open transfer check (same owner, same beneficiary, same amount)
  const dupOpen = await request(app)
    .post('/api/transfers/initiate')
    .set('x-session-id', session1)
    .send({ beneficiaryAccountId: 'A102', amount: 500, idempotencyKey: 'k5' });
  assert.strictEqual(dupOpen.status, 409);
  assert.strictEqual(dupOpen.body.error.code, 'DUPLICATE');

  // 4. Authorise Transfer (BR5)
  console.log('Testing Authorise transfer...');
  // Wrong PIN
  const wrongPinAuth = await request(app)
    .post(`/api/transfers/${ref1}/authorise`)
    .set('x-session-id', session1)
    .send({ pin: '0000' });
  assert.strictEqual(wrongPinAuth.status, 401);

  // Correct PIN
  const authOk = await request(app)
    .post(`/api/transfers/${ref1}/authorise`)
    .set('x-session-id', session1)
    .send({ pin: '1234' });
  assert.strictEqual(authOk.status, 200);
  assert.strictEqual(authOk.body.data.transaction.status, 'AUTHORISED');

  // 5. Complete Transfer (BR7)
  console.log('Testing Complete transfer...');
  const compOk = await request(app)
    .post(`/api/transfers/${ref1}/complete`)
    .set('x-session-id', session1)
    .send({});
  assert.strictEqual(compOk.status, 200);
  assert.strictEqual(compOk.body.data.transaction.status, 'SUCCESS');

  // Verify balances: A101 (25000 - 510 = 24490), A102 (8000 + 500 = 8500)
  const a1 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101');
  const a2 = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102');
  assert.strictEqual(a1.balance, 24490);
  assert.strictEqual(a2.balance, 8500);

  // 6. Access Control (BR10)
  console.log('Testing Access Control...');
  // Customer C102 trying to view C101's transaction
  const forbiddenView = await request(app)
    .get(`/api/transfers/${ref1}`)
    .set('x-session-id', session2);
  assert.strictEqual(forbiddenView.status, 403);
  assert.strictEqual(forbiddenView.body.error.code, 'FORBIDDEN');

  // Customer C101 trying to access admin endpoint
  const forbiddenAdmin = await request(app)
    .get('/api/admin/transactions')
    .set('x-session-id', session1);
  assert.strictEqual(forbiddenAdmin.status, 403);

  // 7. Reversal (BR9)
  console.log('Testing Reversal...');
  const revRes = await request(app)
    .post(`/api/transfers/${ref1}/reverse`)
    .set('x-session-id', session1);
  assert.strictEqual(revRes.status, 200);
  assert.strictEqual(revRes.body.data.transaction.status, 'REVERSED');

  // Verify balances restored: A101 = 25000, A102 = 8000
  const a1Restored = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A101');
  const a2Restored = db.prepare('SELECT balance FROM accounts WHERE id = ?').get('A102');
  assert.strictEqual(a1Restored.balance, 25000);
  assert.strictEqual(a2Restored.balance, 8000);

  // Repeated reversal should be rejected 409
  const repeatRev = await request(app)
    .post(`/api/transfers/${ref1}/reverse`)
    .set('x-session-id', session1);
  assert.strictEqual(repeatRev.status, 409);
  assert.strictEqual(repeatRev.body.error.code, 'INVALID_STATUS_ACTION');

  console.log('✅ Phase 2 Verification Passed: All services, rules, and endpoints validated!');
  closeDatabase();
}

runPhase2Tests().catch(err => {
  console.error('❌ Phase 2 test failed:', err);
  process.exit(1);
});
