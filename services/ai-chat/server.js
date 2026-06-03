// ============================================================
// AI Chat Support Service — Express Server
// Bridge between Chatwoot webhooks and ERP MCP ai_chat
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');

const ChatBridge = require('./chat-bridge');

const app = express();
const PORT = parseInt(process.env.PORT || '8108', 10);
const CHATWOOT_WEBHOOK_SECRET = process.env.CHATWOOT_WEBHOOK_SECRET || '';

// ─── Middleware ──────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Structured JSON logging
app.use(morgan(':method :url :status :response-time ms - :req[x-request-id]', {
  skip: (req) => req.path === '/api/chat/v1/health',
}));

// Attach request ID
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ─── Health Check ────────────────────────────────────

app.get('/api/chat/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ai-chat',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── AI Chat Message ────────────────────────────────

/**
 * POST /api/chat/v1/message
 * Receive a customer message and return AI response.
 *
 * Body: { tenantId, sessionId, message, customerId, language }
 */
app.post('/api/chat/v1/message', async (req, res) => {
  const startTime = Date.now();
  const { tenantId, sessionId: providedSessionId, message, customerId, language } = req.body;

  console.log(`[${req.id}] POST /api/chat/v1/message`, JSON.stringify({
    sessionId: providedSessionId,
    customerId,
    language,
    messageLength: message ? message.length : 0,
  }));

  // Validate required fields
  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message is required',
      requestId: req.id,
    });
  }

  try {
    const result = await ChatBridge.processMessage({
      tenantId,
      sessionId: providedSessionId,
      message,
      customerId,
      language,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[${req.id}] Response in ${elapsed}ms — session: ${result.sessionId}`);

    res.json(result);
  } catch (err) {
    console.error(`[${req.id}] Error processing message:`, err.message);

    // Determine appropriate status code
    const statusCode = err.response?.status || 500;

    res.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).json({
      success: false,
      error: err.message,
      requestId: req.id,
      sessionId: providedSessionId,
    });
  }
});

// ─── Chatwoot Webhook ───────────────────────────────

/**
 * POST /api/chat/v1/chatwoot-webhook
 * Receive webhook events from Chatwoot.
 * Converts Chatwoot message_created events into AI Chat calls.
 *
 * Chatwoot sends: { event, conversation, message, account, ... }
 */
app.post('/api/chat/v1/chatwoot-webhook', async (req, res) => {
  const startTime = Date.now();
  const payload = req.body;

  // Verify webhook signature if secret configured
  const signature = req.headers['x-chatwoot-signature'];
  if (CHATWOOT_WEBHOOK_SECRET && signature) {
    const expected = crypto
      .createHmac('sha256', CHATWOOT_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    if (signature !== expected) {
      console.warn(`[${req.id}] Invalid webhook signature`);
      return res.status(403).json({ success: false, error: 'Invalid signature' });
    }
  }

  const event = payload.event;
  console.log(`[${req.id}] Chatwoot webhook: event="${event}"`);

  // Acknowledge receipt immediately (Chatwoot expects 200 quickly)
  res.json({ success: true, received: true, event });

  // Only process message_created events asynchronously
  if (event !== 'message_created') {
    return;
  }

  const message = payload.message;
  const conversation = payload.conversation;

  // Skip non-incoming messages (agent replies, activity, etc.)
  if (!message || message.message_type !== 0) {
    return;
  }

  // Skip if from AI agent itself to prevent loops
  if (message.sender && message.sender.type === 'agent_bot') {
    return;
  }

  try {
    const tenantId = process.env.DEFAULT_TENANT_ID || 't_001';
    const sessionId = `cw_${conversation.id}`;
    const customerId = conversation.meta?.sender?.id?.toString();
    const language = conversation.meta?.locale || 'en';

    console.log(`[${req.id}] Processing Chatwoot message in conversation ${conversation.id}`);

    const result = await ChatBridge.processMessage({
      tenantId,
      sessionId,
      message: message.content,
      customerId,
      language,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[${req.id}] AI response ready for conv ${conversation.id} (${elapsed}ms)`);

    // Note: Sending the response back to Chatwoot requires Chatwoot REST API
    // This would need CHATWOOT_API_KEY configured and we'd POST to:
    // POST ${CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${convId}/messages
    // For now, the response is returned — the frontend integrates via direct API call
    console.log(`[${req.id}] AI response for conv ${conversation.id}: ${result.response.slice(0, 100)}...`);

    // Optionally send reply back via Chatwoot API
    const chatwootUrl = process.env.CHATWOOT_URL;
    const chatwootKey = process.env.CHATWOOT_API_KEY;
    const accountId = payload.account?.id || process.env.CHATWOOT_ACCOUNT_ID;

    if (chatwootUrl && chatwootKey && accountId) {
      try {
        const axios = require('axios');
        const convId = conversation.id;
        await axios.post(
          `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages`,
          { content: result.response, message_type: 'outgoing', private: false },
          { headers: { 'api_access_token': chatwootKey, 'Content-Type': 'application/json' } }
        );
        console.log(`[${req.id}] AI reply posted to Chatwoot conv ${convId}`);
      } catch (apiErr) {
        console.error(`[${req.id}] Failed to post AI reply to Chatwoot:`, apiErr.message);
      }
    }
  } catch (err) {
    console.error(`[${req.id}] Error processing Chatwoot webhook:`, err.message);
  }
});

// ─── Escalate ───────────────────────────────────────

/**
 * POST /api/chat/v1/escalate
 * Escalate a conversation to a human agent.
 *
 * Body: { tenantId, sessionId, message, reason }
 */
app.post('/api/chat/v1/escalate', async (req, res) => {
  const { tenantId, sessionId, message, reason } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({
      success: false,
      error: 'sessionId and message are required',
      requestId: req.id,
    });
  }

  console.log(`[${req.id}] POST /api/chat/v1/escalate — session: ${sessionId}, reason: ${reason || 'not specified'}`);

  try {
    const result = await ChatBridge.escalate(tenantId, sessionId, message);

    console.log(`[${req.id}] Escalation sent for session ${sessionId}`);
    res.json(result);
  } catch (err) {
    console.error(`[${req.id}] Escalation error:`, err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      requestId: req.id,
    });
  }
});

// ─── Session Info ───────────────────────────────────

/**
 * GET /api/chat/v1/session/:sessionId
 * Get session context and message history.
 */
app.get('/api/chat/v1/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = ChatBridge.getSession(sessionId);

  // Return sanitized session data (no raw customer context)
  res.json({
    success: true,
    sessionId,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    messages: session.messages.slice(-10), // Last 10 messages
  });
});

// ─── Knowledge Base ─────────────────────────────────

/**
 * POST /api/chat/v1/kb/search
 * Search knowledge base for context.
 *
 * Body: { tenantId, query }
 */
app.post('/api/chat/v1/kb/search', async (req, res) => {
  const { tenantId, query } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, error: 'query is required' });
  }

  try {
    const context = await ChatBridge.getKbContext(tenantId || process.env.DEFAULT_TENANT_ID, query);
    res.json({
      success: true,
      context,
      hasContext: context.length > 0,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ─── 404 Handler ───────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Not found: ${req.method} ${req.path}`,
    requestId: req.id,
  });
});

// ─── Error Handler ──────────────────────────────────

app.use((err, req, res, _next) => {
  console.error(`[${req.id}] Unhandled error:`, err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.id,
  });
});

// ─── Start ──────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ai-chat] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[ai-chat] Health: http://localhost:${PORT}/api/chat/v1/health`);
  console.log(`[ai-chat] ERP MCP Mode: ${process.env.ERP_MCP_MODE || 'http'}`);
  console.log(`[ai-chat] ERP MCP URL: ${process.env.ERP_MCP_URL || 'http://localhost:3000'}`);
  console.log(`[ai-chat] Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
