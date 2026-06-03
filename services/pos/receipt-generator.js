'use strict';

/**
 * Receipt Generator
 *
 * Produces receipt data structures and multiple output formats:
 * - ESC/POS binary for thermal (80mm / 58mm) printers
 * - Plain text for SMS / email fallback
 * - HTML for digital receipts shown on screen or emailed
 */

class ReceiptGenerator {
  /**
   * Build the canonical receipt data structure from a completed sale.
   *
   * @param {object} sale  The sale object from pos-engine
   * @returns {object}     Normalised receipt
   */
  static buildReceiptData(sale) {
    const now = new Date();
    const paid = sale.payments || [];
    const totalPaid = paid.reduce((s, p) => s + (p.amount || 0), 0);

    return {
      header: {
        storeName: sale.storeName || 'Business OS POS',
        storeAddress: sale.storeAddress || '',
        storeTaxId: sale.storeTaxId || '',
        receiptNumber: sale.receiptNumber || sale.saleId,
        date: now.toISOString(),
        dateFormatted: this._formatDate(now),
        timeFormatted: this._formatTime(now),
      },
      sale: {
        saleId: sale.saleId,
        customerId: sale.customerId || null,
        customerName: sale.customerName || 'Walk-in Customer',
        customerEmail: sale.customerEmail || '',
      },
      items: (sale.items || []).map((item, idx) => ({
        line: idx + 1,
        sku: item.sku || item.productId || '',
        name: item.name || item.productName || 'Item',
        qty: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        discount: item.discount || 0,
        tax: item.tax || 0,
        total: this._calcItemTotal(item),
      })),
      totals: {
        subtotal: sale.subtotal || 0,
        discountTotal: sale.discountTotal || 0,
        taxTotal: sale.taxTotal || 0,
        grandTotal: sale.grandTotal || 0,
        currency: sale.currency || 'THB',
        tender: totalPaid,
        change: sale.change || Math.max(0, totalPaid - (sale.grandTotal || 0)),
      },
      payments: paid.map(p => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference || '',
        status: p.status || 'completed',
      })),
      footer: {
        thankYouMessage: 'Thank you for your business!',
        refundPolicy: 'Refunds accepted within 7 days with original receipt.',
        barcode: sale.saleId || '',
        qrPrompt: 'Scan to view e-receipt',
      },
    };
  }

  // ── ESC/POS Thermal Printer ──────────────────────────────────────

  /**
   * Generate ESC/POS formatted binary buffer for thermal printers.
   * Supports 80mm (default 42 cols) and 58mm (32 cols).
   *
   * @param {object} receiptData
   * @param {{width?: number, charset?: number}} [opts]
   * @returns {Buffer}
   */
  static toEscPos(receiptData, opts = {}) {
    const width = opts.width || 42; // 42 chars for 80mm paper
    const d = receiptData;

    // ESC/POS control sequences
    const ESC = '\x1b';
    const GS  = '\x1d';
    const LF  = '\n';

    const ESC_INIT     = `${ESC}@`;          // Reset printer
    const ESC_ALIGN_CTR = `${ESC}a\x01`;     // Centre alignment
    const ESC_ALIGN_LFT = `${ESC}a\x00`;     // Left alignment
    const ESC_ALIGN_RGT = `${ESC}a\x02`;     // Right alignment
    const ESC_BOLD_ON  = `${ESC}E\x01`;      // Bold on
    const ESC_BOLD_OFF = `${ESC}E\x00`;      // Bold off
    const ESC_DBL_H    = `${ESC}e\x01`;      // Double height
    const ESC_DBL_OFF  = `${ESC}e\x00`;      // Double height off
    const GS_CUT       = `${GS}V\x00`;       // Full cut
    const GS_PART_CUT  = `${GS}V\x01`;       // Partial cut
    const GS_BARCODE   = `${GS}k\x04`;       // CODE39 barcode
    const GS_QR        = `${GS}(k`;          // QR code prefix
    const LF_LINES     = (n) => LF.repeat(n);

    const hr = '-'.repeat(width);

    const leftRight = (l, r) => {
      const pad = Math.max(1, width - l.length - r.length);
      return l + ' '.repeat(pad) + r;
    };

    const center = (t) => {
      const pad = Math.max(0, Math.floor((width - t.length) / 2));
      return ' '.repeat(pad) + t;
    };

    const trunc = (t) => t.length > width ? t.slice(0, width - 3) + '...' : t;

    const lines = [];

    // ── Header ──
    lines.push(ESC_INIT);
    lines.push(ESC_ALIGN_CTR);
    lines.push(ESC_BOLD_ON + ESC_DBL_H);
    lines.push(trunc(d.header.storeName));
    lines.push(ESC_DBL_OFF + ESC_BOLD_OFF);
    if (d.header.storeAddress) lines.push(trunc(d.header.storeAddress));
    if (d.header.storeTaxId)   lines.push(`Tax ID: ${d.header.storeTaxId}`);
    lines.push(hr);
    lines.push(ESC_ALIGN_LFT);
    lines.push(`Receipt #: ${d.header.receiptNumber}`);
    lines.push(`Date: ${d.header.dateFormatted}  ${d.header.timeFormatted}`);
    if (d.sale.customerName) {
      lines.push(`Customer: ${d.sale.customerName}`);
    }
    lines.push(hr);

    // ── Column headers ──
    lines.push(ESC_BOLD_ON);
    lines.push('Item                          Qty    Amount');
    lines.push(ESC_BOLD_OFF);

    // ── Items ──
    for (const item of d.items) {
      const name = trunc(item.name);
      const qty  = String(item.qty).padStart(3);
      const amt  = this._formatMoney(item.total, d.totals.currency).padStart(8);
      lines.push(`${name}`);
      lines.push(`  ${qty} @ ${this._formatMoney(item.unitPrice, d.totals.currency)}${' '.repeat(Math.max(1, width - 12 - String(qty).length - amt.length - 6))}${amt}`);
    }

    lines.push(hr);

    // ── Totals ──
    const cur = d.totals.currency;
    lines.push(leftRight('Subtotal:', this._formatMoney(d.totals.subtotal, cur)));
    if (d.totals.discountTotal > 0) {
      lines.push(leftRight('Discount:', `-${this._formatMoney(d.totals.discountTotal, cur)}`));
    }
    lines.push(leftRight('Tax:', this._formatMoney(d.totals.taxTotal, cur)));
    lines.push(ESC_BOLD_ON);
    lines.push(leftRight('TOTAL:', this._formatMoney(d.totals.grandTotal, cur)));
    lines.push(ESC_BOLD_OFF);

    lines.push(hr);
    lines.push(leftRight('Tender:', this._formatMoney(d.totals.tender, cur)));
    lines.push(leftRight('Change:', this._formatMoney(d.totals.change, cur)));

    // ── Payments ──
    for (const p of d.payments) {
      lines.push(`  ${p.method.toUpperCase()}: ${this._formatMoney(p.amount, cur)}`);
    }

    lines.push(hr);
    lines.push(ESC_ALIGN_CTR);

    // ── Footer ──
    lines.push('');
    lines.push(d.footer.thankYouMessage);
    if (d.sale.customerEmail) {
      lines.push(`Receipt sent to: ${d.sale.customerEmail}`);
    }
    lines.push(d.footer.refundPolicy);

    lines.push('');
    lines.push(LF_LINES(3));
    lines.push(GS_CUT);

    return Buffer.from(lines.join(LF), 'ascii');
  }

  // ── Plain Text ────────────────────────────────────────────────────

  /**
   * Generate a plain-text receipt (for SMS / email body / logging).
   * @param {object} receiptData
   * @param {{width?: number}} [opts]
   * @returns {string}
   */
  static toPlainText(receiptData, opts = {}) {
    const width = opts.width || 60;
    const d = receiptData;
    const hr = '-'.repeat(width);
    const cur = d.totals.currency;

    const leftRight = (l, r) => {
      const pad = Math.max(1, width - l.length - r.length);
      return l + ' '.repeat(pad) + r;
    };

    const center = (t) => {
      const pad = Math.max(0, Math.floor((width - t.length) / 2));
      return ' '.repeat(pad) + t;
    };

    const lines = [];

    lines.push('');
    lines.push(center(d.header.storeName));
    if (d.header.storeAddress) lines.push(d.header.storeAddress);
    if (d.header.storeTaxId)   lines.push(`Tax ID: ${d.header.storeTaxId}`);
    lines.push(hr);
    lines.push(`Receipt #: ${d.header.receiptNumber}`);
    lines.push(`Date: ${d.header.dateFormatted}  ${d.header.timeFormatted}`);
    lines.push(`Customer: ${d.sale.customerName}`);
    lines.push(hr);

    // Items
    for (const item of d.items) {
      const name = item.name.length > 35 ? item.name.slice(0, 32) + '...' : item.name;
      const qty  = String(item.qty).padStart(3);
      const amt  = ReceiptGenerator._formatMoney(item.total, cur).padStart(8);
      lines.push(`${name.padEnd(35)} ${qty}  ${amt}`);
    }

    lines.push(hr);
    lines.push(leftRight('Subtotal:', ReceiptGenerator._formatMoney(d.totals.subtotal, cur)));
    if (d.totals.discountTotal > 0) {
      lines.push(leftRight('Discount:', `-${ReceiptGenerator._formatMoney(d.totals.discountTotal, cur)}`));
    }
    lines.push(leftRight('Tax:', ReceiptGenerator._formatMoney(d.totals.taxTotal, cur)));
    lines.push(leftRight('TOTAL:', ReceiptGenerator._formatMoney(d.totals.grandTotal, cur)));
    lines.push(hr);
    lines.push(leftRight('Tender:', ReceiptGenerator._formatMoney(d.totals.tender, cur)));
    lines.push(leftRight('Change:', ReceiptGenerator._formatMoney(d.totals.change, cur)));
    for (const p of d.payments) {
      lines.push(`  ${p.method.toUpperCase()}: ${ReceiptGenerator._formatMoney(p.amount, cur)}`);
    }
    lines.push(hr);
    lines.push('');
    lines.push(center(d.footer.thankYouMessage));
    lines.push(center(d.footer.refundPolicy));
    lines.push('');

    return lines.join('\n');
  }

  // ── HTML Digital Receipt ──────────────────────────────────────────

  /**
   * Generate an HTML receipt for email or browser display.
   * @param {object} receiptData
   * @returns {string}
   */
  static toHtml(receiptData) {
    const d = receiptData;
    const cur = d.totals.currency;

    const itemRows = d.items.map(item => `
      <tr>
        <td style="padding:4px 8px;">${item.name}</td>
        <td style="padding:4px 8px; text-align:center;">${item.qty}</td>
        <td style="padding:4px 8px; text-align:right;">${ReceiptGenerator._formatMoney(item.unitPrice, cur)}</td>
        <td style="padding:4px 8px; text-align:right;">${ReceiptGenerator._formatMoney(item.total, cur)}</td>
      </tr>`).join('');

    const paymentRows = d.payments.map(p => `
      <tr>
        <td style="padding:2px 8px;">${p.method.toUpperCase()}</td>
        <td style="padding:2px 8px; text-align:right;">${ReceiptGenerator._formatMoney(p.amount, cur)}</td>
        <td style="padding:2px 8px;">${p.reference || '—'}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${d.header.receiptNumber}</title>
  <style>
    body { font-family: 'Courier New', monospace; margin:0; padding:20px; background:#f5f5f5; }
    .receipt { max-width:400px; margin:0 auto; background:#fff; border:1px solid #ddd; border-radius:8px; padding:24px; }
    hr { border:none; border-top:1px dashed #999; margin:12px 0; }
    .header { text-align:center; }
    .header h2 { margin:0 0 4px; }
    .header p { margin:2px 0; color:#555; font-size:13px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { border-bottom:1px solid #999; padding:6px 8px; text-align:left; }
    td { padding:4px 8px; }
    .total-row td { font-weight:bold; border-top:2px solid #333; padding-top:8px; }
    .grand-total { font-size:18px; font-weight:bold; text-align:center; margin:12px 0; }
    .footer { text-align:center; font-size:12px; color:#888; margin-top:16px; }
    .barcode { text-align:center; margin:12px 0; font-family:'Libre Barcode 39', monospace; font-size:32px; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h2>${d.header.storeName}</h2>
      ${d.header.storeAddress ? `<p>${d.header.storeAddress}</p>` : ''}
      ${d.header.storeTaxId ? `<p>Tax ID: ${d.header.storeTaxId}</p>` : ''}
    </div>
    <hr>
    <p><strong>Receipt #:</strong> ${d.header.receiptNumber}</p>
    <p><strong>Date:</strong> ${d.header.dateFormatted} ${d.header.timeFormatted}</p>
    <p><strong>Customer:</strong> ${d.sale.customerName}</p>
    <hr>
    <table>
      <thead>
        <tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <hr>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right;">${ReceiptGenerator._formatMoney(d.totals.subtotal, cur)}</td></tr>
      ${d.totals.discountTotal > 0 ? `<tr><td>Discount</td><td style="text-align:right; color:#c00;">-${ReceiptGenerator._formatMoney(d.totals.discountTotal, cur)}</td></tr>` : ''}
      <tr><td>Tax</td><td style="text-align:right;">${ReceiptGenerator._formatMoney(d.totals.taxTotal, cur)}</td></tr>
      <tr class="total-row"><td>TOTAL</td><td style="text-align:right; font-size:18px;">${ReceiptGenerator._formatMoney(d.totals.grandTotal, cur)}</td></tr>
    </table>
    <hr>
    <table>
      <tr><th colspan="2">Payment</th><th>Ref</th></tr>
      ${paymentRows}
      <tr><td><strong>Tender</strong></td><td style="text-align:right;">${ReceiptGenerator._formatMoney(d.totals.tender, cur)}</td><td></td></tr>
      <tr><td><strong>Change</strong></td><td style="text-align:right;">${ReceiptGenerator._formatMoney(d.totals.change, cur)}</td><td></td></tr>
    </table>
    <hr>
    <div class="footer">
      <p>${d.footer.thankYouMessage}</p>
      <p>${d.footer.refundPolicy}</p>
      ${d.sale.customerEmail ? `<p>Receipt sent to ${d.sale.customerEmail}</p>` : ''}
      <div class="barcode">${d.footer.barcode}</div>
      <p style="font-size:10px;">${d.footer.qrPrompt}</p>
    </div>
  </div>
</body>
</html>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  static _calcItemTotal(item) {
    const base = (item.unitPrice || 0) * (item.quantity || 1);
    const disc = item.discount || 0;
    const tax  = item.tax || 0;
    return base - disc + tax;
  }

  static _formatMoney(amount, currency = 'THB') {
    const symbols = { THB: '฿', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
    const sym = symbols[currency] || currency + ' ';
    return sym + (amount != null ? amount.toFixed(2) : '0.00');
  }

  static _formatDate(date) {
    const d = date || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  static _formatTime(date) {
    const d = date || new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }
}

module.exports = ReceiptGenerator;
