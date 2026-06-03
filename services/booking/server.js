'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

const engine = require('./booking-engine');

const PORT = parseInt(process.env.PORT || '8115', 10);
const DEFAULT_TENANT = process.env.DEFAULT_TENANT_ID || 'default';

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

// ── Request helpers ─────────────────────────────────────────────────────────

function tenantFromReq(req) {
  return req.headers['x-tenant-id'] || req.query.tenantId || DEFAULT_TENANT;
}

function ok(res, data, status = 200) {
  return res.status(status).json({ status: 'ok', data });
}

function fail(res, error, status = 400) {
  return res.status(status).json({ status: 'error', error });
}

function handleError(res, err) {
  console.error('[BookingServer]', err);
  return res.status(500).json({ status: 'error', error: 'Internal server error' });
}

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/api/booking/v1/health', (req, res) => {
  ok(res, {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Services ────────────────────────────────────────────────────────────────

app.post('/api/booking/v1/services', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { action, serviceId } = req.body;

    switch (action) {
      case 'create': {
        const service = engine.createService(tenantId, req.body);
        return ok(res, service, 201);
      }
      case 'get': {
        if (!serviceId) return fail(res, 'serviceId required');
        const service = engine.getService(tenantId, serviceId);
        if (!service) return fail(res, 'Service not found', 404);
        return ok(res, service);
      }
      case 'list': {
        const activeOnly = req.body.activeOnly !== false;
        const services = engine.listServices(tenantId, activeOnly);
        return ok(res, services);
      }
      case 'update': {
        if (!serviceId) return fail(res, 'serviceId required');
        const updated = engine.updateService(tenantId, serviceId, req.body);
        if (!updated) return fail(res, 'Service not found', 404);
        return ok(res, updated);
      }
      case 'delete': {
        if (!serviceId) return fail(res, 'serviceId required');
        const deleted = engine.deleteService(tenantId, serviceId);
        if (!deleted) return fail(res, 'Service not found', 404);
        return ok(res, { deleted: true });
      }
      default:
        return fail(res, `Unknown action: ${action}. Use create|get|list|update|delete`);
    }
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Staff (accessible via services endpoint or dedicated route) ─────────────

app.post('/api/booking/v1/staff', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { action, staffId } = req.body;

    switch (action) {
      case 'create': {
        const staff = engine.createStaff(tenantId, req.body);
        return ok(res, staff, 201);
      }
      case 'list': {
        const activeOnly = req.body.activeOnly !== false;
        const staffList = engine.listStaff(tenantId, activeOnly);
        return ok(res, staffList);
      }
      case 'get': {
        if (!staffId) return fail(res, 'staffId required');
        const staff = engine.getStaff(tenantId, staffId);
        if (!staff) return fail(res, 'Staff not found', 404);
        return ok(res, staff);
      }
      case 'delete': {
        if (!staffId) return fail(res, 'staffId required');
        const deleted = engine.deleteStaff(tenantId, staffId);
        if (!deleted) return fail(res, 'Staff not found', 404);
        return ok(res, { deleted: true });
      }
      case 'set-breaks': {
        if (!staffId) return fail(res, 'staffId required');
        const breaks = req.body.breaks;
        if (!Array.isArray(breaks)) return fail(res, 'breaks array required');
        const result = engine.setBreaks(tenantId, staffId, breaks);
        if (!result) return fail(res, 'Staff not found', 404);
        return ok(res, result);
      }
      case 'get-breaks': {
        if (!staffId) return fail(res, 'staffId required');
        const breaks = engine.getBreaks(tenantId, staffId);
        return ok(res, breaks);
      }
      default:
        return fail(res, `Unknown action: ${action}. Use create|list|get|delete|set-breaks|get-breaks`);
    }
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Slots ───────────────────────────────────────────────────────────────────

app.post('/api/booking/v1/slots', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { date, serviceId, staffId } = req.body;

    if (!date) return fail(res, 'date required (YYYY-MM-DD)');

    const slots = engine.generateSlots(tenantId, date, serviceId, staffId);
    return ok(res, slots);
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Book ────────────────────────────────────────────────────────────────────

app.post('/api/booking/v1/book', async (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { serviceId, staffId, startTime, customerInfo, notes, collectDeposit } = req.body;

    if (!serviceId) return fail(res, 'serviceId required');
    if (!staffId) return fail(res, 'staffId required');
    if (!startTime) return fail(res, 'startTime required (ISO format)');
    if (!customerInfo || !customerInfo.name) return fail(res, 'customerInfo.name required');

    const result = engine.createBooking(tenantId, {
      serviceId, staffId, startTime, customerInfo, notes,
    });

    if (result.error) return fail(res, result.error, 409);

    const { booking } = result;

    // ERP integration stubs (fire-and-forget)
    if (process.env.ERP_MCP_ENABLED === 'true') {
      try {
        await engine.createBookingOrder(tenantId, booking);
        if (collectDeposit) {
          const depositAmount = typeof collectDeposit === 'number' ? collectDeposit : (booking.price * 0.2);
          await engine.recordDeposit(tenantId, booking, depositAmount);
        }
        await engine.sendBookingNotification(tenantId, booking, 'confirmation');
      } catch (mcpErr) {
        console.warn('[BookingServer] ERP stub warning:', mcpErr.message);
      }
    }

    return ok(res, booking, 201);
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Cancel ──────────────────────────────────────────────────────────────────

app.post('/api/booking/v1/cancel/:bookingId', async (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { bookingId } = req.params;

    const result = engine.cancelBooking(tenantId, bookingId);
    if (result.error) return fail(res, result.error, 404);

    if (process.env.ERP_MCP_ENABLED === 'true') {
      try {
        await engine.sendBookingNotification(tenantId, result.booking, 'cancellation');
      } catch (mcpErr) {
        console.warn('[BookingServer] Cancellation notification stub warning:', mcpErr.message);
      }
    }

    return ok(res, result.booking);
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Bookings List ───────────────────────────────────────────────────────────

app.get('/api/booking/v1/bookings', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { date, customerEmail, staffId, serviceId, status } = req.query;

    const filters = {};
    if (date) filters.date = date;
    if (customerEmail) filters.customerEmail = customerEmail;
    if (staffId) filters.staffId = staffId;
    if (serviceId) filters.serviceId = serviceId;
    if (status) filters.status = status;

    const bookings = engine.listBookings(tenantId, filters);
    return ok(res, bookings);
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Check Availability ──────────────────────────────────────────────────────

app.post('/api/booking/v1/check-availability', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { serviceId, staffId, startTime } = req.body;

    if (!serviceId) return fail(res, 'serviceId required');
    if (!staffId) return fail(res, 'staffId required');
    if (!startTime) return fail(res, 'startTime required');

    const result = engine.checkAvailability(tenantId, { serviceId, staffId, startTime });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Waitlist ────────────────────────────────────────────────────────────────

app.post('/api/booking/v1/waitlist', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const { action } = req.body;

    switch (action) {
      case 'join': {
        const { serviceId, staffId, date, customerInfo } = req.body;
        if (!serviceId) return fail(res, 'serviceId required');
        if (!staffId) return fail(res, 'staffId required');
        if (!date) return fail(res, 'date required (YYYY-MM-DD)');
        if (!customerInfo || !customerInfo.email) return fail(res, 'customerInfo.email required');

        const entry = engine.joinWaitlist(tenantId, { serviceId, staffId, date, customerInfo });
        return ok(res, entry, 201);
      }
      case 'list': {
        const entries = engine.listWaitlist(tenantId, req.body);
        return ok(res, entries);
      }
      default:
        return fail(res, `Unknown action: ${action}. Use join|list`);
    }
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Calendar Export / Import ────────────────────────────────────────────────

app.get('/api/booking/v1/calendar/export', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const ical = engine.exportToIcal(tenantId);
    if (!ical) return fail(res, 'No calendar data for tenant', 404);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.ics"');
    return res.send(ical);
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/booking/v1/calendar/import', (req, res) => {
  try {
    const { icalData } = req.body;
    if (!icalData) return fail(res, 'icalData required');

    const events = engine.importFromIcal(icalData);
    return ok(res, { imported: events.length, events });
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Configuration ───────────────────────────────────────────────────────────

app.post('/api/booking/v1/config', (req, res) => {
  try {
    const tenantId = tenantFromReq(req);
    const tenant = engine.store.ensureTenant(tenantId);

    if (!tenant.config) tenant.config = {};
    const { businessHours } = req.body;

    if (businessHours) {
      tenant.config.businessHours = businessHours;
      engine.persist();
    }

    return ok(res, {
      businessHours: tenant.config.businessHours || '09:00-18:00',
    });
  } catch (err) {
    return handleError(res, err);
  }
});

// ── 404 catch-all ───────────────────────────────────────────────────────────

app.use((req, res) => {
  return fail(res, `Route not found: ${req.method} ${req.path}`, 404);
});

// ── Global error handler ────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[BookingServer Unhandled]', err);
  return res.status(500).json({ status: 'error', error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[BookingServer] Booking Engine running on port ${PORT}`);
  console.log(`[BookingServer] Health: http://localhost:${PORT}/api/booking/v1/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[BookingServer] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[BookingServer] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});

module.exports = app;
