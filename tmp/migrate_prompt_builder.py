#!/usr/bin/env python3
"""Migrate prompt_builder.py from Mistral to Gemini + add persona injection + new styles."""

import re

with open("/home/openhands/erp-stack/prompt-builder-service/prompt_builder.py", "r") as f:
    content = f.read()

# ─── 1. Docstring ────────────────────────────────────────────────────
content = content.replace(
    "Uses Mistral for:",
    "Uses Gemini (instead of Mistral) for:"
)

# ─── 2. Import Gemini instead of Mistral ─────────────────────────────
content = content.replace(
    "from shared_config import MISTRAL_API_KEY as _MISTRAL_API_KEY_LAZY",
    "from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY\nfrom shared_config import GEMINI_MODEL"
)

# ─── 3. Replace Mistral API section with Gemini ─────────────────────
old_api = '''MISTRAL_TEXT_MODEL = "mistral-large-latest"
MISTRAL_VISION_MODEL = "pixtral-large-latest"
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"


def _get_mistral_key() -> str:
    key = os.environ.get("MISTRAL_API_KEY", "")
    if key:
        return key
    try:
        key = _MISTRAL_API_KEY_LAZY() if callable(_MISTRAL_API_KEY_LAZY) else _MISTRAL_API_KEY_LAZY
        if key:
            return key
    except Exception:
        pass
    return ""


def _call_mistral_vision(system_prompt: str, user_text: str, image_url: str, temperature: float = 0.3) -> Optional[str]:
    api_key = _get_mistral_key()
    if not api_key:
        logger.warning("No MISTRAL_API_KEY set in environment")
        return None
    if not image_url:
        return None
    try:
        payload = {
            "model": MISTRAL_VISION_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": image_url}
                ]},
            ],
            "temperature": temperature,
            "max_tokens": 2048,
        }
        resp = requests.post(
            MISTRAL_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        else:
            logger.error(f"Mistral Vision API error ({resp.status_code}): {resp.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"Mistral Vision call failed: {e}")
        return None


def _call_mistral_text(system_prompt: str, user_text: str, temperature: float = 0.3) -> Optional[str]:
    api_key = _get_mistral_key()
    if not api_key:
        logger.warning("No MISTRAL_API_KEY set in environment")
        return None
    try:
        payload = {
            "model": MISTRAL_TEXT_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
            "temperature": temperature,
            "max_tokens": 2048,
        }
        resp = requests.post(
            MISTRAL_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        else:
            logger.error(f"Mistral API error ({resp.status_code}): {resp.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"Mistral call failed: {e}")
        return None'''

new_api = '''GEMINI_MODEL_NAME = GEMINI_MODEL if isinstance(GEMINI_MODEL, str) else "gemini-2.5-flash"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def _get_gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return key
    try:
        key = _GEMINI_API_KEY_LAZY() if callable(_GEMINI_API_KEY_LAZY) else _GEMINI_API_KEY_LAZY
        if key:
            return key
    except Exception:
        pass
    return ""


def _call_gemini(system_prompt: str, user_text: str, temperature: float = 0.3) -> Optional[str]:
    api_key = _get_gemini_key()
    if not api_key:
        logger.warning("No GEMINI_API_KEY set in environment")
        return None
    try:
        model = GEMINI_MODEL_NAME
        url = f"{GEMINI_API_URL}/{model}:generateContent"
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_text}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 2048},
        }
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            json=payload,
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        else:
            logger.error(f"Gemini API error ({resp.status_code}): {resp.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"Gemini call failed: {e}")
        return None


import base64


def _call_gemini_vision(system_prompt: str, user_text: str, image_url: str, temperature: float = 0.3) -> Optional[str]:
    api_key = _get_gemini_key()
    if not api_key:
        logger.warning("No GEMINI_API_KEY set in environment")
        return None
    if not image_url:
        return None
    try:
        img_resp = requests.get(image_url, timeout=30)
        img_resp.raise_for_status()
        img_b64 = base64.b64encode(img_resp.content).decode("utf-8")
        mime = img_resp.headers.get("content-type", "image/jpeg")
        model = GEMINI_MODEL_NAME
        url = f"{GEMINI_API_URL}/{model}:generateContent"
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [
                {"text": user_text},
                {"inlineData": {"mimeType": mime, "data": img_b64}}
            ]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 2048},
        }
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            json=payload,
            timeout=60,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        else:
            logger.error(f"Gemini Vision API error ({resp.status_code}): {resp.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"Gemini Vision call failed: {e}")
        return None'''

content = content.replace(old_api, new_api)

# ─── 4. Update system prompt headers ────────────────────────────────
content = content.replace(
    'PRODUCT_ANALYSIS_SYSTEM = """คุณคือนักวิเคราะห์สินค้าสำหรับ TikTok Shop',
    'PRODUCT_ANALYSIS_SYSTEM = """คุณคือนักวิเคราะห์สินค้าสำหรับ TikTok Shop (Gemini-powered)'
)
content = content.replace(
    'PRODUCT_VISION_SYSTEM = """You are a product image analyst for TikTok Shop.',
    'PRODUCT_VISION_SYSTEM = """You are a product image analyst for TikTok Shop (Gemini-powered).'
)

# ─── 5. Update function calls from Mistral to Gemini ────────────────
content = content.replace(
    "raw = _call_mistral_text(PRODUCT_ANALYSIS_SYSTEM, user_text, temperature=0.3)",
    "raw = _call_gemini(PRODUCT_ANALYSIS_SYSTEM, user_text, temperature=0.3)"
)
content = content.replace(
    'logger.warning("Mistral analysis failed',
    'logger.warning("Gemini analysis failed'
)
content = content.replace(
    "raw = _call_mistral_vision(PRODUCT_VISION_SYSTEM, user_text, product_image, temperature=0.3)",
    "raw = _call_gemini_vision(PRODUCT_VISION_SYSTEM, user_text, product_image, temperature=0.3)"
)

# ─── 6. Add persona injection code before analyze_product_image ─────
insert_pt = content.find("def analyze_product_image")
if insert_pt < 0:
    print("ERROR: cannot find analyze_product_image")
    exit(1)

persona_code = r"""

# ─── Persona Injection ────────────────────────────────────────────────

PERSONA_TEMPLATES = {
    "energetic_young": {
        "model_age": "22-26",
        "vibe": "high energy, trendy, fast talker, Gen Z slang",
        "environment": "bedroom with led lights, trendy cafe",
        "lighting_variation": "neon pink/purple, bright indoor",
        "motion_speed": "fast, snappy cuts",
    },
    "calm_professional": {
        "model_age": "28-35",
        "vibe": "calm, authoritative, measured speech, professional",
        "environment": "modern office, clean white studio",
        "lighting_variation": "soft neutral, ring light style",
        "motion_speed": "slow, deliberate pans",
    },
    "mom_at_home": {
        "model_age": "30-40",
        "vibe": "warm, relatable, busy mom energy",
        "environment": "home kitchen, living room with kids toys",
        "lighting_variation": "warm golden, natural window",
        "motion_speed": "natural, slightly rushed",
    },
    "college_student": {
        "model_age": "19-23",
        "vibe": "casual, budget-conscious, honest reactions",
        "environment": "dorm room, campus, library",
        "lighting_variation": "cool fluorescent, mixed daylight",
        "motion_speed": "casual, natural hand gestures",
    },
    "minimalist_zen": {
        "model_age": "25-32",
        "vibe": "calm, aesthetic, slow living, premium feel",
        "environment": "minimalist room with plants, yoga space",
        "lighting_variation": "soft diffused, morning light",
        "motion_speed": "slow, graceful movements",
    },
    "tech_enthusiast": {
        "model_age": "22-30",
        "vibe": "excited, gadget-focused, fast demo style",
        "environment": "desk with monitors, gaming setup",
        "lighting_variation": "RGB lighting, cool blue/white",
        "motion_speed": "fast, demonstrative",
    },
}


def _select_persona(category: str, product_name: str = "") -> dict:
    import random
    cat_persona_map = {
        "beauty": ["energetic_young", "calm_professional", "mom_at_home", "minimalist_zen"],
        "electronics": ["tech_enthusiast", "college_student", "calm_professional"],
        "food": ["mom_at_home", "college_student", "energetic_young"],
        "fashion": ["energetic_young", "minimalist_zen", "calm_professional"],
        "home": ["mom_at_home", "minimalist_zen", "calm_professional"],
        "tools": ["calm_professional", "tech_enthusiast", "mom_at_home"],
        "health": ["calm_professional", "minimalist_zen", "energetic_young"],
    }
    pool = cat_persona_map.get(category, list(PERSONA_TEMPLATES.keys()))
    chosen = random.choice(pool)
    return PERSONA_TEMPLATES[chosen]


def _apply_persona_to_profile(profile: dict, persona: dict) -> dict:
    if persona.get("model_age"):
        profile["persona_age"] = persona["model_age"]
    if persona.get("vibe"):
        profile["persona_vibe"] = persona["vibe"]
    if persona.get("environment"):
        profile["setting"] = persona["environment"]
    if persona.get("lighting_variation"):
        profile["persona_lighting"] = persona["lighting_variation"]
    if persona.get("motion_speed"):
        profile["persona_motion"] = persona["motion_speed"]
    base_audience = profile.get("target_audience", "")
    if persona.get("vibe") and base_audience:
        profile["target_audience"] = f"{base_audience} -- {persona['vibe']}"
    return profile

"""

content = content[:insert_pt] + persona_code + content[insert_pt:]

# ─── 7. Add new styles to STYLE_MAP ──────────────────────────────────
insert_pt = content.find("PRODUCT_CATEGORY_MAP = {")
if insert_pt < 0:
    print("ERROR: cannot find PRODUCT_CATEGORY_MAP")
    exit(1)

new_styles = r"""
    "pov_lifehack": {
        "model_action": "POV angle, hands visible doing task, product solving a specific problem in real-time",
        "camera": "over-the-shoulder, chest-mounted POV, focus on hands and product action",
        "vibe": "authentic, problem-solving, instructional",
        "keywords": "POV, life hack, hands-on solution, real-time problem solving",
        "video_motion": "first-person POV motion, hands demonstrating product use, natural hand movements, solution reveal",
    },
    "asmr_texture": {
        "model_action": "extreme close-up, product being opened/applied, slow deliberate movements, no talking first 3 seconds",
        "camera": "macro close-up, extreme close up of product texture, slow zoom",
        "vibe": "satisfying, sensory, focused",
        "keywords": "ASMR, texture close-up, satisfying sounds, product details",
        "video_motion": "very slow pan across product texture, product being clicked/opened/closed, slow-motion liquid flow",
    },
    "split_comparison": {
        "model_action": "before and after comparison, showing old way vs new way, split screen effect",
        "camera": "two shots side by side, same framing for before and after",
        "vibe": "dramatic, transformative, convincing",
        "keywords": "before after, comparison, transformation, old vs new",
        "video_motion": "split screen motion, left side showing struggle, right side showing ease, wipe transition effect",
    },
    "street_interview": {
        "model_action": "excited reaction, showing product as if discovered randomly, genuine surprise",
        "camera": "shaky handheld style, vlog style, product front and center",
        "vibe": "surprised, genuine, authentic discovery",
        "keywords": "street find, random discovery, honest reaction, impulse buy",
        "video_motion": "handheld camera motion, product being brought into frame suddenly, excited presenter gestures",
    },
    "greenscreen_react": {
        "model_action": "model pointing at content behind them, reacting to product benefits shown on screen",
        "camera": "medium shot, model off-center left/right, space for content behind",
        "vibe": "reactive, commentary-style, TikTok-native",
        "keywords": "green screen, reaction, point and comment, trending format",
        "video_motion": "model pointing and gesturing at content, head turns, reaction expressions",
    },
    "aesthetic_vlog": {
        "model_action": "model going through routine naturally, product appears organically in scene, GRWM energy",
        "camera": "variety of angles, fast cuts, cinematic b-roll, sometimes model not looking at camera",
        "vibe": "cinematic, aesthetic, aspirational, premium",
        "keywords": "vlog, daily routine, GRWM, aesthetic lifestyle, cinematic",
        "video_motion": "fast paced cuts, product smoothly appearing in frame, slow motion segments, smooth transitions",
    },

"""

content = content[:insert_pt] + new_styles + content[insert_pt:]

# ─── 8. Update UGC_STYLE_FOLDER ─────────────────────────────────────
content = content.replace(
    'UGC_STYLE_FOLDER = {\n    "holding": "Holding_Product",\n    "review": "UGC_Review",\n    "usage": "Product_Usage",\n    "talking": "UGC_Review",\n}',
    'UGC_STYLE_FOLDER = {\n    "holding": "Holding_Product",\n    "review": "UGC_Review",\n    "usage": "Product_Usage",\n    "talking": "UGC_Review",\n    "pov_lifehack": "POV_Lifehack",\n    "asmr_texture": "ASMR_Texture",\n    "split_comparison": "Split_Comparison",\n    "street_interview": "Street_Interview",\n    "greenscreen_react": "Greenscreen_React",\n    "aesthetic_vlog": "Aesthetic_Vlog",\n}'
)

# ─── 9. Update analyze_and_build_prompts docstring ──────────────────
content = content.replace(
    "1. Analyze product via Mistral",
    "1. Analyze product via Gemini"
)
content = content.replace(
    "2. Optionally analyze product image via Mistral Pixtral Vision",
    "2. Optionally analyze product image via Gemini Vision"
)

# ─── 10. Insert persona injection call in analyze_and_build_prompts ──
# Find the rebuild prompts call after building them the first time
old_block = '''    # Step 2: Build prompts
    image_prompt, negative_prompt = build_image_prompt(profile, product_name, ugc_style)
    video_prompt = build_video_prompt(profile, product_name, ugc_style)
    if not negative_prompt:
        negative_prompt = build_negative_prompt(profile, ugc_style)
    
    # Step 3: Validate script timing'''

new_block = '''    # Step 2b: Inject random persona for diversity
    persona = _select_persona(profile.get("category", category or "other"), product_name)
    profile = _apply_persona_to_profile(profile, persona)
    logger.info(f"Persona: {persona.get('vibe', '')} | Env: {persona.get('environment', '')}")

    # Step 3: Build prompts (with persona-injected profile)
    image_prompt, negative_prompt = build_image_prompt(profile, product_name, ugc_style)
    video_prompt = build_video_prompt(profile, product_name, ugc_style)
    if not negative_prompt:
        negative_prompt = build_negative_prompt(profile, ugc_style)
    
    # Step 4: Validate script timing'''

content = content.replace(old_block, new_block)

# ─── 11. Update metadata ────────────────────────────────────────────
content = content.replace(
    '"ugc_style": ugc_style,\n            "used_mistral": True,\n            "image_analyzed": bool(vision_profile),',
    '"ugc_style": ugc_style,\n            "used_gemini": True,\n            "image_analyzed": bool(vision_profile),\n            "persona": {\n                "vibe": persona.get("persona_vibe", ""),\n                "environment": persona.get("setting", ""),\n                "lighting": persona.get("persona_lighting", ""),\n                "motion_speed": persona.get("persona_motion", ""),\n            }'
)

# ─── Write ───────────────────────────────────────────────────────────
with open("/home/openhands/erp-stack/prompt-builder-service/prompt_builder.py", "w") as f:
    f.write(content)

print("Done! prompt_builder.py updated.")
print(f"Total lines: {len(content.splitlines())}")

# Quick validation
if "MISTRAL_API_KEY" in content:
    print("WARNING: still contains MISTRAL_API_KEY references!")
if "GEMINI_API_KEY" not in content:
    print("WARNING: missing Gemini API imports!")
if "persona" in content:
    print("OK: Persona injection code found")
