// ============================================================
// Chat Bridge — Core logic for AI Chat Support
// Bridges Chatwoot webhooks ↔ ERP MCP tools
// ============================================================

const axios = require('axios');
const crypto = require('crypto');

const {
  ERP_MCP_URL = 'http://localhost:3000',
  ERP_MCP_MODE = 'http',
  OPENCLAW_URL = 'http://localhost:18789',
  DEFAULT_TENANT_ID = 't_001',
  DEFAULT_LANGUAGE = 'en',
} = process.env;

// ─── Session Store (in-memory) ──────────────────────
// In production, replace with Redis/DB-backed store
const sessions = new Map();

// ─── Tool Invocation ────────────────────────────────

/**
 * Call an ERP MCP tool.
 * When ERP_MCP_MODE=http, calls erp-core HTTP /mcp endpoint.
 * When ERP_MCP_MODE=mcp-sse, calls OpenClaw MCP SSE endpoint.
 */
async function callTool(tool, args) {
  const startTime = Date.now();
  let result;

  if (ERP_MCP_MODE === 'http') {
    // REST proxy: erp-core HTTP server at port 3000
    const res = await axios.post(`${ERP_MCP_URL}/mcp`, { tool, args }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    result = res.data;

    if (!res.status.toString().startsWith('2')) {
      throw new Error(`ERP MCP HTTP error ${res.status}: ${JSON.stringify(result)}`);
    }
  } else if (ERP_MCP_MODE === 'mcp-sse') {
    // MCP SSE via OpenClaw Gateway
    // OpenClaw's control UI exposes a POST endpoint for invoking tools
    const res = await axios.post(`${OPENCLAW_URL}/api/mcp/tools/call`, {
      serverName: 'erp-mcp',
      toolName: tool,
      arguments: args,
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    result = res.data;

    if (!res.status.toString().startsWith('2') && res.status !== 200) {
      throw new Error(`OpenClaw MCP error ${res.status}: ${JSON.stringify(result)}`);
    }
  } else {
    // Direct stdio mode — spawn the MCP process for each call
    // This is slower but reliable when MCP is running as stdio server
    const { spawn } = require('child_process');
    result = await callToolViaStdio(tool, args);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[chat-bridge] callTool("${tool}") → ${elapsed}ms`);

  return result;
}

/**
 * Call MCP tool by spawning the erp-core server process in stdio mode.
 * Used as fallback when REST endpoints are not available.
 */
async function callToolViaStdio(tool, args) {
  const { spawn } = require('child_process');
  const path = require('path');

  return new Promise((resolve, reject) => {
    const serverPath = '/home/openhands/erp-core/erp-core/packages/server/dist/index.js';
    const proc = spawn('node', [serverPath], {
      env: {
        ...process.env,
        MODE: 'stdio',
        DB_PATH: '/home/openhands/erp-core/erp-core/packages/server/data/erp.db',
        JWT_SECRET: 'erp-core-jwt-secret-2026',
        TENANT_ID: DEFAULT_TENANT_ID,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // MCP stdio protocol: send a JSON-RPC request, receive response on stdout
    const requestId = crypto.randomUUID();
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    });

    let output = '';
    let resolved = false;

    proc.stdout.on('data', (data) => {
      output += data.toString();
      try {
        const lines = output.trim().split('\n');
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.id === requestId || (parsed.result && !resolved)) {
            resolved = true;
            proc.kill();
            resolve(parsed.result || parsed);
          }
        }
      } catch { /* partial data; wait for more */ }
    });

    proc.stderr.on('data', (data) => {
      console.error(`[mcp-stdio:stderr] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        if (output.trim()) {
          try { resolve(JSON.parse(output.trim())); }
          catch { reject(new Error(`MCP process exited (${code})`)); }
        } else {
          reject(new Error(`MCP process exited (${code}) with no output`));
        }
      }
    });

    // Write request to stdin
    proc.stdin.write(request + '\n');
    proc.stdin.end();

    // Timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error('MCP stdio call timed out after 30s'));
      }
    }, 30000);
  });
}

// ─── Session Management ─────────────────────────────

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      messages: [],
      context: {},
      createdAt: Date.now(),
    });
  }
  return sessions.get(sessionId);
}

function addMessage(sessionId, role, content) {
  const session = getSession(sessionId);
  session.messages.push({ role, content, timestamp: new Date().toISOString() });
  // Keep last 20 messages to bound memory
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20);
  }
  return session;
}

// ─── Knowledge Base ─────────────────────────────────

/**
 * Search KB collections for relevant context given a query.
 * Returns concatenated document snippets.
 */
async function getKbContext(tenantId, query) {
  try {
    // List all KB collections
    const collectionsResult = await callTool('erp-mcp__list_kb_collections', { tenantId });

    const collections = Array.isArray(collectionsResult)
      ? collectionsResult
      : (collectionsResult.collections || collectionsResult.data || []);

    if (!collections.length) {
      console.log('[chat-bridge] No KB collections found');
      return '';
    }

    let contextParts = [];
    // Limit search to first 3 collections
    const collectionsToSearch = collections.slice(0, 3);

    for (const col of collectionsToSearch) {
      const colId = col.id || col.collectionId || col._id;
      if (!colId) continue;

      try {
        const docsResult = await callTool('erp-mcp__list_kb_documents', {
          tenantId,
          collectionId: colId,
          search: query,
        });

        const docs = Array.isArray(docsResult)
          ? docsResult
          : (docsResult.documents || docsResult.data || []);

        for (const doc of docs.slice(0, 3)) {
          if (doc.title || doc.content) {
            contextParts.push(
              `[${col.name || 'KB'}] ${doc.title || 'Untitled'}:\n${(doc.content || '').slice(0, 500)}`
            );
          }
        }
      } catch (err) {
        console.warn(`[chat-bridge] KB search error for collection ${colId}: ${err.message}`);
      }
    }

    return contextParts.join('\n\n---\n\n');
  } catch (err) {
    console.warn(`[chat-bridge] KB lookup failed: ${err.message}`);
    return '';
  }
}

// ─── Customer Context ───────────────────────────────

/**
 * Fetch customer details for context enrichment.
 */
async function getCustomerContext(tenantId, customerId) {
  if (!customerId) return null;

  try {
    const customer = await callTool('erp-mcp__get_customer', { tenantId, customerId });
    return customer;
  } catch (err) {
    console.warn(`[chat-bridge] Customer lookup failed: ${err.message}`);
    return null;
  }
}

// ─── Process Message (Core) ─────────────────────────

/**
 * Process an incoming customer message:
 * 1. Get session context
 * 2. Fetch KB context if available
 * 3. Fetch customer context if available
 * 4. Call ERP MCP ai_chat
 * 5. Return formatted response
 */
async function processMessage({
  tenantId = DEFAULT_TENANT_ID,
  sessionId,
  message,
  customerId,
  language = DEFAULT_LANGUAGE,
}) {
  const startTime = Date.now();

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }
  if (!message || !message.trim()) {
    throw new Error('Message is required');
  }

  // 1. Get/create session and add user message
  const session = getSession(sessionId);
  addMessage(sessionId, 'user', message);

  // 2. Fetch KB context for the query (async — don't block if fails)
  const kbPromise = getKbContext(tenantId, message).catch((err) => {
    console.warn(`[chat-bridge] KB fetch error (non-fatal): ${err.message}`);
    return '';
  });

  // 3. Fetch customer context
  const customerPromise = getCustomerContext(tenantId, customerId);

  const [kbContext, customer] = await Promise.all([kbPromise, customerPromise]);

  // 4. Build augmented message with context
  let augmentedMessage = message;
  const contextParts = [];

  if (customer && customer.name) {
    contextParts.push(`Customer: ${customer.name}`);
  }
  if (customer && customer.email) {
    contextParts.push(`Email: ${customer.email}`);
  }
  if (kbContext) {
    contextParts.push(`\nKnowledge Base Context:\n${kbContext}`);
  }

  if (contextParts.length > 0) {
    augmentedMessage = `[Context]\n${contextParts.join('\n')}\n\n[Customer Message]\n${message}`;
  }

  // 5. Call ERP MCP ai_chat
  const aiResult = await callTool('erp-mcp__ai_chat', {
    tenantId,
    sessionId,
    message: augmentedMessage,
    customerId: customerId || undefined,
    language,
  });

  const elapsed = Date.now() - startTime;

  // Parse response
  const responseText = typeof aiResult === 'string'
    ? aiResult
    : (aiResult.response || aiResult.text || aiResult.message || JSON.stringify(aiResult));

  // Add AI response to session
  addMessage(sessionId, 'assistant', responseText);

  // 6. Return formatted response
  return formatResponse(responseText, {
    sessionId,
    tenantId,
    customerId,
    language,
    elapsed,
    messageCount: session.messages.length,
  });
}

// ─── Format Response ────────────────────────────────

/**
 * Format LLM response with metadata for Chatwoot.
 */
function formatResponse(text, metadata = {}) {
  return {
    success: true,
    response: text,
    sessionId: metadata.sessionId,
    timestamp: new Date().toISOString(),
    meta: {
      elapsed: metadata.elapsed,
      messageCount: metadata.messageCount,
      language: metadata.language,
      tenantId: metadata.tenantId,
    },
  };
}

// ─── Escalation ─────────────────────────────────────

/**
 * Escalate a conversation by sending a notification.
 */
async function escalate(tenantId, sessionId, message) {
  const session = getSession(sessionId);
  const context = {
    sessionId,
    messageCount: session.messages.length,
    lastMessage: message,
    customerId: session.context.customerId,
  };

  await callTool('erp-mcp__send_notification', {
    tenantId: tenantId || DEFAULT_TENANT_ID,
    eventType: 'chat_escalation',
    message: `[AI Chat Escalation] Session: ${sessionId}\nMessage: ${message}`,
    data: context,
  });

  return { success: true, sessionId, escalatedAt: new Date().toISOString() };
}

// ─── Session Cleanup ────────────────────────────────

// Clean up stale sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (now - session.createdAt > MAX_AGE) {
      sessions.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[chat-bridge] Cleaned ${cleaned} stale sessions`);
}, 30 * 60 * 1000);

// ─── Exports ────────────────────────────────────────

module.exports = {
  processMessage,
  getKbContext,
  formatResponse,
  escalate,
  getSession,
  callTool,
};
