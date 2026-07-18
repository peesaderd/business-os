#!/usr/bin/env python3
"""Update persona_engine.py with speech fields, then update script_gen.py with persona sync."""

import os, sys, ast

ERP_STACK = "/home/openhands/erp-stack"
PB_SERVICE = os.path.join(ERP_STACK, "prompt-builder-service")
MODULES_VIDEO = os.path.join(ERP_STACK, "modules", "video")

# ═══════════════════════════════════════════════════════════════════════
# 1. Update persona_engine.py — add speech_style, pacing, forbidden_phrases
# ═══════════════════════════════════════════════════════════════════════

persona_path = os.path.join(PB_SERVICE, "persona_engine.py")
with open(persona_path) as f:
    content = f.read()

enhanced_personas = """PERSONA_TEMPLATES = {
    "energetic_young": {
        "model_age": "22-26",
        "vibe": "high energy, trendy, fast talker, Gen Z slang",
        "environment": "bedroom with led lights, trendy cafe",
        "lighting_variation": "neon pink/purple, bright indoor",
        "motion_speed": "fast, snappy cuts",
        "speech_style": "พูดเร็ว ใช้ศัพท์วัยรุ่น อินเทรนด์ มีมุก มีคำฮิต 'ออมายก็อด' 'จึ้ง' 'ปัง' 'ตัวแม่' 'แก'",
        "pacing": "เร็ว กระชับ ตื่นเต้น เปลี่ยนท่อนเร็ว",
        "forbidden_phrases": "ห้ามใช้ภาษาเป็นทางการ ห้ามใช้ 'ครับ/ค่ะ' มากเกินไป ห้ามพูดยืดยาว",
    },
    "calm_professional": {
        "model_age": "28-35",
        "vibe": "calm, authoritative, measured speech, professional",
        "environment": "modern office, clean white studio",
        "lighting_variation": "soft neutral, ring light style",
        "motion_speed": "slow, deliberate pans",
        "speech_style": "พูดชัด ฉะฉาน มีหลักการ ใช้ศัพท์วิชาการพอประมาณ น่าเชื่อถือ ใช้ 'ครับ/ค่ะ' สุภาพ",
        "pacing": "ช้า กลาง เน้นคำสำคัญ เว้นจังหวะให้ข้อมูลซึม",
        "forbidden_phrases": "ห้ามใช้ศัพท์วัยรุ่น ห้ามพูดเร็วเกินไป ห้ามใช้คำไม่เป็นทางการ",
    },
    "mom_at_home": {
        "model_age": "30-40",
        "vibe": "warm, relatable, busy mom energy",
        "environment": "home kitchen, living room with kids toys",
        "lighting_variation": "warm golden, natural window",
        "motion_speed": "natural, slightly rushed",
        "speech_style": "พูดกันเองเหมือนคุยกับเพื่อน บ่นบ้าง 'งานบ้านเยอะ' 'เวลาไม่พอ' 'เจอของดีมา' ใช้ภาษาไทยธรรมชาติ",
        "pacing": "ธรรมชาติ บางทีเร็วเพราะรีบ บางทีช้าเพราะกำลังทำอะไรไปด้วย",
        "forbidden_phrases": "ห้ามใช้ภาษาอังกฤษเยอะ ห้ามใช้ศัพท์ทางการ ห้ามพูดยืดเยื้อ",
    },
    "college_student": {
        "model_age": "19-23",
        "vibe": "casual, budget-conscious, honest reactions",
        "environment": "dorm room, campus, library",
        "lighting_variation": "cool fluorescent, mixed daylight",
        "motion_speed": "casual, natural hand gestures",
        "speech_style": "พูดตรงๆ ไม่ปรุงแต่ง 'คือแบบ...' '实话实说' ประหยัดตัง 'เดี๋ยวกูทดลองให้ดู'",
        "pacing": "ธรรมชาติ กึ่งช้า ไม่ต้องเร่ง ไม่ต้องเก่ง",
        "forbidden_phrases": "ห้ามโฆษณาชัดเกินไป ห้ามใช้ภาษาเชฟหรือผู้ใหญ่",
    },
    "minimalist_zen": {
        "model_age": "25-32",
        "vibe": "calm, aesthetic, slow living, premium feel",
        "environment": "minimalist room with plants, yoga space",
        "lighting_variation": "soft diffused, morning light",
        "motion_speed": "slow, graceful movements",
        "speech_style": "พูดช้า นุ่มนวล มีสมาธิ เน้น mindful 'ลองหายใจลึกๆ แล้วมาดูกัน' ใช้คำสวยๆ",
        "pacing": "ช้า มีพื้นที่ให้หายใจ แต่ละประโยคมีน้ำหนัก",
        "forbidden_phrases": "ห้ามพูดเร็ว ห้ามใช้คำตลาด ห้ามขายของตรงเกินไป",
    },
    "tech_enthusiast": {
        "model_age": "22-30",
        "vibe": "excited, gadget-focused, fast demo style",
        "environment": "desk with monitors, gaming setup",
        "lighting_variation": "RGB lighting, cool blue/white",
        "motion_speed": "fast, demonstrative",
        "speech_style": "พูดเร็ว ตื่นเต้นกับสเปค ใช้ศัพท์เทคนิค 'แรงม้าจัด' '60fps เนียนกริ๊บ' 'ชิปตัวนี้แรงกว่าเดิมเท่าตัว'",
        "pacing": "เร็ว เร้าใจ มีลูกเล่น ตื่นเต้นตลอดเวลา",
        "forbidden_phrases": "ห้ามใช้ภาษาเพ้อเจ้อ ห้ามไม่รู้เรื่องที่พูด ห้ามไม่ถูกต้องทางเทคนิค",
    },
}"""

old_start = content.find("PERSONA_TEMPLATES = {")
old_end = content.find("\ndef _select_persona")
if old_start >= 0 and old_end >= 0:
    content = content[:old_start] + enhanced_personas + content[old_end:]

with open(persona_path, "w") as f:
    f.write(content)
print("✅ persona_engine.py — enhanced with speech_style, pacing, forbidden_phrases")
try:
    ast.parse(content)
    print("   ✓ Syntax OK")
except SyntaxError as e:
    print(f"   ✗ Syntax error line {e.lineno}: {e.msg}")

# ═══════════════════════════════════════════════════════════════════════
# 2. Rewrite script_gen.py — add persona sync
# ═══════════════════════════════════════════════════════════════════════

new_script_gen = '''"""
TikTok UGC Studio — AI Script Generator
ใช้ AiBot Auto-Gen v4.5 prompt system + Gemini API
✨ PERSONA-AWARE — น้ำเสียงสอดคล้องกับ Persona ที่เลือกไว้
"""

import os
import json
import logging
import random
import sys
from pathlib import Path
from typing import Optional

_erp_stack = Path(__file__).parent.parent.parent
if str(_erp_stack) not in sys.path:
    sys.path.insert(0, str(_erp_stack))

# ─── Import shared modules ──────────────────────────────────────────
_pb_path = _erp_stack / "prompt-builder-service"
if str(_pb_path) not in sys.path:
    sys.path.insert(0, str(_pb_path))

from shared_config import GEMINI_API_KEY
from persona_engine import PERSONA_TEMPLATES, _select_persona

logger = logging.getLogger("tiktok-ugc.script_gen")

PROMPTS_DIR = Path(__file__).parent / "prompts"


# ═══════════════════════════════════════════════════════════════════════
# ─── Persona-Aware System Prompt Builder ────────────────────────────
# ═══════════════════════════════════════════════════════════════════════

def build_script_system_prompt(persona: dict) -> str:
    """Build a persona-injected system prompt for Gemini script generation.
    
    Takes the persona dict (from persona_engine._select_persona()) and
    generates a system prompt layer that controls tone, voice, and pacing.
    """
    persona_name = persona.get("vibe", "ทั่วไป").split(",")[0].strip()
    persona_age = persona.get("model_age", "25-35")
    speech_style = persona.get("speech_style", "พูดเป็นกันเอง ธรรมชาติ")
    pacing = persona.get("pacing", "ธรรมชาติ")
    forbidden = persona.get("forbidden_phrases", "")

    base = """คุณคือ Copywriter มืออาชีพที่เขียนสคริปต์โฆษณา UGC สั้นๆ สำหรับ TikTok
สคริปต์ต้องสั้น กระชับ เข้าใจง่าย เหมาะกับ Voiceover ความยาว 8-16 วินาที

[STRICT TONE & VOICE CONTROL]
ให้สวมบทบาทเป็นบุคคลที่มีบุคลิกดังนี้:
- ลักษณะ: {persona_name} (อายุช่วง {persona_age})
- รูปแบบการพูด: {speech_style}
- จังหวะการเล่าเรื่อง: {pacing}
- ข้อห้าม: {forbidden}

[OUTPUT FORMAT]
13 คำสั่งต่อไปนี้ STRICT มาก:
1. ภาษาไทยเท่านั้น ไม่มีภาษาอังกฤษปนเว้นแต่จำเป็น
2. ห้ามใส่เครื่องหมายวรรคตอนในสคริปต์หลัก (ห้าม . , ! ? " ")
3. ห้ามใช้ตัวเลข ห้ามใส่ emoji
4. ห้ามมีคำว่า Hook Value CTA หรือ [วงเล็บ]
5. ห้ามมีคำว่า "สวัสดี" "วันนี้" "เพื่อนๆ" "ทุกคน" "ครับ" ทุกต้นคลิป
6. ห้ามขึ้นต้นด้วยคำว่า ว่าไง/ว่าไงบ้าง/ว่าไงครับ
7. ห้ามบอกว่ากดติดตาม กดไลค์ กดแชร์ แชร์เลย คลิปนี้
8. ห้ามพูดถึงหัวข้อเดิมซ้ำ
9. ให้พูดเฉพาะเนื้อหาสินค้า ห้ามพูดนอกเรื่อง
10. ส่งออกเฉพาะสคริปต์เท่านั้น ห้ามมีคำอธิบายเพิ่มเติม
11. ตอบกลับด้วยสคริปต์ภาษาไทยที่พร้อมใช้วางใน TikTok Voiceover ทันที
12. ห้ามใช้ Hook Value CTA ในสคริปต์
13. ห้ามมีตัวเลขและ emoji ในสคริปต์เด็ดขาด"""

    return base.format(
        persona_name=persona_name,
        persona_age=persona_age,
        speech_style=speech_style,
        pacing=pacing,
        forbidden=forbidden,
    )


# ─── Gemini Config ─────────────────────────────────────────────────────────

def _call_gemini(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call Gemini API for script generation."""
    api_key = GEMINI_API_KEY()
    if not api_key:
        logger.warning("No GEMINI_API_KEY configured — using template fallback")
        return None

    try:
        import httpx
        gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2000},
        }
        resp = httpx.post(url, json=payload, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        else:
            logger.warning(f"Gemini API error ({resp.status_code}): {resp.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        return None


# ─── Prompt Loader ─────────────────────────────────────────────────────────

def load_prompt(path: str) -> str:
    """Load a prompt file from the prompts directory"""
    full_path = PROMPTS_DIR / path
    if not full_path.exists():
        logger.warning(f"Prompt not found: {path}")
        return ""
    return full_path.read_text(encoding="utf-8")


def fill_template(template: str, data: dict) -> str:
    """Replace {{key}} with data[key]"""
    import re
    def replacer(m):
        key = m.group(1)
        v = data.get(key)
        return str(v) if v is not None else ""
    return re.sub(r'\{\{(\w+)\}\}', replacer, template)


# ─── Script Generators ─────────────────────────────────────────────────────

def generate_tiktok_review_script(
    product_name: str,
    customer_problem: str = "",
    main_benefit: str = "",
    target_audience: str = "",
    tone: str = "",
    cta: str = "",
    duration: str = "8s",
    extra_rules: str = "",
    persona: Optional[dict] = None,
    persona_category: str = "beauty",
) -> dict:
    """Generate a TikTok UGC review script using AiBot prompts
    
    Args:
        product_name: ชื่อสินค้า
        customer_problem: ปัญหาที่สินค้าแก้
        main_benefit: ประโยชน์หลัก
        target_audience: กลุ่มเป้าหมาย
        tone: โทนเสียง (ถ้าไม่ระบุ จะใช้จาก persona)
        cta: คำกระตุ้นการซื้อ
        duration: ความยาวคลิป (8s/16s)
        extra_rules: กฎเพิ่มเติม
        persona: dict persona จาก persona_engine (ถ้า None จะสุ่มใหม่)
        persona_category: หมวดหมู่สำหรับสุ่ม persona (ถ้า persona=None)
    """
    # ─── Persona sync ──────────────────────────────────────────────────
    if persona is None:
        persona = _select_persona(persona_category, product_name)
    persona_name = persona.get("vibe", "ทั่วไป").split(",")[0].strip()
    
    # ─── Load prompts ─────────────────────────────────────────────────
    if duration == "16s":
        system = load_prompt("system_16s.prompt.txt")
        master = load_prompt("master_16s_3step.prompt.txt")
        user_tpl = load_prompt("user_16s.prompt.txt")
    else:
        system = load_prompt("system.prompt.txt")
        master = load_prompt("master.prompt.txt")
        user_tpl = load_prompt("user.template.prompt.txt")

    # ─── Build user data ──────────────────────────────────────────────
    # tone จาก persona ถ้าไม่ override
    effective_tone = tone or persona_name
    
    user_data = {
        "product_name": product_name,
        "customer_problem": customer_problem or "ปัญหาที่พบเจอบ่อย",
        "main_benefit": main_benefit or "คุณภาพดี ใช้งานได้จริง",
        "target_audience": target_audience or "ทุกคนที่กำลังมองหา",
        "tone": effective_tone,
        "cta": cta or "กดดูในตะกร้าเลย",
        "extra_rules": extra_rules or "-",
    }

    user_prompt = fill_template(user_tpl, user_data)
    
    # ─── Build persona-aware system prompt ────────────────────────────
    persona_layer = build_script_system_prompt(persona)
    combined_system = f"{persona_layer}\n\n{system}" if system else persona_layer

    # ─── Try LLM with persona injection ───────────────────────────────
    raw = _call_gemini(combined_system, f"{master}\n\n{user_prompt}")

    if raw:
        return {
            "script": raw,
            "uses_llm": True,
            "duration": duration,
            "product": product_name,
            "persona": persona_name,
        }

    # Fallback: template-based script
    script = _template_script(user_data, duration)
    return {
        "script": script,
        "uses_llm": False,
        "duration": duration,
        "product": product_name,
        "persona": persona_name,
    }


def _template_script(data: dict, duration: str) -> str:
    """Template fallback for TikTok review script"""
    pname = data.get("product_name", "สินค้านี้")
    problem = data.get("customer_problem", "ปัญหาที่เจอ")
    benefit = data.get("main_benefit", "คุณภาพดี")
    tone = data.get("tone", "เป็นกันเอง")

    variations = json.loads(load_prompt("variation.json") or "{}")
    hooks = variations.get("hooks", ["แนะนำสินค้าดี"])
    ctas = variations.get("ctas", ["กดตะกร้าเลย"])

    hook = random.choice(hooks)
    cta_phrase = random.choice(ctas)

    if duration == "16s":
        return (
            f"[Hook] {hook}! {pname} {problem} ต้องดู!\\n\\n"
            f"[Value] {pname} {benefit} ใช้งานง่าย ได้ผลจริง "
            f"ลองใช้แล้วประทับใจมาก\\n\\n"
            f"[CTA] {cta_phrase} {pname} ราคาพิเศษวันนี้เท่านั้น!"
        )
    else:
        return (
            f"[สคริปต์ 8 วินาที]\\n"
            f"{hook}! {pname} {problem} ต้องดู!\\n"
            f"{pname} {benefit} ลองใช้แล้วดีมาก\\n"
            f"{cta_phrase}!"
        )


def generate_ugc_script(
    style: str,
    product_name: str,
    gender: str = "female",
    age: str = "25-35",
    scene: str = "home",
    custom_negative_prompt: Optional[str] = None,
    persona: Optional[dict] = None,
) -> dict:
    """
    Generate UGC video prompt by style.
    If persona provided, also pass persona name in result for traceability.
    """
    style_map = {
        "holding_product": "Holding_Product",
        "product_usage": "Product_Usage",
        "ugc_review": "UGC_Review",
    }

    folder = style_map.get(style)
    if not folder:
        return {"error": f"Unknown style: {style}"}

    system = load_prompt(f"UGC_prompts/{folder}/system.prompt")
    master = load_prompt(f"UGC_prompts/{folder}/master.prompt")
    user_tpl = load_prompt(f"UGC_prompts/{folder}/user.template.prompt")
    file_negative = load_prompt(f"UGC_prompts/{folder}/negative.prompt")
    if custom_negative_prompt:
        negative = custom_negative_prompt + ", " + file_negative if file_negative else custom_negative_prompt
    else:
        negative = file_negative

    user_data = {
        "product": product_name,
        "gender": gender,
        "age": age,
        "scene": scene,
        "background": "clean",
    }

    user_prompt = fill_template(user_tpl, user_data)
    system_full = f"{system}\\n\\n{negative}" if negative else system

    raw = _call_gemini(system_full, f"{master}\\n\\n{user_prompt}")

    result = {
        "style": style,
        "prompt": raw or f"{system_full}\\n\\n{master}\\n\\n{user_prompt}",
        "negative_prompt": negative,
        "merged_negative_prompt": negative,
        "product": product_name,
        "uses_llm": raw is not None,
    }
    if persona:
        persona_name = persona.get("vibe", "").split(",")[0].strip()
        result["persona"] = persona_name
    return result


def get_script_variations() -> dict:
    """Get available script variations from AiBot config"""
    var = load_prompt("variation.json")
    try:
        return json.loads(var) if var else {}
    except json.JSONDecodeError:
        return {
            "hooks": ["แนะนำสินค้าดี", "ของดีมาแล้ว"],
            "tones": ["เป็นกันเอง", "จริงใจ"],
            "ctas": ["กดตะกร้าเลย", "สั่งเลยวันนี้"],
            "benefits": ["คุณภาพดี", "คุ้มค่า"],
        }


SCRIPT_TEMPLATES = {
    "8s": {
        "hook": ["เปิดด้วยปัญหา", "เปิดด้วยคำถาม", "เปิดด้วยความว้าว"],
        "value": ["บอกประโยชน์หลัก", "บอกจุดเด่น"],
        "cta": ["เชิญชวนซื้อ", "บอกให้กดลิงก์"],
    },
    "16s": {
        "hook": ["เปิดเรื่อง", "ดึงดูดความสนใจ"],
        "value": ["อธิบายรายละเอียด", "บอกประโยชน์"],
        "cta": ["สรุป + เชิญชวน"],
    },
}
'''

with open(os.path.join(MODULES_VIDEO, "script_gen.py"), "w") as f:
    f.write(new_script_gen)
print("✅ script_gen.py — persona-aware rewrite complete")
try:
    ast.parse(new_script_gen)
    print("   ✓ Syntax OK")
except SyntaxError as e:
    print(f"   ✗ Syntax error line {e.lineno}: {e.msg}")

print(f"\n🔍 Total lines: persona_engine={len(content.splitlines())}, script_gen={len(new_script_gen.splitlines())}")
