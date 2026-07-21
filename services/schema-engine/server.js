'use strict';

/**
 * SuperAPP Schema Engine — Express Server
 *
 * Dynamic schema + data CRUD with PostgreSQL.
 * Built for AI-driven relation resolution (OpenClaw).
 *
 * Port: 8100 (configurable via PORT env)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const db = require('./db');
const schemaMgr = require('./schema-manager');
const dataMgr = require('./data-manager');
const templates = require('./template-registry');
const erp = require('./erp-client');

// ── Config ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 8100;

// ── App ─────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// ── Health ──────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    const erpOk = await erp.health();
    res.json({
      status: 'ok',
      database: true,
      erpMcp: erpOk,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      database: false,
      erpMcp: false,
      error: err.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SCHEMA CRUD
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/schema
 * Create a new schema definition.
 */
app.post('/api/v1/schema', async (req, res) => {
  try {
    const schema = await schemaMgr.createSchema(req.body);
    res.status(201).json({ success: true, schema });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/schema
 * List all schemas.
 */
app.get('/api/v1/schema', async (_req, res) => {
  try {
    const list = await schemaMgr.listSchemas();
    res.json({ success: true, schemas: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/schema/:slug
 * Get full schema detail.
 */
app.get('/api/v1/schema/:slug', async (req, res) => {
  try {
    const schema = await schemaMgr.getSchema(req.params.slug);
    if (!schema) return res.status(404).json({ success: false, error: 'Schema not found' });
    res.json({ success: true, schema });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/schema/:slug
 * Update schema definition.
 */
app.put('/api/v1/schema/:slug', async (req, res) => {
  try {
    const schema = await schemaMgr.updateSchema(req.params.slug, req.body);
    res.json({ success: true, schema });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/schema/:slug
 * Delete schema + all its records (CASCADE).
 */
app.delete('/api/v1/schema/:slug', async (req, res) => {
  try {
    const deleted = await schemaMgr.deleteSchema(req.params.slug);
    if (!deleted) return res.status(404).json({ success: false, error: 'Schema not found' });
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/v1/schema/:slug/toggle
 * Activate / deactivate schema.
 */
app.patch('/api/v1/schema/:slug/toggle', async (req, res) => {
  try {
    const { active } = req.body;
    const result = await schemaMgr.setActive(req.params.slug, active);
    res.json({ success: true, schema: result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DATA CRUD
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/data/:schema
 * Create a record in the given schema.
 */
app.post('/api/v1/data/:schema', async (req, res) => {
  try {
    const record = await dataMgr.createRecord(req.params.schema, req.body);
    res.status(201).json({ success: true, record });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/data/:schema
 * List / query records. Supports:
 *   ?search=keyword              — text search across string fields
 *   ?field_name=value            — field-specific filter
 *   ?sort=field_name&order=ASC   — sorting
 *   ?page=1&limit=50             — pagination
 */
app.get('/api/v1/data/:schema', async (req, res) => {
  try {
    // Separate query params from schema param
    const { schema: _schema, ...queryParams } = req.query;
    const result = await dataMgr.listRecords(req.params.schema, req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/data/:schema/:id
 * Get a single record.
 */
app.get('/api/v1/data/:schema/:id', async (req, res) => {
  try {
    const record = await dataMgr.getRecord(req.params.schema, req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, record });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/data/:schema/:id
 * Update a record (partial merge).
 */
app.put('/api/v1/data/:schema/:id', async (req, res) => {
  try {
    const record = await dataMgr.updateRecord(req.params.schema, req.params.id, req.body);
    res.json({ success: true, record });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/data/:schema/:id
 * Delete a record.
 */
app.delete('/api/v1/data/:schema/:id', async (req, res) => {
  try {
    const deleted = await dataMgr.deleteRecord(req.params.schema, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, deleted: true });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// BATCH DATA OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/data/:schema/batch
 * Batch create or update records within a schema.
 *
 * Request body:
 *   { "records": [...] }         — batch create
 *   { "updates": [{id, data}] }  — batch update
 *   { "batchSize": 100 }         — optional override (default 100, max 500)
 *
 * Each batch runs in its own transaction.
 * On error, returns partial progress + error message.
 */
app.post('/api/v1/data/:schema/batch', async (req, res) => {
  try {
    const { records, updates, batchSize } = req.body;

    if (!records && !updates) {
      return res.status(400).json({
        success: false,
        error: 'Must provide "records" (create) or "updates" (update) array',
      });
    }

    if (records && updates) {
      return res.status(400).json({
        success: false,
        error: 'Provide either "records" or "updates", not both',
      });
    }

    if (records) {
      const result = await dataMgr.batchCreateRecords(
        req.params.schema,
        records,
        batchSize
      );
      return res.status(201).json({ success: true, action: 'create', ...result });
    }

    if (updates) {
      const result = await dataMgr.batchUpdateRecords(
        req.params.schema,
        updates,
        batchSize
      );
      return res.json({ success: true, action: 'update', ...result });
    }
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/template
 * List available templates.
 */
app.get('/api/v1/template', (_req, res) => {
  try {
    res.json({ success: true, templates: templates.listTemplates() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/template/:name
 * Get template detail.
 */
app.get('/api/v1/template/:name', (req, res) => {
  try {
    const tmpl = templates.getTemplate(req.params.name);
    if (!tmpl) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, template: tmpl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/template/:name/install
 * Install a template as a live schema (with optional overrides).
 */
app.post('/api/v1/template/:name/install', async (req, res) => {
  try {
    const schema = await templates.installTemplate(req.params.name, req.body);
    res.status(201).json({ success: true, schema });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// AI QUERY (for OpenClaw)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/query
 * AI-friendly query endpoint.
 * OpenClaw sends structured queries here instead of raw SQL.
 *
 * Body: {
 *   intent: 'search' | 'aggregate' | 'relation',
 *   schema: 'member',
 *   filters: { field: value },
 *   aggregate: { field: 'points', fn: 'sum' },
 *   relations: [{ schema: 'queue_ticket', via: 'member_id' }]
 * }
 */
app.post('/api/v1/query', async (req, res) => {
  try {
    const { intent, schema: schemaSlug, filters, aggregate, relations } = req.body;

    if (!schemaSlug) {
      return res.status(400).json({ success: false, error: 'schema is required' });
    }

    const schemaDef = await schemaMgr.getSchema(schemaSlug);
    if (!schemaDef) {
      return res.status(404).json({ success: false, error: `Schema "${schemaSlug}" not found` });
    }

    let result;

    switch (intent) {
      case 'search': {
        // Normal search with filters
        const queryParams = { ...filters, limit: 500 };
        result = await dataMgr.listRecords(schemaSlug, queryParams);
        break;
      }

      case 'aggregate': {
        // Simple aggregate (sum, avg, min, max, count)
        if (!aggregate || !aggregate.field) {
          return res.status(400).json({ success: false, error: 'aggregate.field is required' });
        }
        const allRecords = await dataMgr.listRecords(schemaSlug, { limit: 5000 });
        const values = allRecords.data
          .map(r => r.data[aggregate.field])
          .filter(v => typeof v === 'number' && !isNaN(v));

        const fn = (aggregate.fn || 'count').toLowerCase();
        let value;
        switch (fn) {
          case 'sum':
            value = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            break;
          case 'min':
            value = values.length > 0 ? Math.min(...values) : 0;
            break;
          case 'max':
            value = values.length > 0 ? Math.max(...values) : 0;
            break;
          case 'count':
          default:
            value = allRecords.total;
            break;
        }

        result = {
          aggregate: { field: aggregate.field, function: fn, value: Math.round(value * 100) / 100 },
          total: allRecords.total,
        };
        break;
      }

      case 'relation': {
        // Get record + its related records from other schemas
        if (!filters || !filters.id) {
          return res.status(400).json({ success: false, error: 'filters.id required for relation query' });
        }
        const record = await dataMgr.getRecord(schemaSlug, filters.id);
        if (!record) {
          return res.status(404).json({ success: false, error: 'Record not found' });
        }

        const related = {};
        if (Array.isArray(relations)) {
          for (const rel of relations) {
            const relSchema = await schemaMgr.getSchema(rel.schema);
            if (!relSchema) continue;

            // Find the field that relates back
            const relField = rel.via || 'member_id';
            const relRecords = await dataMgr.listRecords(rel.schema, { [relField]: record.id });
            related[rel.schema] = relRecords.data;
          }
        }

        result = { record: record.data, related };
        break;
      }

      default: {
        // Default = search
        const queryParams = { ...filters, limit: 500 };
        result = await dataMgr.listRecords(schemaSlug, queryParams);
        break;
      }
    }

    res.json({ success: true, intent, schema: schemaSlug, result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/schema-info
 * Expose all schema definitions + field metadata for AI to understand the data model.
 * OpenClaw calls this to learn what data is available.
 */
app.get('/api/v1/schema-info', async (_req, res) => {
  try {
    const schemas = await schemaMgr.listSchemas({ activeOnly: true });
    const detail = await Promise.all(
      schemas.map(async (s) => {
        const full = await schemaMgr.getSchema(s.slug);
        return {
          slug: full.slug,
          name: full.name,
          description: full.description,
          fields: (full.fields || []).map(f => ({
            name: f.name,
            type: f.type,
            label: f.label,
            required: f.required,
            options: f.options || null,
            refSchema: f.refSchema || null,
            erpSource: f.erpSource || null,
          })),
          config: full.config,
          recordCount: (await db.query('SELECT COUNT(*) FROM records WHERE schema_id = $1', [full.id])).rows[0].count,
        };
      })
    );

    res.json({ success: true, schemas: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ERP SYNC — Manual triggers
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/sync/erp-members
 * Pull member data from ERP Core and upsert into member schema.
 *
 * Uses batch transactions (default 50 records per batch):
 *   - Each batch runs in its own transaction (BEGIN + COMMIT)
 *   - If a batch fails, only that batch rolls back
 *   - Previously completed batches are preserved
 *   - Accepts optional body.batchSize to override (max 200)
 *
 * Fail-fast: when a batch fails, the error is returned with a summary
 * of what was synced/created so far across successful batches.
 */
app.post('/api/v1/sync/erp-members', async (req, res) => {
  try {
    const { search, batchSize: rawBatchSize } = req.body;
    const batchSize = Math.min(200, Math.max(1, parseInt(rawBatchSize, 10) || 50));

    const erpMembers = await erp.searchMembers(search || '');
    const schema = await schemaMgr.getSchema('member');
    if (!schema) {
      return res.status(400).json({ success: false, error: 'Member schema not installed. Run template first.' });
    }

    let synced = 0;
    let created = 0;
    const total = erpMembers.length;
    const batchResults = [];

    for (let b = 0; b < total; b += batchSize) {
      const batch = erpMembers.slice(b, b + batchSize);
      const batchNum = Math.floor(b / batchSize) + 1;

      // Each batch runs in its own transaction
      const result = await db.withTransaction(async (client) => {
        let batchSynced = 0;
        let batchCreated = 0;

        for (const m of batch) {
          const existing = await db.query(
            `SELECT id FROM records WHERE schema_id = $1 AND data->>'erp_id' = $2 LIMIT 1`,
            [schema.id, String(m.id)],
            client
          );

          const memberData = {
            erp_id: String(m.id),
            full_name: m.name || '',
            phone: m.phone || '',
            email: m.email || '',
            points: m.points || m.rewardPoints || 0,
            tier: m.tier || 'bronze',
            is_active: m.is_active !== false,
          };

          if (existing.rows.length > 0) {
            await db.query(
              `UPDATE records SET data = data || $1 WHERE id = $2`,
              [JSON.stringify(memberData), existing.rows[0].id],
              client
            );
            batchSynced++;
          } else {
            await db.query(
              `INSERT INTO records (schema_id, data) VALUES ($1, $2)`,
              [schema.id, JSON.stringify(memberData)],
              client
            );
            batchCreated++;
          }
        }

        return { synced: batchSynced, created: batchCreated };
      });

      synced += result.synced;
      created += result.created;
      batchResults.push({
        batch: batchNum,
        count: batch.length,
        synced: result.synced,
        created: result.created,
      });
    }

    res.json({
      success: true,
      synced,
      created,
      total,
      batches: batchResults.length,
      batchResults,
    });
  } catch (err) {
    // Fail-fast: return partial progress + error
    const errorResponse = {
      success: false,
      error: err.message,
      partial: { synced, created },
    };
    // If any batches completed, include them
    if (typeof synced !== 'undefined' && typeof created !== 'undefined') {
      errorResponse.partial = { synced, created };
    }
    res.status(500).json(errorResponse);
  }
});

// ═══════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════

async function start() {
  try {
    // Run DB migration
    await db.migrate();

    // Optionally install default templates on first run
    const existing = await schemaMgr.listSchemas();
    if (existing.length === 0 && process.env.SEED_TEMPLATES === 'true') {
      console.log('[SchemaEngine] First run — installing default templates...');
      await templates.installTemplate('member');
      await templates.installTemplate('queue_ticket');
      await templates.installTemplate('booking_slot');
      await templates.installTemplate('pos_order');
      await templates.installTemplate('reward_ledger');
      console.log('[SchemaEngine] Default templates installed');
    }

    // Auto-seed video_recipe template (re-run safe — silently skips if exists)
    try {
      await templates.installTemplate('video_recipe');
      console.log('[SchemaEngine] video_recipe template installed + seeded');
    } catch (err) {
      if (err.message && err.message.includes('already exists')) {
        console.log('[SchemaEngine] video_recipe already installed, skipping');
      } else {
        console.warn('[SchemaEngine] video_recipe install warning:', err.message);
      }
    }

    app.listen(PORT, () => {
      console.log(`[SchemaEngine] Running on port ${PORT}`);
      console.log(`[SchemaEngine] Health: http://localhost:${PORT}/health`);
      console.log(`[SchemaEngine] API:   http://localhost:${PORT}/api/v1/schema`);
    });
  } catch (err) {
    console.error('[SchemaEngine] Startup failed:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
