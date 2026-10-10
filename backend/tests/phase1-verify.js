const assert = require('assert');
const { getDatabase, closeDatabase } = require('../src/db/connection');
const UserRepository = require('../src/repositories/UserRepository');
const AccountRepository = require('../src/repositories/AccountRepository');
const ServiceConfigRepository = require('../src/repositories/ServiceConfigRepository');
const TransactionRepository = require('../src/repositories/TransactionRepository');
const TransactionHistoryRepository = require('../src/repositories/TransactionHistoryRepository');
const { seedDatabase } = require('../scripts/seed');

console.log('--- Running Phase 1 Verification ---');

// Re-seed DB to ensure clean state
const summary = seedDatabase();
console.log('Seed summary:', summary);
assert.strictEqual(summary.usersCount, 4, 'Should have 4 users');
assert.strictEqual(summary.accountsCount, 3, 'Should have 3 accounts');
assert.strictEqual(summary.configCount, 3, 'Should have 3 config entries');

const userRepo = new UserRepository();
const accountRepo = new AccountRepository();
const configRepo = new ServiceConfigRepository();
const txnRepo = new TransactionRepository();
const historyRepo = new TransactionHistoryRepository();

// Test UserRepository
const user1 = userRepo.findByLoginId('C101');
assert(user1, 'User C101 should exist');
assert.strictEqual(user1.id, 'U1');
assert.strictEqual(user1.role, 'CUSTOMER');
assert.strictEqual(user1.status, 'Active');

const adminUser = userRepo.findByLoginId('ADMIN01');
assert(adminUser, 'Admin ADMIN01 should exist');
assert.strictEqual(adminUser.role, 'ADMIN');

const blockedUser = userRepo.findByLoginId('C103');
assert(blockedUser, 'Blocked user C103 should exist');
assert.strictEqual(blockedUser.status, 'Inactive');

// Test AccountRepository
const acc1 = accountRepo.findById('A101');
assert(acc1, 'Account A101 should exist');
assert.strictEqual(acc1.owner_user_id, 'U1');
assert.strictEqual(acc1.balance, 25000);
assert.strictEqual(acc1.status, 'Active');

const acc2 = accountRepo.findById('A102');
assert.strictEqual(acc2.balance, 8000);

const acc3 = accountRepo.findById('A103');
assert.strictEqual(acc3.status, 'Inactive');

// Test ServiceConfigRepository
const threshold = configRepo.get('threshold');
const lowCharge = configRepo.get('low_charge');
const highCharge = configRepo.get('high_charge');
assert.strictEqual(threshold, '1000');
assert.strictEqual(lowCharge, '10');
assert.strictEqual(highCharge, '0');

// Test TransactionRepository & TransactionHistoryRepository
const testRef = 'TXN-20261010-ABC123';
const testIdemp = 'idemp-phase1-test';
const createdTxn = txnRepo.create({
  reference: testRef,
  idempotencyKey: testIdemp,
  ownerUserId: 'U1',
  sourceAccountId: 'A101',
  beneficiaryAccountId: 'A102',
  beneficiaryNameSnapshot: 'Sample Customer 2',
  amount: 1500,
  charge: 0,
  totalDebit: 1500,
  chargeRuleSnapshot: JSON.stringify({ threshold: 1000, low_charge: 10, high_charge: 0 }),
  status: 'INITIATED'
});

assert(createdTxn, 'Transaction should be created');
assert.strictEqual(createdTxn.reference, testRef);
assert.strictEqual(createdTxn.status, 'INITIATED');

const byRef = txnRepo.findByReference(testRef);
assert.strictEqual(byRef.amount, 1500);

const byIdemp = txnRepo.findByIdempotencyKey(testIdemp);
assert.strictEqual(byIdemp.reference, testRef);

const openTxn = txnRepo.findOpenTransaction('U1', 'A102', 1500);
assert(openTxn, 'Should find open transaction');

// Update status
txnRepo.updateStatus(testRef, 'AUTHORISED');
const updatedTxn = txnRepo.findByReference(testRef);
assert.strictEqual(updatedTxn.status, 'AUTHORISED');

// Test History
historyRepo.create({
  referenceId: testRef,
  actorId: 'U1',
  oldStatus: 'INITIATED',
  newStatus: 'AUTHORISED',
  note: 'Customer authorised with valid PIN'
});

const histories = historyRepo.findByReference(testRef);
assert.strictEqual(histories.length, 1);
assert.strictEqual(histories[0].new_status, 'AUTHORISED');

// Test Atomic Transaction Helper
txnRepo.executeTransaction(() => {
  accountRepo.decrementBalance('A101', 1500);
  accountRepo.incrementBalance('A102', 1500);
  txnRepo.updateStatus(testRef, 'SUCCESS');
  historyRepo.create({
    referenceId: testRef,
    actorId: 'SYSTEM',
    oldStatus: 'AUTHORISED',
    newStatus: 'SUCCESS',
    note: 'Transaction committed'
  });
});

const finalAcc1 = accountRepo.findById('A101');
const finalAcc2 = accountRepo.findById('A102');
assert.strictEqual(finalAcc1.balance, 23500);
assert.strictEqual(finalAcc2.balance, 9500);

const finalTxn = txnRepo.findByReference(testRef);
assert.strictEqual(finalTxn.status, 'SUCCESS');

console.log('✅ Phase 1 Verification Passed: All repository methods, SQLite schema, transactions, and seeds verified!');
closeDatabase();
