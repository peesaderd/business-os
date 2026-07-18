/**
 * Queue Engine — Unit Tests
 *
 * Tests the core QueueEngine class directly (no HTTP).
 * Run with: node test/queue-engine.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Use dev require path
const QueueEngine = require('../queue-engine');

// ─── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`      ${err.message}`);
    if (err.expected !== undefined) {
      console.log(`      expected: ${JSON.stringify(err.expected)}`);
      console.log(`      actual:   ${JSON.stringify(err.actual)}`);
    }
  }
}

function assertThrows(fn, expectedMessage) {
  try {
    fn();
    throw new Error(`Expected error: "${expectedMessage}"`);
  } catch (err) {
    if (err.message !== expectedMessage) {
      const e = new Error(`Expected "${expectedMessage}", got "${err.message}"`);
      e.expected = expectedMessage;
      e.actual = err.message;
      throw e;
    }
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

function testJoin() {
  const engine = new QueueEngine({ avgServiceTimeMinutes: 10 });

  // Basic join
  const t1 = engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Alice', phone: '0811111111' } });
  assert.strictEqual(t1.ticketNumber, '0001', 'First ticket should be 0001');
  assert.strictEqual(t1.status, 'waiting');
  assert.strictEqual(t1.position, 1);
  assert.strictEqual(t1.isVip, false);
  assert.strictEqual(t1.estimatedWaitMinutes, 0); // First in queue, 0 wait
  assert.ok(t1.id, 'Should have uuid');
  assert.ok(t1.joinedAt > 0, 'Should have join timestamp');

  // Second join
  const t2 = engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Bob' } });
  assert.strictEqual(t2.ticketNumber, '0002');
  assert.strictEqual(t2.position, 2);
  assert.strictEqual(t2.estimatedWaitMinutes, 10); // Behind Alice (10 min)

  // Third join
  const t3 = engine.join({ serviceType: 'clinic', customerInfo: { name: 'Charlie' } });
  assert.strictEqual(t3.ticketNumber, '0003');
  assert.strictEqual(t3.position, 3);
  assert.strictEqual(t3.estimatedWaitMinutes, 20);
}

function testVipPriority() {
  const engine = new QueueEngine();

  // Non-VIP joins first
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Normal' } });
  // VIP joins
  const vip = engine.join({ serviceType: 'restaurant', customerInfo: { name: 'VIP' }, isVip: true });
  // Another non-VIP
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Normal2' } });

  assert.strictEqual(vip.position, 1, 'VIP should be at front');
  assert.strictEqual(vip.estimatedWaitMinutes, 0, 'VIP should have no wait');

  const queue = engine.queue.map(t => t.customerInfo.name);
  assert.deepStrictEqual(queue, ['VIP', 'Normal', 'Normal2'], 'VIP should be first');
}

function testInvalidServiceType() {
  const engine = new QueueEngine({ serviceTypes: 'restaurant,clinic' });
  assertThrows(
    () => engine.join({ serviceType: 'bank', customerInfo: {} }),
    'Invalid service type "bank". Allowed: restaurant, clinic'
  );
}

function testCallAndComplete() {
  const engine = new QueueEngine({ noShowTimeoutMinutes: 0 });

  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'B' } });

  // Call first
  const called = engine.callNext('0001');
  assert.strictEqual(called.status, 'called');
  assert.ok(called.calledAt > 0);
  assert.strictEqual(called.counterId, null);

  // Queue should now have only B
  assert.strictEqual(engine.queue.length, 1);
  assert.strictEqual(engine.queue[0].ticketNumber, '0002');
  assert.strictEqual(engine.serving.length, 1);
  assert.strictEqual(engine.serving[0].ticketNumber, '0001');

  // Complete
  const served = engine.complete('0001');
  assert.strictEqual(served.status, 'served');
  assert.strictEqual(served.actualWaitMinutes >= 0, true, 'actualWaitMinutes should be >= 0');
  assert.ok(served.servedAt > 0);

  assert.strictEqual(engine.serving.length, 0);
  assert.strictEqual(engine.completed.length, 1);
  assert.strictEqual(engine.completed[0].ticketNumber, '0001');
}

function testCallCounter() {
  const engine = new QueueEngine();
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });

  const called = engine.callNext('0001', 'counter-1');
  assert.strictEqual(called.counterId, 'counter-1');
}

function testSkip() {
  const engine = new QueueEngine({ noShowTimeoutMinutes: 0 });

  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'B' } });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'C' } });

  const skipped = engine.skip('0002');
  assert.strictEqual(skipped.status, 'skipped');
  assert.ok(skipped.skippedAt > 0);

  assert.strictEqual(engine.queue.length, 2);
  assert.strictEqual(engine.queue[0].ticketNumber, '0001');
  assert.strictEqual(engine.queue[1].ticketNumber, '0003');
  assert.strictEqual(engine.skipped.length, 1);
  assert.strictEqual(engine.skipped[0].ticketNumber, '0002');

  // Position should recalc
  assert.strictEqual(engine.queue[1].position, 2);
}

function testGetStats() {
  const engine = new QueueEngine();
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });
  engine.join({ serviceType: 'clinic', customerInfo: { name: 'B' } });
  engine.callNext('0001');
  engine.complete('0001');
  engine.skip('0002');

  const stats = engine.getStats();
  assert.strictEqual(stats.served, 1);
  assert.strictEqual(stats.waiting, 0);
  assert.strictEqual(stats.skipped, 1);
  assert.strictEqual(stats.totalJoined, 2);
  assert.strictEqual(stats.averageWaitMinutes >= 0, true, 'averageWaitMinutes should be >= 0');
  assert.ok(stats.byServiceType.restaurant);
  assert.ok(stats.byServiceType.clinic);
}

function testGetAnalytics() {
  const engine = new QueueEngine();
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'B' } });
  engine.callNext('0001');
  engine.complete('0001');

  const analytics = engine.getAnalytics();
  assert.strictEqual(analytics.totalTickets, 2);
  assert.strictEqual(analytics.totalServed, 1);
  assert.strictEqual(analytics.hourlyDistribution.length, 24);
  assert.strictEqual(analytics.byStatus.served, 1);
  assert.strictEqual(analytics.byStatus.waiting, 1);
}

function testGetQueue() {
  const engine = new QueueEngine();
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'B' } });

  const q = engine.getQueue();
  assert.strictEqual(q.totalInQueue, 2);
  assert.strictEqual(q.totalServing, 0);
  assert.strictEqual(q.totalServedToday, 0);
  assert.strictEqual(q.waiting.length, 2);
  assert.strictEqual(q.waiting[0].ticketNumber, '0001');
  assert.strictEqual(q.waiting[0].customerName, 'A');
  // Public view should NOT expose internal fields
  assert.strictEqual(q.waiting[0].id, undefined, 'Public should not expose uuid');
  assert.strictEqual(q.waiting[0].phone, undefined, 'Public should not expose phone');
}

function testGetStatus() {
  const engine = new QueueEngine();
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });

  const status = engine.getStatus('0001');
  assert.ok(status);
  assert.strictEqual(status.ticketNumber, '0001');
  assert.strictEqual(status.estimatedWaitMinutes, 0);

  const notFound = engine.getStatus('9999');
  assert.strictEqual(notFound, null);
}

function testPersistence() {
  const engine = new QueueEngine({ noShowTimeoutMinutes: 30 });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'A' } });
  engine.join({ serviceType: 'clinic', customerInfo: { name: 'B' } });
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'C' }, isVip: true });
  engine.callNext('0001');
  engine.complete('0001');

  // Serialize
  const json = engine.serialize();
  const data = JSON.parse(json);
  assert.strictEqual(data._counter, 3);
  assert.strictEqual(data.queue.length, 2);
  assert.strictEqual(data.completed.length, 1);

  // Deserialize into a new engine
  const engine2 = new QueueEngine({ noShowTimeoutMinutes: 30 });
  engine2.deserialize(json);

  assert.strictEqual(engine2._counter, 3);
  assert.strictEqual(engine2.tickets.size, 3);
  assert.strictEqual(engine2.queue.length, 2);
  assert.strictEqual(engine2.queue[0].ticketNumber, '0003'); // VIP first
  assert.strictEqual(engine2.queue[1].ticketNumber, '0002');
  assert.strictEqual(engine2.completed.length, 1);
  assert.strictEqual(engine2.completed[0].ticketNumber, '0001');
  assert.strictEqual(engine2.getStats().served, 1);

  // Verify position/wait recalculated
  assert.strictEqual(engine2.queue[0].position, 1);
  assert.strictEqual(engine2.queue[1].position, 2);
}

function testRegisterCounter() {
  const engine = new QueueEngine();
  const c1 = engine.registerCounter('counter-1', 'เคาน์เตอร์ 1');
  assert.strictEqual(c1.counterId, 'counter-1');
  assert.strictEqual(c1.label, 'เคาน์เตอร์ 1');
  assert.strictEqual(c1.isActive, true);

  // Duplicate
  assertThrows(
    () => engine.registerCounter('counter-1', 'อีกเคาน์เตอร์'),
    'Counter counter-1 already exists'
  );

  const counters = engine.getCounters();
  assert.strictEqual(counters.length, 1);
  assert.strictEqual(counters[0].counterId, 'counter-1');
}

function testSmartQueue() {
  const engine = new QueueEngine({ avgServiceTimeMinutes: 5 });

  // Tickets with LINE user
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'LINE User', phone: '081', lineUserId: 'line1' } });
  // Ticket without LINE but with phone
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Phone User', phone: '082' } });

  const lineCandidates = engine.getTicketsForLineNotify(5);
  assert.strictEqual(lineCandidates.length, 1);
  assert.strictEqual(lineCandidates[0].customerInfo.lineUserId, 'line1');

  engine.markLineNotified('0001');
  assert.strictEqual(engine.getTicketsForLineNotify(5).length, 0);

  // Phone candidates — both tickets have phone numbers
  const phoneCandidates = engine.getTicketsForPhoneCall(5);
  assert.strictEqual(phoneCandidates.length, 2, 'Both tickets have phone numbers');

  // Mark phone notified for 0001
  engine.markPhoneNotified('0001');
  const remainingPhone = engine.getTicketsForPhoneCall(5);
  assert.strictEqual(remainingPhone.length, 1, 'Only 0002 remains after 0001 notified');
  assert.strictEqual(remainingPhone[0].ticketNumber, '0002');

  // Find by LINE user
  const found = engine.findTicketsByLineUser('line1');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].ticketNumber, '0001');

  const notFound = engine.findTicketsByLineUser('nonexistent');
  assert.strictEqual(notFound.length, 0);

  // Confirm LINE
  engine.confirmLine('0001', true);
  const t = engine.tickets.get('0001');
  assert.strictEqual(t.lineConfirmed, true);
  assert.ok(t.lineConfirmedAt > 0);
}

function testUpdateGps() {
  const engine = new QueueEngine();
  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Guy' } });

  const updated = engine.updateGps('0001', { lat: 13.7563, lng: 100.5018 });
  assert.strictEqual(updated.customerInfo.gps.lat, 13.7563);
  assert.strictEqual(updated.customerInfo.gps.lng, 100.5018);
  assert.ok(updated.customerInfo.gps.timestamp);
  assert.strictEqual(updated.gpsCheckAttempts, 1);

  assertThrows(
    () => engine.updateGps('9999', {}),
    'Ticket 9999 not found'
  );
}

function testEventEmitter() {
  const engine = new QueueEngine();
  let emitted = [];

  engine.on('join', (t) => emitted.push(`join:${t.ticketNumber}`));
  engine.on('call', (t) => emitted.push(`call:${t.ticketNumber}`));
  engine.on('complete', (t) => emitted.push(`complete:${t.ticketNumber}`));

  engine.join({ serviceType: 'restaurant', customerInfo: { name: 'Emit' } });
  engine.callNext('0001');
  engine.complete('0001');

  assert.deepStrictEqual(emitted, ['join:0001', 'call:0001', 'complete:0001']);
}

function testConcurrentOperations() {
  const engine = new QueueEngine();
  const count = 100;

  for (let i = 0; i < count; i++) {
    engine.join({ serviceType: 'restaurant', customerInfo: { name: `User-${i}` } });
  }

  assert.strictEqual(engine.tickets.size, count);
  assert.strictEqual(engine.queue.length, count);
  assert.strictEqual(engine._counter, count);

  // Call and complete 50
  for (let i = 0; i < 50; i++) {
    const num = String(i + 1).padStart(4, '0');
    engine.callNext(num);
    engine.complete(num);
  }

  assert.strictEqual(engine.queue.length, 50);
  assert.strictEqual(engine.completed.length, 50);
  assert.strictEqual(engine.queue[0].ticketNumber, '0051');
  assert.strictEqual(engine.queue[49].ticketNumber, '0100');
  assert.strictEqual(engine.queue[0].position, 1);
}

// ─── Run ───────────────────────────────────────────────────────────────────

console.log('\n🧪 Queue Engine Tests');
console.log('════════════════════════\n');

test('join creates ticket with correct number, position, and wait', testJoin);
test('VIP skips ahead of non-VIP tickets', testVipPriority);
test('invalid service type throws', testInvalidServiceType);
test('call and complete flow works', testCallAndComplete);
test('call with counterId', testCallCounter);
test('skip removes from queue, adds to skipped', testSkip);
test('getStats returns correct counts', testGetStats);
test('getAnalytics returns correct periods', testGetAnalytics);
test('getQueue returns public view only', testGetQueue);
test('getStatus returns ticket or null', testGetStatus);
test('serialize/deserialize roundtrip', testPersistence);
test('register counter / duplicate detection', testRegisterCounter);
test('smart queue LINE + phone helpers', testSmartQueue);
test('GPS update works', testUpdateGps);
test('events emit on join/call/complete', testEventEmitter);
test('100 concurrent joins then 50 call/complete', testConcurrentOperations);

console.log(`\n════════════════════════`);
console.log(`📊 Result: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);

process.exit(failed > 0 ? 1 : 0);
