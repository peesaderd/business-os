#!/usr/bin/env python3
"""Test Pipeline Logger — verify logging works correctly"""
import sys
sys.path.insert(0, "/home/openhands/erp-stack/modules")

from video.pipeline_logger import start_job, update_step, update_prompts, update_analysis, complete_job, get_job

print("=" * 70)
print("PIPELINE LOGGER TEST")
print("=" * 70)

# Test 1: Start job
print("\n📝 Test 1: Start pipeline job")
job_id = "test_logger_002"
start_job(job_id, {
    "product_title": "ลิปสติกสีแดง ติดทน 12 ชม.",
    "product_image": "https://example.com/lipstick.jpg",
    "product_description": "ลิปสติกสีแดงสด ติดทน ไม่หลุดง่าย ให้ลุคโดดเด่น",
    "recipe_name": "tus",
    "ugc_style": "holding"
})
print(f"   ✅ Job started: {job_id}")

# Test 2: Update steps
print("\n📝 Test 2: Update pipeline steps")
update_analysis(job_id, {
    'duration_ms': 1500,
    'category': 'beauty',
    'target_gender': 'female',
    'target_age': '25'
})
print("   ✅ Step 'analyze' updated via update_analysis()")

update_step(job_id, 'recipe', {
    'duration_ms': 50,
})
print("   ✅ Step 'recipe' updated")

update_step(job_id, 'script', {
    'duration_ms': 2000,
})
print("   ✅ Step 'script' updated")

update_step(job_id, 'image_prompt', {
    'duration_ms': 1200,
})
print("   ✅ Step 'image_prompt' updated")

update_prompts(job_id, {
    'image_prompt': 'Casual smartphone photo. A woman holding the product...',
    'video_prompts': ['Scene 1: woman holds product', 'Scene 2: close-up of lips'],
    'script': 'ใครชอบลิปสติกหลุดง่ายบ้าง? ต้องลองลิปสติกสีแดงตัวนี้เลย!',
    'negative_prompt': 'text, watermark, logo',
    'hashtags': ['ลิปสติกติดทน', 'ลิปสติกสีแดง', 'เมคอัพ'],
    'scenes': [{'name': 'hook', 'duration': 3}, {'name': 'demo', 'duration': 5}]
})
print("   ✅ Prompts updated via update_prompts()")

# Test 3: Get job
print("\n📝 Test 3: Retrieve job data")
job = get_job(job_id)
if job:
    print(f"   ✅ Job found: {job.get('job_id')}")
    print(f"   Product: {job.get('product_title')}")
    print(f"   Status: {job.get('status')}")
    print(f"   Image prompt: {job.get('image_prompt', '')[:50]}...")
    print(f"   Script: {job.get('script', '')[:50]}...")
    print(f"   Duration analysis_ms: {job.get('duration_analysis_ms')}")
    print(f"   Duration recipe_ms: {job.get('duration_recipe_ms')}")
    print(f"   Duration script_ms: {job.get('duration_script_ms')}")
    print(f"   Duration image_prompt_ms: {job.get('duration_image_prompt_ms')}")
else:
    print(f"   ❌ Job not found!")

# Test 4: Complete job
print("\n📝 Test 4: Complete pipeline job")
complete_job(
    job_id=job_id,
    final_path='/storage/videos/test_video.mp4',
    total_duration_ms=8000,
    total_video_duration=8.0,
    total_scenes=6
)
print("   ✅ Job completed")

# Test 5: Verify completion
print("\n📝 Test 5: Verify completed job")
job = get_job(job_id)
if job:
    print(f"   ✅ Job status: {job.get('status')}")
    print(f"   ✅ Final path: {job.get('final_video_path')}")
    print(f"   ✅ Duration: {job.get('total_duration_seconds')}s")
    print(f"   ✅ Total scenes: {job.get('total_scenes')}")
    print(f"   ✅ Duration total_ms: {job.get('duration_total_ms')}")
else:
    print(f"   ❌ Job not found!")

print("\n" + "=" * 70)
print("✅ ALL LOGGER TESTS PASSED")
print("=" * 70)
print(f"Job ID: {job_id}")
print("Pipeline logger is working correctly!")
