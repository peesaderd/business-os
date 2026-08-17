#!/usr/bin/env python3
"""
gen.py — Universal Nano Banana image generator + optional upscale.

Replaces 4 separate scripts:
  - prodia_test/gen_triptych.py
  - prodia_test/gen_triptych_sync.py
  - prodia_test/nanobanana_i2i.py
  - prodia_test/wan_img2vid.py        (handled separately)

Subcommands:
  gen      Generate image via Nano Banana (default)
  upscale  Upscale via R-ESRGAN/HYPIR
  list     List available presets

Usage examples:

  gen:
    gen.py --list
    gen.py gen --preset shot_yerpall_strawberry
    gen.py gen --prompt "..." --ref product.png --aspect 16:9 --out shot.jpg
    gen.py gen --preset triptych_dearny --method async   # returns price

  upscale:
    gen.py upscale input.jpg -o out.png                # R-ESRGAN 2x default
    gen.py upscale input.jpg -o out.png --model hypir  # HYPIR 2x ($0.05)
    gen.py upscale input.jpg -o out.png --scale 4      # R-ESRGAN 4x
    gen.py upscale input.jpg -o out.png --method async --model hypir
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lib_nano_banana import generate, PRICE_USD  # noqa: E402
from lib_upscale import upscale, MODELS as UPSCALE_MODELS  # noqa: E402

PRESETS_PATH = HERE / "prompts.json"
WORKSPACE_ROOT = Path("/home/openhands/.openclaw/workspace")


# ═══════════════════════════════════════════════════════════════════════════
# Preset loader
# ═══════════════════════════════════════════════════════════════════════════

def load_preset(name: str) -> dict:
    if not PRESETS_PATH.exists():
        raise FileNotFoundError(f"presets file not found: {PRESETS_PATH}")
    presets = json.loads(PRESETS_PATH.read_text())
    presets.pop("comment", None)
    if name not in presets:
        raise KeyError(f"preset not found: {name}\navailable: {list(presets.keys())}")
    p = dict(presets[name])
    if p.get("prompt_file"):
        pf = Path(p["prompt_file"])
        if not pf.is_absolute():
            pf = HERE / pf
        p["prompt_file"] = pf
        p["prompt"] = pf.read_text().strip()
    if p.get("negative_file"):
        nf = Path(p["negative_file"])
        if not nf.is_absolute():
            nf = HERE / nf
        p["negative_file"] = nf
        p["negative"] = nf.read_text().strip()
    if p.get("reference"):
        ref = Path(p["reference"])
        if not ref.is_absolute():
            ref = WORKSPACE_ROOT / ref
        p["reference"] = ref
    if p.get("output"):
        out = Path(p["output"])
        if not out.is_absolute():
            out = WORKSPACE_ROOT / out
        p["output"] = out
    return p


# ═══════════════════════════════════════════════════════════════════════════
# Subcommand: gen
# ═══════════════════════════════════════════════════════════════════════════

def cmd_gen(args):
    if args.list:
        list_presets()
        return 0

    preset_data: dict = {}
    if args.preset:
        preset_data = load_preset(args.preset)

    prompt = args.prompt
    if not prompt and args.prompt_file:
        prompt = Path(args.prompt_file).read_text().strip()
    if not prompt:
        prompt = preset_data.get("prompt")

    aspect = args.aspect or preset_data.get("aspect_ratio", "16:9")
    out = args.out or preset_data.get("output") or str(WORKSPACE_ROOT / f"nano_banana_{args.method}.jpg")

    refs = list(args.ref) if args.ref else []
    if not refs and preset_data.get("reference"):
        refs = [str(preset_data["reference"])]
    if not refs and preset_data.get("references"):
        refs = list(preset_data["references"])

    if not prompt:
        print("❌ prompt required (use --prompt, --prompt-file, or --preset)", file=sys.stderr)
        return 1

    if preset_data.get("negative") and args.method == "sync":
        print(f"[note] sync endpoint doesn't accept negative_prompt (omitting); "
              f"negative was: {preset_data['negative'][:80]}...",
              file=sys.stderr)

    print(f"[gen] method={args.method} aspect={aspect} refs={refs} out={out}",
          file=sys.stderr)
    print(f"[gen] prompt[:200]: {prompt[:200]}...", file=sys.stderr)

    result = generate(
        prompt=prompt,
        reference_paths=refs if refs else None,
        aspect_ratio=aspect,
        output_path=out,
        method=args.method,
    )
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


# ═══════════════════════════════════════════════════════════════════════════
# Subcommand: upscale
# ═══════════════════════════════════════════════════════════════════════════

def cmd_upscale(args):
    model = args.model
    scale = args.scale
    # Validate
    mp = UPSCALE_MODELS[model]
    if scale not in mp["scales"]:
        print(f"❌ scale {scale}x not supported by '{model}'; allowed: {mp['scales']}", file=sys.stderr)
        return 1

    print(f"[upscale] input={args.input} output={args.output} model={model} "
          f"scale={scale} method={args.method}", file=sys.stderr)

    result = upscale(
        input_path=args.input,
        output_path=args.output,
        model=model,
        scale=scale,
        method=args.method,
    )
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


# ═══════════════════════════════════════════════════════════════════════════
# Subcommand: list
# ═══════════════════════════════════════════════════════════════════════════

def list_presets():
    if not PRESETS_PATH.exists():
        print("no presets.json yet", file=sys.stderr)
        return
    presets = json.loads(PRESETS_PATH.read_text())
    presets.pop("comment", None)
    print("Available presets:")
    for k, v in presets.items():
        print(f"  {k:30}  {v.get('description','')}")
    print(f"\nNano Banana image: ${PRICE_USD}/image (async endpoint)")
    print("Upscale: " + ", ".join(
        f"{k}={','.join(str(s)+'x' for s in v['scales'])}"
        for k, v in UPSCALE_MODELS.items()
    ))


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def build_parser():
    p = argparse.ArgumentParser(description="Universal prodia image-gen CLI")
    sub = p.add_subparsers(dest="cmd")

    # gen
    pg = sub.add_parser("gen", help="Generate image via Nano Banana",
                        formatter_class=argparse.RawDescriptionHelpFormatter,
                        epilog=__doc__)
    pg.add_argument("--preset", help="Load prompt+config from presets.json")
    pg.add_argument("--prompt", help="Prompt text (overrides preset)")
    pg.add_argument("--prompt-file", help="Path to prompt file")
    pg.add_argument("--ref", action="append", help="Reference image (repeatable)")
    pg.add_argument("--aspect", help="Aspect ratio (e.g. 16:9, 1:1)")
    pg.add_argument("--out", help="Output path")
    pg.add_argument("--method", choices=["sync", "async"], default="sync")
    pg.add_argument("--list", action="store_true", help="List presets")

    # upscale
    pu = sub.add_parser("upscale", help="Upscale via R-ESRGAN/HYPIR")
    pu.add_argument("input", help="Input image path")
    pu.add_argument("-o", "--output", help="Output path")
    pu.add_argument("--model", choices=list(UPSCALE_MODELS.keys()), default="resrgan",
                    help="Default: resrgan (cheap). Use 'hypir' for highest quality.")
    pu.add_argument("--scale", type=int, default=2,
                    help="2x (default, both), 4x/8x (R-ESRGAN only)")
    pu.add_argument("--method", choices=["sync", "async"], default="sync")

    # list (top-level --list is also accepted)
    pl = sub.add_parser("list", help="List available presets")

    return p


def main():
    ap = build_parser()
    args = ap.parse_args()

    if args.cmd == "gen" or getattr(args, "list", False):
        return cmd_gen(args)
    elif args.cmd == "upscale":
        return cmd_upscale(args)
    elif args.cmd == "list":
        list_presets()
        return 0
    else:
        ap.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
