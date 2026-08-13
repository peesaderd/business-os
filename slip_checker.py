#!/usr/bin/env python3
"""
Slip Checker — ระบบเช็คสลิปโอนเงิน
ใช้ pyzbar (QR decode) + Tesseract (OCR ภาษาไทย)

Usage:
    python3 slip_checker.py <image_path>
    python3 slip_checker.py --qr-only <image_path>
    python3 slip_checker.py --ocr-only <image_path>
"""

import sys
import json
import re
from pathlib import Path

try:
    from pyzbar.pyzbar import decode as qr_decode
    from PIL import Image
except ImportError:
    print("ERROR: pip install pyzbar Pillow")
    sys.exit(1)

try:
    import pytesseract
except ImportError:
    print("ERROR: pip install pytesseract")
    sys.exit(1)


def decode_qr(image_path: str) -> dict:
    """Decode QR code from slip image."""
    img = Image.open(image_path)
    results = qr_decode(img)
    
    if not results:
        return {"status": "no_qr_found", "data": None}
    
    qr_data = results[0].data.decode("utf-8")
    
    return {
        "status": "found",
        "raw": qr_data,
        "parsed": parse_qr_payload(qr_data)
    }


def parse_qr_payload(payload: str) -> dict:
    """Parse PromptPay/EMV QR payload into readable fields."""
    result = {}
    i = 0
    
    while i < len(payload) - 4:
        tag = payload[i:i+2]
        length = int(payload[i+2:i+4])
        value = payload[i+4:i+4+length]
        
        if tag == "00":
            result["format"] = value
        elif tag == "01":
            result["initiation"] = "static" if value == "11" else "dynamic"
        elif tag == "29":
            result["merchant_info"] = parse_merchant_info(value)
        elif tag == "53":
            result["currency"] = "THB" if value == "764" else value
        elif tag == "54":
            result["amount"] = float(value)
        elif tag == "58":
            result["country"] = value
        elif tag == "63":
            result["crc"] = value
        
        i += 4 + length
    
    return result


def parse_merchant_info(data: str) -> dict:
    """Parse Merchant Account Information sub-tags."""
    result = {}
    i = 0
    
    while i < len(data) - 4:
        sub_tag = data[i:i+2]
        length = int(data[i+2:i+4])
        value = data[i+4:i+4+length]
        
        if sub_tag == "00":
            result["aid"] = value
            result["is_promptpay"] = value == "A000000677010111"
        elif sub_tag == "01":
            result["type"] = "mobile"
            result["mobile"] = format_mobile(value)
        elif sub_tag == "02":
            result["type"] = "tax_id_or_account"
            result["id"] = value
        elif sub_tag == "03":
            result["type"] = "ewallet"
            result["ewallet_id"] = value
        elif sub_tag == "04":
            result["type"] = "bank_account"
            result["account"] = value
        
        i += 4 + length
    
    return result


def format_mobile(digits: str) -> str:
    """Format mobile number from PromptPay format (0066XXXXXXXXX)."""
    if digits.startswith("0066"):
        return "0" + digits[4:]
    return digits


def ocr_image(image_path: str, lang: str = "tha+eng") -> dict:
    """OCR the slip image to extract text."""
    img = Image.open(image_path)
    
    # Full OCR
    full_text = pytesseract.image_to_string(img, lang=lang)
    
    # Parse structured fields
    parsed = parse_ocr_text(full_text)
    
    return {
        "full_text": full_text.strip(),
        "parsed": parsed
    }


def parse_ocr_text(text: str) -> dict:
    """Parse OCR text into structured fields."""
    result = {}
    
    # Amount
    amount_match = re.search(r'([\d,]+\.?\d*)\s*(?:บาท|baht|฿)', text)
    if amount_match:
        result["amount"] = float(amount_match.group(1).replace(",", ""))
    
    # Date/Time
    date_match = re.search(r'(\d{1,2})\s*(?:ส\.ค\.|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})\s*[-–]\s*(\d{1,2}:\d{2})', text)
    if date_match:
        result["date"] = f"{date_match.group(1)} {date_match.group(2)}"
        result["time"] = date_match.group(3)
    
    # Bank names
    if "กรุงไทย" in text or "Krungthai" in text:
        result["sender_bank"] = "กรุงไทย"
    if "กสิกร" in text or "KBank" in text or "KASIKORN" in text:
        result["sender_bank"] = "กสิกรไทย"
    if "กรุงเทพ" in text or "Bangkok" in text:
        result["sender_bank"] = "กรุงเทพ"
    if "ไทยพาณิชย์" in text or "SCB" in text:
        result["sender_bank"] = "ไทยพาณิชย์"
    if "ออมสิน" in text or "GSB" in text:
        result["sender_bank"] = "ออมสิน"
    if "พร้อมเพย์" in text or "PromptPay" in text:
        result["receiver_method"] = "PromptPay"
    
    # Reference code
    ref_match = re.search(r'(?:เลขอ้างอิง|Reference|Ref)[:\s]*([A-Za-z0-9]+)', text)
    if ref_match:
        result["reference"] = ref_match.group(1)
    
    # Names (Thai names starting with นาย/นาง/นางสาว)
    names = re.findall(r'(นาย|นาง|นางสาว)\s*([ก-๙a-zA-Z\s]+)', text)
    if len(names) >= 2:
        result["sender_name"] = f"{names[0][0]}{names[0][1].strip()}"
        result["receiver_name"] = f"{names[1][0]}{names[1][1].strip()}"
    elif len(names) == 1:
        result["name"] = f"{names[0][0]}{names[0][1].strip()}"
    
    # Account numbers (masked patterns like XXX-X-XX506-6)
    accounts = re.findall(r'[Xx*]{2,}[-\s]*[Xx*]*[-\s]*(\d{3,4})', text)
    if accounts:
        result["account_last4"] = accounts
    
    return result


def check_slip(image_path: str, qr_only: bool = False, ocr_only: bool = False) -> dict:
    """Main function to check a slip."""
    result = {
        "image": image_path,
        "qr": None,
        "ocr": None,
        "summary": {}
    }
    
    # QR decode
    if not ocr_only:
        result["qr"] = decode_qr(image_path)
        if result["qr"]["parsed"]:
            result["summary"]["qr_amount"] = result["qr"]["parsed"].get("amount")
            result["summary"]["qr_currency"] = result["qr"]["parsed"].get("currency")
            merchant = result["qr"]["parsed"].get("merchant_info", {})
            result["summary"]["qr_type"] = merchant.get("type")
    
    # OCR
    if not qr_only:
        result["ocr"] = ocr_image(image_path)
        if result["ocr"]["parsed"]:
            result["summary"].update(result["ocr"]["parsed"])
    
    return result


def print_result(result: dict):
    """Pretty print the result."""
    print("=" * 60)
    print("📋 SLIP CHECKER — ผลการเช็คสลิป")
    print("=" * 60)
    
    # QR Result
    if result["qr"]:
        qr = result["qr"]
        print(f"\n📱 QR Code: {'✅ Found' if qr['status'] == 'found' else '❌ Not found'}")
        if qr["parsed"]:
            p = qr["parsed"]
            print(f"   Format: {p.get('format', 'N/A')}")
            print(f"   Type: {p.get('initiation', 'N/A')}")
            print(f"   Amount: ฿{p.get('amount', 'N/A')}")
            print(f"   Currency: {p.get('currency', 'N/A')}")
            if "merchant_info" in p:
                mi = p["merchant_info"]
                print(f"   Merchant Type: {mi.get('type', 'N/A')}")
                if "account" in mi:
                    print(f"   Account: ...{mi['account'][-4:]}")
                if "mobile" in mi:
                    print(f"   Mobile: {mi['mobile']}")
    
    # OCR Result
    if result["ocr"]:
        ocr = result["ocr"]
        print(f"\n🔍 OCR Result:")
        if ocr["parsed"]:
            for k, v in ocr["parsed"].items():
                print(f"   {k}: {v}")
    
    # Summary
    if result["summary"]:
        print(f"\n📊 Summary:")
        for k, v in result["summary"].items():
            print(f"   {k}: {v}")
    
    print("\n" + "=" * 60)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    qr_only = "--qr-only" in sys.argv
    ocr_only = "--ocr-only" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    
    if not args:
        print("ERROR: No image path provided")
        sys.exit(1)
    
    image_path = args[0]
    if not Path(image_path).exists():
        print(f"ERROR: File not found: {image_path}")
        sys.exit(1)
    
    result = check_slip(image_path, qr_only, ocr_only)
    print_result(result)
    
    # Also output as JSON
    json_path = Path(image_path).with_suffix(".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n💾 JSON saved: {json_path}")


if __name__ == "__main__":
    main()
