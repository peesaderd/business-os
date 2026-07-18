'use strict';

/**
 * Schema Manager — CRUD for Schema Definitions
 *
 * A schema = table definition with typed fields stored as JSONB.
 * Fields support: string, number, boolean, date, select, array, text, relation
 *
 * Field definition shape:
 * {
 *   name: 'field_name',
 *   type: 'string' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'text' | 'relation',
 *   label: 'Display Label',
 *   required: false,
 *   unique: false,
 *   default: null,
 *   options: ['a','b'],          // for 'select' type
 *   refSchema: 'other_slug',     // for 'relation' type
 *   refField: 'id',              // for 'relation' type
 *   placeholder: '',
 *   description: '',
 *   erpSource: null,              // 'members', 'products', etc. — for ERP-synced fields
 *   erpField: null,               // field name in ERP
 * }
 */

const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// ── Validation helpers ──────────────────────────────────────────────

const VALID_TYPES = ['string', 'number', 'boolean', 'date', 'select', 'array', 'text', 'relation'];

function validateFields(fields) {
  if (!Array.isArray(fields)) return 'fields must be an array';
  const seen = new Set();
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f.name || typeof f.name !== 'string') return `field[${i}]: name is required`;
    if (!/^[a-z_][a-z0-9_]*$/.test(f.name)) return `field[${i}]: name "${f.name}" must be snake_case`;
    if (seen.has(f.name)) return `field[${i}]: duplicate name "${f.name}"`;
    seen.add(f.name);
    if (f.type && !VALID_TYPES.includes(f.type)) return `field[${i}]: invalid type "${f.type}"`;
    if (f.type === 'select' && (!Array.isArray(f.options) || f.options.length === 0)) {
      return `field[${i}]: select type needs options array`;
    }
    if (f.type === 'relation' && !f.refSchema) {
      return `field[${i}]: relation type needs refSchema`;
    }
  }
  return null;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/_+/g, '_');
}

// ── CRUD ────────────────────────────────────────────────────────────

/**
 * Create a new schema definition.
 * @param {{name:string, slug?:string, description?:string, fields:Array, config?:object, template?:string}} input
 * @returns {Promise<object>}
 */
async function createSchema(input) {
  const { name, description, fields, config, template } = input;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw Object.assign(new Error('name is required'), { status: 400 });
  }

  const err = validateFields(fields);
  if (err) throw Object.assign(new Error(err), { status: 400 });

  const slug = input.slug || slugify(name);
  const cfg = config || {};

  // Check slug uniqueness
  const existing = await db.query('SELECT id FROM schemas WHERE slug = $1', [slug]);
  if (existing.rows.length > 0) {
    throw Object.assign(new Error(`Schema slug "${slug}" already exists`), { status: 409 });
  }

  const result = await db.query(
    `INSERT INTO schemas (name, slug, description, fields, config, template)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name.trim(), slug, (description || '').trim(), JSON.stringify(fields), JSON.stringify(cfg), template || null]
  );

  return result.rows[0];
}

/**
 * List all schemas (summary).
 * @param {{activeOnly?: boolean}} options
 * @returns {Promise<Array>}
 */
async function listSchemas(options = {}) {
  const where = options.activeOnly ? 'WHERE is_active = TRUE' : '';
  const result = await db.query(
    `SELECT id, name, slug, description, template, is_active,
            jsonb_array_length(fields) AS field_count,
            created_at, updated_at
     FROM schemas ${where}
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * Get a schema by slug (full detail).
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
async function getSchema(slug) {
  const result = await db.query(
    'SELECT * FROM schemas WHERE slug = $1',
    [slug]
  );
  return result.rows[0] || null;
}

/**
 * Get a schema by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getSchemaById(id) {
  const result = await db.query('SELECT * FROM schemas WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Update a schema definition.
 * @param {string} slug
 * @param {{name?:string, description?:string, fields?:Array, config?:object}} update
 * @returns {Promise<object>}
 */
async function updateSchema(slug, update) {
  const existing = await getSchema(slug);
  if (!existing) throw Object.assign(new Error(`Schema "${slug}" not found`), { status: 404 });

  if (update.fields) {
    const err = validateFields(update.fields);
    if (err) throw Object.assign(new Error(err), { status: 400 });
  }

  const name = update.name ?? existing.name;
  const description = update.description ?? existing.description;
  const fields = update.fields ?? existing.fields;
  const config = update.config ?? existing.config;

  const result = await db.query(
    `UPDATE schemas SET name = $1, description = $2, fields = $3, config = $4
     WHERE slug = $5 RETURNING *`,
    [name, description, JSON.stringify(fields), JSON.stringify(config), slug]
  );

  return result.rows[0];
}

/**
 * Delete a schema and all its records (CASCADE).
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function deleteSchema(slug) {
  const result = await db.query(
    `DELETE FROM schemas WHERE slug = $1 RETURNING id`,
    [slug]
  );
  return result.rowCount > 0;
}

/**
 * Activate / deactivate a schema
 * @param {string} slug
 * @param {boolean} active
 * @returns {Promise<object>}
 */
async function setActive(slug, active) {
  const result = await db.query(
    `UPDATE schemas SET is_active = $1 WHERE slug = $2 RETURNING id, slug, is_active`,
    [active, slug]
  );
  if (result.rowCount === 0) throw Object.assign(new Error(`Schema "${slug}" not found`), { status: 404 });
  return result.rows[0];
}

module.exports = {
  createSchema,
  listSchemas,
  getSchema,
  getSchemaById,
  updateSchema,
  deleteSchema,
  setActive,
  slugify,
};
