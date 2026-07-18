'use strict';

/**
 * Queue Engine — Core Queue Management Logic
 *
 * In-memory queue with sorted data structures.
 * Designed for WebSocket upgrade path (events emitted via EventEmitter).
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class QueueEngine extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} options.avgServiceTimeMinutes  Average service time used for ETAs
   * @param {number} options.noShowTimeoutMinutes   How long before a called-but-unserved ticket is marked no-show
   */
  constructor(options = {}) {
    super();
    this.avgServiceTimeMinutes = options.avgServiceTimeMinutes || 15;
    this.noShowTimeoutMinutes = options.noShowTimeoutMinutes || 10;

    /** @type {Map<string, Ticket>} ticketNumber → Ticket */
    this.tickets = new Map();

    /** @type {Ticket[]} Active queue (sorted: priority desc, joinedAt asc) */
    this.queue = [];

    /** @type {Ticket[]} Currently being served */
    this.serving = [];

    /** @type {Ticket[]} Completed today */
    this.completed = [];

    /** @type {Ticket[]} Skipped today */
    this.skipped = [];

    /** @type {Ticket[]} No-shows today */
    this.noShows = [];

    /** Ticket number counter (resets daily) */
    this._counter = 0;

    /** Service type configuration */
    this.serviceTypes = (options.serviceTypes || 'restaurant,clinic,salon,service_center')
      .split(',')
      .map(s => s.trim().toLowerCase());

    /** Staff / counter assignments */
    this.counters = new Map(); // counterId -> { label, currentTicket, isActive }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Join the queue.
   * @param {object} params
   * @param {string} params.serviceType
   * @param {object} params.customerInfo - { name, phone, email, customerId? }
   * @param {boolean} [params.isVip]
   * @returns {Ticket}
   */
  join({ serviceType, customerInfo, isVip = false, gps = null, lineUserId = '' }) {
    const st = (serviceType || '').toLowerCase();
    if (!this.serviceTypes.includes(st) && st !== '') {
      throw new Error(`Invalid service type "${serviceType}". Allowed: ${this.serviceTypes.join(', ')}`);
    }

    this._counter += 1;
    const ticketNumber = this._padTicket(this._counter);

    const customerName = (customerInfo && customerInfo.name) || 'Guest';
    const phone = (customerInfo && customerInfo.phone) || '';

    const ticket = {
      id: uuidv4(),
      ticketNumber,
      serviceType: st || 'general',
      customerInfo: {
        name: customerName,
        phone,
        email: (customerInfo && customerInfo.email) || '',
        customerId: (customerInfo && customerInfo.customerId) || null,
        lineUserId: (customerInfo && customerInfo.lineUserId) || lineUserId || '',
        gps: (customerInfo && customerInfo.gps) || gps || null, // { lat, lng, timestamp }
      },
      isVip: !!isVip,
      status: 'waiting', // waiting → called → (served | no_show) ; or skipped
      counterId: null,
      position: 0,
      joinedAt: Date.now(),
      calledAt: null,
      servedAt: null,
      skippedAt: null,
      estimatedWaitMinutes: 0,
      actualWaitMinutes: null,
      // Smart Queue features
      lineConfirmed: null,  // true | false | null (pending)
      lineConfirmedAt: null,
      phoneCalled: false,    // Whether AI phone call was made
      proximityChecked: false,
      proximityDistance: null,
      // GPS check interval
      gpsCheckAttempts: 0,
      lastGpsCheckAt: null,
      // Notification flags
      notifiedLine: false,
      notifiedPhone: false,
    };

    this.tickets.set(ticket.ticketNumber, ticket);
    this._enqueue(ticket);
    this._recalcPositions();
    this._recalcWaitTimes();

    this.emit('join', ticket);
    this.emit('queue:updated', this._publicQueue());

    return ticket;
  }

  /**
   * Call a ticket to be served.
   * @param {string} ticketNumber
   * @param {string} [counterId]
   * @returns {Ticket}
   */
  callNext(ticketNumber, counterId) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) throw new Error(`Ticket ${ticketNumber} not found`);
    if (ticket.status !== 'waiting') throw new Error(`Ticket ${ticketNumber} is ${ticket.status}, not waiting`);

    ticket.status = 'called';
    ticket.calledAt = Date.now();
    ticket.counterId = counterId || null;

    // Remove from queue
    const idx = this.queue.findIndex(t => t.ticketNumber === ticketNumber);
    if (idx !== -1) this.queue.splice(idx, 1);

    this.serving.push(ticket);

    // Auto no-show timer
    if (this.noShowTimeoutMinutes > 0) {
      ticket._noShowTimer = setTimeout(() => {
        this._markNoShow(ticket.ticketNumber);
      }, this.noShowTimeoutMinutes * 60 * 1000);
    }

    this._recalcPositions();
    this._recalcWaitTimes();

    this.emit('call', ticket);
    this.emit('queue:updated', this._publicQueue());

    return ticket;
  }

  /**
   * Skip a ticket (move it to skipped, not served).
   * @param {string} ticketNumber
   * @returns {Ticket}
   */
  skip(ticketNumber) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) throw new Error(`Ticket ${ticketNumber} not found`);

    // Clear no-show timer if present
    this._clearNoShowTimer(ticket);

    ticket.status = 'skipped';
    ticket.skippedAt = Date.now();

    // Remove from wherever it was
    this._removeFromActiveLists(ticket);
    this.skipped.push(ticket);

    this._recalcPositions();
    this._recalcWaitTimes();

    this.emit('skip', ticket);
    this.emit('queue:updated', this._publicQueue());

    return ticket;
  }

  /**
   * Mark a ticket as served/completed.
   * @param {string} ticketNumber
   * @returns {Ticket}
   */
  complete(ticketNumber) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) throw new Error(`Ticket ${ticketNumber} not found`);
    if (ticket.status !== 'called') throw new Error(`Ticket ${ticketNumber} is ${ticket.status}, not in called state`);

    this._clearNoShowTimer(ticket);

    ticket.status = 'served';
    ticket.servedAt = Date.now();
    ticket.actualWaitMinutes = (ticket.servedAt - ticket.joinedAt) / 60000;

    this._removeFromActiveLists(ticket);
    this.completed.push(ticket);

    this.emit('complete', ticket);
    this.emit('queue:updated', this._publicQueue());

    return ticket;
  }

  /**
   * Get the current queue (public view — no internal IDs).
   * @returns {object}
   */
  getQueue() {
    return {
      waiting: this._publicQueue(),
      serving: this.serving.map(t => this._publicTicket(t)),
      totalInQueue: this.queue.length,
      totalServing: this.serving.length,
      totalServedToday: this.completed.length,
    };
  }

  /**
   * Get a ticket's status.
   * @param {string} ticketNumber
   * @returns {Ticket|null}
   */
  getStatus(ticketNumber) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) return null;

    // Recalculate current position if still waiting
    if (ticket.status === 'waiting') {
      this._recalcWaitTimes();
      return this._publicTicket(ticket);
    }

    return this._publicTicket(ticket);
  }

  /**
   * Get today's statistics.
   * @returns {object}
   */
  getStats() {
    const servedCount = this.completed.length;
    const totalWaits = this.completed
      .filter(t => t.actualWaitMinutes !== null)
      .map(t => t.actualWaitMinutes);
    const avgWait = totalWaits.length > 0
      ? totalWaits.reduce((a, b) => a + b, 0) / totalWaits.length
      : 0;
    const maxWait = totalWaits.length > 0 ? Math.max(...totalWaits) : 0;
    const noShowCount = this.noShows.length;
    const skippedCount = this.skipped.length;

    // Service type breakdown
    const byService = {};
    for (const t of this.tickets.values()) {
      if (!byService[t.serviceType]) byService[t.serviceType] = { joined: 0, served: 0, waiting: 0, called: 0, skipped: 0, noShow: 0 };
      byService[t.serviceType].joined += 1;
      byService[t.serviceType][t.status] += 1;
    }

    return {
      period: 'today',
      served: servedCount,
      waiting: this.queue.length,
      serving: this.serving.length,
      skipped: skippedCount,
      noShows: noShowCount,
      totalJoined: this.tickets.size,
      averageWaitMinutes: Math.round(avgWait * 10) / 10,
      maxWaitMinutes: Math.round(maxWait * 10) / 10,
      byServiceType: byService,
    };
  }

  /**
   * Get historical analytics (all-time).
   * @returns {object}
   */
  getAnalytics() {
    const allTickets = [...this.tickets.values()];
    const served = allTickets.filter(t => t.status === 'served');
    const waits = served.filter(t => t.actualWaitMinutes !== null).map(t => t.actualWaitMinutes);
    const avgWait = waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

    // Hourly distribution
    const hourly = new Array(24).fill(0);
    for (const t of allTickets) {
      const h = new Date(t.joinedAt).getHours();
      hourly[h] += 1;
    }

    return {
      totalTickets: allTickets.length,
      totalServed: served.length,
      totalNoShows: this.noShows.length,
      totalSkipped: this.skipped.length,
      averageWaitMinutes: Math.round(avgWait * 10) / 10,
      byStatus: {
        waiting: allTickets.filter(t => t.status === 'waiting').length,
        called: allTickets.filter(t => t.status === 'called').length,
        served: served.length,
        skipped: this.skipped.length,
        noShow: this.noShows.length,
      },
      hourlyDistribution: hourly,
      serviceTypes: this.serviceTypes,
      avgServiceTimeMinutes: this.avgServiceTimeMinutes,
    };
  }

  /**
   * Provide real-time queue update payloads.
   * @returns {object}
   */
  getSnapshot() {
    return {
      ...this.getQueue(),
      stats: this.getStats(),
    };
  }

  // ─── Counter / Staff Management ──────────────────────────────────────────

  /**
   * Register a counter/station.
   * @param {string} counterId
   * @param {string} label
   * @returns {object}
   */
  registerCounter(counterId, label) {
    if (this.counters.has(counterId)) {
      throw new Error(`Counter ${counterId} already exists`);
    }
    const counter = { counterId, label, currentTicket: null, isActive: true };
    this.counters.set(counterId, counter);
    return counter;
  }

  /**
   * Get all counters.
   * @returns {object[]}
   */
  getCounters() {
    return [...this.counters.values()];
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _enqueue(ticket) {
    // VIPs go to the front, otherwise by FIFO
    if (ticket.isVip) {
      // Insert after existing VIPs but before non-VIP
      const lastVipIdx = this._lastIndexOf(t => t.isVip);
      this.queue.splice(lastVipIdx + 1, 0, ticket);
    } else {
      this.queue.push(ticket);
    }
  }

  _lastIndexOf(predicate) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (predicate(this.queue[i])) return i;
    }
    return -1;
  }

  _recalcPositions() {
    this.queue.forEach((t, i) => {
      t.position = i + 1;
    });
  }

  _recalcWaitTimes() {
    let cumulative = 0;
    for (const ticket of this.queue) {
      ticket.estimatedWaitMinutes = Math.round(cumulative * 10) / 10;
      cumulative += this.avgServiceTimeMinutes;
    }
  }

  _markNoShow(ticketNumber) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket || ticket.status !== 'called') return;

    ticket.status = 'no_show';
    this._removeFromActiveLists(ticket);
    this.noShows.push(ticket);

    this.emit('no_show', ticket);
    this.emit('queue:updated', this._publicQueue());
  }

  _clearNoShowTimer(ticket) {
    if (ticket._noShowTimer) {
      clearTimeout(ticket._noShowTimer);
      delete ticket._noShowTimer;
    }
  }

  _removeFromActiveLists(ticket) {
    this.queue = this.queue.filter(t => t.ticketNumber !== ticket.ticketNumber);
    this.serving = this.serving.filter(t => t.ticketNumber !== ticket.ticketNumber);
  }

  _padTicket(n) {
    return String(n).padStart(4, '0');
  }

  _publicTicket(t) {
    return {
      ticketNumber: t.ticketNumber,
      serviceType: t.serviceType,
      customerName: t.customerInfo.name,
      isVip: t.isVip,
      status: t.status,
      counterId: t.counterId,
      position: t.position,
      joinedAt: t.joinedAt,
      calledAt: t.calledAt,
      servedAt: t.servedAt,
      skippedAt: t.skippedAt,
      estimatedWaitMinutes: t.estimatedWaitMinutes,
      actualWaitMinutes: t.actualWaitMinutes,
    };
  }

  _publicQueue() {
    return this.queue.map(t => this._publicTicket(t));
  }

  // ─── Persistence (simple JSON) ───────────────────────────────────────────

  /**
   * Serialize engine state to a JSON-safe object.
   * @returns {string}
   */
  serialize() {
    // Don't serialize timers
    const data = {
      _counter: this._counter,
      tickets: [...this.tickets.entries()].map(([k, v]) => {
        const { _noShowTimer, ...rest } = v;
        return [k, rest];
      }),
      queue: this.queue.map(t => t.ticketNumber),
      serving: this.serving.map(t => t.ticketNumber),
      completed: this.completed.map(t => t.ticketNumber),
      skipped: this.skipped.map(t => t.ticketNumber),
      noShows: this.noShows.map(t => t.ticketNumber),
      counters: [...this.counters.entries()],
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize and restore engine state.
   * @param {string} json
   */
  deserialize(json) {
    try {
      const data = JSON.parse(json);
      this._counter = data._counter || 0;

      // Restore tickets (stripped of timer)
      this.tickets = new Map(data.tickets);

      // Restore lists by ticketNumber reference
      const byNumber = (n) => this.tickets.get(n);

      this.queue = (data.queue || []).map(byNumber).filter(Boolean);
      this.serving = (data.serving || []).map(byNumber).filter(Boolean);

      // Re-instate no-show timers for called tickets (lost on restart)
      for (const ticket of this.serving) {
        if (ticket.status === 'called' && ticket.calledAt) {
          const elapsed = Date.now() - ticket.calledAt;
          const remaining = Math.max(0, this.noShowTimeoutMinutes * 60 * 1000 - elapsed);
          ticket._noShowTimer = setTimeout(() => {
            this._markNoShow(ticket.ticketNumber);
          }, remaining);
        }
      }
      this.completed = (data.completed || []).map(byNumber).filter(Boolean);
      this.skipped = (data.skipped || []).map(byNumber).filter(Boolean);
      this.noShows = (data.noShows || []).map(byNumber).filter(Boolean);

      this.counters = new Map(data.counters || []);

      this._recalcPositions();
      this._recalcWaitTimes();
    } catch (err) {
      console.error('Failed to deserialize queue state:', err.message);
    }
  }

  // ─── Smart Queue: GPS / LINE / Phone ─────────────────────────────────

  /**
   * Update a ticket's GPS location.
   * @param {string} ticketNumber
   * @param {{ lat: number, lng: number }} gps
   */
  updateGps(ticketNumber, gps) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) throw new Error(`Ticket ${ticketNumber} not found`);
    ticket.customerInfo.gps = { ...gps, timestamp: Date.now() };
    ticket.lastGpsCheckAt = Date.now();
    ticket.gpsCheckAttempts += 1;
    return ticket;
  }

  /**
   * Confirm a ticket via LINE (or other channel).
   * @param {string} ticketNumber
   * @param {boolean} confirmed
   * @returns {Ticket}
   */
  confirmLine(ticketNumber, confirmed) {
    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) throw new Error(`Ticket ${ticketNumber} not found`);
    ticket.lineConfirmed = confirmed;
    ticket.lineConfirmedAt = Date.now();
    this.emit('line:confirm', { ticketNumber, confirmed });
    return ticket;
  }

  /**
   * Get all tickets that need LINE notification.
   * @param {number} [minutesThreshold=5]  Notify if wait <= this many minutes
   * @returns {Ticket[]}
   */
  getTicketsForLineNotify(minutesThreshold = 5) {
    const now = Date.now();
    return this.queue.filter((t) => {
      if (t.notifiedLine) return false;
      if (!t.customerInfo.lineUserId) return false;
      if (t.estimatedWaitMinutes > minutesThreshold) return false;
      return true;
    });
  }

  /**
   * Mark that LINE notification was sent.
   * @param {string} ticketNumber
   */
  markLineNotified(ticketNumber) {
    const ticket = this.tickets.get(ticketNumber);
    if (ticket) ticket.notifiedLine = true;
  }

  /**
   * Get tickets needing an AI phone call.
   * @param {number} [minutesThreshold=3]  Call if wait <= this many minutes
   * @returns {Ticket[]}
   */
  getTicketsForPhoneCall(minutesThreshold = 3) {
    return this.queue.filter((t) => {
      if (t.notifiedPhone) return false;
      if (!t.customerInfo.phone) return false;
      if (t.estimatedWaitMinutes > minutesThreshold) return false;
      // Already sent LINE? Still call for extra confirmation
      return true;
    });
  }

  /**
   * Mark that phone call was made.
   * @param {string} ticketNumber
   */
  markPhoneNotified(ticketNumber) {
    const ticket = this.tickets.get(ticketNumber);
    if (ticket) {
      ticket.notifiedPhone = true;
      ticket.phoneCalled = true;
    }
  }

  /**
   * Find tickets for a given LINE user ID.
   * @param {string} lineUserId
   * @returns {Ticket[]}
   */
  findTicketsByLineUser(lineUserId) {
    const results = [];
    for (const ticket of this.tickets.values()) {
      if (ticket.customerInfo.lineUserId === lineUserId) {
        results.push(ticket);
      }
    }
    return results;
  }

  /**
   * Get a simple persistence-friendly JSON snapshot.
   */
  toJSON() {
    return {
      stats: this.getStats(),
      analytics: this.getAnalytics(),
      counters: this.getCounters(),
    };
  }
}

module.exports = QueueEngine;
