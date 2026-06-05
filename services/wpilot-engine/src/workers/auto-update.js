/**
 * Auto-Update Worker — อัปเดต WordPress core/plugin/themes
 */
const WordPressClient = require('../services/wp-client');
const aiClient = require('../services/ai-client');
const db = require('../db');

module.exports = async function processAutoUpdate(job) {
  const { customerId, type } = job.data;
  const customer = db.getCustomer(customerId);
  if (!customer) throw new Error(`Customer ${customerId} not found`);

  const wp = new WordPressClient({ siteUrl: customer.site_url, apiKey: customer.wp_api_key });

  db.addLog({ customerId, level: 'info', message: `Starting auto-update (${type})`, metadata: { jobId: job.id } });

  // 1. สร้าง Backup ก่อน
  db.addLog({ customerId, level: 'info', message: 'Creating backup before update...' });
  let backup;
  try {
    backup = await wp.createBackup();
  } catch (e) {
    db.addLog({ customerId, level: 'warn', message: `Backup skipped: ${e.message}`, metadata: { jobId: job.id } });
  }

  // 2. เช็ค current version
  let currentVersion;
  if (type === 'core') {
    const info = await wp.getCoreVersion();
    currentVersion = info.version || 'unknown';
  }

  // 3. วิเคราะห์ความปลอดภัย
  db.addLog({ customerId, level: 'info', message: `Analyzing ${type} update...` });
  const analysis = await aiClient.analyzeUpdate({
    currentVersion,
    newVersion: 'latest',
    changelog: `Auto ${type} update`,
    type,
  });

  if (analysis.decision === 'RISKY' && analysis.confidence < 70) {
    db.addLog({ customerId, level: 'warn', message: `Update skipped: ${analysis.reason}`, metadata: { jobId: job.id } });
    return { skipped: true, reason: analysis.reason };
  }

  // 4. Execute
  db.addLog({ customerId, level: 'info', message: `Executing ${type} update...` });
  try {
    const result = await wp.executeCommand(`${type} update`);
    db.addLog({ customerId, level: 'info', message: `✅ ${type} update completed`, metadata: { jobId: job.id } });
    return { success: true, type, result };
  } catch (e) {
    db.addLog({ customerId, level: 'error', message: `❌ ${type} update failed: ${e.message}`, metadata: { jobId: job.id } });

    // Auto-rollback
    if (backup && backup.id) {
      db.addLog({ customerId, level: 'info', message: 'Auto-rollback initiated...' });
      try {
        await wp.restoreBackup(backup.id);
        db.addLog({ customerId, level: 'info', message: '✅ Rollback successful', metadata: { jobId: job.id } });
      } catch (rberr) {
        db.addLog({ customerId, level: 'error', message: `❌ Rollback failed: ${rberr.message}`, metadata: { jobId: job.id } });
      }
    }
    throw e;
  }
};
