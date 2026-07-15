#!/usr/bin/env python3
"""
Full Workflow Test: TUS Products → Prompt Builder → Output
ดึงสินค้าจาก TUS → ส่งไป Prompt Builder → ดูผลลัพธ์ทุก field
"""
import sys
import json
import requests

# Service URLs
TUS_URL = "http://localhost:8105"
PROMPT_URL = "http://localhost:8117"

def get_tus_products(limit=5, category=None, trending=False):
    """ดึงสินค้าจาก TUS"""
    products = requests.get(f"{TUS_URL}/products/list").json().get("products", [])
    
    # Filter
    if category:
        products = [p for p in products if category.lower() in p.get("category", "").lower()]
    if trending:
        products = [p for p in products if p.get("trending", 0) == 1]
    
    return products[:limit]

def build_prompt_from_product(product):
    """ส่งสินค้าไป Prompt Builder"""
    image_url = f"{TUS_URL}{product['images'][0]}" if product.get('images') else None
    
    payload = {
        "product_name": product.get("title", ""),
        "product_description": product.get("description", ""),
        "product_image": image_url,
        "recipe_name": "tus",
        "price": product.get("price_thb"),
        "category": product.get("category", ""),
    }
    
    result = requests.post(f"{PROMPT_URL}/api/v1/build", json=payload).json()
    return result, image_url

print("=" * 70)
print("WORKFLOW TEST: TUS → Prompt Builder → Output")
print("=" * 70)

# Step 1: ดึงสินค้าจาก TUS (Lipstick, trending)
print("\n📦 Step 1: Fetch products from TUS")
products = get_tus_products(limit=3, category="Lipstick")
print(f"   Found {len(products)} lipstick products")

# เลือกสินค้ามาทดสอบ
if products:
    product = products[0]
    print(f"\n🎯 Selected Product:")
    print(f"   📛 Name: {product['title'][:60]}...")
    print(f"   💰 Price: ฿{product.get('price_thb', 'N/A')}")
    print(f"   ⭐ Rating: {product.get('rating', 'N/A')}")
    print(f"   📈 Sold: {product.get('sold_total', 'N/A'):,} units")
    print(f"   🔥 Viral: {product.get('viral_score', 'N/A')}")
    print(f"   🏷️  Category: {product.get('category')}")
    print(f"   🏪 Seller: {product.get('seller_name')}")
    print(f"   🖼️  Images: {len(product.get('images', []))} รูป")
    
    # Step 2: ส่งไป Prompt Builder
    print(f"\n🧠 Step 2: Send to Prompt Builder API")
    result, image_url = build_prompt_from_product(product)
    print(f"   Image URL: {image_url[:80]}...")
    
    # Step 3: แสดงผลครบทุก field
    print(f"\n📋 Step 3: Full Prompt Output")
    print(f"\n{'='*70}")
    print("📊 ANALYSIS (จาก Mistral)")
    print(f"{'='*70}")
    analysis = result.get("analysis", {})
    print(f"   🏷️  Category: {analysis.get('category')}")
    print(f"   👤 Target: {analysis.get('target_gender')}, {analysis.get('target_age')} years old")
    print(f"   🎯 Audience: {analysis.get('target_audience')}")
    print(f"   😤 Problem: {analysis.get('customer_problem')}")
    print(f"   ✅ Benefit: {analysis.get('main_benefit')}")
    print(f"   📍 Setting: {analysis.get('setting')}")
    print(f"   🏷️  Hashtags: {', '.join(analysis.get('hashtags', []))}")
    
    print(f"\n{'='*70}")
    print("🖼️  IMAGE PROMPT (สำหรับ Nano Banana)")
    print(f"{'='*70}")
    image_prompt = result.get("image_prompt", "")
    print(f"   Length: {len(image_prompt)} chars")
    print(f"   Content:\n{image_prompt}")
    
    print(f"\n{'='*70}")
    print("🎬 VIDEO PROMPT (สำหรับ Wan 2.7)")
    print(f"{'='*70}")
    video_prompt = result.get("video_prompt", "")
    print(f"   Length: {len(video_prompt)} chars")
    print(f"   Content:\n{video_prompt}")
    
    print(f"\n{'='*70}")
    print("🚫 NEGATIVE PROMPT")
    print(f"{'='*70}")
    negative = result.get("negative_prompt", "")
    print(f"   {negative}")
    
    print(f"\n{'='*70}")
    print("✅ QUALITY CHECKS")
    print(f"{'='*70}")
    
    # ตรวจคุณภาพ
    issues = []
    
    # 1. ไม่มีภาษาไทยใน prompts
    thai_chars_img = sum(1 for c in image_prompt if '\u0e00' <= c <= '\u0e7f')
    thai_chars_vid = sum(1 for c in video_prompt if '\u0e00' <= c <= '\u0e7f')
    if thai_chars_img > 0:
        issues.append(f"❌ Image prompt มีภาษาไทย {thai_chars_img} ตัว")
    else:
        print(f"   ✅ Image prompt ไม่มีภาษาไทย")
    if thai_chars_vid > 0:
        issues.append(f"❌ Video prompt มีภาษาไทย {thai_chars_vid} ตัว")
    else:
        print(f"   ✅ Video prompt ไม่มีภาษาไทย")
    
    # 2. ไม่มีชื่อสินค้าใน prompts (AI เห็นรูปแล้ว)
    product_name = product.get("title", "")[:20]
    if product_name in image_prompt:
        issues.append(f"❌ Image prompt มีชื่อสินค้า: {product_name}")
    else:
        print(f"   ✅ Image prompt ไม่มีชื่อสินค้า")
    
    # 3. ไม่มี Ultra-realistic (cinematic)
    if "Ultra-realistic" in image_prompt:
        issues.append(f"❌ Image prompt ยังใช้ 'Ultra-realistic'")
    else:
        print(f"   ✅ Image prompt ไม่มี 'Ultra-realistic' (UGC style)")
    
    # 4. Age เป็น 25 ปี (consistent)
    if "25" in image_prompt:
        print(f"   ✅ Image prompt ระบุ age 25 ปี")
    
    # 5. มี Hashtags
    hashtags = analysis.get("hashtags", [])
    print(f"   ✅ Hashtags: {len(hashtags)} อัน")
    
    if issues:
        print(f"\n⚠️  ISSUES FOUND:")
        for issue in issues:
            print(f"   {issue}")
    else:
        print(f"\n🎉 ALL CHECKS PASSED!")

else:
    print("❌ No products found")
