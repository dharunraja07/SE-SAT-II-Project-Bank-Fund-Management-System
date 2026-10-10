const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../backend/src/app');
const { seedDatabase } = require('../backend/scripts/seed');
const { closeDatabase } = require('../backend/src/db/connection');

const SCREENSHOT_DIR = path.resolve(__dirname, '../evidence/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function captureScreenshots() {
  console.log('=== Starting Automated Playwright Screenshot Capture ===');

  const testDbPath = path.resolve(__dirname, '../backend/data/screenshot-test.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
  }

  // Set up backend app serving built frontend on port 5055
  const PORT = 5055;
  const { app, db } = createApp({ dbPath: testDbPath });
  seedDatabase(db);

  const server = app.listen(PORT);
  console.log(`Test server running at http://localhost:${PORT}`);

  const browser = await chromium.launch({
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  try {
    const baseUrl = `http://localhost:${PORT}`;

    // 1. Login Screen (T6)
    console.log('Capturing: T6-login.png');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-id-input');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T6-login.png'), fullPage: true });

    // 2. Login as Customer C101
    await page.fill('#login-id-input', 'C101');
    await page.fill('#login-pin-input', '1234');
    await page.click('#login-submit-button');
    await page.waitForSelector('#customer-balance-display');

    // 3. Rejected Inactive Case (T3)
    console.log('Capturing: T3-rejected-inactive.png');
    await page.fill('#transfer-beneficiary-input', 'A103');
    await page.fill('#transfer-amount-input', '500');
    await page.click('#transfer-step1-next-button');
    await page.waitForSelector('#transfer-error-alert');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T3-rejected-inactive.png'), fullPage: true });

    // 4. Transfer Review with Service Charge displayed (T4)
    console.log('Capturing: T4-transfer-review.png');
    await page.fill('#transfer-beneficiary-input', 'A102');
    await page.fill('#transfer-amount-input', '500');
    await page.click('#transfer-step1-next-button');
    await page.waitForSelector('#review-charge-display');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T4-transfer-review.png'), fullPage: true });

    // 5. Authorise and Complete Transfer -> Success Receipt (T5)
    console.log('Capturing: T5-success-receipt.png');
    await page.click('#transfer-step2-next-button');
    await page.waitForSelector('#authorise-pin-input');
    await page.fill('#authorise-pin-input', '1234');
    await page.click('#transfer-authorise-button');
    await page.waitForSelector('#transfer-complete-button');
    await page.click('#transfer-complete-button');
    await page.waitForSelector('#receipt-reference');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T5-success-receipt.png'), fullPage: true });

    // 6. Customer History Table (T8)
    console.log('Capturing: T8-history.png');
    await page.click('#receipt-new-transfer-button');
    await page.waitForSelector('table.data-table');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T8-history.png'), fullPage: true });

    // 7. Reversal Execution (T10)
    console.log('Capturing: T10-reversal.png');
    const reverseBtn = await page.waitForSelector('button[id^="reverse-txn-"]');
    await reverseBtn.click();
    await page.waitForTimeout(1000); // wait for state update
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T10-reversal.png'), fullPage: true });

    // 8. Logout and Login as Administrator
    await page.click('#logout-button');
    await page.waitForSelector('#login-id-input');
    await page.fill('#login-id-input', 'ADMIN01');
    await page.fill('#login-pin-input', '9999');
    await page.click('#login-submit-button');
    await page.waitForSelector('text=System-Wide Transactions');

    // 9. Admin Audit View (T8)
    console.log('Capturing: T8-admin-audit.png');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T8-admin-audit.png'), fullPage: true });

    // 10. Admin Invalid Status Action Attempt (T9)
    console.log('Capturing: T9-admin-invalid-action.png');
    const selectElem = await page.waitForSelector('select[id^="admin-target-status-select-"]');
    await selectElem.selectOption('SUCCESS');
    const applyBtn = await page.waitForSelector('button[id^="admin-apply-status-button-"]');
    await applyBtn.click();
    await page.waitForSelector('#admin-action-error-alert');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'T9-admin-invalid-action.png'), fullPage: true });

    console.log('✅ All evidence screenshots captured successfully in evidence/screenshots/');
  } finally {
    await browser.close();
    server.close();
    closeDatabase();
  }
}

if (require.main === module) {
  captureScreenshots().catch(err => {
    console.error('Error capturing screenshots:', err);
    process.exit(1);
  });
}

module.exports = { captureScreenshots };
