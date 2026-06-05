/**
 * WPilot Job Queue — BullMQ Queue Setup
 */
const { Queue, Worker, QueueScheduler } = require('bullmq');
const Redis = require('ioredis');
const config = require('./config');

const connection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
});

// ── Queue ──
const jobQueue = new Queue('wpilot-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// ── Add Job ──
async function addJob({ id, type, customerId, payload }) {
  return jobQueue.add(type, { id, customerId, ...payload }, {
    jobId: id,
    priority: type === 'auto-update' ? 1 : 2,
  });
}

// ── Get Queue Status ──
async function getQueueStatus() {
  const [waiting, active, completed, failed] = await Promise.all([
    jobQueue.getWaitingCount(),
    jobQueue.getActiveCount(),
    jobQueue.getCompletedCount(),
    jobQueue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

module.exports = { jobQueue, connection, addJob, getQueueStatus };
