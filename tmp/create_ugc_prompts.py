#!/usr/bin/env python3
"""Create UGC prompt template files for 6 new video styles."""

import os

BASE = "/home/openhands/erp-stack/prompt-builder-service/UGC_prompts"

# Template files content per style
STYLES = {}

# ──────────── POV_Lifehack ────────────
STYLES["POV_Lifehack"] = {
    "system.prompt": """You are a video generation system for POV life-hack style videos.
NO text, NO graphics, NO UI.

CRITICAL - MODEL & HANDS:
- POV angle: camera is at chest/shoulder height looking down at hands.
- Model's hands are visible doing the task — product solving a specific problem.
- The product must be clearly visible and in focus throughout.
- Hands should appear natural, not stiff.

CRITICAL - FACE:
- Model's face should be visible at the top/edge of frame.
- Natural expression — like someone filming themselves.

CRITICAL - SAME CHARACTER FOR MULTI-SCENE:
- Scene 1 and 2 MUST have the SAME gender (same hands, same skin tone, same voice).
- DO NOT switch between scenes.""",

    "master.prompt": """Authentic POV life hack style. First-person view showing product solving a problem in real-time. Natural lighting, real environment. Product in focus, hands doing the action. {scene_description}. The process should look natural and unscripted.""",

    "user.template.prompt": """{scene_description}

First-person POV shot showing hands using the product to solve a specific problem. Natural real-world setting. Product clearly visible.""",

    "negative.prompt": """text, subtitle, caption, emoji, icon, logo, watermark, UI, overlay, graphic, tripod visible, third person view, flat lay""",
}

# ──────────── ASMR_Texture ────────────
STYLES["ASMR_Texture"] = {
    "system.prompt": """You are a video generation system for ASMR texture-focused product videos.
NO text, NO graphics, NO UI.
CRITICAL - EXTREME CLOSE-UP:
- Focus on product texture — macro level detail.
- Slow deliberate movements.
- First 2-3 seconds: NO movement, just product texture.
- Product being opened, clicked, squeezed, or applied.
CRITICAL - LIGHTING:
- Dramatic lighting to highlight texture.
- Soft focus on edges, sharp in center.
- Glossy or matte texture must be clearly visible.""",

    "master.prompt": """ASMR texture-focused shot. Macro close-up of product texture and detail. Slow deliberate motion. {scene_description}. Sharp focus on product surface, soft bokeh edges. Satisfying sensory experience.""",

    "user.template.prompt": """{scene_description}

Extreme close-up macro shot of product texture. Slow motion. Product details sharp and clear. Satisfying visual experience.""",

    "negative.prompt": """text, subtitle, caption, emoji, logo, watermark, UI, overlay, fast motion, shaky camera, person talking, distracting background""",
}

# ──────────── Split_Comparison ────────────
STYLES["Split_Comparison"] = {
    "system.prompt": """You are a video generation system for before/after comparison videos.
NO text, NO graphics, NO UI.
CRITICAL - SPLIT SCREEN:
- Left side: BEFORE (struggle, problem, old way).
- Right side: AFTER (solution, product in use, transformation).
- Same person/background on both sides for consistency.
- Product only on the RIGHT side (AFTER).
CRITICAL - EXPRESSION:
- LEFT: frustrated, struggling, unhappy.
- RIGHT: satisfied, happy, relieved.""",

    "master.prompt": """Split screen comparison. Left side shows the problem or old way. Right side shows the solution with product. {scene_description}. Same lighting and framing on both sides. Dramatic contrast between struggle and solution.""",

    "user.template.prompt": """{scene_description}

Split screen before/after shot. Left: problem scenario. Right: solution with product. Dramatic transformation visible.""",

    "negative.prompt": """text, subtitle, caption, logo, watermark, UI, overlay, blurry, dark, cluttered background, multiple people, inconsistent lighting""",
}

# ──────────── Street_Interview ────────────
STYLES["Street_Interview"] = {
    "system.prompt": """You are a video generation system for street interview style UGC.
NO text, NO graphics, NO UI.
CRITICAL - AUTHENTIC REACTION:
- Model looks surprised/happy like they just found something amazing.
- Product brought into frame suddenly — like random discovery.
- Handheld camera feel — natural, not polished.
- Model's expression: genuine excitement, "wait until you see this" energy.""",

    "master.prompt": """Street interview style, handheld camera. Model holding product with excited expression, like a random discovery. {scene_description}. Authentic reaction, genuine surprise. Natural environment. Product front and center.""",

    "user.template.prompt": """{scene_description}

Genuine discovery moment. Model excitedly showing product. Handheld authentic style. Product in focus.""",

    "negative.prompt": """text, subtitle, caption, logo, watermark, UI, overlay, studio lighting, tripod, scripted look, perfect framing, professional studio""",
}

# ──────────── Greenscreen_React ────────────
STYLES["Greenscreen_React"] = {
    "system.prompt": """You are a video generation system for green screen reaction videos.
NO text, NO graphics, NO UI.
CRITICAL - MODEL POSITION:
- Model positioned to one side (left or right), leaving space behind.
- Model pointing at content behind them.
- Background should be solid colored (green screen) for replacement.
- Model's expression: reactive, like commenting on something interesting.""",

    "master.prompt": """Green screen reaction style. Model to one side, pointing at content behind. {scene_description}. Reactive expression, like commenting on amazing content. Clear space behind model for overlay. Clean background.""",

    "user.template.prompt": """{scene_description}

Model positioned off-center, reacting and pointing at content behind them. Green screen background. TikTok-native reaction format.""",

    "negative.prompt": """text, subtitle, caption, emoji, logo, watermark, UI, overlay text, busy background, multiple people, complex scene behind model""",
}

# ──────────── Aesthetic_Vlog ────────────
STYLES["Aesthetic_Vlog"] = {
    "system.prompt": """You are a video generation system for aesthetic vlog/GRWM style videos.
NO text, NO graphics, NO UI.
CRITICAL - CINEMATIC QUALITY:
- Beautiful composition — rule of thirds, leading lines.
- Model sometimes not looking at camera (candid, natural).
- Product appears organically as part of routine.
- Fast cuts between angles.
- Premium, aspirational feel.
CRITICAL - LIGHTING:
- Golden hour or soft diffused light.
- Warm color grading.
- Rich shadows and highlights.""",

    "master.prompt": """Cinematic vlog style, aesthetic composition. Model going through routine naturally, product appearing organically. {scene_description}. Golden hour or soft warm lighting. Premium, aspirational feel. Beautiful framing.""",

    "user.template.prompt": """{scene_description}

Aesthetic vlog style. Natural daily routine. Product appears organically. Beautiful lighting and composition. Premium feel.""",

    "negative.prompt": """text, subtitle, caption, logo, watermark, UI, overlay, flat lighting, cluttered background, direct camera stare, messy room, harsh shadows""",
}

# ──── Write all files ────
for style, files in STYLES.items():
    style_dir = os.path.join(BASE, style)
    for filename, content in files.items():
        filepath = os.path.join(style_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content.strip() + "\n")
        print(f"  ✓ {style}/{filename}")

print(f"\n✅ Created {sum(len(v) for v in STYLES.values())} prompt files across {len(STYLES)} styles")
