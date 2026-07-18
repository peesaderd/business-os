#!/usr/bin/env python3
"""Split prompt_builder.py into 4 modules for cleaner microservice architecture."""

import os, ast

SRC = "/home/openhands/erp-stack/prompt-builder-service/prompt_builder.py"
DST = "/home/openhands/erp-stack/prompt-builder-service"

with open(SRC, "r") as f:
    lines = f.readlines()

def find_line(marker, start=0):
    """Find line index containing marker, return None if not found."""
    for i in range(start, len(lines)):
        if marker in lines[i]:
            return i
    return None

def extract_range(start_marker, end_marker, start_off=0, end_off=0):
    """Extract lines between two markers (exclusive of end)."""
    s = find_line(start_marker)
    e = find_line(end_marker, s+1) if end_marker else len(lines)
    if s is None:
        print(f"  WARNING: start '{start_marker}' not found")
        return ""
    return "".join(lines[s+start_off:e+end_off])

# ═══════════════════════════
# 1. prompt_templates.py
# ═══════════════════════════
templates = """# ─── Prompt Templates ────────────────────────────────────────────
# STYLE_MAP, category mapping, UGC prompt template loaders
# ═══════════════════════════════════════════════════════════════════════

import os
import json
import re
from typing import Optional, List, Dict, Any
from pathlib import Path

BASE_DIR = Path(__file__).parent
UGC_PROMPTS_DIR = str(BASE_DIR / "UGC_prompts")
RECIPES_DIR = str(BASE_DIR / "recipes")

"""

# STYLE_MAP section: from STYLE_MAP = { to end of closing }
style_start = find_line("STYLE_MAP = {")
if style_start is not None:
    # Find matching closing brace at outer level
    depth = 0
    style_end = style_start
    for i in range(style_start, len(lines)):
        stripped = lines[i].strip()
        if stripped == "{":
            depth += 1
        elif stripped == "}":
            depth -= 1
            if depth == 0:
                style_end = i
                break
    
    # PRODUCT_CATEGORY_MAP starts right after
    cat_start = find_line("PRODUCT_CATEGORY_MAP = {", style_end)
    if cat_start is not None:
        depth = 0
        cat_end = cat_start
        for i in range(cat_start, len(lines)):
            stripped = lines[i].strip()
            if stripped == "{":
                depth += 1
            elif stripped == "}":
                depth -= 1
                if depth == 0:
                    cat_end = i
                    break
    
    # UGC_STYLE_FOLDER starts after
    folder_start = find_line("UGC_STYLE_FOLDER = {", cat_end)
    if folder_start is not None:
        depth = 0
        folder_end = folder_start
        for i in range(folder_start, len(lines)):
            stripped = lines[i].strip()
            if stripped == "{":
                depth += 1
            elif stripped == "}":
                depth -= 1
                if depth == 0:
                    folder_end = i
                    break
    
    # Functions after UGC_STYLE_FOLDER up to Gemini API Calls
    gemini_start = find_line("Gemini API Calls")
    
    # STYLE_MAP only (not cat_end which includes PRODUCT_CATEGORY_MAP)
    # Find where STYLE_MAP closes - second closing brace after opening
    depth = 0
    style_close = style_start
    for i in range(style_start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0:
            style_close = i
            break
    templates += "".join(lines[style_start:style_close+1]) + "\n\n"
    # PRODUCT_CATEGORY_MAP (from its start to its closing brace)
    depth = 0
    cat_close = cat_start
    for i in range(cat_start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0:
            cat_close = i
            break
    templates += "".join(lines[cat_start:cat_close+1]) + "\n\n"
    # UGC_STYLE_FOLDER (from its start to its closing brace)
    depth = 0
    folder_close = folder_start
    for i in range(folder_start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0:
            folder_close = i
            break
    templates += "".join(lines[folder_start:folder_close+1]) + "\n\n"
    # Add the functions between folder and gemini
    templates += "".join(lines[folder_close+1:gemini_start])

with open(f"{DST}/prompt_templates.py", "w") as f:
    f.write(templates)
print(f"✅ prompt_templates.py ({len(templates.splitlines())} lines)")

# ═══════════════════════════
# 2. gemini_client.py
# ═══════════════════════════
gemini = """# ─── Gemini API Client ──────────────────────────────────────────
# Low-level Gemini API calls + product image analysis
# ═══════════════════════════════════════════════════════════════════════

import os
import json
import base64
import logging
from typing import Optional, List, Dict, Any

import requests

logger = logging.getLogger("prompt-builder-service")

from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY
from shared_config import GEMINI_MODEL
from prompt_templates import _extract_json

"""

gemini_start = find_line("Gemini API Calls")
persona_start = find_line("Persona Injection")
if gemini_start and persona_start:
    gemini_section = "".join(lines[gemini_start:persona_start])
    gemini += gemini_section + "\n"

# Also move analyze_product_image (it's between persona and prompt generation)
img_start = find_line("def analyze_product_image")
img_end = find_line("def analyze_product", img_start+1) if img_start else None
if img_start and img_end:
    gemini += "".join(lines[img_start:img_end]) + "\n"

with open(f"{DST}/gemini_client.py", "w") as f:
    f.write(gemini)
print(f"✅ gemini_client.py ({len(gemini.splitlines())} lines)")

# ═══════════════════════════
# 3. persona_engine.py
# ═══════════════════════════
persona = """# ─── Persona Engine ─────────────────────────────────────────────
# Persona selection and injection for UGC diversity
# ═══════════════════════════════════════════════════════════════════════

import random
import logging
from typing import Dict, Optional

logger = logging.getLogger("prompt-builder-service")

"""

ps_start = find_line("PERSONA_TEMPLATES")
funcs_end = find_line("gemini_client")  # This won't match dummy

# Find end: either analyze_product_image or next section "Image & Video"
for name in ["def analyze_product_image", "Image & Video Prompt"]:
    funcs_end = find_line(name, ps_start)
    if funcs_end:
        break

if ps_start and funcs_end:
    persona += "".join(lines[ps_start:funcs_end])

with open(f"{DST}/persona_engine.py", "w") as f:
    f.write(persona)
print(f"✅ persona_engine.py ({len(persona.splitlines())} lines)")

# ═══════════════════════════
# 4. Rewrite prompt_builder.py (thin orchestrator)
# ═══════════════════════════
def extract_def(name, lines, start_search=0):
    """Extract a full top-level function definition by name."""
    start = find_line(f"def {name}(", start_search)
    if start is None:
        return None, None, None
    end = len(lines)
    for i in range(start+1, len(lines)):
        if lines[i].strip().startswith("def ") and not lines[i].startswith(" "):
            # Check it's not an inner function (needs module-level indent 0)
            indent = len(lines[i]) - len(lines[i].lstrip())
            if indent == 0:
                end = i
                break
    return "".join(lines[start:end]), start, end

# Functions that stay in prompt_builder
stay_funcs = [
    "analyze_product",           # Product analysis
    "build_image_prompt",        # Image prompt builder
    "build_video_prompt",        # Video prompt builder
    "build_negative_prompt",     # Negative prompt builder
    "_estimate_speech_duration", # Timing helper
    "_build_timing_validated_script",  # Script timing
    "analyze_and_build_prompts", # Main orchestrator
    "build_prompt",              # Backward compat
]

# Build new file header
new_pb = """# ─── Prompt Builder — Main Orchestrator ──────────────────────────
# Thin layer that imports from sub-modules and orchestrates the pipeline
# ═══════════════════════════════════════════════════════════════════════

import os
import json
import logging
import random
from typing import Optional, List, Dict, Any
from pathlib import Path
from copy import deepcopy

import requests

from prompt_templates import (
    STYLE_MAP, PRODUCT_CATEGORY_MAP, UGC_STYLE_FOLDER,
    load_ugc_templates, fill_template, _match_category,
    _get_lighting, _extract_json, BASE_DIR,
)
from gemini_client import (
    _call_gemini, _call_gemini_vision, _get_gemini_key, analyze_product_image,
)
from persona_engine import (
    PERSONA_TEMPLATES, _select_persona, _apply_persona_to_profile,
)

logger = logging.getLogger("prompt-builder-service")

"""

for func in stay_funcs:
    content, s, e = extract_def(func, lines)
    if content:
        new_pb += content + "\n\n"
    else:
        print(f"  ⚠️ Function '{func}' not found")

with open(f"{DST}/prompt_builder.py", "w") as f:
    f.write(new_pb)
print(f"✅ prompt_builder.py (NEW - {len(new_pb.splitlines())} lines)")

# ═══════════════════════════
# Validate syntax
# ═══════════════════════════
print("\n--- Syntax Check ---")
for name in ["prompt_templates.py", "gemini_client.py", "persona_engine.py", "prompt_builder.py"]:
    path = f"{DST}/{name}"
    try:
        with open(path) as f:
            ast.parse(f.read())
        print(f"  ✓ {name}")
    except SyntaxError as e:
        print(f"  ✗ {name} line {e.lineno}: {e.msg}")

# Initial test import (dry run)
print("\n--- Import Test ---")
os.chdir(DST)
for name in ["prompt_templates", "gemini_client", "persona_engine"]:
    try:
        exec(f"import {name}")
        print(f"  ✓ import {name}")
    except Exception as e:
        print(f"  ✗ import {name}: {e}")
