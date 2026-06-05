/**
 * Health Check Worker — ตรวจสอบสถานะเว็บลูกค้า
 */
const WordPressClient = require('../services/wp-client');
const db = require('../db');

module.exports = async function processHealthCheck(job) {
  const { customerId } = job.data;
  const customer = db.getCustomer(customerId);
  if (!customer) throw new Error(`Customer ${customerId} not found`);

  const wp = new WordPressClient({ siteUrl: customer.site_url, apiKey: customer.wp_api_key });

  const status = await wp.getStatus();

  if (status.connected) {
    db.addLog({ customerId, level: 'info', message: `✅ Site healthy`, metadata: { ...status } });
  } else {
    db.addLog({ customerId, level: 'error', message: `❌ Site unreachable: ${status.error}`, metadata: { jobId: job.id } });
  }

  return status;
};
