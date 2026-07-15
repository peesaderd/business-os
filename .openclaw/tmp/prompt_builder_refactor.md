 refactor prompt-builder-service/prompt_builder.py ให้ใช้ Mistral API แทน Gemini API ทั้งหมด

ปัญหา:
- GEMINI_API_KEY ที่ใช้ได้ (AQ.Ab8...) เป็น Gemini Live API key ซึ่งใช้กับ generateContent endpoint ไม่ได้
- Model "gemini-2.5-flash" ไม่มีใน Gemini API

สิ่งที่ต้องทำ:
1. เพิ่ม import shared_config ที่ไฟล์ prompt_builder.py
2. แก้ _call_gemini_vision() ให้ใช้ Mistral pixtral-large-2501 แทน
3. แก้ _call_gemini() ให้ใช้ Mistral mistral-large-latest แทน
4. ใช้ MISTRAL_API_KEY จาก shared_config

ตัวอย่าง Mistral API call:
```python
resp = requests.post(
    "https://api.mistral.ai/v1/chat/completions",
    headers={"Authorization": f"Bearer {MISTRAL_API_KEY()}"},
    json={
        "model": "pixtral-large-2501",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": image_url}
            ]}
        ]
    }
)
return resp.json()["choices"][0]["message"]["content"]
```

สำหรับ text-only:
```python
resp = requests.post(
    "https://api.mistral.ai/v1/chat/completions",
    headers={"Authorization": f"Bearer {MISTRAL_API_KEY()}"},
    json={
        "model": "mistral-large-latest",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text}
        ]
    }
)
return resp.json()["choices"][0]["message"]["content"]
```

ไฟล์ที่ต้องแก้:
- /home/openhands/erp-stack/prompt-builder-service/prompt_builder.py

ตรวจสอบ shared_config ที่ /home/openhands/erp-stack/shared_config.py ก่อนใช้
