class VoicePOS {
  constructor() {
    this.recognition = null;
    this.isRecording = false;
    this.conversationHistory = [];
    this.sessionId = 'voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this.currentOrder = [];
    this.finalTranscript = '';
    this.pendingItems = [];
    this._silenceTimer = null;
    this._silenceTimeout = 3000;
    this._isSpeaking = false;
    this._processing = false;
    this.currentLang = 'th';

    this.init();
  }

  init() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('เบราว์เซอร์นี้ไม่รองรับ Voice Recognition\nกรุณาใช้ Chrome หรือ Edge');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.updateUI();
    };

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          const trimmed = transcript.trim();
          // Barge-in: stop TTS when user starts speaking
          if (this._isSpeaking) {
            this.stopSpeaking();
            // Reset finalTranscript for new input after barge-in
            this.finalTranscript = '';
          }
          if (trimmed && !this._isSpeaking) {
            if (trimmed.includes(this.finalTranscript.trim())) {
              this.finalTranscript = trimmed;
            } else {
              this.finalTranscript += (this.finalTranscript ? ' ' : '') + trimmed;
            }
          }
          this._resetSilenceTimer();
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech error:', event.error);
      if (event.error === 'not-allowed') {
        this.setStatus('กรุณาเปิดอนุญาตไมโครโฟน', 'error');
        this.isRecording = false;
        this.updateUI();
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if we should still be recording (with retry)
      this._tryRestartMic();
    };

    // Button handlers
    document.getElementById('micBtn').addEventListener('click', () => this.toggleRecording());
    document.getElementById('clearBtn').addEventListener('click', () => this.clearChat());
    document.getElementById('btnAddCart').addEventListener('click', () => this.confirmAddToCart());
    document.getElementById('btnSkip').addEventListener('click', () => this.skipItems());
    document.getElementById('btnSendKitchen').addEventListener('click', () => this.finalizeOrder());
    document.getElementById('cartBar').addEventListener('click', (e) => {
      if (e.target.closest('.btn-send-kitchen')) return;
      if (this.currentOrder.length > 0) this.openCartEditor();
    });
    document.getElementById('btnCloseCartEditor').addEventListener('click', () => this.closeCartEditor());
    document.getElementById('btnClearCart').addEventListener('click', () => this.clearCartFromEditor());

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setLanguage(btn.dataset.lang));
    });

    this.setLanguage('th');
  }

  // ======== Language Management ========
  setLanguage(lang) {
    this.currentLang = lang;
    const langMap = { th: 'th-TH', zh: 'zh-CN', en: 'en-US' };
    this.recognition.lang = langMap[lang] || 'th-TH';

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    const welcomes = {
      th: 'สวัสดีครับ! ยินดีต้อนรับสู่ร้านอาหารไทย 🍜<br>กดไมค์แล้วพูดชื่อเมนูที่ต้องการได้เลยครับ',
      zh: '您好！欢迎来到泰国餐厅 🍜<br>点击麦克风，说出您想要的菜品',
      en: 'Welcome to our Thai Restaurant! 🍜<br>Press the mic and say what you\'d like to order'
    };
    document.querySelector('.message.ai .message-bubble').innerHTML = welcomes[lang] || welcomes.th;

    const btnTexts = {
      th: { mic: '🎤 กดเพื่อพูด', stop: '🔴 กดเพื่อหยุด', send: '🍳 ส่งไปครัว', clear: '🗑️ ล้าง' },
      zh: { mic: '🎤 按下说话', stop: '🔴 按下停止', send: '🍳 发送到厨房', clear: '🗑️ 清除' },
      en: { mic: '🎤 Press to Talk', stop: '🔴 Press to Stop', send: '🍳 Send to Kitchen', clear: '🗑️ Clear' }
    };
    const btns = btnTexts[lang] || btnTexts.th;
    document.getElementById('micBtn').textContent = btns.mic;
    document.getElementById('btnSendKitchen').textContent = btns.send;
    document.getElementById('clearBtn').textContent = btns.clear;

    const statusTexts = { th: 'พร้อมรับคำสั่ง', zh: '准备就绪', en: 'Ready' };
    document.getElementById('status').textContent = statusTexts[lang] || statusTexts.th;
  }

  _resetSilenceTimer() {
    clearTimeout(this._silenceTimer);
    this._silenceTimer = setTimeout(() => {
      if (this.isRecording && this.finalTranscript.trim() && !this._processing) {
        const text = this.finalTranscript.trim();
        this.finalTranscript = '';
        try { this.recognition.stop(); } catch(e) {}
        this.handleVoiceInput(text);
      }
    }, this._silenceTimeout);
  }

  toggleRecording() {
    if (this.isRecording) {
      this.isRecording = false;
      clearTimeout(this._silenceTimer);
      try { this.recognition.stop(); } catch(e) {}
      const text = this.finalTranscript.trim();
      this.finalTranscript = '';
      if (text && !this._processing) this.handleVoiceInput(text);
      this.updateUI();
    } else {
      this._processing = false;
      this.finalTranscript = '';
      this.isRecording = true;
      this.updateUI();
      setTimeout(() => {
        if (this.isRecording) {
          try { this.recognition.start(); } catch(e) {}
        }
      }, 150);
    }
  }

  async handleVoiceInput(text) {
    if (this._processing) return;
    this._processing = true;

    this.addMessage(text, 'user');
    this.setStatus('⏳ กำลังประมวลผล...', 'processing');
    this.conversationHistory.push({ role: 'user', content: text });

    try {
      const response = await fetch('/api/voice/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          conversationHistory: this.conversationHistory.slice(-10),
          session_id: this.sessionId,
          lang: this.currentLang
        })
      });

      const data = await response.json();

      if (data.success) {
        const replyText = (data.reply || '').trim();
        this.addMessage(replyText, 'ai');
        this.conversationHistory.push({ role: 'model', content: replyText });

        if (data.action === 'identify' && data.items && data.items.length > 0) {
          this.showConfirmationPopup(data.items);
        } else if (data.action === 'complete') {
          if (this.currentOrder.length > 0) {
            const langMessages = {
              th: '👉 กดปุ่ม "🍳 ส่งไปครัว" ด้านล่างเพื่อยืนยันออเดอร์ครับ',
              zh: '👉 点击下方 "🍳 发送到厨房" 按钮确认订单',
              en: '👉 Press "🍳 Send to Kitchen" below to confirm your order'
            };
            this.addMessage(langMessages[this.currentLang] || langMessages.th, 'ai');
            this.highlightSendButton();
          }
        }

        this._processing = false;

        // Speak reply — mic stays on, just flag _isSpeaking
        this.speak(replyText).then(() => {
          this._isSpeaking = false;
          this.updateUI();
        });
      } else {
        this.addMessage('ขออภัยครับ เกิดข้อผิดพลาด', 'ai');
        this._processing = false;
        this._restartMic();
      }
    } catch (err) {
      console.error('Error:', err);
      this.addMessage('ขออภัยครับ ไม่สามารถเชื่อมต่อได้', 'ai');
      this._processing = false;
      this._restartMic();
    }
    this.updateUI();
  }

  _tryRestartMic(retries = 3) {
    if (!this.isRecording || this._processing) return;
    const attempt = (n) => {
      if (n <= 0 || !this.isRecording || this._processing) return;
      try {
        this.recognition.start();
        console.log('🎤 Mic restarted');
      } catch(e) {
        console.warn('⚠️ Mic restart attempt failed:', e.message);
        setTimeout(() => attempt(n - 1), 500);
      }
    };
    setTimeout(() => attempt(retries), 300);
  }

  // ======== Simple TTS using browser SpeechSynthesis ========
  speak(text) {
    if (!text || !text.trim()) return Promise.resolve();

    this.stopSpeaking();

    return new Promise((resolve) => {
      const cleanText = text.replace(/[^\u0e00-\u0e7fa-zA-Z0-9 \t.,!?-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanText) { resolve(); return; }

      // DON'T stop mic — just flag to ignore speech results
      this._isSpeaking = true;
      this.updateUI();

      const synthesis = window.speechSynthesis;
      if (!synthesis) {
        this._isSpeaking = false;
        resolve();
        return;
      }

      // Cancel any pending speech
      synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = this.currentLang === 'zh' ? 'zh-CN' : this.currentLang === 'en' ? 'en-US' : 'th-TH';
      utterance.rate = 1.0;

      const voices = synthesis.getVoices();
      const voiceLang = { th: 'th', zh: 'zh', en: 'en' }[this.currentLang] || 'th';
      const matchVoice = voices.find(v => v.lang.startsWith(voiceLang));
      if (matchVoice) utterance.voice = matchVoice;

      utterance.onend = () => {
        this._isSpeaking = false;
        this.updateUI();
        resolve();
      };

      utterance.onerror = () => {
        this._isSpeaking = false;
        resolve();
      };

      try {
        synthesis.speak(utterance);
      } catch (e) {
        this._isSpeaking = false;
        resolve();
      }
    });
  }

  stopSpeaking() {
    try { window.speechSynthesis.cancel(); } catch(e) {}
    this._isSpeaking = false;
  }

  _restartMic() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.updateUI();
    this._tryRestartMic();
  }

  // ======== Confirmation Popup ========
  showConfirmationPopup(items) {
    this.pendingItems = items.map((item, i) => ({
      ...item,
      _idx: i,
      quantity: item.quantity || 1,
      remark: ''
    }));
    this._renderPopupItems();
    document.getElementById('popupOverlay').classList.add('show');
  }

  _renderPopupItems() {
    const popupBody = document.getElementById('popupBody');
    let html = '';
    this.pendingItems.forEach((item, i) => {
      const itemName = item.nameTh || item.name || 'unknown';
      const itemNameEn = item.nameTh ? item.name : '';
      const qty = item.quantity || 1;
      const price = item.price || 0;
      const subtotal = price * qty;
      html += `
        <div class="popup-item">
          <div class="popup-item-name">${itemName}</div>
          ${itemNameEn ? `<div class="popup-item-name-en">${itemNameEn}</div>` : ''}
          <div class="popup-item-controls">
            <button class="qty-btn" onclick="app._popupQty(${i}, -1)">−</button>
            <span class="qty-value" id="popupQty${i}">${qty}</span>
            <button class="qty-btn" onclick="app._popupQty(${i}, 1)">+</button>
          </div>
          <div class="popup-item-price">${subtotal} บาท</div>
        </div>
        <div class="popup-item-remark">
          <input type="text" placeholder="remark (เผ็ด/ไม่เผ็ด/อื่นๆ)" 
                 value="${item.remark || ''}" 
                 onchange="app._popupRemark(${i}, this.value)" />
        </div>
      `;
    });
    const total = this.pendingItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    html += `<div class="popup-total">รวม ${total.toLocaleString()} บาท</div>`;
    popupBody.innerHTML = html;
  }

  _popupQty(idx, delta) {
    const item = this.pendingItems[idx];
    if (!item) return;
    item.quantity = Math.max(1, (item.quantity || 1) + delta);
    this._renderPopupItems();
  }

  _popupRemark(idx, val) {
    if (this.pendingItems[idx]) this.pendingItems[idx].remark = val;
  }

  confirmAddToCart() {
    document.getElementById('popupOverlay').classList.remove('show');
    this.pendingItems.forEach(item => {
      const itemName = item.nameTh || item.name;
      const existing = this.currentOrder.find(o => o.name === itemName);
      if (existing) {
        existing.quantity += item.quantity || 1;
        if (item.remark) existing.remark = item.remark;
      } else {
        this.currentOrder.push({
          name: itemName,
          nameEn: item.name || '',
          quantity: item.quantity || 1,
          price: item.price || 0,
          remark: item.remark || ''
        });
      }
    });
    this.pendingItems = [];
    this.refreshCartBar();
    this.showChatOrderSummary();
    this.speak('เพิ่มในตะกร้าเรียบร้อยครับ');
  }

  skipItems() {
    document.getElementById('popupOverlay').classList.remove('show');
    this.pendingItems = [];
    this.addMessage('👌 ไม่เป็นไรครับ พูดรายการใหม่ได้เลยครับ', 'ai');
    this.speak('ไม่เป็นไรครับ พูดรายการใหม่ได้เลย');
  }

  // ======== Cart Management ========
  refreshCartBar() {
    const cartBar = document.getElementById('cartBar');
    const cartCount = document.getElementById('cartCount');
    const cartTotal = document.getElementById('cartTotal');
    const sendBtn = document.getElementById('btnSendKitchen');
    const count = this.currentOrder.length;
    const total = this.currentOrder.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (count > 0) {
      cartBar.classList.add('visible');
      cartCount.textContent = count;
      cartTotal.textContent = total.toLocaleString();
      sendBtn.disabled = false;
    } else {
      cartBar.classList.remove('visible');
      sendBtn.disabled = true;
    }
  }

  highlightSendButton() {
    const sendBtn = document.getElementById('btnSendKitchen');
    sendBtn.style.animation = 'pulse 0.8s 3';
    setTimeout(() => { sendBtn.style.animation = ''; }, 2400);
  }

  showChatOrderSummary() {
    if (this.currentOrder.length === 0) return;
    const chatArea = document.getElementById('chatArea');
    const existing = document.getElementById('orderSummary');
    if (existing) existing.remove();
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'order-summary';
    summaryDiv.id = 'orderSummary';
    let html = '<h3>🛒 ตะกร้าสินค้า</h3>';
    let total = 0;
    this.currentOrder.forEach((item, index) => {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      html += `
        <div class="order-item">
          <span>
            ${item.name} ×${item.quantity}
            <button class="btn-remove-item" data-index="${index}" title="ลบรายการ">✕</button>
          </span>
          <span>${subtotal} บาท</span>
        </div>
      `;
    });
    html += `
      <div class="order-item order-total">
        <span>รวมทั้งหมด</span>
        <span>${total.toLocaleString()} บาท</span>
      </div>
    `;
    summaryDiv.innerHTML = html;
    chatArea.appendChild(summaryDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    summaryDiv.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.removeFromCart(idx);
      });
    });
  }

  removeFromCart(index) {
    this.currentOrder.splice(index, 1);
    this.refreshCartBar();
    this.showChatOrderSummary();
    if (this.currentOrder.length === 0) {
      this.addMessage('🫙 ตะกร้าว่างแล้วครับ พูดสั่งเพิ่มได้เลย', 'ai');
      const s = document.getElementById('orderSummary');
      if (s) s.remove();
    }
  }

  // ======== Cart Editor ========
  openCartEditor() {
    this._renderCartEditor();
    document.getElementById('cartEditorOverlay').classList.add('show');
  }

  closeCartEditor() {
    document.getElementById('cartEditorOverlay').classList.remove('show');
    this.refreshCartBar();
    this.showChatOrderSummary();
  }

  clearCartFromEditor() {
    this.currentOrder = [];
    this.pendingItems = [];
    this.closeCartEditor();
    const s = document.getElementById('orderSummary');
    if (s) s.remove();
    this.addMessage('🗑️ ล้างตะกร้าแล้วครับ', 'ai');
  }

  _renderCartEditor() {
    const body = document.getElementById('cartEditorBody');
    if (this.currentOrder.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">ตะกร้าว่าง</div>';
      return;
    }
    let html = '';
    this.currentOrder.forEach((item, i) => {
      const subtotal = (item.price || 0) * (item.quantity || 1);
      html += `
        <div class="popup-item">
          <div class="popup-item-name">${item.name}</div>
          ${item.nameEn ? `<div class="popup-item-name-en">${item.nameEn}</div>` : ''}
          <div class="popup-item-controls">
            <button class="qty-btn" onclick="app._cartQty(${i}, -1)">−</button>
            <span class="qty-value" id="cartQty${i}">${item.quantity}</span>
            <button class="qty-btn" onclick="app._cartQty(${i}, 1)">+</button>
            <button class="qty-btn qty-btn-del" onclick="app._cartRemove(${i})">🗑️</button>
          </div>
          <div class="popup-item-price">${subtotal.toLocaleString()} บาท</div>
        </div>
        <div class="popup-item-remark">
          <input type="text" placeholder="remark (เผ็ด/ไม่เผ็ด/อื่นๆ)" 
                 value="${item.remark || ''}" 
                 onchange="app._cartRemark(${i}, this.value)" />
        </div>
      `;
    });
    const total = this.currentOrder.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    html += `<div class="popup-total">รวม ${total.toLocaleString()} บาท</div>`;
    body.innerHTML = html;
  }

  _cartQty(idx, delta) {
    const item = this.currentOrder[idx];
    if (!item) return;
    item.quantity = Math.max(1, (item.quantity || 1) + delta);
    this._renderCartEditor();
  }

  _cartRemark(idx, val) {
    if (this.currentOrder[idx]) this.currentOrder[idx].remark = val;
  }

  _cartRemove(idx) {
    this.currentOrder.splice(idx, 1);
    this._renderCartEditor();
  }

  // ======== Finalize Order ========
  async finalizeOrder() {
    if (this.currentOrder.length === 0) {
      this.addMessage('⚠️ ยังไม่มีรายการในตะกร้าครับ', 'ai');
      return;
    }

    const btn = document.getElementById('btnSendKitchen');
    btn.disabled = true;
    btn.textContent = '⏳ กำลังส่ง...';

    const total = this.currentOrder.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemList = this.currentOrder.map(i => `${i.name} ×${i.quantity}`).join(', ');
    this.addMessage(`📋 ยืนยันออเดอร์: ${itemList}\nรวม ${total.toLocaleString()} บาท`, 'user');
    this.setStatus('⏳ กำลังส่งออเดอร์ไปครัว...', 'processing');

    try {
      const response = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: this.currentOrder,
          tableId: 'T01'
        })
      });

      const data = await response.json();

      if (data.success) {
        this.addMessage(`✅ ส่งออเดอร์ไปครัวแล้ว!\nรหัสออเดอร์: ${data.orderId}\nรวม: ${data.total.toLocaleString()} บาท\nขอบคุณที่ใช้บริการครับ 🎉`, 'ai');
        this.speak(`ส่งออเดอร์ไปครัวแล้วครับ รหัส ${data.orderId} รวม ${data.total} บาท`);

        this.currentOrder = [];
        this.conversationHistory = [];
        this.sessionId = 'voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        this.refreshCartBar();
        const s = document.getElementById('orderSummary');
        if (s) s.remove();

        // Sound effect
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
      } else {
        this.addMessage(`❌ ส่งไม่สำเร็จ: ${data.error || 'ไม่ทราบสาเหตุ'}\nลองใหม่อีกครั้งครับ`, 'ai');
        this.currentOrder = [];
        this.refreshCartBar();
        const s = document.getElementById('orderSummary');
        if (s) s.remove();
      }
    } catch (err) {
      console.error('Order error:', err);
      this.addMessage(`❌ เชื่อมต่อ POS ไม่ได้: ${err.message}\nลองใหม่อีกครั้งครับ`, 'ai');
      this.currentOrder = [];
      this.refreshCartBar();
      const s = document.getElementById('orderSummary');
      if (s) s.remove();
    }

    btn.textContent = '🍳 ส่งไปครัว';
    btn.disabled = this.currentOrder.length === 0;
    this.setStatus('🎤 กดไมค์เพื่อพูด', '');
  }

  // ======== UI Helpers ========
  addMessage(text, sender) {
    const chatArea = document.getElementById('chatArea');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    const avatar = sender === 'ai' ? '🤖' : '👤';
    const displayText = text.replace(/\n/g, '<br>');
    messageDiv.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-bubble">${displayText}</div>
    `;
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  clearChat() {
    this.currentOrder = [];
    this.conversationHistory = [];
    this.sessionId = 'voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this.finalTranscript = '';
    this.pendingItems = [];
    this._processing = false;
    this.stopSpeaking();

    document.getElementById('popupOverlay').classList.remove('show');
    this.refreshCartBar();

    const welcomes = {
      th: 'สวัสดีครับ! ยินดีต้อนรับสู่ร้านอาหารไทย 🍜<br>กดไมค์แล้วพูดชื่อเมนูที่ต้องการได้เลยครับ',
      zh: '您好！欢迎来到泰国餐厅 🍜<br>点击麦克风，说出您想要的菜品',
      en: 'Welcome to our Thai Restaurant! 🍜<br>Press the mic and say what you\'d like to order'
    };
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = `
      <div class="message ai">
        <div class="message-avatar">🤖</div>
        <div class="message-bubble">${welcomes[this.currentLang] || welcomes.th}</div>
      </div>
    `;
  }

  updateUI() {
    const micBtn = document.getElementById('micBtn');
    const status = document.getElementById('status');

    if (this.isRecording) {
      micBtn.classList.add('recording');
      micBtn.textContent = '🔴 กดเพื่อหยุด';
      status.textContent = '🎤 กำลังฟัง...';
      status.className = 'status listening';
    } else {
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎤 กดเพื่อพูด';
      status.textContent = 'พร้อมรับคำสั่ง';
      status.className = 'status';
    }
  }

  setStatus(text, className) {
    const status = document.getElementById('status');
    status.textContent = text;
    status.className = `status ${className}`;
  }
}

// Initialize when page loads
window.addEventListener('load', () => {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };

  window.app = new VoicePOS();
});
