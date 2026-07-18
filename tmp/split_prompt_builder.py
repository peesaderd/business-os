#!/usr/bin/env python3
"""Split prompt_builder.py into 4 modules for cleaner microservice architecture."""

import os, re, ast

SRC = "/home/openhands/erp-stack/prompt-builder-service/prompt_builder.py"
DST = "/home/openhands/erp-stack/prompt-builder-service"

with open(SRC, "r") as f:
    lines = f.readlines()

def get_section(start_marker, end_marker=None, start_offset=0, end_offset=0):
    """Get lines from start_marker to end_marker (exclusive)."""
    start = None
    end = len(lines)
    for i, line in enumerate(lines):
        if start is None and start_marker in line:
            start = i + start_offset
        if start is not None and end_marker and end_marker in line:
            end = i + end_offset
            break
    if start is None:
        raise ValueError(f"Section start '{start_marker}' not found")
    return lines[start:end], start, end

def section_to_str(section_lines):
    return "".join(section_lines).strip() + "\n"

# ── Read full file ──
full_content = "".join(lines)

# ────────────────────────────────────────────
# 1. prompt_templates.py
# ────────────────────────────────────────────
# Content: from "# ─── Paths" up to but not including "# ─── Gemini API Calls"
# Includes: STYLE_MAP, PRODUCT_CATEGORY_MAP, UGC_STYLE_FOLDER, load_ugc_templates,
#           fill_template, _match_category, _get_lighting, _extract_json

templates_header = """# ─── Prompt Templates ────────────────────────────────────────────
# STYLE_MAP, category mapping, UGC prompt template loaders
# ═══════════════════════════════════════════════════════════════════════

import os
import json
import re
from typing import Optional, List, Dict, Any
from pathlib import Path

# ─── Paths ───────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
UGC_PROMPTS_DIR = str(BASE_DIR / "UGC_prompts")
RECIPES_DIR = str(BASE_DIR / "recipes")

"""

# Extract STYLE_MAP, PRODUCT_CATEGORY_MAP, UGC_STYLE_FOLDER, and helper functions
t_start, _, _ = get_section("# ─── Style / Category Maps", start_offset=2)
t_end_idx = None
for i, line in enumerate(lines):
    if "# ─── Gemini API Calls" in line:
        t_end_idx = i
        break

templates_body = "".join(lines[t_start:t_end_idx]).strip() + "\n"

prompt_templates_py = templates_header + templates_body

# Fix imports: remove unused ones, keep what's needed
prompt_templates_py = prompt_templates_py.replace(
    "from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY\nfrom shared_config import GEMINI_MODEL\n",
    ""
)
prompt_templates_py = prompt_templates_py.replace(
    "from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY\n",
    ""
)
prompt_templates_py = prompt_templates_py.replace(
    "from shared_config import GEMINI_MODEL\n",
    ""
)

# Remove Mistral config section
prompt_templates_py = re.sub(
    r"# ─── Mistral Config.*?# ─── Style / Category Maps",
    "",
    prompt_templates_py,
    flags=re.DOTALL
)

os.makedirs(DST, exist_ok=True)
with open(f"{DST}/prompt_templates.py", "w") as f:
    f.write(prompt_templates_py)
print(f"✅ prompt_templates.py ({len(prompt_templates_py.splitlines())} lines)")

# ────────────────────────────────────────────
# 2. gemini_client.py
# ────────────────────────────────────────────
# Content: GEMINI_MODEL_NAME, GEMINI_API_URL, _get_gemini_key,
#          _call_gemini, _call_gemini_vision, analyze_product_image

gemini_header = """# ─── Gemini API Client ──────────────────────────────────────────
# Low-level Gemini API calls + product image analysis
# ═══════════════════════════════════════════════════════════════════════

import os
import json
import base64
import logging
from typing import Optional, List, Dict, Any

import requests

logger = logging.getLogger("prompt-builder-service")

# ─── Config from shared_config ──────────────────────────────────────
from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY
from shared_config import GEMINI_MODEL

"""

gemini_section, gs, ge = get_section("GEMINI_MODEL_NAME", "def analyze_product_image", end_offset=0)
gemini_body = "".join(gemini_section) + "\n\n"

# Get analyze_product_image function
api_start = None
api_end = None
for i, line in enumerate(lines):
    if "def analyze_product_image" in line:
        api_start = i
    if api_start is not None and "def analyze_product" in line and i > api_start:
        api_end = i
        break

if api_start and api_end:
    gemini_body += "".join(lines[api_start:api_end]) + "\n"

# Add _extract_json dependency (it's used by analyze_product_image)
# Actually, _extract_json is in prompt_templates, but analyze_product_image uses it
# We need to import it or move it
# For now, add import of _extract_json from prompt_templates at the top
gemini_header = gemini_header.replace(
    "from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY\nfrom shared_config import GEMINI_MODEL\n",
    "from shared_config import GEMINI_API_KEY as _GEMINI_API_KEY_LAZY\nfrom shared_config import GEMINI_MODEL\nfrom prompt_templates import _extract_json\n"
)

# Check that the function exists by finding its closing
# analyze_product_image is indented at module level
# It ends when a new def at module level starts, or file ends
api_lines = None
for i, line in enumerate(lines):
    if "def analyze_product_image" in line:
        api_lines = []
        depth = 0
        for j in range(i, len(lines)):
            api_lines.append(lines[j])
            stripped = lines[j].strip()
            if stripped.startswith("def "):
                depth += 1
            if stripped == '"""' and depth == 1:
                pass  # docstring end
        break

gemini_client_py = gemini_header + gemini_body.strip() + "\n"

# Also add import for the extraction helper
# Fix the _extract_json import

with open(f"{DST}/gemini_client.py", "w") as f:
    f.write(gemini_client_py)
print(f"✅ gemini_client.py ({len(gemini_client_py.splitlines())} lines)")

# ────────────────────────────────────────────
# 3. persona_engine.py
# ────────────────────────────────────────────
persona_header = """# ─── Persona Engine ─────────────────────────────────────────────
# Persona selection and injection for UGC diversity
# ═══════════════════════════════════════════════════════════════════════

import random
import logging
from typing import Dict, Optional

logger = logging.getLogger("prompt-builder-service")

"""

persona_start = None
persona_end = None
for i, line in enumerate(lines):
    if "PERSONA_TEMPLATES" in line:
        persona_start = i
        break
for i, line in enumerate(lines):
    if persona_start and i > persona_start and "def analyze_product_image" in line:
        persona_end = i
        break

persona_body = "".join(lines[persona_start:persona_end]) if persona_end else "".join(lines[persona_start:])

persona_engine_py = persona_header + persona_body.strip() + "\n"

with open(f"{DST}/persona_engine.py", "w") as f:
    f.write(persona_engine_py)
print(f"✅ persona_engine.py ({len(persona_engine_py.splitlines())} lines)")

# ────────────────────────────────────────────
# 4. Rewrite prompt_builder.py (thin orchestrator)
# ────────────────────────────────────────────
# Keep: imports, analyze_product, build_image_prompt, build_video_prompt,
#       build_negative_prompt, timing functions, analyze_and_build_prompts,
#       backward compat APIs

# Sections to keep:
# - imports (top of file)
# - analyze_product function
# - build_image_prompt function 
# - build_video_prompt function
# - build_negative_prompt function
# - _estimate_speech_duration, _build_timing_validated_script
# - analyze_and_build_prompts (main)
# - build_prompt (backward compat)

# I'll rebuild it cleanly from scratch, importing from the new modules
# Then append the functions that remain

# First, extract all functions that stay
def extract_function(name, lines):
    """Extract a function by name, returns (lines, start_idx, end_idx)."""
    start = None
    for i, line in enumerate(lines):
        if f"def {name}" in line and line.strip().startswith("def "):
            start = i
            break
    if start is None:
        return None, None, None
    
    # Find end: next top-level def or end of file
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].strip().startswith("def ") and not lines[i].startswith(" "):
            end = i
            break
        if i == len(lines) - 1:
            end = i + 1
    
    return lines[start:end], start, end

# Extract all functions that stay
stay_funcs = [
    "analyze_product",
    "build_image_prompt",
    "build_video_prompt", 
    "build_negative_prompt",
    "_estimate_speech_duration",
    "_build_timing_validated_script",
    "analyze_and_build_prompts",
    "build_prompt",
]

extracted = {}
for func in stay_funcs:
    flines, s, e = extract_function(func, lines)
    if flines:
        extracted[func] = "".join(flines)
    else:
        print(f"  ⚠️ Function '{func}' not found")

# Build the new prompt_builder.py
pb_header = """# ─── Prompt Builder — Main Orchestrator ──────────────────────────
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

# ─── Sub-module imports ──────────────────────────────────────────────
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

# Append each extracted function
body_parts = []
for func in stay_funcs:
    if func in extracted:
        body_parts.append(extracted[func])

pb_body = "\n".join(body_parts) + "\n"

with open(f"{DST}/prompt_builder.py", "w") as f:
    f.write(pb_header + pb_body)
print(f"✅ prompt_builder.py (NEW - {len(pb_body.splitlines())} lines)")

# ────────────────────────────────────────────
# Validate syntax
# ────────────────────────────────────────────
for name in ["prompt_templates.py", "gemini_client.py", "persona_engine.py", "prompt_builder.py"]:
    path = f"{DST}/{name}"
    try:
        with open(path) as f:
            ast.parse(f.read())
        print(f"  ✓ {name} syntax OK")
    except SyntaxError as e:
        print(f"  ✗ {name} syntax error line {e.lineno}: {e.msg}")
        # Show context
        with open(path) as f:
            ctx = f.read().split('\n')
        for j in range(max(0, e.lineno-3), min(len(ctx), e.lineno+3)):
            print(f"    {j+1}: {ctx[j]}")

print("\n✅ Split complete!")
