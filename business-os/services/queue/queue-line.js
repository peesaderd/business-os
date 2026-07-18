'use strict';

/**
 * Queue LINE Module
 *
 * LINE Messaging API integration for queue notifications:
 * - Confirm attendance via LINE
 * - Notify when turn is near
 * - Receive webhook replies from LINE users
 */

const axios = require('axios');
const crypto = require('crypto');

class QueueLine {
  /**
   * @param {object} options
   * @param {string} options.channelAccessToken  LINE Channel Access Token
   * @param {string} options.channelSecret       LINE Channel Secret
   * @param {boolean} options.enabled            Enable/disable LINE features
   */
  constructor(options = {}) {
    this.channelAccessToken = options.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    this.channelSecret = options.channelSecret || process.env.LINE_CHANNEL_SECRET || '';
    this.enabled = options.enabled !== undefined ? options.enabled : !!this.channelAccessToken;

    this.LINE_API = 'https://api.line.me/v2/bot';
  }

  /**
   * Verify LINE webhook signature.
   * @param {string} signature  X-Line-Signature header value
   * @param {string} body       Raw request body
   * @returns {boolean}
   */
  verifySignature(signature, body) {
    if (!this.channelSecret) return false;
    const expected = crypto
      .createHmac('SHA256', this.channelSecret)
      .update(body)
      .digest('base64');
    return signature === expected;
  }

  /**
   * Send a push message to a LINE user.
   * @param {string} userId  LINE user ID
   * @param {string} text    Message text
   * @returns {Promise<object>}
   */
  async pushMessage(userId, text) {
    if (!this.enabled) {
      console.log(`[queue-line] LINE disabled. Would send to ${userId}: "${text}"`);
      return { simulated: true, to: userId, text };
    }

    try {
      const res = await axios.post(
        `${this.LINE_API}/message/push`,
        {
          to: userId,
          messages: [{ type: 'text', text }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.channelAccessToken}`,
          },
          timeout: 10_000,
        }
      );
      console.log(`[queue-line] Push to ${userId}: OK`);
      return { success: true, userId };
    } catch (err) {
      console.error(`[queue-line] Push failed for ${userId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send a confirmation message with quick reply buttons.
   * @param {string} userId      LINE user ID
   * @param {string} ticketLabel Ticket number / label
   * @param {number} minutes     Estimated wait time
   * @returns {Promise<object>}
   */
  async sendConfirm(userId, ticketLabel, minutes) {
    if (!this.enabled) {
      console.log(`[queue-line] Would send CONFIRM to ${userId}: Ticket ${ticketLabel}, ~${minutes} min`);
      return { simulated: true };
    }

    const text =
      `🎫 QUEUE UPDATE 🎫\n\n` +
      `Your ticket: ${ticketLabel}\n` +
      `Estimated wait: ~${minutes} minutes\n\n` +
      `❗ Your turn is coming up!\n` +
      `Please confirm you are still coming:\n\n` +
      `🟢 Reply 1 to CONFIRM\n` +
      `🔴 Reply 2 to CANCEL\n` +
      `⏱️ Reply 3 for 10 more minutes`;

    try {
      const res = await axios.post(
        `${this.LINE_API}/message/push`,
        {
          to: userId,
          messages: [
            {
              type: 'text',
              text: text,
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '✅ Confirm',
                      text: '1',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '❌ Cancel',
                      text: '2',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '⏱️ Need 10 min',
                      text: '3',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.channelAccessToken}`,
          },
          timeout: 10_000,
        }
      );
      console.log(`[queue-line] Confirm sent to ${userId}`);
      return { success: true, userId };
    } catch (err) {
      console.error(`[queue-line] Confirm failed for ${userId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Parse LINE webhook events.
   * @param {object} body  Parsed webhook body
   * @returns {Array<{ userId: string, replyToken: string, text: string, type: string }>}
   */
  parseWebhook(body) {
    const events = [];
    if (!body || !body.events) return events;

    for (const event of body.events) {
      if (event.type === 'message' && event.message.type === 'text') {
        events.push({
          userId: event.source.userId,
          replyToken: event.replyToken,
          text: event.message.text.trim(),
          type: 'message',
          timestamp: event.timestamp,
        });
      } else if (event.type === 'follow') {
        events.push({
          userId: event.source.userId,
          type: 'follow',
          timestamp: event.timestamp,
        });
      } else if (event.type === 'unfollow') {
        events.push({
          userId: event.source.userId,
          type: 'unfollow',
          timestamp: event.timestamp,
        });
      }
    }
    return events;
  }

  /**
   * Handle LINE confirm reply (1 = confirm, 2 = cancel, 3 = need more time).
   * @param {string} userId  LINE user ID
   * @param {string} text    Reply text
   * @returns {{ action: string, userId: string }}
   */
  parseConfirmReply(userId, text) {
    const trimmed = text.trim();
    if (trimmed === '1') {
      return { action: 'confirm', userId };
    } else if (trimmed === '2') {
      return { action: 'cancel', userId };
    } else if (trimmed === '3') {
      return { action: 'delay', userId };
    }
    return { action: 'unknown', userId };
  }

  /**
   * Check if LINE integration is properly configured.
   * @returns {{ enabled: boolean, channelAccessToken: boolean, channelSecret: boolean }}
   */
  status() {
    return {
      enabled: this.enabled,
      channelAccessToken: !!this.channelAccessToken,
      channelSecret: !!this.channelSecret,
    };
  }
}

module.exports = QueueLine;
