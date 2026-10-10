const bcrypt = require('bcryptjs');
const { getDatabase } = require('../src/db/connection');

function seedDatabase(dbOrPath = null) {
  const db = typeof dbOrPath === 'string' || !dbOrPath ? getDatabase(dbOrPath) : dbOrPath;

  const now = new Date().toISOString();

  // Generate bcrypt hashes with salt rounds 10
  const salt = bcrypt.genSaltSync(10);
  const hash1234 = bcrypt.hashSync('1234', salt);
  const hash5678 = bcrypt.hashSync('5678', salt);
  const hash9999 = bcrypt.hashSync('9999', salt);
  const hash0000 = bcrypt.hashSync('0000', salt);

  const runSeed = db.transaction(() => {
    // Clean up in foreign-key safe order
    db.prepare('DELETE FROM transaction_history').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM service_config').run();
    db.prepare('DELETE FROM accounts').run();
    db.prepare('DELETE FROM users').run();

    // Insert Users
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, role, status, login_id, pin_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('U1', 'Sample Customer 1', 'CUSTOMER', 'Active', 'C101', hash1234, now);
    insertUser.run('U2', 'Sample Customer 2', 'CUSTOMER', 'Active', 'C102', hash5678, now);
    insertUser.run('U0', 'Administrator', 'ADMIN', 'Active', 'ADMIN01', hash9999, now);
    insertUser.run('U3', 'Blocked Holder', 'CUSTOMER', 'Inactive', 'C103', hash0000, now);

    // Insert Accounts
    const insertAccount = db.prepare(`
      INSERT INTO accounts (id, owner_user_id, status, balance, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertAccount.run('A101', 'U1', 'Active', 25000, now);
    insertAccount.run('A102', 'U2', 'Active', 8000, now);
    insertAccount.run('A103', 'U3', 'Inactive', 12000, now);

    // Insert Service Config
    const insertConfig = db.prepare(`
      INSERT INTO service_config (key, value)
      VALUES (?, ?)
    `);

    insertConfig.run('threshold', '1000');
    insertConfig.run('low_charge', '10');
    insertConfig.run('high_charge', '0');
  });

  runSeed();

  return {
    usersCount: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    accountsCount: db.prepare('SELECT COUNT(*) as c FROM accounts').get().c,
    configCount: db.prepare('SELECT COUNT(*) as c FROM service_config').get().c
  };
}

if (require.main === module) {
  try {
    const summary = seedDatabase();
    console.log('Database seeded successfully:');
    console.log(`  Users: ${summary.usersCount}`);
    console.log(`  Accounts: ${summary.accountsCount}`);
    console.log(`  Config entries: ${summary.configCount}`);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

module.exports = { seedDatabase };
