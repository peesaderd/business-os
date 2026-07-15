#!/usr/bin/env python3
"""
Complete Workflow Test: TUS → Prompt Builder → Full Output
ดึงสินค้าจาก TUS → สร้างทุกสิ่ง (Analysis, Image/Video Prompt, Script, Hashtags)
"""
import sys
import json
import requests

# เพิ่ม path สำหรับ import script_gen
sys.path.insert(0, "/home/openhands/erp-stack")
sys.path.insert(0, "/home/openhands/erp-stack/modules")

from video.script_gen import generate_tiktok_review_script

# Service URLs
TUS_URL = "http://localhost:8105"
PROMPT_URL = "http://localhost:8117"

def get_tus_product(category="Lipstick", trending=True):
    """ดึงสินค้า 1 รายการจาก TUS"""
    products = requests.get(f"{TUS_URL}/products/list").json().get("products", [])
    
    # Filter
    if category:
        products = [p for p in products if category.lower() in p.get("category", "").lower()]
    if trending:
        products = [p for p in products if p.get("trending", 0) == 1]
    
    return products[0] if products else None

def generate_full_prompt_set(product):
    """สร้างทุกสิ่งจากสินค้า 1 รายการ"""
    # Step 1: ส่งไป Prompt Builder API
    image_url = f"{TUS_URL}{product['images'][0]}" if product.get('images') else None
    
    payload = {
        "product_name": product.get("title", ""),
        "product_description": product.get("description", ""),
        "product_image": image_url,
        "recipe_name": "tus",
        "price": product.get("price_thb"),
        "category": product.get("category", ""),
    }
    
    print(f"\n🧠 Step 1: Send to Prompt Builder API...")
    prompt_result = requests.post(f"{PROMPT_URL}/api/v1/build", json=payload).json()
    
    # Step 2: สร้าง Script ภาษาไทย
    print(f"🎤 Step 2: Generate Thai Script with Gemini...")
    analysis = prompt_result.get("analysis", {})
    
    script_result = generate_tiktok_review_script(
        product_name=product.get("title", ""),
        customer_problem=analysis.get("customer_problem", ""),
        main_benefit=analysis.get("main_benefit", ""),
        target_audience=analysis.get("target_audience", ""),
        duration="8s",
    )
    
    # Extract script text
    if isinstance(script_result, dict):
        script_text = script_result.get("script", "")
    else:
        script_text = str(script_result)
    
    # Step 3: รวมผลลัพธ์ทั้งหมด
    full_output = {
        "product": {
            "id": product.get("product_id"),
            "name": product.get("title"),
            "price": product.get("price_thb"),
            "rating": product.get("rating"),
            "sold": product.get("sold_total"),
            "category": product.get("category"),
            "seller": product.get("seller_name"),
            "image_url": image_url,
        },
        "analysis": analysis,
        "image_prompt": prompt_result.get("image_prompt", ""),
        "video_prompt": prompt_result.get("video_prompt", ""),
        "negative_prompt": prompt_result.get("negative_prompt", ""),
        "script": {
            "text": script_text,
            "duration": "8s",
            "language": "Thai"
        },
        "hashtags": analysis.get("hashtags", []),
        "metadata": {
            "ugc_style": "holding",
            "used_mistral": prompt_result.get("metadata", {}).get("used_mistral", False),
            "image_analyzed": prompt_result.get("metadata", {}).get("image_analyzed", False),
        }
    }
    
    return full_output

def display_full_output(output):
    """แสดงผลครบทุก field"""
    product = output["product"]
    analysis = output["analysis"]
    
    print("\n" + "=" * 80)
    print(f" PRODUCT: {product['name'][:60]}...")
    print("=" * 80)
    print(f"   💰 Price: ฿{product['price']}")
    print(f"   ⭐ Rating: {product['rating']}/5")
    print(f"   📈 Sold: {product['sold']:,} units")
    print(f"   🏷️  Category: {product['category']}")
    print(f"   🏪 Seller: {product['seller']}")
    print(f"   🖼️  Image: {product['image_url'][:80]}...")
    
    print(f"\n{'=' * 80}")
    print(f"📊 ANALYSIS (Mistral Vision)")
    print(f"{'=' * 80}")
    print(f"   ️  Category: {analysis.get('category')}")
    print(f"   👤 Target: {analysis.get('target_gender')}, {analysis.get('target_age')} years old")
    print(f"   🎯 Audience: {analysis.get('target_audience')}")
    print(f"   😤 Problem: {analysis.get('customer_problem')}")
    print(f"   ✅ Benefit: {analysis.get('main_benefit')}")
    print(f"    Setting: {analysis.get('setting')}")
    
    print(f"\n{'=' * 80}")
    print(f"🖼️  IMAGE PROMPT (สำหรับ Nano Banana)")
    print(f"{'=' * 80}")
    print(f"   Length: {len(output['image_prompt'])} chars")
    print(f"   Content:\n{output['image_prompt']}")
    
    print(f"\n{'=' * 80}")
    print(f"🎬 VIDEO PROMPT (สำหรับ Wan 2.7)")
    print(f"{'=' * 80}")
    print(f"   Length: {len(output['video_prompt'])} chars")
    print(f"   Content:\n{output['video_prompt']}")
    
    print(f"\n{'=' * 80}")
    print(f" SCRIPT (ภาษาไทย - 8 วินาที)")
    print(f"{'=' * 80}")
    print(f"   Length: {len(output['script']['text'])} chars")
    print(f"   Duration: {output['script']['duration']}")
    print(f"   Content:\n{output['script']['text']}")
    
    print(f"\n{'=' * 80}")
    print(f"🚫 NEGATIVE PROMPT")
    print(f"{'=' * 80}")
    print(f"   {output['negative_prompt']}")
    
    print(f"\n{'=' * 80}")
    print(f"🏷️  HASHTAGS ({len(output['hashtags'])} อัน)")
    print(f"{'=' * 80}")
    for i, tag in enumerate(output['hashtags'], 1):
        print(f"   {i}. {tag}")
    
    print(f"\n{'=' * 80}")
    print(f"✅ QUALITY CHECKS")
    print(f"{'=' * 80}")
    
    issues = []
    
    # ตรวจสอบคุณภาพ
    thai_chars_img = sum(1 for c in output['image_prompt'] if '\u0e00' <= c <= '\u0e7f')
    thai_chars_vid = sum(1 for c in output['video_prompt'] if '\u0e00' <= c <= '\u0e7f')
    
    if thai_chars_img > 0:
        issues.append(f"❌ Image prompt มีภาษาไทย {thai_chars_img} ตัว")
    else:
        print(f"   ✅ Image prompt ไม่มีภาษาไทย")
    
    if thai_chars_vid > 0:
        issues.append(f"❌ Video prompt มีภาษาไทย {thai_chars_vid} ตัว")
    else:
        print(f"   ✅ Video prompt ไม่มีภาษาไทย")
    
    product_name = product['name'][:20]
    if product_name in output['image_prompt']:
        issues.append(f"❌ Image prompt มีชื่อสินค้า")
    else:
        print(f"   ✅ Image prompt ไม่มีชื่อสินค้า")
    
    if "Ultra-realistic" in output['image_prompt']:
        issues.append(f"❌ Image prompt ยังใช้ 'Ultra-realistic'")
    else:
        print(f"   ✅ Image prompt ไม่มี 'Ultra-realistic' (UGC style)")
    
    if "Casual smartphone" in output['image_prompt']:
        print(f"   ✅ Image prompt ใช้ 'Casual smartphone' (UGC)")
    
    if "25" in output['image_prompt']:
        print(f"   ✅ Image prompt ระบุ age 25 ปี")
    
    script_text = output['script']['text']
    thai_chars_script = sum(1 for c in script_text if '\u0e00' <= c <= '\u0e7f')
    if thai_chars_script > 0:
        print(f"   ✅ Script เป็นภาษาไทย ({thai_chars_script} ตัวอักษร)")
    else:
        issues.append(f"❌ Script ไม่มีภาษาไทย")
    
    if len(output['hashtags']) >= 3:
        print(f"   ✅ Hashtags {len(output['hashtags'])} อัน")
    
    if output['metadata']['used_mistral']:
        print(f"   ✅ ใช้ Mistral Vision วิเคราะห์รูป")
    
    if issues:
        print(f"\n⚠️  ISSUES FOUND:")
        for issue in issues:
            print(f"   {issue}")
    else:
        print(f"\n🎉 ALL CHECKS PASSED!")
    
    return output

# ══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 80)
    print("COMPLETE WORKFLOW TEST")
    print("TUS Product → Prompt Builder → Script → Full Output")
    print("=" * 80)
    
    # ดึงสินค้าจาก TUS
    print("\n Fetching product from TUS (Lipstick category)...")
    product = get_tus_product(category="Lipstick", trending=True)
    
    if not product:
        print("❌ No product found")
        sys.exit(1)
    
    print(f"✅ Product found: {product['title'][:60]}...")
    
    # สร้างทุกสิ่ง
    output = generate_full_prompt_set(product)
    
    # แสดงผลครบทุก field
    result = display_full_output(output)
    
    # บันทึกเป็น JSON
    output_file = "/tmp/full_prompt_output.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Output saved to: {output_file}")
    print(f"\n{'=' * 80}")
    print("✅ WORKFLOW COMPLETE")
    print(f"{'=' * 80}")
