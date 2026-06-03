'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

/**
 * Booking Engine — Core scheduling logic.
 *
 * In-memory calendar with optional JSON-file persistence.
 * Supports:
 *   - Service / staff / customer management
 *   - 15-min slot granularity with configurable duration
 *   - Conflict detection (no double-booking, no overlapping)
 *   - Business hours & break scheduling
 *   - Waitlist management
 *   - Google Calendar iCal export/import stub
 *   - ERP MCP integration stubs
 */

const TENANT = process.env.DEFAULT_TENANT_ID || 'default';
const PERSIST_PATH = process.env.BOOKING_DATA_PATH || path.join(__dirname, '.data', 'booking-store.json');

// ── In-Memory Store ────────────────────────────────────────────────────────

const store = {
  // Keyed by tenantId → { services: {}, staff: {}, bookings: {}, waitlist: {}, breaks: {} }
  tenants: {},

  ensureTenant(tenantId) {
    if (!this.tenants[tenantId]) {
      this.tenants[tenantId] = {
        services: {},
        staff: {},
        bookings: {},     // bookingId → Booking
        waitlist: [],     // [{ id, tenantId, serviceId, staffId, date, createdAt }]
        breaks: {},       // staffId → Break[]
      };
    }
    return this.tenants[tenantId];
  },

  getTenant(tenantId) {
    return this.tenants[tenantId] || null;
  },
};

// ── Persistence ─────────────────────────────────────────────────────────────

function persist() {
  try {
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(store.tenants, null, 2), 'utf-8');
  } catch (err) {
    console.error('[BookingEngine] Persist failed:', err.message);
  }
}

function load() {
  try {
    if (fs.existsSync(PERSIST_PATH)) {
      const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
      store.tenants = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[BookingEngine] Load failed, starting fresh:', err.message);
    store.tenants = {};
  }
}

// Load on startup
load();

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;
const SLOT_GRANULARITY_MS = 15 * MINUTE_MS;

function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function toMinutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function setTime(date, minutes) {
  const d = new Date(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function toDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse business hours from config. Supports eg "09:00-12:00,13:00-18:00"
 * to handle a lunch break, or simple "09:00-18:00".
 */
function parseBusinessHours(tenantId) {
  const tenant = store.getTenant(tenantId);
  const raw = (tenant && tenant.config && tenant.config.businessHours)
    || `${process.env.BUSINESS_HOURS_START || '09:00'}-${process.env.BUSINESS_HOURS_END || '18:00'}`;
  return raw.split(',').map(seg => {
    const [start, end] = seg.trim().split('-');
    return { start: parseTime(start), end: parseTime(end) };
  });
}

/**
 * Get the default slot duration for a given service.
 */
function getSlotDuration(service) {
  return (service && service.durationMinutes) || parseInt(process.env.SLOT_DURATION_MINUTES || '60', 10);
}

// ── Service CRUD ────────────────────────────────────────────────────────────

function createService(tenantId, data) {
  const tenant = store.ensureTenant(tenantId);
  const id = uuidv4();
  const service = {
    id,
    tenantId,
    name: data.name,
    description: data.description || '',
    durationMinutes: data.durationMinutes || parseInt(process.env.SLOT_DURATION_MINUTES || '60', 10),
    price: data.price || 0,
    currency: data.currency || 'USD',
    color: data.color || '#3B82F6',
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tenant.services[id] = service;
  persist();
  return service;
}

function getService(tenantId, serviceId) {
  const tenant = store.getTenant(tenantId);
  return tenant ? tenant.services[serviceId] || null : null;
}

function listServices(tenantId, activeOnly = true) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];
  const all = Object.values(tenant.services);
  return activeOnly ? all.filter(s => s.isActive) : all;
}

function updateService(tenantId, serviceId, data) {
  const tenant = store.getTenant(tenantId);
  if (!tenant || !tenant.services[serviceId]) return null;
  const svc = tenant.services[serviceId];
  Object.assign(svc, data, { updatedAt: new Date().toISOString() });
  persist();
  return svc;
}

function deleteService(tenantId, serviceId) {
  const tenant = store.getTenant(tenantId);
  if (!tenant || !tenant.services[serviceId]) return false;
  tenant.services[serviceId].isActive = false;
  persist();
  return true;
}

// ── Staff CRUD ──────────────────────────────────────────────────────────────

function createStaff(tenantId, data) {
  const tenant = store.ensureTenant(tenantId);
  const id = uuidv4();
  const staff = {
    id,
    tenantId,
    name: data.name,
    email: data.email || '',
    phone: data.phone || '',
    color: data.color || '#10B981',
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tenant.staff[id] = staff;
  persist();
  return staff;
}

function getStaff(tenantId, staffId) {
  const tenant = store.getTenant(tenantId);
  return tenant ? tenant.staff[staffId] || null : null;
}

function listStaff(tenantId, activeOnly = true) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];
  const all = Object.values(tenant.staff);
  return activeOnly ? all.filter(s => s.isActive) : all;
}

function deleteStaff(tenantId, staffId) {
  const tenant = store.getTenant(tenantId);
  if (!tenant || !tenant.staff[staffId]) return false;
  tenant.staff[staffId].isActive = false;
  persist();
  return true;
}

// ── Break Scheduling ────────────────────────────────────────────────────────

function setBreaks(tenantId, staffId, breaks) {
  const tenant = store.ensureTenant(tenantId);
  if (!tenant.staff[staffId]) return null;
  tenant.breaks[staffId] = breaks.map(b => ({
    start: parseTime(b.start),
    end: parseTime(b.end),
    label: b.label || 'Break',
  }));
  persist();
  return tenant.breaks[staffId];
}

function getBreaks(tenantId, staffId) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];
  return tenant.breaks[staffId] || [];
}

// ── Slot Generation ─────────────────────────────────────────────────────────

/**
 * Generate available time slots for a date/service/staff combination.
 *
 * @param {string} tenantId
 * @param {string} dateStr — YYYY-MM-DD
 * @param {string} [serviceId] — if omitted, uses default duration
 * @param {string} [staffId] — if omitted, generates for all active staff
 * @returns {Array<{ start: string, end: string, staffId: string, staffName: string }>}
 */
function generateSlots(tenantId, dateStr, serviceId, staffId) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];

  const service = serviceId ? tenant.services[serviceId] : null;
  const duration = getSlotDuration(service);
  const businessRanges = parseBusinessHours(tenantId);

  const date = new Date(dateStr + 'T00:00:00Z');
  const now = new Date();
  const isToday = isSameDay(date, now);
  const nowMinutes = isToday ? toMinutesSinceMidnight(now) : 0;

  // Determine which staff to generate for
  let staffList = [];
  if (staffId) {
    const s = tenant.staff[staffId];
    if (s && s.isActive) staffList.push(s);
  } else {
    staffList = Object.values(tenant.staff).filter(s => s.isActive);
  }

  const slots = [];

  for (const staff of staffList) {
    const staffBreaks = tenant.breaks[staff.id] || [];
    const existingBookings = getBookingsForStaffDate(tenantId, staff.id, dateStr);

    for (const range of businessRanges) {
      let cursor = range.start;

      while (cursor + duration <= range.end) {
        // Check break conflict
        const slotEnd = cursor + duration;
        const inBreak = staffBreaks.some(b =>
          (cursor >= b.start && cursor < b.end)
          || (slotEnd > b.start && slotEnd <= b.end)
          || (b.start >= cursor && b.start < slotEnd)
        );
        if (inBreak) {
          cursor += SLOT_GRANULARITY_MS / MINUTE_MS;
          continue;
        }

        // Check past time (today only)
        if (isToday && cursor <= nowMinutes) {
          cursor += SLOT_GRANULARITY_MS / MINUTE_MS;
          continue;
        }

        // Check conflict with existing booking
        const hasConflict = existingBookings.some(b => {
          const bStart = toMinutesSinceMidnight(new Date(b.startTime));
          const bEnd = bStart + b.durationMinutes;
          return slotEnd > bStart && cursor < bEnd;
        });

        if (!hasConflict) {
          slots.push({
            start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
            end: `${String(Math.floor((cursor + duration) / 60)).padStart(2, '0')}:${String((cursor + duration) % 60).padStart(2, '0')}`,
            staffId: staff.id,
            staffName: staff.name,
            date: dateStr,
            durationMinutes: duration,
          });
        }

        cursor += SLOT_GRANULARITY_MS / MINUTE_MS;
      }
    }
  }

  return slots;
}

// ── Bookings ────────────────────────────────────────────────────────────────

/**
 * Retrieve bookings for a specific staff member on a date.
 */
function getBookingsForStaffDate(tenantId, staffId, dateStr) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];
  return Object.values(tenant.bookings).filter(b =>
    b.staffId === staffId
    && b.status !== 'cancelled'
    && toDateKey(new Date(b.startTime)) === dateStr
  );
}

/**
 * Create a booking.
 *
 * @param {string} tenantId
 * @param {object} data — { serviceId, staffId, startTime (ISO), customerInfo, notes }
 * @returns {{ booking: object|null, error: string|null }}
 */
function createBooking(tenantId, data) {
  const tenant = store.ensureTenant(tenantId);

  // Validate service
  const service = getService(tenantId, data.serviceId);
  if (!service || !service.isActive) {
    return { booking: null, error: 'Service not found or inactive' };
  }

  // Validate staff
  const staff = getStaff(tenantId, data.staffId);
  if (!staff || !staff.isActive) {
    return { booking: null, error: 'Staff not found or inactive' };
  }

  const startTime = new Date(data.startTime);
  if (isNaN(startTime.getTime())) {
    return { booking: null, error: 'Invalid startTime' };
  }

  const duration = service.durationMinutes;
  const endMinutes = toMinutesSinceMidnight(startTime) + duration;
  const startMinutes = toMinutesSinceMidnight(startTime);

  // Check business hours
  const businessRanges = parseBusinessHours(tenantId);
  const isInBusinessHours = businessRanges.some(r =>
    startMinutes >= r.start && endMinutes <= r.end
  );
  if (!isInBusinessHours) {
    return { booking: null, error: 'Time outside business hours' };
  }

  // Check staff breaks
  const staffBreaks = tenant.breaks[data.staffId] || [];
  const inBreak = staffBreaks.some(b =>
    (startMinutes >= b.start && startMinutes < b.end)
    || (endMinutes > b.start && endMinutes <= b.end)
    || (b.start >= startMinutes && b.start < endMinutes)
  );
  if (inBreak) {
    return { booking: null, error: 'Staff is on break during this time' };
  }

  // Conflict detection: no overlapping bookings for the same staff
  const dateKey = toDateKey(startTime);
  const existing = getBookingsForStaffDate(tenantId, data.staffId, dateKey);
  const conflict = existing.some(b => {
    const bStart = toMinutesSinceMidnight(new Date(b.startTime));
    const bEnd = bStart + b.durationMinutes;
    return endMinutes > bStart && startMinutes < bEnd;
  });

  if (conflict) {
    return { booking: null, error: 'Time slot is already booked' };
  }

  // Past check
  if (startTime < new Date()) {
    return { booking: null, error: 'Cannot book in the past' };
  }

  // Create booking
  const id = uuidv4();
  const booking = {
    id,
    tenantId,
    serviceId: data.serviceId,
    staffId: data.staffId,
    startTime: startTime.toISOString(),
    durationMinutes: duration,
    endTime: new Date(startTime.getTime() + duration * MINUTE_MS).toISOString(),
    customerInfo: {
      name: data.customerInfo?.name || '',
      email: data.customerInfo?.email || '',
      phone: data.customerInfo?.phone || '',
      notes: data.customerInfo?.notes || '',
    },
    notes: data.notes || '',
    status: 'confirmed',
    price: service.price,
    currency: service.currency,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tenant.bookings[id] = booking;
  persist();

  // Remove matching waitlist entries
  removeMatchedWaitlist(tenantId, data.staffId, dateKey);

  return { booking, error: null };
}

/**
 * Cancel a booking.
 */
function cancelBooking(tenantId, bookingId) {
  const tenant = store.getTenant(tenantId);
  if (!tenant || !tenant.bookings[bookingId]) {
    return { booking: null, error: 'Booking not found' };
  }

  const booking = tenant.bookings[bookingId];
  if (booking.status === 'cancelled') {
    return { booking: null, error: 'Booking already cancelled' };
  }

  booking.status = 'cancelled';
  booking.updatedAt = new Date().toISOString();
  persist();

  return { booking, error: null };
}

/**
 * List bookings with optional filters.
 */
function listBookings(tenantId, filters = {}) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];

  let results = Object.values(tenant.bookings);

  if (filters.date) {
    const fDate = toDateKey(new Date(filters.date));
    results = results.filter(b => toDateKey(new Date(b.startTime)) === fDate);
  }
  if (filters.customerEmail) {
    results = results.filter(b =>
      b.customerInfo.email.toLowerCase().includes(filters.customerEmail.toLowerCase())
    );
  }
  if (filters.staffId) {
    results = results.filter(b => b.staffId === filters.staffId);
  }
  if (filters.serviceId) {
    results = results.filter(b => b.serviceId === filters.serviceId);
  }
  if (filters.status) {
    results = results.filter(b => b.status === filters.status);
  }

  // Sort by startTime ascending
  results.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  return results;
}

// ── Availability Check ──────────────────────────────────────────────────────

function checkAvailability(tenantId, data) {
  const { serviceId, staffId, startTime } = data;

  const service = getService(tenantId, serviceId);
  if (!service || !service.isActive) {
    return { available: false, reason: 'Service not found or inactive' };
  }

  const staff = getStaff(tenantId, staffId);
  if (!staff || !staff.isActive) {
    return { available: false, reason: 'Staff not found or inactive' };
  }

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    return { available: false, reason: 'Invalid startTime' };
  }

  const duration = service.durationMinutes;
  const dateKey = toDateKey(start);
  const startMinutes = toMinutesSinceMidnight(start);
  const endMinutes = startMinutes + duration;

  // Business hours
  const bizRanges = parseBusinessHours(tenantId);
  const inBizHours = bizRanges.some(r => startMinutes >= r.start && endMinutes <= r.end);
  if (!inBizHours) {
    return { available: false, reason: 'Outside business hours' };
  }

  // Breaks
  const tenant = store.getTenant(tenantId);
  const staffBreaks = tenant?.breaks[staffId] || [];
  for (const b of staffBreaks) {
    if ((startMinutes >= b.start && startMinutes < b.end)
      || (endMinutes > b.start && endMinutes <= b.end)
      || (b.start >= startMinutes && b.start < endMinutes)) {
      return { available: false, reason: 'Staff on break' };
    }
  }

  // Conflict
  const existing = getBookingsForStaffDate(tenantId, staffId, dateKey);
  for (const b of existing) {
    const bStart = toMinutesSinceMidnight(new Date(b.startTime));
    const bEnd = bStart + b.durationMinutes;
    if (endMinutes > bStart && startMinutes < bEnd) {
      return { available: false, reason: 'Time slot already booked' };
    }
  }

  // Past
  if (start < new Date()) {
    return { available: false, reason: 'Cannot book in the past' };
  }

  return { available: true, reason: null };
}

// ── Waitlist ────────────────────────────────────────────────────────────────

function joinWaitlist(tenantId, data) {
  const tenant = store.ensureTenant(tenantId);
  const entry = {
    id: uuidv4(),
    tenantId,
    serviceId: data.serviceId,
    staffId: data.staffId,
    date: data.date,
    customerInfo: {
      name: data.customerInfo?.name || '',
      email: data.customerInfo?.email || '',
      phone: data.customerInfo?.phone || '',
    },
    createdAt: new Date().toISOString(),
  };
  tenant.waitlist.push(entry);
  persist();
  return entry;
}

function listWaitlist(tenantId, filters = {}) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return [];

  let results = tenant.waitlist;
  if (filters.serviceId) results = results.filter(w => w.serviceId === filters.serviceId);
  if (filters.staffId) results = results.filter(w => w.staffId === filters.staffId);
  if (filters.date) results = results.filter(w => w.date === filters.date);

  return results;
}

function removeMatchedWaitlist(tenantId, staffId, dateKey) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return;

  const before = tenant.waitlist.length;
  tenant.waitlist = tenant.waitlist.filter(w =>
    !(w.staffId === staffId && w.date === dateKey)
  );
  if (tenant.waitlist.length !== before) persist();
}

// ── Google Calendar Sync Stubs ──────────────────────────────────────────────

function exportToIcal(tenantId) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) return null;

  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BusinessOS//BookingEngine//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const b of Object.values(tenant.bookings)) {
    if (b.status === 'cancelled') continue;
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    const uid = b.id + '@businessos.local';
    const dtStart = formatIcalDate(start);
    const dtEnd = formatIcalDate(end);
    const summary = `Booking: ${b.customerInfo.name || 'Unknown'} - ${b.id.slice(0, 8)}`;

    ical.push('BEGIN:VEVENT');
    ical.push(`UID:${uid}`);
    ical.push(`DTSTART:${dtStart}`);
    ical.push(`DTEND:${dtEnd}`);
    ical.push(`SUMMARY:${summary}`);
    ical.push(`DESCRIPTION:Service ${b.serviceId} | Staff ${b.staffId}`);
    ical.push('END:VEVENT');
  }

  ical.push('END:VCALENDAR');
  return ical.join('\r\n');
}

function importFromIcal(icalData) {
  // Stub — parses basic VEVENT blocks and returns an array of { start, end, summary }
  const events = [];
  const lines = icalData.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
    } else if (trimmed === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current) {
      if (trimmed.startsWith('DTSTART:')) current.start = trimmed.slice(8);
      else if (trimmed.startsWith('DTEND:')) current.end = trimmed.slice(6);
      else if (trimmed.startsWith('SUMMARY:')) current.summary = trimmed.slice(8);
    }
  }

  return events.map(e => ({
    start: parseIcalDate(e.start),
    end: parseIcalDate(e.end),
    summary: e.summary || '',
  }));
}

function formatIcalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function parseIcalDate(str) {
  // "20260603T090000Z" → ISO
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const day = str.slice(6, 8);
  const hour = str.slice(9, 11);
  const min = str.slice(11, 13);
  const sec = str.slice(13, 15);
  return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
}

// ── ERP MCP Integration Stubs ───────────────────────────────────────────────

/**
 * Placeholder for erp-mcp__get_customer.
 * In production this would call the MCP tool.
 */
async function lookupCustomer(tenantId, email) {
  // Stub — returns basic customer shape
  return {
    id: null,
    name: '',
    email,
    exists: false,
  };
}

/**
 * Placeholder for erp-mcp__create_order.
 * In production this creates a service order in the ERP.
 */
async function createBookingOrder(tenantId, booking) {
  // Stub
  return { orderId: null, status: 'simulated' };
}

/**
 * Placeholder for erp-mcp__create_transaction.
 * Records a deposit or payment against a booking.
 */
async function recordDeposit(tenantId, booking, amount) {
  // Stub
  return { transactionId: null, status: 'simulated' };
}

/**
 * Placeholder for erp-mcp__send_notification.
 * Sends booking confirmation / reminder via configured channel.
 */
async function sendBookingNotification(tenantId, booking, type) {
  // Stub — type: 'confirmation' | 'reminder' | 'cancellation'
  return { sent: true, channel: 'simulated' };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Store management
  store,
  persist,
  load,

  // Services
  createService,
  getService,
  listServices,
  updateService,
  deleteService,

  // Staff
  createStaff,
  getStaff,
  listStaff,
  deleteStaff,

  // Breaks
  setBreaks,
  getBreaks,

  // Slots
  generateSlots,

  // Bookings
  createBooking,
  cancelBooking,
  listBookings,

  // Availability / Waitlist
  checkAvailability,
  joinWaitlist,
  listWaitlist,

  // Calendar sync stubs
  exportToIcal,
  importFromIcal,

  // ERP integration stubs
  lookupCustomer,
  createBookingOrder,
  recordDeposit,
  sendBookingNotification,
};
