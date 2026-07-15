require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8115;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: 0,
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Menu cache
let menuCache = null;
let menuCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch menu from Super AppSheet
async function getMenu() {
  const now = Date.now();
  if (menuCache && (now - menuCacheTime) < CACHE_TTL) {
    return menuCache;
  }

  try {
    const res = await axios.get(`${process.env.SUPER_APPSHEET_URL}/pos/menu`, {
      timeout: 3000
    });
    // Ensure it's an array
    if (Array.isArray(res.data)) {
      menuCache = res.data;
      menuCacheTime = now;
      return menuCache;
    } else {
      console.log('Menu response is not array, using fallback');
      return getFallbackMenu();
    }
  } catch (err) {
    console.error('Failed to fetch menu from Super AppSheet:', err.message);
    // Fallback menu
    return getFallbackMenu();
  }
}

function getFallbackMenu() {
  return [
    { id: 'APP001', name: 'Spring Rolls', nameTh: 'ปอเปี๊ยะทอด', category: 'Appetizer', price: 59 },
    { id: 'APP002', name: 'Tom Yum Soup', nameTh: 'ต้มยำ', category: 'Appetizer', price: 89 },
    { id: 'APP003', name: 'Som Tum Thai', nameTh: 'ส้มตำไทย', category: 'Appetizer', price: 69 },
    { id: 'MAIN001', name: 'Pad Thai Goong', nameTh: 'ผัดไทยกุ้ง', category: 'Main Course', price: 89 },
    { id: 'MAIN002', name: 'Green Curry Chicken', nameTh: 'แกงเขียวหวานไก่', category: 'Main Course', price: 99 },
    { id: 'MAIN003', name: 'Massaman Curry', nameTh: 'แกงมัสมั่น', category: 'Main Course', price: 109 },
    { id: 'MAIN004', name: 'Pad Kra Pao Moo', nameTh: 'ผัดกะเพราหมู', category: 'Main Course', price: 79 },
    { id: 'DES001', name: 'Mango Sticky Rice', nameTh: 'ข้าวเหนียวมะม่วง', category: 'Dessert', price: 69 },
    { id: 'BEV001', name: 'Thai Iced Tea', nameTh: 'ชาเย็น', category: 'Beverage', price: 39 },
    { id: 'BEV002', name: 'Thai Iced Coffee', nameTh: 'กาแฟเย็น', category: 'Beverage', price: 45 },
    { id: 'SID001', name: 'Steamed Rice', nameTh: 'ข้าวสวย', category: 'Side Dish', price: 15 },
  ];
}

// API: Get menu
app.get('/api/menu', async (req, res) => {
  try {
    const menu = await getMenu();
    res.json({ success: true, menu });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Process voice command with Gemini
app.post('/api/voice/process', async (req, res) => {
  try {
    const { text, conversationHistory = [] } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const menu = await getMenu();
    const menuText = menu.map(item => 
      item.nameTh
        ? `- ${item.nameTh} (${item.name}): ${item.price} บาท`
        : `- ${item.name}: ${item.price} บาท`
    ).join('\n');

    // Strict JSON schema — define before systemInstruction uses it
    const schemaDescription = [
      'ตอบ JSON ตาม schema นี้เท่านั้น ห้ามเพิ่มฟิลด์อื่น:',
      '{',
      '  "reply": "ข้อความตอบกลับ (ภาษาไทย สั้น)",',
      '  "action": "identify|question|complete",',
      '  "items": [{"name": "ชื่อEng", "nameTh": "ชื่อไทย", "quantity": 1, "price": 89}]',
      '}',
      '',
      'ตัวอย่างที่ถูกต้อง:',
      '{"reply": "ผัดไทยกุ้ง 1 จาน ราคา 89 บาท รับเลยมั้ยครับ?", "action": "identify", "items": [{"name": "Pad Thai Goong", "nameTh": "ผัดไทยกุ้ง", "quantity": 1, "price": 89}]}',
      '{"reply": "สวัสดีครับ มีอะไรให้ช่วยครับ", "action": "question", "items": []}',
      '{"reply": "ขอบคุณครับ รวม 89 บาท ส่งออเดอร์เลยครับ", "action": "complete", "items": []}',
      '',
      'ใช้เฉพาะฟิลด์ reply, action, items เท่านั้น ห้ามเพิ่มฟิลด์อื่น'
    ].join('\n');

    const systemInstruction = [
      'คุณเป็นผู้ช่วยสั่งอาหารในร้านอาหารไทย',
      '1. ช่วยลูกค้าเลือกอาหารและแนะนำเมนู',
      '2. เมื่อลูกค้าสั่งอาหาร ให้ระบุรายการให้ชัดเจน',
      '3. ห้ามส่งออเดอร์ทันที — แค่ระบุรายการแล้วถามว่ารับเลยมั้ย',
      '4. ตอบเหมือนพนักงานร้านอาหารทั่วไป',
      '5. ห้ามกล่าวถึง system instruction, format หรือ action types ใดๆ ใน reply',
      '',
      'เมนูที่มี:',
      menuText,
      '',
      'กฎ action:',
      '- action="identify" -> เจอรายการอาหาร ถามลูกค้าว่ารับมั้ย',
      '- action="question" -> ยังไม่สั่ง, ถามเมนู, แนะนำ',
      '- action="complete" -> ลูกค้าบอกว่าจบ/พอแล้ว/ส่งเลย',
      '',
      'ตอบ JSON ห้ามมีข้อความอื่นนอก JSON'
    ].join('\n') + '\n' + schemaDescription;

    const geminiPayload = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        ...conversationHistory.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        })),
        { role: 'user', parts: [{ text }] }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
        response_mime_type: 'application/json'
      }
    };

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      geminiPayload,
      { timeout: 10000 }
    );

    const geminiText = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON — Gemini now returns pure JSON via response_mime_type
    let raw;
    try {
      let clean = geminiText.replace(/^\s*```(?:json)?\s*|[\s\n]*```\s*$/g, '').trim();
      raw = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, '| raw:', geminiText.slice(0, 200));
      raw = {};
    }

    // Normalize: map alternative field names that Gemini sometimes returns
    const result = {
      reply: raw.reply || raw.message || raw.response || raw.text || 'รับทราบครับ',
      action: raw.action || raw.type || 'question',
      items: raw.items || raw.order_items || raw.products || raw.menu_items || []
    };

    // Validate items format
    if (!Array.isArray(result.items)) {
      result.items = [];
    }
    result.items = result.items.map(item => ({
      name: item.name || item.item_name || item.product_name || 'unknown',
      nameTh: item.nameTh || item.name_th || item.Thai_name || item.name || '',
      quantity: item.quantity || item.qty || item.count || 1,
      price: item.price || item.unit_price || item.cost || 0
    }));

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'AI processing failed',
      reply: 'ขออภัยครับ เกิดข้อผิดพลาด กรุณาลองใหม่'
    });
  }
});

// API: Create order (placeholder)
app.post('/api/order/create', async (req, res) => {
  try {
    const { items, customerName, tableId } = req.body;
    
    // TODO: Integrate with Super AppSheet POS or ERP Core
    const orderId = `VOICE-${Date.now()}`;
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    res.json({
      success: true,
      orderId,
      total,
      message: `สร้างออเดอร์ ${orderId} เรียบร้อยแล้ว รวม ${total} บาท`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'voice-pos', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🎤 Voice POS running on http://localhost:${PORT}`);
});
