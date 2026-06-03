'use strict';

/**
 * Queue Management Service — server.js
 *
 * Express server exposing the Queue Engine via REST API.
 * Runs on port 8113 (configurable via PORT env).
 * Also serves the kiosk self-check-in HTML page at /kiosk.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const QueueEngine = require('./queue-engine');
const { checkProximity, formatDistance } = require('./queue-gps');
const QueueLine = require('./queue-line');
const QueuePhoneCall = require('./queue-phone');
const { requireStaffAuth } = require('./middleware-auth');

// ─── Configuration ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 8113;
const SERVICE_TYPES = process.env.SERVICE_TYPES || 'restaurant,clinic,salon,service_center';
const AVG_SERVICE_TIME_MINUTES = parseInt(process.env.AVG_SERVICE_TIME_MINUTES, 10) || 15;
const NO_SHOW_TIMEOUT_MINUTES = parseInt(process.env.NO_SHOW_TIMEOUT_MINUTES, 10) || 10;
const PERSISTENCE_PATH = process.env.PERSISTENCE_PATH || path.join(__dirname, 'data', 'queue-state.json');

// ─── LINE Integration ──────────────────────────────────────────────────────

const lineBot = new QueueLine();

// ─── AI Phone Integration ──────────────────────────────────────────────────

const phoneCall = new QueuePhoneCall();

// ─── Business GPS Location ─────────────────────────────────────────────────

// Default business location (configurable via env or API)
let businessLocation = {
  lat: parseFloat(process.env.BUSINESS_LAT || '13.7563'),   // Default: Bangkok
  lng: parseFloat(process.env.BUSINESS_LNG || '100.5018'),
  name: process.env.BUSINESS_NAME || 'Business OS Store',
  address: process.env.BUSINESS_ADDRESS || '',
  proximityRadiusMeters: parseInt(process.env.PROXIMITY_RADIUS_METERS, 10) || 500,
};

// ─── Engine Initialisation ─────────────────────────────────────────────────

const engine = new QueueEngine({
  avgServiceTimeMinutes: AVG_SERVICE_TIME_MINUTES,
  noShowTimeoutMinutes: NO_SHOW_TIMEOUT_MINUTES,
  serviceTypes: SERVICE_TYPES,
});

// Load persisted state if available
try {
  if (fs.existsSync(PERSISTENCE_PATH)) {
    const raw = fs.readFileSync(PERSISTENCE_PATH, 'utf-8');
    engine.deserialize(raw);
    console.log(`[queue] Restored ${engine.tickets.size} tickets from persistence`);
  }
} catch (err) {
  console.warn('[queue] Could not restore persistence:', err.message);
}

// Periodic persistence (every 30s)
function persistState() {
  try {
    const dir = path.dirname(PERSISTENCE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = PERSISTENCE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, engine.serialize(), 'utf-8');
    fs.renameSync(tmpPath, PERSISTENCE_PATH);
  } catch (err) {
    console.error('[queue] Persistence write failed:', err.message);
  }
}
setInterval(persistState, 30_000);

// ─── Express App ───────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
// Skip JSON parsing for LINE webhook (we need raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/api/queue/v1/line/webhook') return next();
  express.json()(req, res, next);
});

// ─── API Routes ────────────────────────────────────────────────────────────

/**
 * GET /api/queue/v1/health
 * Health check
 */
app.get('/api/queue/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'queue-management',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    stats: engine.getStats(),
  });
});

/**
 * POST /api/queue/v1/join
 * Customer joins the queue.
 * Body: { serviceType, customerInfo: { name, phone, email, customerId? }, isVip? }
 */
app.post('/api/queue/v1/join', (req, res) => {
  try {
    const { serviceType, customerInfo, isVip, gps, lineUserId } = req.body;

    if (!serviceType) {
      return res.status(400).json({ error: 'serviceType is required' });
    }

    const ticket = engine.join({
      serviceType,
      customerInfo: customerInfo || {},
      isVip,
      gps: gps || (req.body.lat && req.body.lng ? { lat: req.body.lat, lng: req.body.lng } : null),
      lineUserId: lineUserId || (customerInfo && customerInfo.lineUserId) || '',
    });

    // ── ERP Integration hooks (non-blocking) ──
    // In production, these would call erp-mcp functions via the gateway.
    // For now if we detect the erp-mcp tools are available, we can integrate.
    // This is a placeholder for the customer lookup + notification pipeline.

    console.log(`[queue] Ticket ${ticket.ticketNumber} joined for ${serviceType}`);

    res.status(201).json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        position: ticket.position,
        estimatedWaitMinutes: ticket.estimatedWaitMinutes,
        joinedAt: ticket.joinedAt,
        serviceType: ticket.serviceType,
      },
    });
  } catch (err) {
    console.error('[queue] Join error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/queue/v1/status/:ticketNumber
 * Check queue position and status.
 */
app.get('/api/queue/v1/status/:ticketNumber', (req, res) => {
  try {
    const ticket = engine.getStatus(req.params.ticketNumber);
    if (!ticket) {
      return res.status(404).json({ error: `Ticket ${req.params.ticketNumber} not found` });
    }
    res.json({ success: true, ticket });
  } catch (err) {
    console.error('[queue] Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/call/:ticketNumber
 * Staff calls the next customer.
 * Body (optional): { counterId }
 */
app.post('/api/queue/v1/call/:ticketNumber', requireStaffAuth, (req, res) => {
  try {
    const { counterId } = req.body || {};
    const ticket = engine.callNext(req.params.ticketNumber, counterId);
    console.log(`[queue] Called ticket ${ticket.ticketNumber}${counterId ? ` to counter ${counterId}` : ''}`);
    res.json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        counterId: ticket.counterId,
        calledAt: ticket.calledAt,
      },
    });
  } catch (err) {
    console.error('[queue] Call error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/skip/:ticketNumber
 * Skip a ticket (remove without serving).
 */
app.post('/api/queue/v1/skip/:ticketNumber', requireStaffAuth, (req, res) => {
  try {
    const ticket = engine.skip(req.params.ticketNumber);
    console.log(`[queue] Skipped ticket ${ticket.ticketNumber}`);
    res.json({ success: true, ticket: { ticketNumber: ticket.ticketNumber, status: ticket.status } });
  } catch (err) {
    console.error('[queue] Skip error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/complete/:ticketNumber
 * Mark as served.
 */
app.post('/api/queue/v1/complete/:ticketNumber', requireStaffAuth, (req, res) => {
  try {
    const ticket = engine.complete(req.params.ticketNumber);
    console.log(`[queue] Completed ticket ${ticket.ticketNumber} (waited ${Math.round(ticket.actualWaitMinutes)} min)`);
    res.json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        actualWaitMinutes: ticket.actualWaitMinutes,
        servedAt: ticket.servedAt,
      },
    });
  } catch (err) {
    console.error('[queue] Complete error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/queue/v1/current
 * Staff view — full queue state.
 */
app.get('/api/queue/v1/current', (req, res) => {
  try {
    const queue = engine.getQueue();
    res.json({ success: true, ...queue });
  } catch (err) {
    console.error('[queue] Current error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/queue/v1/stats
 * Today's statistics.
 */
app.get('/api/queue/v1/stats', (req, res) => {
  try {
    const stats = engine.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error('[queue] Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/queue/v1/analytics
 * Historical analytics.
 */
app.get('/api/queue/v1/analytics', (req, res) => {
  try {
    const analytics = engine.getAnalytics();
    res.json({ success: true, analytics });
  } catch (err) {
    console.error('[queue] Analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SMART QUEUE: GPS / LINE / PHONE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/queue/v1/gps/location
 * Get the business location (for kiosk / app to display).
 */
app.get('/api/queue/v1/gps/location', (req, res) => {
  res.json({
    success: true,
    location: businessLocation,
  });
});

/**
 * PUT /api/queue/v1/gps/location
 * Update the business location.
 * Body: { lat, lng, name?, address?, proximityRadiusMeters? }
 */
app.put('/api/queue/v1/gps/location', requireStaffAuth, (req, res) => {
  try {
    const { lat, lng, name, address, proximityRadiusMeters } = req.body;
    if (lat !== undefined) businessLocation.lat = parseFloat(lat);
    if (lng !== undefined) businessLocation.lng = parseFloat(lng);
    if (name) businessLocation.name = name;
    if (address) businessLocation.address = address;
    if (proximityRadiusMeters) businessLocation.proximityRadiusMeters = parseInt(proximityRadiusMeters, 10);
    res.json({ success: true, location: businessLocation });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/gps/check
 * Check if a customer is within proximity of the business.
 * Body: { ticketNumber, gps: { lat, lng } }
 */
app.post('/api/queue/v1/gps/check', (req, res) => {
  try {
    const { ticketNumber, gps } = req.body;
    if (!ticketNumber) return res.status(400).json({ error: 'ticketNumber required' });
    if (!gps || gps.lat === undefined || gps.lng === undefined) {
      return res.status(400).json({ error: 'gps { lat, lng } required' });
    }

    // Update the ticket's GPS
    engine.updateGps(ticketNumber, gps);

    // Check proximity
    const result = checkProximity(
      gps,
      { lat: businessLocation.lat, lng: businessLocation.lng },
      businessLocation.proximityRadiusMeters
    );

    res.json({
      success: true,
      withinRange: result.withinRange,
      distanceMeters: result.distanceMeters,
      distanceKm: result.distanceKm,
      businessLocation: {
        name: businessLocation.name,
        lat: businessLocation.lat,
        lng: businessLocation.lng,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/line/send
 * Send a LINE message to a ticket holder.
 * Body: { ticketNumber, message? }
 * If no message, sends the confirm prompt.
 */
app.post('/api/queue/v1/line/send', requireStaffAuth, async (req, res) => {
  try {
    const { ticketNumber, message } = req.body;
    if (!ticketNumber) return res.status(400).json({ error: 'ticketNumber required' });

    const ticket = engine.tickets.get(ticketNumber);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const lineUserId = ticket.customerInfo.lineUserId;
    if (!lineUserId) return res.status(400).json({ error: 'No LINE user ID for this ticket' });

    const text = message || (
      `🎫 *Your Turn is Near!* 🎫\n\n` +
      `Ticket: *${ticketNumber}*\n` +
      `Service: *${ticket.serviceType}*\n` +
      `Wait: *~${ticket.estimatedWaitMinutes} minutes*\n\n` +
      `Please come to ${businessLocation.name}`
    );

    const result = await lineBot.pushMessage(lineUserId, text);
    engine.markLineNotified(ticketNumber);
    res.json({ success: true, line: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/line/confirm
 * Send LINE confirm prompt and wait for reply.
 * Body: { ticketNumber }
 */
app.post('/api/queue/v1/line/confirm', async (req, res) => {
  try {
    const { ticketNumber } = req.body;
    if (!ticketNumber) return res.status(400).json({ error: 'ticketNumber required' });

    const ticket = engine.tickets.get(ticketNumber);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const lineUserId = ticket.customerInfo.lineUserId;
    if (!lineUserId) return res.status(400).json({ error: 'No LINE user ID' });

    const result = await lineBot.sendConfirm(lineUserId, ticketNumber, ticket.estimatedWaitMinutes);
    res.json({ success: true, line: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/line/webhook
 * LINE Messaging API webhook receiver.
 */
app.post('/api/queue/v1/line/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Respond to LINE immediately (required)
  res.json({});

  try {
    const signature = req.headers['x-line-signature'];
    const bodyStr = req.body.toString();

    // Verify signature
    if (lineBot.enabled && !lineBot.verifySignature(signature, bodyStr)) {
      console.warn('[queue] Invalid LINE signature');
      return;
    }

    const body = JSON.parse(bodyStr);
    const events = lineBot.parseWebhook(body);

    for (const event of events) {
      if (event.type === 'message') {
        const reply = lineBot.parseConfirmReply(event.userId, event.text);
        const tickets = engine.findTicketsByLineUser(event.userId);
        const activeTicket = tickets.find(t => t.status === 'waiting' || t.status === 'called');

        if (!activeTicket) {
          console.log(`[queue] LINE: ${event.userId} replied but no active ticket`);
          continue;
        }

        if (reply.action === 'confirm') {
          engine.confirmLine(activeTicket.ticketNumber, true);
          console.log(`[queue] LINE: Ticket ${activeTicket.ticketNumber} CONFIRMED via LINE`);
        } else if (reply.action === 'cancel') {
          engine.confirmLine(activeTicket.ticketNumber, false);
          try { engine.skip(activeTicket.ticketNumber); } catch (e) { /* already skipped */ }
          console.log(`[queue] LINE: Ticket ${activeTicket.ticketNumber} CANCELLED via LINE`);
        } else if (reply.action === 'delay') {
          engine.confirmLine(activeTicket.ticketNumber, true);
          // Recalculate with extra 10 minutes
          activeTicket.estimatedWaitMinutes += 10;
          console.log(`[queue] LINE: Ticket ${activeTicket.ticketNumber} requested 10 min delay`);
        }
      } else if (event.type === 'follow') {
        console.log(`[queue] LINE: User ${event.userId} followed the bot`);
      } else if (event.type === 'unfollow') {
        console.log(`[queue] LINE: User ${event.userId} unfollowed the bot`);
      }
    }
  } catch (err) {
    console.error('[queue] LINE webhook error:', err.message);
  }
});

/**
 * POST /api/queue/v1/phone/call
 * Trigger an AI phone call to the customer.
 * Body: { ticketNumber }
 */
app.post('/api/queue/v1/phone/call', requireStaffAuth, async (req, res) => {
  try {
    const { ticketNumber } = req.body;
    if (!ticketNumber) return res.status(400).json({ error: 'ticketNumber required' });

    const ticket = engine.tickets.get(ticketNumber);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const phone = ticket.customerInfo.phone;
    if (!phone) return res.status(400).json({ error: 'No phone number for this ticket' });

    const announcement = phoneCall.generateAnnouncement({
      ticketNumber,
      businessName: businessLocation.name,
      estimatedWaitMinutes: ticket.estimatedWaitMinutes,
      serviceType: ticket.serviceType,
    });

    const result = await phoneCall.makeCall(phone, announcement, {
      ticketNumber,
      businessName: businessLocation.name,
    });

    engine.markPhoneNotified(ticketNumber);
    res.json({ success: true, phone: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/queue/v1/smart/notify
 * Smart notification: checks queue and auto-sends LINE/Phone to customers
 * whose turn is near. Designed to be called via cron/scheduler.
 */
app.post('/api/queue/v1/smart/notify', requireStaffAuth, async (req, res) => {
  try {
    const results = { line: { sent: 0, errors: 0 }, phone: { calls: 0, errors: 0 } };

    // LINE notifications (5 min threshold)
    const lineCandidates = engine.getTicketsForLineNotify(5);
    for (const ticket of lineCandidates) {
      const lineUserId = ticket.customerInfo.lineUserId;
      if (lineUserId) {
        const r = await lineBot.sendConfirm(lineUserId, ticket.ticketNumber, ticket.estimatedWaitMinutes);
        if (r.success) {
          engine.markLineNotified(ticket.ticketNumber);
          results.line.sent++;
        } else {
          results.line.errors++;
        }
      }
    }

    // Phone calls (3 min threshold, only if no LINE or not confirmed)
    const phoneCandidates = engine.getTicketsForPhoneCall(3);
    for (const ticket of phoneCandidates) {
      const phone = ticket.customerInfo.phone;
      if (phone && !ticket.lineConfirmed) {
        const announcement = phoneCall.generateAnnouncement({
          ticketNumber: ticket.ticketNumber,
          businessName: businessLocation.name,
          estimatedWaitMinutes: ticket.estimatedWaitMinutes,
        });
        const r = await phoneCall.makeCall(phone, announcement, { ticketNumber: ticket.ticketNumber });
        if (r.success || r.simulated) {
          engine.markPhoneNotified(ticket.ticketNumber);
          results.phone.calls++;
        } else {
          results.phone.errors++;
        }
      }
    }

    res.json({
      success: true,
      queueLength: engine.queue.length,
      notified: results,
      smartEnabled: { line: lineBot.enabled, phone: phoneCall.enabled },
    });
  } catch (err) {
    console.error('[queue] Smart notify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/queue/v1/smart/config
 * Get Smart Queue configuration.
 */
app.get('/api/queue/v1/smart/config', (req, res) => {
  res.json({
    success: true,
    businessLocation,
    line: lineBot.status(),
    phone: phoneCall.status(),
    gpsRadiusMeters: businessLocation.proximityRadiusMeters,
  });
});

// ─── Kiosk View ────────────────────────────────────────────────────────────

// Serve the kiosk HTML page at /kiosk
const kioskHtmlPath = path.join(__dirname, 'kiosk-view.html');
app.get('/kiosk', (req, res) => {
  res.sendFile(kioskHtmlPath);
});

// ─── Error Handling ────────────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[queue] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start Server ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  🏪 Queue Management Service`);
  console.log(`  ─────────────────────────`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  Service types: ${SERVICE_TYPES}`);
  console.log(`  Avg service time: ${AVG_SERVICE_TIME_MINUTES} min`);
  console.log(`  No-show timeout: ${NO_SHOW_TIMEOUT_MINUTES} min`);
  console.log(`  Persistence: ${PERSISTENCE_PATH}`);
  console.log(`  Kiosk UI: http://localhost:${PORT}/kiosk`);
  console.log(`  API:     http://localhost:${PORT}/api/queue/v1/health\n`);
});

module.exports = app;
