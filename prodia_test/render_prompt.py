#!/usr/bin/env python3
"""
render_prompt.py — Render product profile + template → image/video prompt.

Architecture:
  product_profiles/{product_id}.json   — what the product is
  templates/image/{template_id}.json   — how to shoot the image
  templates/video/{template_id}.json   — 4-beat video structure
  ↓
  render_prompt.py --product X --template Y → text prompt

Usage:
    # Render image prompt
    python3 prodia_test/render_prompt.py image \\
        --product yerpall_strawberry \\
        --template studio_hero_v1 \\
        --output /tmp/yerpall_prompt.txt

    # Render image prompt + show resolved variables
    python3 prodia_test/render_prompt.py image \\
        --product yerpall_strawberry --template studio_hero_v1 \\
        --show-vars

    # Render video 4-beat JSON
    python3 prodia_test/render_prompt.py video \\
        --product yerpall_strawberry --template 4beat_review_v1 \\
        --show-vars

    # List profiles / templates
    python3 prodia_test/render_prompt.py list
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROFILES_DIR = HERE / "product_profiles"
TEMPLATES_DIR = HERE / "templates"
IMAGE_TPL_DIR = TEMPLATES_DIR / "image"
VIDEO_TPL_DIR = TEMPLATES_DIR / "video"


# ═══════════════════════════════════════════════════════════════════════════
# Loaders
# ═══════════════════════════════════════════════════════════════════════════

def load_profile(product_id: str) -> dict:
    p = PROFILES_DIR / f"{product_id}.json"
    if not p.exists():
        raise FileNotFoundError(
            f"profile not found: {p}\n"
            f"available: {[f.stem for f in PROFILES_DIR.glob('*.json')]}"
        )
    return json.loads(p.read_text())


def load_image_template(template_id: str) -> dict:
    p = IMAGE_TPL_DIR / f"{template_id}.json"
    if not p.exists():
        raise FileNotFoundError(
            f"image template not found: {p}\n"
            f"available: {[f.stem for f in IMAGE_TPL_DIR.glob('*.json')]}"
        )
    return json.loads(p.read_text())


def load_video_template(template_id: str) -> dict:
    p = VIDEO_TPL_DIR / f"{template_id}.json"
    if not p.exists():
        raise FileNotFoundError(
            f"video template not found: {p}\n"
            f"available: {[f.stem for f in VIDEO_TPL_DIR.glob('*.json')]}"
        )
    return json.loads(p.read_text())


# ═══════════════════════════════════════════════════════════════════════════
# Validation
# ═══════════════════════════════════════════════════════════════════════════

def validate_profile_for_template(profile: dict, template: dict) -> list:
    """Return list of missing required fields (empty = OK)."""
    required = template.get("required_profile_fields", [])
    missing = []
    for field_path in required:
        # support dotted paths like "name.en"
        parts = field_path.split(".")
        cur = profile
        for part in parts:
            if not isinstance(cur, dict) or part not in cur:
                missing.append(field_path)
                break
            cur = cur[part]
    return missing


# ═══════════════════════════════════════════════════════════════════════════
# Image render
# ═══════════════════════════════════════════════════════════════════════════

def _younger_age(age_range: str) -> str:
    """Use youngest end of range — looks younger in the photo.
    '20-35' → 'around 20'   /   '25-50' → 'around 25'   /   '30' → '30'
    """
    s = str(age_range)
    if "-" in s:
        low = s.split("-")[0].strip()
        return f"around {low}"
    return s


def _resolve_image_vars(profile: dict, template: dict) -> dict:
    """Merge profile + template defaults into a flat var dict for .format()."""
    target = profile.get("target_audience", {})
    eth = target.get('ethnicity', 'Asian').replace(' / ', ' or ')  # "Thai / Asian" → "Thai or Asian"
    age = _younger_age(target.get('age_range', '20-30'))           # "20-35" → "around 20"
    ta = f"{age}-year-old {eth} {target.get('gender', 'female')}"

    # Short product name (drop "Serum", "Detergent" etc. for natural speech)
    product_full = profile["name"]["en"]
    product_short = product_full.split()[0]  # "YERPALL"

    # Scene description from category + tone (or template override)
    defaults = template.get("defaults", {})
    if defaults.get("scene_override"):
        scene = defaults["scene_override"]
    else:
        cat = profile.get("category", "product")
        tone = profile.get("tone", "natural")
        if cat == "cosmetics":
            scene = f"a clean beauty studio with soft {profile.get('color_palette', {}).get('primary', 'pink')} gradient background"
        elif cat == "household":
            scene = f"a bright modern home setting with clean {profile.get('color_palette', {}).get('primary', 'blue')} accents"
        else:
            scene = f"a clean studio setting matching the {tone} brand tone"

    composition_raw = defaults.get("composition", "product is centered in frame")
    return {
        "product_name":       product_full,
        "product_short":      product_short,
        "scene_description":  scene,
        "model_desc":         ta,
        "action_phrase":      "smiling and holding",
        "composition_sentence": f"The {composition_raw}",
        "shot_type":          defaults.get("shot_type", "medium close-up"),
        "angle":              defaults.get("angle", "eye level"),
        "depth_of_field":     defaults.get("depth_of_field", "shallow (f/2.8)"),
        "lighting_cap":       defaults.get("lighting", "soft natural lighting").capitalize(),
        "style":              defaults.get("style", "photorealistic"),
        "aspect_ratio":       defaults.get("aspect_ratio", "16:9"),
    }


def render_image(profile: dict, template: dict) -> dict:
    missing = validate_profile_for_template(profile, template)
    if missing:
        return {"ok": False, "error": f"profile missing required fields: {missing}",
                "profile_id": profile.get("product_id"),
                "template_id": template.get("template_id")}

    vars = _resolve_image_vars(profile, template)
    tpl = template.get("prompt_template", "")
    try:
        prompt = tpl.format(**vars)
    except KeyError as e:
        return {"ok": False, "error": f"template has unfilled placeholder: {e}",
                "vars": vars}

    return {
        "ok": True,
        "prompt": prompt,
        "negative_prompt": template.get("negative_prompt", ""),
        "vars": vars,
        "profile_id": profile.get("product_id"),
        "template_id": template.get("template_id"),
        "image_ref": profile.get("image_ref"),
        "aspect_ratio": vars["aspect_ratio"],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Video render (4-beat structure)
# ═══════════════════════════════════════════════════════════════════════════

def _build_beat_prompt(beat_id: str, beat_cfg: dict, profile: dict, script_text: str) -> str:
    """Build video prompt for one beat — action + camera + script context (for lip-sync)."""
    action = beat_cfg.get("action_default", "")
    camera = beat_cfg.get("camera_default", "")
    product_short = profile["name"]["en"].split()[0]
    style = "photorealistic, 16:9, natural lighting"
    return (
        f'{action} The model says: "{script_text}". '
        f'Shot: {camera}. '
        f'Style: {style}, {product_short} product visible.'
    )


def render_video(profile: dict, template: dict) -> dict:
    missing = validate_profile_for_template(profile, template)
    if missing:
        return {"ok": False, "error": f"profile missing required fields: {missing}"}

    # Support both "beats" (new) and "beat_template" (legacy) keys
    beats_tpl = template.get("beats") or template.get("beat_template", {})
    beats_data = profile.get("tts_script", {}).get("beats", {})

    beats = []
    for beat_id, beat_cfg in beats_tpl.items():
        script_text = beats_data.get(beat_id, "")
        script_template = beat_cfg.get("script_template", "{script_text}")
        try:
            resolved_script = script_template.format(script_text=script_text)
        except KeyError:
            resolved_script = script_text

        beats.append({
            "beat_id":           beat_id,
            "name":              beat_cfg.get("name", beat_id),
            "time_start":        beat_cfg.get("time_start", 0),
            "time_end":          beat_cfg.get("time_end", 0),
            "script":            resolved_script,
            "action":            beat_cfg.get("action_default", ""),
            "camera":            beat_cfg.get("camera_default", ""),
            "transition_to_next": beat_cfg.get("transition_to_next", "cut"),
            "video_prompt":      _build_beat_prompt(beat_id, beat_cfg, profile, resolved_script),
        })

    return {
        "ok": True,
        "video_id": f"{profile['product_id']}_{template['template_id']}",
        "duration_seconds": template.get("duration_seconds", 15),
        "aspect_ratio": template.get("defaults", {}).get("aspect_ratio", "9:16"),
        "style": template.get("defaults", {}).get("style", ""),
        "source_image": f"{profile['product_id']}_shot_2x.jpg",
        "last_frame": f"{profile['product_id']}_panel_3.jpg",
        "audio": template.get("defaults", {}).get("audio", {}),
        "tts_voice": profile.get("tts_script", {}).get("voice", "Kore"),
        "tts_language": profile.get("tts_script", {}).get("language", "th"),
        "full_script": " ".join(b["script"] for b in beats if b["script"]),
        "beats": beats,
        "profile_id": profile.get("product_id"),
        "template_id": template.get("template_id"),
    }


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

def cmd_image(args):
    profile = load_profile(args.product)
    template = load_image_template(args.template)
    result = render_image(profile, template)
    if not result.get("ok"):
        print(json.dumps(result, indent=2))
        return 1

    if args.show_vars:
        print("# Resolved Variables")
        print(json.dumps(result["vars"], indent=2))
        print()

    print(f"# Image Prompt ({result['profile_id']} + {result['template_id']})")
    print(f"aspect_ratio: {result['aspect_ratio']}")
    print(f"image_ref: {result['image_ref']}")
    print()
    print(result["prompt"])
    if result.get("negative_prompt"):
        print()
        print(f"# Negative: {result['negative_prompt']}")

    if args.output:
        Path(args.output).write_text(result["prompt"])
        print(f"\n# Saved → {args.output}")

    return 0


def cmd_video(args):
    profile = load_profile(args.product)
    template = load_video_template(args.template)
    result = render_video(profile, template)
    if not result.get("ok"):
        print(json.dumps(result, indent=2))
        return 1

    print(json.dumps(result, indent=2))

    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2))
        print(f"\n# Saved → {args.output}")

    return 0


def cmd_list(args):
    profiles = sorted(p.stem for p in PROFILES_DIR.glob("*.json"))
    img_tpls = sorted(p.stem for p in IMAGE_TPL_DIR.glob("*.json"))
    vid_tpls = sorted(p.stem for p in VIDEO_TPL_DIR.glob("*.json"))

    print("Product profiles:")
    for p in profiles:
        print(f"  {p}")
    print("\nImage templates:")
    for t in img_tpls:
        print(f"  {t}")
    print("\nVideo templates:")
    for t in vid_tpls:
        print(f"  {t}")


def build_parser():
    p = argparse.ArgumentParser(description="Render product + template → prompt")
    sub = p.add_subparsers(dest="cmd")

    pi = sub.add_parser("image", help="Render image prompt")
    pi.add_argument("--product", required=True, help="product_id (e.g. yerpall_strawberry)")
    pi.add_argument("--template", required=True, help="template_id (e.g. studio_hero_v1)")
    pi.add_argument("--output", help="save prompt to file")
    pi.add_argument("--show-vars", action="store_true", help="print resolved variables")
    pi.set_defaults(func=cmd_image)

    pv = sub.add_parser("video", help="Render video 4-beat structure")
    pv.add_argument("--product", required=True)
    pv.add_argument("--template", required=True)
    pv.add_argument("--output", help="save JSON to file")
    pv.set_defaults(func=cmd_video)

    pl = sub.add_parser("list", help="List profiles and templates")
    pl.set_defaults(func=cmd_list)

    return p


def main():
    ap = build_parser()
    args = ap.parse_args()
    if not args.cmd:
        ap.print_help()
        return 0
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
