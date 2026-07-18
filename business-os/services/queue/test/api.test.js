/**
 * Queue Service — API Integration Tests
 *
 * Tests the REST API endpoints via HTTP.
 * Requires the Queue Service to be running on the configured port.
 *
 * Run with: node test/api.test.js
 * (Start queue service first: node server.js)
 */

const assert = require('assert');
const http = require('http');

const BASE = process.env.TEST_URL || 'http://localhost:8113';
const STAFF_KEY = 'queue-staff-dev-key-2026';

let passed = 0;
let failed = 0;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✅ ${name}`);
  }).catch((err) => {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`      ${err.message}`);
  });
}

async function run() {
  console.log('\n🧪 Queue API Integration Tests');
  console.log(`🔗 ${BASE}`);
  console.log('═══════════════════════════════\n');

  // ── Health ──
  await test('GET /api/queue/v1/health', async () => {
    const res = await request('GET', '/api/queue/v1/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.service, 'queue-management');
    assert.ok(res.body.stats);
  });

  // ── Join ──
  await test('POST /api/queue/v1/join (restaurant)', async () => {
    const res = await request('POST', '/api/queue/v1/join', {
      serviceType: 'restaurant',
      customerInfo: { name: 'สมชาย', phone: '0812345678' },
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.success);
    assert.strictEqual(typeof res.body.ticket.ticketNumber, 'string');
    assert.strictEqual(res.body.ticket.serviceType, 'restaurant');
    assert.strictEqual(res.body.ticket.position, 1);
  });

  await test('POST /api/queue/v1/join (clinic)', async () => {
    const res = await request('POST', '/api/queue/v1/join', {
      serviceType: 'clinic',
      customerInfo: { name: 'วิภา', phone: '0898765432' },
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.ticket.serviceType, 'clinic');
  });

  await test('POST /api/queue/v1/join (invalid type → 400)', async () => {
    const res = await request('POST', '/api/queue/v1/join', {
      serviceType: 'invalid',
      customerInfo: { name: 'X' },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  await test('POST /api/queue/v1/join (missing type → 400)', async () => {
    const res = await request('POST', '/api/queue/v1/join', {
      customerInfo: { name: 'X' },
    });
    assert.strictEqual(res.status, 400);
  });

  // ── Status ──
  await test('GET /api/queue/v1/status/:ticket', async () => {
    const res = await request('GET', '/api/queue/v1/status/0001');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ticket.ticketNumber, '0001');
    assert.strictEqual(res.body.ticket.status, 'waiting');
  });

  await test('GET /api/queue/v1/status/:ticket (404)', async () => {
    const res = await request('GET', '/api/queue/v1/status/9999');
    assert.strictEqual(res.status, 404);
  });

  // ── Staff Auth ──
  await test('POST /api/queue/v1/call (no auth → 401)', async () => {
    const res = await request('POST', '/api/queue/v1/call/0001');
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/queue/v1/call (with staff key)', async () => {
    const res = await request('POST', '/api/queue/v1/call/0001', { counterId: 'counter-1' }, {
      'X-Staff-Key': STAFF_KEY,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ticket.status, 'called');
  });

  // ── Complete ──
  await test('POST /api/queue/v1/complete/:ticket', async () => {
    const res = await request('POST', '/api/queue/v1/complete/0001', {}, {
      'X-Staff-Key': STAFF_KEY,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ticket.status, 'served');
    assert.ok(res.body.ticket.actualWaitMinutes > 0);
  });

  // ── Current ──
  await test('GET /api/queue/v1/current', async () => {
    const res = await request('GET', '/api/queue/v1/current');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.waiting));
    assert.ok(Array.isArray(res.body.serving));
    assert.strictEqual(typeof res.body.totalInQueue, 'number');
  });

  // ── Stats ──
  await test('GET /api/queue/v1/stats', async () => {
    const res = await request('GET', '/api/queue/v1/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.stats.period, 'today');
    assert.ok(res.body.stats.byServiceType);
  });

  // ── Analytics ──
  await test('GET /api/queue/v1/analytics', async () => {
    const res = await request('GET', '/api/queue/v1/analytics');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.analytics.hourlyDistribution.length, 24);
  });

  // ── Skip ──
  await test('POST /api/queue/v1/skip/:ticket', async () => {
    const res = await request('POST', '/api/queue/v1/skip/0002', {}, {
      'X-Staff-Key': STAFF_KEY,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ticket.status, 'skipped');
  });

  // ── GPS ──
  await test('GET /api/queue/v1/gps/location', async () => {
    const res = await request('GET', '/api/queue/v1/gps/location');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.location.lat);
  });

  await test('POST /api/queue/v1/gps/check', async () => {
    // Create a fresh ticket for GPS check
    const joinRes = await request('POST', '/api/queue/v1/join', {
      serviceType: 'restaurant',
      customerInfo: { name: 'GPS User', phone: '0888888888' },
    });
    const ticketNum = joinRes.body.ticket.ticketNumber;
    const res = await request('POST', '/api/queue/v1/gps/check', {
      ticketNumber: ticketNum,
      gps: { lat: 13.7563, lng: 100.5018 },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.body.withinRange, 'boolean');
    assert.ok(res.body.distanceMeters >= 0);
  });

  await test('POST /api/queue/v1/gps/check (missing ticket → 400)', async () => {
    const res = await request('POST', '/api/queue/v1/gps/check', {
      gps: { lat: 13.7, lng: 100.5 },
    });
    assert.strictEqual(res.status, 400);
  });

  // ── Smart Config ──
  await test('GET /api/queue/v1/smart/config', async () => {
    const res = await request('GET', '/api/queue/v1/smart/config');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.businessLocation);
    assert.ok(res.body.line);
    assert.ok(res.body.phone);
  });

  // ── 404 ──
  await test('GET unknown route → 404', async () => {
    const res = await request('GET', '/api/queue/v1/nonexistent');
    assert.strictEqual(res.status, 404);
  });

  console.log(`\n═══════════════════════════════`);
  console.log(`📊 Result: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n💥 Fatal:', err.message);
  console.error('Make sure the Queue Service is running on', BASE);
  process.exit(1);
});
