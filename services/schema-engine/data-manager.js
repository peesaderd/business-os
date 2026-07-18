'use strict';

/**
 * Data Manager — Dynamic CRUD for Schema Records
 *
 * Each record is a JSONB row linked to a schema.
 * Validation is done against the schema's field definitions.
 * Supports filtering, pagination, and field-level querying on JSONB.
 */

const db = require('./db');
const schemaMgr = require('./schema-manager');
const erp = require('./erp-client');

// ── Validation ──────────────────────────────────────────────────────

/**
 * Validate data against schema field definitions.
 * Returns { valid: boolean, errors: string[] }
 */
function validateData(data, fields) {
  const errors = [];

  for (const field of fields) {
    const val = data[field.name];

    // Required check
    if (field.required && (val === undefined || val === null || val === '')) {
      errors.push(`${field.name} (${field.label || field.name}): is required`);
      continue;
    }

    // Skip validation if null/undefined and not required
    if (val === undefined || val === null) continue;

    // Type validation
    switch (field.type) {
      case 'string':
      case 'text':
        if (typeof val !== 'string') {
          errors.push(`${field.name}: expected string, got ${typeof val}`);
        }
        break;
      case 'number':
        if (typeof val !== 'number' || isNaN(val)) {
          errors.push(`${field.name}: expected number, got ${typeof val}`);
        }
        break;
      case 'boolean':
        if (typeof val !== 'boolean') {
          errors.push(`${field.name}: expected boolean, got ${typeof val}`);
        }
        break;
      case 'date':
        if (typeof val !== 'string' || isNaN(Date.parse(val))) {
          errors.push(`${field.name}: expected valid date string`);
        }
        break;
      case 'select':
        if (!field.options.includes(val)) {
          errors.push(`${field.name}: "${val}" is not in [${field.options.join(', ')}]`);
        }
        break;
      case 'array':
        if (!Array.isArray(val)) {
          errors.push(`${field.name}: expected array`);
        }
        break;
      case 'relation':
        if (typeof val !== 'string') {
          errors.push(`${field.name}: expected relation ID (string)`);
        }
        break;
    }

    // Unique check (deferred to DB layer with explicit check)
    // Min/Max for numbers
    if (field.type === 'number') {
      if (field.min !== undefined && val < field.min) {
        errors.push(`${field.name}: minimum ${field.min}`);
      }
      if (field.max !== undefined && val > field.max) {
        errors.push(`${field.name}: maximum ${field.max}`);
      }
    }

    // String length
    if ((field.type === 'string' || field.type === 'text') && typeof val === 'string') {
      if (field.minLength !== undefined && val.length < field.minLength) {
        errors.push(`${field.name}: minimum ${field.minLength} characters`);
      }
      if (field.maxLength !== undefined && val.length > field.maxLength) {
        errors.push(`${field.name}: maximum ${field.maxLength} characters`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build a WHERE clause from query params, filtering on JSONB fields.
 * Returns { clause: string, params: any[] }
 */
function buildWhereClause(params, fields) {
  const clauses = [];
  const values = [];
  let idx = 2; // $1 is reserved for schema_id in listRecords

  // text search across all string fields
  if (params.search) {
    const searchClauses = fields
      .filter(f => f.type === 'string' || f.type === 'text')
      .map(f => `data->>'${f.name}' ILIKE $${idx}`);
    if (searchClauses.length > 0) {
      clauses.push(`(${searchClauses.join(' OR ')})`);
      values.push(`%${params.search}%`);
      idx++;
    }
  }

  // Field-specific filters: ?field_name=value OR ?phone=0812345678
  for (const field of fields) {
    const val = params[field.name];
    if (val === undefined) continue;

    switch (field.type) {
      case 'string':
      case 'text':
      case 'select':
      case 'relation':
        if (val.includes(',')) {
          // Multiple values: OR match
          const orClauses = val.split(',').map(() => `data->>'${field.name}' = $${idx++}`);
          clauses.push(`(${orClauses.join(' OR ')})`);
          val.split(',').forEach(v => values.push(v.trim()));
        } else {
          clauses.push(`data->>'${field.name}' = $${idx++}`);
          values.push(val);
        }
        break;
      case 'number':
        if (val.startsWith('>=')) {
          clauses.push(`(data->>'${field.name}')::numeric >= $${idx++}`);
          values.push(parseFloat(val.slice(2)));
        } else if (val.startsWith('<=')) {
          clauses.push(`(data->>'${field.name}')::numeric <= $${idx++}`);
          values.push(parseFloat(val.slice(2)));
        } else if (val.startsWith('>')) {
          clauses.push(`(data->>'${field.name}')::numeric > $${idx++}`);
          values.push(parseFloat(val.slice(1)));
        } else if (val.startsWith('<')) {
          clauses.push(`(data->>'${field.name}')::numeric < $${idx++}`);
          values.push(parseFloat(val.slice(1)));
        } else {
          clauses.push(`(data->>'${field.name}')::numeric = $${idx++}`);
          values.push(parseFloat(val));
        }
        break;
      case 'boolean':
        clauses.push(`data->>'${field.name}' = $${idx++}`);
        values.push(val === 'true' ? 'true' : 'false');
        break;
      case 'date':
        if (val.startsWith('>=') || val.startsWith('<=') || val.startsWith('>') || val.startsWith('<')) {
          const op = val.slice(0, val.includes('=') ? 2 : 1);
          clauses.push(`(data->>'${field.name}')::timestamptz ${op === '>=' ? '>=' : op === '<=' ? '<=' : op === '>' ? '>' : '<'} $${idx++}`);
          values.push(val.slice(op.length));
        } else {
          clauses.push(`data->>'${field.name}' = $${idx++}`);
          values.push(val);
        }
        break;
    }
  }

  const clause = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
  return { clause, values };
}

// ── ERP Sync ────────────────────────────────────────────────────────

/**
 * For schemas with erpSource fields, resolve ERP data.
 * Returns enriched record data merged with local data.
 */
async function resolveErpFields(schema, localData) {
  const erpFields = (schema.fields || []).filter(f => f.erpSource && f.erpField);
  if (erpFields.length === 0) return localData;

  const erpIdField = erpFields.find(f => f.name === 'erp_id');
  if (!erpIdField || !localData.erp_id) return localData;

  // Fetch from ERP based on source
  let erpData = null;
  const source = erpFields[0].erpSource;

  if (source === 'member' || source === 'customer') {
    erpData = await erp.getMemberById(localData.erp_id);
  }

  if (!erpData) return localData;

  // Merge ERP fields into data
  const merged = { ...localData };
  for (const field of erpFields) {
    if (field.erpField && erpData[field.erpField] !== undefined && localData[field.name] === undefined) {
      merged[field.name] = erpData[field.erpField];
    }
  }
  return merged;
}

// ── CRUD ────────────────────────────────────────────────────────────

/**
 * Create a record.
 * @param {string} schemaSlug
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createRecord(schemaSlug, data) {
  const schema = await schemaMgr.getSchema(schemaSlug);
  if (!schema) throw Object.assign(new Error(`Schema "${schemaSlug}" not found`), { status: 404 });

  const { valid, errors } = validateData(data, schema.fields);
  if (!valid) throw Object.assign(new Error(`Validation failed: ${errors.join('; ')}`), { status: 400 });

  // Check unique constraints
  for (const field of schema.fields) {
    if (field.unique && data[field.name] !== undefined && data[field.name] !== null) {
      const check = await db.query(
        `SELECT id FROM records WHERE schema_id = $1 AND data->>'${field.name}' = $2 LIMIT 1`,
        [schema.id, String(data[field.name])]
      );
      if (check.rows.length > 0) {
        throw Object.assign(new Error(`${field.name}: value "${data[field.name]}" already exists`), { status: 409 });
      }
    }
  }

  // Apply defaults
  const enriched = { ...data };
  for (const field of schema.fields) {
    if (enriched[field.name] === undefined && field.default !== undefined && field.default !== null) {
      enriched[field.name] = field.default;
    }
  }

  const result = await db.query(
    `INSERT INTO records (schema_id, data) VALUES ($1, $2) RETURNING *`,
    [schema.id, JSON.stringify(enriched)]
  );

  return { ...result.rows[0], schema: schema.slug };
}

/**
 * List / query records by schema.
 * @param {string} schemaSlug
 * @param {object} queryParams  — { search, field filters, sort, order, page, limit }
 * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
 */
async function listRecords(schemaSlug, queryParams = {}) {
  const schema = await schemaMgr.getSchema(schemaSlug);
  if (!schema) throw Object.assign(new Error(`Schema "${schemaSlug}" not found`), { status: 404 });

  const fields = schema.fields || [];
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(queryParams.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const sort = queryParams.sort || 'created_at';
  const order = (queryParams.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { clause, values } = buildWhereClause(queryParams, fields);

  // Count
  const countResult = await db.query(
    `SELECT COUNT(*) FROM records WHERE schema_id = $1 ${clause}`,
    [schema.id, ...values]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch
  // JSONB sort: use data->>'field' for field sorts, fallback to created_at
  const sortClause = sort === 'created_at' || sort === 'updated_at'
    ? `${sort}`
    : `data->>'${sort}'`;

  const dataResult = await db.query(
    `SELECT * FROM records WHERE schema_id = $1 ${clause}
     ORDER BY ${sortClause} ${order}
     LIMIT $${values.length + 2} OFFSET $${values.length + 3}`,
    [schema.id, ...values, limit, offset]
  );

  // Resolve ERP fields if needed
  const resolved = await Promise.all(
    dataResult.rows.map(async (row) => {
      const enriched = await resolveErpFields(schema, row.data);
      return { id: row.id, schema: schema.slug, data: enriched, created_at: row.created_at, updated_at: row.updated_at };
    })
  );

  return {
    data: resolved,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a single record by ID.
 * @param {string} schemaSlug
 * @param {string} recordId
 * @returns {Promise<object|null>}
 */
async function getRecord(schemaSlug, recordId) {
  const schema = await schemaMgr.getSchema(schemaSlug);
  if (!schema) throw Object.assign(new Error(`Schema "${schemaSlug}" not found`), { status: 404 });

  const result = await db.query(
    'SELECT * FROM records WHERE id = $1 AND schema_id = $2',
    [recordId, schema.id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const enrichedData = await resolveErpFields(schema, row.data);

  return {
    id: row.id,
    schema: schema.slug,
    data: enrichedData,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Update a record.
 * @param {string} schemaSlug
 * @param {string} recordId
 * @param {object} data  (partial — merges with existing)
 * @returns {Promise<object>}
 */
async function updateRecord(schemaSlug, recordId, data) {
  const schema = await schemaMgr.getSchema(schemaSlug);
  if (!schema) throw Object.assign(new Error(`Schema "${schemaSlug}" not found`), { status: 404 });

  // Get existing
  const existing = await db.query(
    'SELECT * FROM records WHERE id = $1 AND schema_id = $2',
    [recordId, schema.id]
  );
  if (existing.rows.length === 0) {
    throw Object.assign(new Error(`Record ${recordId} not found in "${schemaSlug}"`), { status: 404 });
  }

  // Merge data
  const mergedData = { ...existing.rows[0].data, ...data };

  // Validate merged result
  const { valid, errors } = validateData(mergedData, schema.fields);
  if (!valid) throw Object.assign(new Error(`Validation failed: ${errors.join('; ')}`), { status: 400 });

  // Check unique constraints (exclude current record)
  for (const field of schema.fields) {
    if (field.unique && mergedData[field.name] !== undefined && mergedData[field.name] !== null) {
      const check = await db.query(
        `SELECT id FROM records WHERE schema_id = $1 AND data->>'${field.name}' = $2 AND id != $3 LIMIT 1`,
        [schema.id, String(mergedData[field.name]), recordId]
      );
      if (check.rows.length > 0) {
        throw Object.assign(new Error(`${field.name}: value "${mergedData[field.name]}" already exists`), { status: 409 });
      }
    }
  }

  const result = await db.query(
    'UPDATE records SET data = $1 WHERE id = $2 AND schema_id = $3 RETURNING *',
    [JSON.stringify(mergedData), recordId, schema.id]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    schema: schema.slug,
    data: row.data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Delete a record.
 * @param {string} schemaSlug
 * @param {string} recordId
 * @returns {Promise<boolean>}
 */
async function deleteRecord(schemaSlug, recordId) {
  const schema = await schemaMgr.getSchema(schemaSlug);
  if (!schema) throw Object.assign(new Error(`Schema "${schemaSlug}" not found`), { status: 404 });

  const result = await db.query(
    'DELETE FROM records WHERE id = $1 AND schema_id = $2 RETURNING id',
    [recordId, schema.id]
  );
  return result.rowCount > 0;
}

module.exports = {
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  resolveErpFields,
};
