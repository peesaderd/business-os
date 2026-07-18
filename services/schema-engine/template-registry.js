'use strict';

/**
 * Template Registry — Pre-built Schema Templates
 *
 * Each template defines:
 *   - name, slug, description
 *   - fields array (same format as schema-manager)
 *   - config (default schema config)
 *   - seed data (optional, for demo/quickstart)
 *
 * Templates are installed via POST /api/v1/template/:name/install
 * which copies the template into a real schema.
 */

const TEMPLATES = {

  // ═════════════════════════════════════════════════════════════════
  // Member — ต่อกับ ERP Core (member fields อ่านจาก ERP, extension เก็บ local)
  // ═════════════════════════════════════════════════════════════════
  member: {
    name: 'Member',
    slug: 'member',
    description: 'สมาชิก / ลูกค้า — เชื่อมต่อกับ ERP Core และมีฟิลด์เสริมสำหรับ SuperAPP',
    config: {
      icon: '👤',
      color: '#4F46E5',
      defaultSort: 'created_at',
      enableSearch: true,
      searchFields: ['full_name', 'phone', 'email'],
    },
    fields: [
      // ── Fields from ERP Core ────────────────────────────────
      {
        name: 'erp_id',
        type: 'string',
        label: 'ERP Customer ID',
        description: 'Reference ID in ERP Core',
        required: false,
        unique: true,
        erpSource: 'member',
        erpField: 'id',
      },
      {
        name: 'full_name',
        type: 'string',
        label: 'ชื่อ-นามสกุล',
        required: true,
        erpSource: 'member',
        erpField: 'name',
      },
      {
        name: 'phone',
        type: 'string',
        label: 'เบอร์โทรศัพท์',
        required: false,
        unique: true,
        placeholder: '0812345678',
        erpSource: 'member',
        erpField: 'phone',
      },
      {
        name: 'email',
        type: 'string',
        label: 'อีเมล',
        required: false,
        placeholder: 'user@example.com',
        erpSource: 'member',
        erpField: 'email',
      },
      {
        name: 'points',
        type: 'number',
        label: 'แต้มสะสม',
        default: 0,
        min: 0,
        erpSource: 'member',
        erpField: 'points',
      },
      {
        name: 'tier',
        type: 'select',
        label: 'ระดับสมาชิก',
        options: ['bronze', 'silver', 'gold', 'platinum'],
        default: 'bronze',
        erpSource: 'member',
        erpField: 'tier',
      },
      // ── Extended fields (local only, not in ERP) ────────────
      {
        name: 'tags',
        type: 'array',
        label: 'แท็ก',
        description: 'Tags for segmentation (VIP, vegan, prefer_line, etc.)',
        required: false,
        placeholder: '["vip", "prefer_line"]',
      },
      {
        name: 'preferences',
        type: 'text',
        label: 'ความชอบ / หมายเหตุ',
        required: false,
      },
      {
        name: 'birth_date',
        type: 'date',
        label: 'วันเกิด',
        required: false,
      },
      {
        name: 'line_user_id',
        type: 'string',
        label: 'LINE User ID',
        description: 'For LINE messaging integration',
        required: false,
      },
      {
        name: 'is_active',
        type: 'boolean',
        label: 'ใช้งานอยู่',
        default: true,
      },
      {
        name: 'notes',
        type: 'text',
        label: 'บันทึกภายใน',
        required: false,
      },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // Queue Ticket — ระบบคิว
  // ═════════════════════════════════════════════════════════════════
  queue_ticket: {
    name: 'Queue Ticket',
    slug: 'queue_ticket',
    description: 'คิวเข้าคิว / ใบจองคิว — สำหรับร้านอาหาร, คลินิก, ร้านค้า',
    config: {
      icon: '🎯',
      color: '#F59E0B',
      defaultSort: 'created_at',
      enableSearch: true,
      searchFields: ['ticket_number', 'customer_name', 'phone'],
    },
    fields: [
      {
        name: 'ticket_number',
        type: 'string',
        label: 'เลขที่คิว',
        required: true,
        unique: true,
      },
      {
        name: 'customer_name',
        type: 'string',
        label: 'ชื่อลูกค้า',
        required: true,
      },
      {
        name: 'phone',
        type: 'string',
        label: 'เบอร์โทร',
        required: false,
      },
      {
        name: 'member_id',
        type: 'relation',
        label: 'Member ID',
        refSchema: 'member',
        refField: 'id',
        required: false,
      },
      {
        name: 'service_type',
        type: 'select',
        label: 'ประเภทบริการ',
        options: ['restaurant', 'clinic', 'salon', 'service_center', 'bank', 'other'],
        default: 'restaurant',
      },
      {
        name: 'status',
        type: 'select',
        label: 'สถานะ',
        options: ['waiting', 'called', 'serving', 'completed', 'skipped', 'no_show', 'cancelled'],
        default: 'waiting',
      },
      {
        name: 'priority',
        type: 'number',
        label: 'ลำดับความสำคัญ',
        default: 0,
        min: 0,
        max: 10,
        description: 'Higher = sooner',
      },
      {
        name: 'party_size',
        type: 'number',
        label: 'จำนวนคน',
        default: 1,
        min: 1,
        max: 100,
      },
      {
        name: 'called_at',
        type: 'date',
        label: 'เวลาเรียกคิว',
        required: false,
      },
      {
        name: 'served_at',
        type: 'date',
        label: 'เวลาให้บริการ',
        required: false,
      },
      {
        name: 'estimated_wait_minutes',
        type: 'number',
        label: 'เวลารอโดยประมาณ (นาที)',
        default: 15,
        min: 0,
      },
      {
        name: 'source',
        type: 'select',
        label: 'ช่องทาง',
        options: ['kiosk', 'staff', 'line', 'web', 'phone'],
        default: 'staff',
      },
      {
        name: 'notes',
        type: 'text',
        label: 'หมายเหตุ',
        required: false,
      },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // Booking Slot — จองเวลานัดหมาย
  // ═════════════════════════════════════════════════════════════════
  booking_slot: {
    name: 'Booking Slot',
    slug: 'booking_slot',
    description: 'การจอง / นัดหมาย — สำหรับคลินิก, ร้านเสริมสวย, บริการ',
    config: {
      icon: '📅',
      color: '#10B981',
      defaultSort: 'start_time',
      enableSearch: true,
      searchFields: ['customer_name', 'phone', 'service_name'],
    },
    fields: [
      {
        name: 'customer_name',
        type: 'string',
        label: 'ชื่อลูกค้า',
        required: true,
      },
      {
        name: 'phone',
        type: 'string',
        label: 'เบอร์โทร',
        required: true,
      },
      {
        name: 'member_id',
        type: 'relation',
        label: 'Member ID',
        refSchema: 'member',
        refField: 'id',
        required: false,
      },
      {
        name: 'service_name',
        type: 'string',
        label: 'ชื่อบริการ',
        required: true,
      },
      {
        name: 'service_type',
        type: 'select',
        label: 'ประเภท',
        options: ['hair', 'skin', 'dental', 'checkup', 'consultation', 'repair', 'other'],
        default: 'consultation',
      },
      {
        name: 'start_time',
        type: 'date',
        label: 'เวลาเริ่ม',
        required: true,
      },
      {
        name: 'end_time',
        type: 'date',
        label: 'เวลาสิ้นสุด',
        required: true,
      },
      {
        name: 'staff_name',
        type: 'string',
        label: 'ผู้ให้บริการ',
        required: false,
      },
      {
        name: 'status',
        type: 'select',
        label: 'สถานะ',
        options: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'],
        default: 'pending',
      },
      {
        name: 'price',
        type: 'number',
        label: 'ราคา',
        default: 0,
        min: 0,
      },
      {
        name: 'deposit_paid',
        type: 'number',
        label: 'มัดจำ',
        default: 0,
        min: 0,
      },
      {
        name: 'source',
        type: 'select',
        label: 'ช่องทางจอง',
        options: ['staff', 'web', 'line', 'phone'],
        default: 'staff',
      },
      {
        name: 'notes',
        type: 'text',
        label: 'หมายเหตุ',
        required: false,
      },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // POS Order — ใบสั่งขาย (extends POS service)
  // ═════════════════════════════════════════════════════════════════
  pos_order: {
    name: 'POS Order',
    slug: 'pos_order',
    description: 'รายการสั่งซื้อหน้าร้าน — ต่อกับ POS Service',
    config: {
      icon: '🧾',
      color: '#EF4444',
      defaultSort: 'created_at',
      enableSearch: true,
      searchFields: ['order_number', 'customer_name', 'phone'],
    },
    fields: [
      {
        name: 'order_number',
        type: 'string',
        label: 'เลขที่ใบสั่ง',
        required: true,
        unique: true,
      },
      {
        name: 'customer_name',
        type: 'string',
        label: 'ชื่อลูกค้า',
        default: 'Walk-in Customer',
      },
      {
        name: 'customer_id',
        type: 'relation',
        label: 'Member ID',
        refSchema: 'member',
        refField: 'id',
        required: false,
      },
      {
        name: 'phone',
        type: 'string',
        label: 'เบอร์โทร',
        required: false,
      },
      {
        name: 'items',
        type: 'array',
        label: 'รายการสินค้า',
        description: 'Array of { productId, name, qty, price }',
        required: true,
      },
      {
        name: 'subtotal',
        type: 'number',
        label: 'ยอดก่อนลด',
        default: 0,
        min: 0,
      },
      {
        name: 'discount',
        type: 'number',
        label: 'ส่วนลด',
        default: 0,
        min: 0,
      },
      {
        name: 'tax',
        type: 'number',
        label: 'ภาษี',
        default: 0,
        min: 0,
      },
      {
        name: 'grand_total',
        type: 'number',
        label: 'ยอดรวมสุทธิ',
        default: 0,
        min: 0,
      },
      {
        name: 'payment_method',
        type: 'select',
        label: 'วิธีชำระ',
        options: ['cash', 'card', 'promptpay', 'transfer', 'qr', 'credit'],
        default: 'cash',
      },
      {
        name: 'payment_status',
        type: 'select',
        label: 'สถานะชำระ',
        options: ['pending', 'paid', 'refunded', 'partial'],
        default: 'pending',
      },
      {
        name: 'status',
        type: 'select',
        label: 'สถานะ',
        options: ['pending', 'completed', 'cancelled', 'refunded'],
        default: 'pending',
      },
      {
        name: 'erp_order_id',
        type: 'string',
        label: 'ERP Order ID',
        required: false,
      },
      {
        name: 'notes',
        type: 'text',
        label: 'หมายเหตุ',
        required: false,
      },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // Reward Ledger — ประวัติแต้ม
  // ═════════════════════════════════════════════════════════════════
  reward_ledger: {
    name: 'Reward Ledger',
    slug: 'reward_ledger',
    description: 'ประวัติแต้มสะสมและการใช้แต้มของสมาชิก',
    config: {
      icon: '⭐',
      color: '#8B5CF6',
      defaultSort: 'created_at',
    },
    fields: [
      {
        name: 'member_id',
        type: 'relation',
        label: 'Member',
        refSchema: 'member',
        refField: 'id',
        required: true,
      },
      {
        name: 'type',
        type: 'select',
        label: 'ประเภท',
        options: ['earn', 'redeem', 'expire', 'adjust', 'bonus'],
        required: true,
      },
      {
        name: 'points',
        type: 'number',
        label: 'จำนวนแต้ม',
        required: true,
        description: 'Positive = earn, Negative = redeem',
      },
      {
        name: 'balance_after',
        type: 'number',
        label: 'ยอดคงเหลือหลังรายการ',
        default: 0,
        min: 0,
      },
      {
        name: 'reference_type',
        type: 'select',
        label: 'ประเภทอ้างอิง',
        options: ['pos_order', 'booking', 'manual', 'promotion', 'queue'],
        default: 'manual',
      },
      {
        name: 'reference_id',
        type: 'string',
        label: 'Reference ID',
        required: false,
      },
      {
        name: 'description',
        type: 'text',
        label: 'คำอธิบาย',
        required: false,
      },
    ],
  },

};

// ── Template Operations ─────────────────────────────────────────────

/**
 * List all available templates (metadata only).
 * @returns {Array<{name, slug, description, fieldCount, config}>}
 */
function listTemplates() {
  return Object.values(TEMPLATES).map(t => ({
    name: t.name,
    slug: t.slug,
    description: t.description,
    fieldCount: t.fields.length,
    icon: t.config.icon,
    color: t.config.color,
  }));
}

/**
 * Get a template by slug.
 * @param {string} slug
 * @returns {object|null}
 */
function getTemplate(slug) {
  return TEMPLATES[slug] || null;
}

/**
 * Install a template: creates a real schema from the template definition.
 * @param {string} slug  — template slug
 * @param {object} [overrides]  — optional { name, slug, fields_append, config_override }
 * @returns {Promise<object>}  — the created schema
 */
async function installTemplate(slug, overrides = {}) {
  const template = TEMPLATES[slug];
  if (!template) {
    throw Object.assign(new Error(`Template "${slug}" not found`), { status: 404 });
  }

  const schemaMgr = require('./schema-manager');

  const schemaData = {
    name: overrides.name || template.name,
    slug: overrides.slug || template.slug,
    description: overrides.description || template.description,
    fields: [
      ...template.fields,
      ...(overrides.fieldsAppend || []),
    ],
    config: {
      ...template.config,
      ...(overrides.config || {}),
    },
    template: slug,
  };

  return await schemaMgr.createSchema(schemaData);
}

module.exports = {
  TEMPLATES,
  listTemplates,
  getTemplate,
  installTemplate,
};
