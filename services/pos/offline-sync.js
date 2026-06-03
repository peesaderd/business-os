'use strict';

/**
 * Offline-First Sync Engine
 *
 * Provides an in-memory queue (IndexedDB-like) for offline transactions.
 * On reconnect, pending operations are pushed to the ERP MCP in order.
 * Conflict resolution: server timestamp wins.
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class OfflineSync extends EventEmitter {
  constructor(options = {}) {
    super();

    this.mcpUrl = options.mcpUrl || process.env.ERP_MCP_URL || 'http://localhost:18789';
    this.tenantId = options.tenantId || process.env.DEFAULT_TENANT_ID || 'default';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 2000;

    /** @type {Array<{id: string, type: string, payload: object, timestamp: number, retries: number}>} */
    this._queue = [];

    /** @type {Set<string>} IDs of operations currently being flushed */
    this._flushing = new Set();

    /** @type {boolean} */
    this._online = true;

    this._loadFromDisk();
  }

  // ── Queue Management ──────────────────────────────────────────────

  /**
   * Enqueue an offline operation.
   * @param {'sale'|'refund'|'payment'|'adjust_inventory'|'create_order'} type
   * @param {object} payload
   * @returns {string} operation id
   */
  enqueue(type, payload) {
    const id = uuidv4();
    const op = { id, type, payload, timestamp: Date.now(), retries: 0 };
    this._queue.push(op);
    this._persist();
    this.emit('enqueued', op);
    return id;
  }

  /**
   * Remove an operation from the queue (e.g. after successful sync).
   * @param {string} id
   */
  dequeue(id) {
    const idx = this._queue.findIndex(o => o.id === id);
    if (idx !== -1) {
      this._queue.splice(idx, 1);
      this._flushing.delete(id);
      this._persist();
      this.emit('dequeued', id);
    }
  }

  /** @returns {number} */
  get pendingCount() {
    return this._queue.length;
  }

  /** @returns {Array<{id: string, type: string, timestamp: number}>} */
  getPending() {
    return this._queue.map(o => ({ id: o.id, type: o.type, timestamp: o.timestamp }));
  }

  // ── Online / Offline ─────────────────────────────────────────────

  setOnline(online) {
    const changed = this._online !== online;
    this._online = online;
    if (changed) {
      this.emit(online ? 'online' : 'offline');
      if (online) {
        this.flush().catch(err =>
          console.error('[OfflineSync] Flush error on reconnect:', err.message)
        );
      }
    }
  }

  get isOnline() {
    return this._online;
  }

  // ── Sync / Flush ──────────────────────────────────────────────────

  /**
   * Attempt to push all pending operations to the ERP MCP.
   * Operations are sent in FIFO order. If one fails, the process stops
   * (conflict resolution halts at first failure).
   */
  async flush() {
    if (!this._online) {
      console.log('[OfflineSync] Offline — skipping flush');
      return;
    }

    const pending = this._queue.filter(o => !this._flushing.has(o.id));
    if (pending.length === 0) return;

    console.log(`[OfflineSync] Flushing ${pending.length} pending operation(s)...`);

    for (const op of pending) {
      this._flushing.add(op.id);

      try {
        await this._syncOperation(op);
        this.dequeue(op.id);
        this.emit('synced', op);
      } catch (err) {
        op.retries += 1;
        this._persist();

        if (op.retries >= this.maxRetries) {
          console.error(`[OfflineSync] Operation ${op.id} failed after ${this.maxRetries} retries. Dropping.`, err.message);
          this.dequeue(op.id);
          this.emit('dropped', op, err);
        } else {
          console.warn(`[OfflineSync] Operation ${op.id} failed (retry ${op.retries}/${this.maxRetries})`, err.message);
          this.emit('retry', op, err);
        }

        // Stop the flush on failure — remaining ops will retry next flush
        break;
      }
    }
  }

  /**
   * Execute a single operation against the ERP MCP.
   * @param {{id: string, type: string, payload: object}} op
   */
  async _syncOperation(op) {
    const axios = require('axios');

    switch (op.type) {
      case 'sale':
        await axios.post(`${this.mcpUrl}/api/pos/v1/sale`, op.payload);
        break;
      case 'refund':
        await axios.post(`${this.mcpUrl}/api/pos/v1/refund`, op.payload);
        break;
      case 'payment':
        await axios.post(`${this.mcpUrl}/api/pos/v1/payment`, op.payload);
        break;
      case 'adjust_inventory':
        await axios.post(`${this.mcpUrl}/api/inventory/adjust`, op.payload);
        break;
      case 'create_order':
        await axios.post(`${this.mcpUrl}/api/orders`, op.payload);
        break;
      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  // ── Persistence ──────────────────────────────────────────────────

  _persist() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pos_offline_queue', JSON.stringify(this._queue));
    }
    // In Node.js, we keep in-memory. A real impl would use a local SQLite/LevelDB.
  }

  _loadFromDisk() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('pos_offline_queue');
        if (raw) {
          this._queue = JSON.parse(raw);
        }
      } catch { /* ignore */ }
    }
  }

  /**
   * Conflict resolution: compare client and server timestamps.
   * Server timestamp wins for inventory, customer, and finance records.
   *
   * @param {{clientTs: number, serverTs: number, entity: string}} conflict
   * @returns {'server'|'client'}
   */
  resolveConflict(conflict) {
    // Server timestamp wins — authoritative source
    if (conflict.serverTs > conflict.clientTs) {
      return 'server';
    }
    return 'server'; // default: trust server
  }
}

module.exports = OfflineSync;
