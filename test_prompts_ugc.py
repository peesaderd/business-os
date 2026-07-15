#!/usr/bin/env python3
"""Test Pipeline Prompt Flow — Step 1-4 (verify UGC style prompts)"""
import sys
sys.path.insert(0, "/home/openhands/erp-stack")
sys.path.insert(0, "/home/openhands/erp-stack/prompt-builder-service")
sys.path.insert(0, "/home/openhands/erp-stack/modules")

PRODUCT_NAME = "ลิปสติกสีแดง ติดทน 12 ชม."
PRODUCT_DESC = "ลิปสติกสีแดงสด ติดทน ไม่หลุดง่าย ให้ลุคโดดเด่น"

print("=" * 70)
print("PIPELINE PROMPT TEST — UGC STYLE")
print("=" * 70)

# Step 1: Analyze
from prompt_builder import analyze_product
profile = analyze_product(PRODUCT_NAME, PRODUCT_DESC)
print(f"\n✅ Step 1: {profile.get('category')} / {profile.get('target_gender')} / {profile.get('target_age')}")
print(f"   image_description: {profile.get('image_description','')[:150]}...")

# Step 3: Script
from video.script_gen import generate_tiktok_review_script
script_result = generate_tiktok_review_script(
    product_name=PRODUCT_NAME,
    customer_problem=profile.get("customer_problem",""),
    main_benefit=profile.get("main_benefit",""),
    target_audience=profile.get("target_audience",""),
    duration="8s",
)
script_text = script_result.get("script","") if isinstance(script_result, dict) else script_result
print(f"\n✅ Step 3 Script: {script_text[:100]}...")

# Step 4: Image Prompt
from prompt_builder import build_image_prompt
image_prompt, negative = build_image_prompt(profile, PRODUCT_NAME, "holding")
print(f"\n✅ Step 4 Image Prompt ({len(image_prompt)} chars):")
print(f"   {image_prompt}")

# Step 5: Video Prompt  
from prompt_builder import build_video_prompt
video_prompt = build_video_prompt(profile, PRODUCT_NAME, "holding")
print(f"\n✅ Step 5 Video Prompt ({len(video_prompt)} chars):")
print(f"   {video_prompt}")

# Hashtags
print(f"\n✅ Hashtags: {profile.get('hashtags')}")
print(f"✅ Negative: {negative[:80]}...")

# Quality checks
print("\n" + "=" * 70)
print("QUALITY CHECKS")
print("=" * 70)
thai_chars = sum(1 for c in image_prompt if '\u0e00' <= c <= '\u0e7f')
print(f"Thai chars in image_prompt: {thai_chars} {'❌' if thai_chars > 0 else '✅'}")
thai_chars_v = sum(1 for c in video_prompt if '\u0e00' <= c <= '\u0e7f')
print(f"Thai chars in video_prompt: {thai_chars_v} {'❌' if thai_chars_v > 0 else '✅'}")
print(f"Product name in image_prompt: {'❌ YES' if PRODUCT_NAME in image_prompt else '✅ NO'}")
print(f"'Ultra-realistic' in image_prompt: {'❌ YES' if 'Ultra-realistic' in image_prompt else '✅ NO'}")
print(f"'Casual smartphone' in image_prompt: {'✅ YES' if 'Casual smartphone' in image_prompt or 'smartphone' in image_prompt.lower() else '⚠️  NO'}")
print(f"Age in image_prompt contains '25': {'✅ YES' if '25' in image_prompt else '⚠️  NO'}")
print(f"Hashtags count: {len(profile.get('hashtags', []))} {'✅' if len(profile.get('hashtags', [])) >= 3 else '❌'}")
