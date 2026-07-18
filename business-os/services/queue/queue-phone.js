'use strict';

/**
 * Queue AI Phone Call Module
 *
 * AI-powered voice call integration:
 * - Calls customer when turn is near
 * - Speaks queue update via TTS (ElevenLabs / Google TTS)
 * - Supports Twilio, SIP, or custom webhook phone providers
 * - Simulation mode for development
 */

const axios = require('axios');

class QueuePhoneCall {
  /**
   * @param {object} options
   * @param {string} options.provider       Phone provider: 'twilio' | 'vapi' | 'simulation'
   * @param {string} options.accountSid     Twilio Account SID
   * @param {string} options.authToken      Twilio Auth Token
   * @param {string} options.fromNumber     Caller phone number
   * @param {string} options.ttsApiUrl      TTS API URL (ElevenLabs / Google)
   * @param {string} options.ttsApiKey      TTS API key
   * @param {string} options.ttsVoiceId     TTS voice ID
   * @param {boolean} options.enabled       Enable/disable phone features
   */
  constructor(options = {}) {
    this.provider = options.provider || process.env.PHONE_PROVIDER || 'simulation';
    this.accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = options.fromNumber || process.env.PHONE_FROM_NUMBER || '+15551234567';
    this.ttsApiUrl = options.ttsApiUrl || process.env.TTS_API_URL || 'https://api.elevenlabs.io/v1/text-to-speech';
    this.ttsApiKey = options.ttsApiKey || process.env.TTS_API_KEY || '';
    this.ttsVoiceId = options.ttsVoiceId || process.env.TTS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // ElevenLabs Rachel
    this.enabled = options.enabled !== undefined ? options.enabled : (this.provider !== 'simulation');
  }

  /**
   * Generate TTS audio from text.
   * @param {string} text  Text to speak
   * @returns {Promise<Buffer|null>}  Audio buffer or null
   */
  async generateSpeech(text) {
    if (!this.ttsApiKey) {
      console.log(`[queue-phone] No TTS key, using simulated speech: "${text}"`);
      return null;
    }

    try {
      const res = await axios.post(
        `${this.ttsApiUrl}/${this.ttsVoiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.ttsApiKey,
          },
          responseType: 'arraybuffer',
          timeout: 15_000,
        }
      );
      console.log(`[queue-phone] TTS generated: ${text.length} chars`);
      return Buffer.from(res.data);
    } catch (err) {
      console.error('[queue-phone] TTS failed:', err.message);
      return null;
    }
  }

  /**
   * Make an outbound phone call.
   * @param {string} toNumber   Customer phone number
   * @param {string} message    Message to speak (will use TTS)
   * @param {object} options    { ticketNumber, businessName }
   * @returns {Promise<object>}
   */
  async makeCall(toNumber, message, options = {}) {
    if (this.provider === 'simulation' || !this.enabled) {
      console.log(`[queue-phone] 📞 SIMULATED call to ${toNumber}`);
      console.log(`[queue-phone]    Message: "${message}"`);
      console.log(`[queue-phone]    Ticket: ${options.ticketNumber || 'N/A'}`);
      return { simulated: true, to: toNumber, message, callSid: `sim_${Date.now()}` };
    }

    if (this.provider === 'twilio') {
      return this._twilioCall(toNumber, message, options);
    }

    if (this.provider === 'vapi') {
      return this._vapiCall(toNumber, message, options);
    }

    return { success: false, error: `Unknown provider: ${this.provider}` };
  }

  /**
   * Make call via Twilio.
   */
  async _twilioCall(toNumber, message, options) {
    if (!this.accountSid || !this.authToken) {
      return { success: false, error: 'Twilio not configured' };
    }

    const twilio = require('twilio');
    const client = new twilio(this.accountSid, this.authToken);

    // TwiML: Speak the message
    const twiml = `<Response><Say voice="alice" language="th-TH">${this._escapeXml(message)}</Say></Response>`;

    try {
      const call = await client.calls.create({
        twiml,
        to: toNumber,
        from: this.fromNumber,
        statusCallback: `${process.env.PUBLIC_URL || 'http://localhost:8113'}/api/queue/v1/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      console.log(`[queue-phone] Twilio call to ${toNumber}: SID ${call.sid}`);
      return { success: true, callSid: call.sid, status: call.status };
    } catch (err) {
      console.error('[queue-phone] Twilio call failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Make call via VAPI.ai.
   */
  async _vapiCall(toNumber, message, options) {
    const vapiToken = process.env.VAPI_API_KEY;
    if (!vapiToken) {
      return { success: false, error: 'VAPI not configured' };
    }

    try {
      const res = await axios.post(
        'https://api.vapi.ai/call',
        {
          phoneNumber: toNumber,
          assistant: {
            firstMessage: message,
            model: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: 'You are a friendly queue assistant.' }],
            },
            voice: {
              provider: 'elevenlabs',
              voiceId: this.ttsVoiceId,
            },
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${vapiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        }
      );
      console.log(`[queue-phone] VAPI call to ${toNumber}: ID ${res.data.id}`);
      return { success: true, callId: res.data.id, status: res.data.status };
    } catch (err) {
      console.error('[queue-phone] VAPI call failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generate the queue announcement message.
   * @param {object} info  { ticketNumber, businessName, estimatedWaitMinutes, serviceType }
   * @returns {string}
   */
  generateAnnouncement(info) {
    const biz = info.businessName || 'the store';
    const ticket = info.ticketNumber || '';
    const wait = info.estimatedWaitMinutes || 5;

    // Thai language announcement
    return (
      `สวัสดีครับ คุณได้รับบริการจาก ${biz} ` +
      `คิวของคุณหมายเลข ${ticket} ` +
      `อีกประมาณ ${wait} นาที จะถึงคิวของคุณแล้วครับ ` +
      `กรุณามาที่ร้านเพื่อรับบริการ ขอบคุณครับ`
    );
  }

  /**
   * Generate confirmation prompt message (shorter, for confirm flow).
   * @param {object} info
   * @returns {string}
   */
  generateConfirmPrompt(info) {
    const biz = info.businessName || 'the store';
    const ticket = info.ticketNumber || '';

    return (
      `สวัสดีครับ จาก ${biz} คิวหมายเลข ${ticket} ของคุณกำลังจะถึงแล้ว ` +
      `หากคุณอยู่ใกล้ร้าน กด 1 เพื่อยืนยัน หรือกด 2 เพื่อยกเลิก`
    );
  }

  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Check phone integration status.
   * @returns {object}
   */
  status() {
    return {
      provider: this.provider,
      enabled: this.enabled,
      fromNumber: this.fromNumber,
      ttsConfigured: !!this.ttsApiKey,
      twilioConfigured: !!(this.accountSid && this.authToken),
    };
  }
}

module.exports = QueuePhoneCall;
