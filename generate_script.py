#!/usr/bin/env python3
"""Generate script for LA GLACE product"""
import sys
sys.path.insert(0, "/home/openhands/erp-stack")
sys.path.insert(0, "/home/openhands/erp-stack/modules")

from video.script_gen import generate_tiktok_review_script

product_name = "LA GLACE MELTED SUNDAE LIP CLICK | ลิปไอติมลากลาส 26สี"
customer_problem = "ต้องการลิปสติกที่มีสีสันสดใส สวยงาม และทาแล้วไม่แห้งติดริมฝีปาก"
main_benefit = "ลิปสติกสีสันหลากหลาย 26 สี ให้ลุคหวานๆ แบบไอติมละลาย ทาแล้วเนียนไม่แห้ง"
target_audience = "สาวๆ วัยรุ่นถึงวัยทำงานที่ชื่นชอบลิปสติกสีสันสดใสและลุคที่ดูน่ารัก"

result = generate_tiktok_review_script(
    product_name=product_name,
    customer_problem=customer_problem,
    main_benefit=main_benefit,
    target_audience=target_audience,
    duration="8s",
)

print("=" * 70)
print("🎤 SCRIPT (ภาษาไทย) สำหรับ LA GLACE Lip Click")
print("=" * 70)
print()

if isinstance(result, dict):
    script_text = result.get("script", "")
    print(f"Script: {script_text}")
    print()
    print(f"--- Metadata ---")
    for key, value in result.items():
        if key != "script":
            print(f"  {key}: {value}")
else:
    print(f"Script: {result}")
