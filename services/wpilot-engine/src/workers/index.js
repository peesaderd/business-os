/**
 * Worker Pool Manager — ตั้งค่าและรัน workers
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const config = require('../config');
const db = require('../db');

const connection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
});

const workers = [];

function startWorkers() {
  const concurrency = config.workers.concurrency;

  // Auto-Update Worker
  const updateWorker = new Worker('wpilot-jobs', async (job) => {
    const { type } = job.data;
    const startTime = Date.now();

    db.updateJobStatus(job.id, 'running');

    try {
      let result;
      switch (type) {
        case 'auto-update':
          result = await require('./auto-update')(job);
          break;
        case 'content-gen':
          result = await require('./content-gen')(job);
          break;
        case 'health-check':
          result = await require('./health-check')(job);
          break;
        default:
          result = { error: `Unknown job type: ${type}` };
      }

      db.updateJobStatus(job.id, 'completed', result);
      return result;
    } catch (e) {
      db.updateJobStatus(job.id, 'failed', null, e.message);
      throw e;
    }
  }, {
    connection,
    concurrency,
    pollIntervalMs: config.workers.pollIntervalMs,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  updateWorker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} (${job.data.type}) completed`);
  });

  updateWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} (${job.data.type}) failed: ${err.message}`);
  });

  workers.push(updateWorker);
  console.log(`👷 WPilot workers started (concurrency: ${concurrency})`);
}

function stopWorkers() {
  workers.forEach(w => w.close());
  console.log('🛑 Workers stopped');
}

module.exports = { startWorkers, stopWorkers };
