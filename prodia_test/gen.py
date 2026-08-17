#!/usr/bin/env python3
"""
gen.py — Universal Nano Banana image generator.

Replaces 3 separate scripts:
  - prodia_test/gen_triptych.py
  - prodia_test/gen_triptych_sync.py
  - prodia_test/nanobanana_i2i.py

All callers use the same command. Pass either --preset or raw --prompt+--ref+--out.

Usage examples:

    # Use preset (prompt + ref from prompts.json)
    ./gen.py --preset shot_yerpall_strawberry
    ./gen.py --preset triptych_dearny

    # Raw: prompt + 1 reference image
    ./gen.py --prompt "..." --ref product.png --aspect 16:9 --out shot.jpg

    # Raw: prompt + 2 references (banner + product)
    ./gen.py --prompt "..." --ref banner.jpg --ref product.jpg --out out.jpg

    # Use prompt from file
    ./gen.py --prompt-file prompts/foo.txt --ref product.png --out foo.jpg

    # Override preset fields
    ./gen.py --preset shot_yerpall_strawberry --out different_name.jpg --method async

    # Get price (use async endpoint)
    ./gen.py --preset triptych_dearny --method async
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lib_nano_banana import generate, generate_sync, generate_async, PRICE_USD  # noqa: E402

PRESETS_PATH = HERE / "prompts.json"
WORKSPACE_ROOT = Path("/home/openhands/.openclaw/workspace")


def load_preset(name: str) -> dict:
    """Load preset by name from prompts.json. Resolve relative paths against workspace root."""
    if not PRESETS_PATH.exists():
        raise FileNotFoundError(f"presets file not found: {PRESETS_PATH}")
    presets = json.loads(PRESETS_PATH.read_text())
    presets.pop("comment", None)
    if name not in presets:
        raise KeyError(f"preset not found: {name}\navailable: {list(presets.keys())}")
    p = dict(presets[name])
    # Resolve relative paths against workspace root
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


def main():
    ap = argparse.ArgumentParser(description="Universal Nano Banana image generator")
    ap.add_argument("--preset", help="Load prompt+config from prompts.json preset")
    ap.add_argument("--prompt", help="Prompt text (overrides preset)")
    ap.add_argument("--prompt-file", help="Path to prompt file (overrides preset)")
    ap.add_argument("--ref", action="append", help="Reference image path (repeatable)")
    ap.add_argument("--aspect", help="Aspect ratio (e.g., 16:9, 1:1, 9:16)")
    ap.add_argument("--out", help="Output path")
    ap.add_argument("--method", choices=["sync", "async"], default="sync",
                    help="Endpoint: sync (default, no price) | async (with price)")
    ap.add_argument("--list", action="store_true", help="List available presets and exit")
    args = ap.parse_args()

    # List presets
    if args.list:
        presets = json.loads(PRESETS_PATH.read_text())
        presets.pop("comment", None)
        print("Available presets:")
        for k, v in presets.items():
            print(f"  {k:30}  {v.get('description','')}")
        print(f"\nEstimated price: ${PRICE_USD}/image (async endpoint)")
        return

    # Resolve fields: preset → args
    preset_data: dict = {}
    if args.preset:
        preset_data = load_preset(args.preset)

    # Prompt
    prompt = args.prompt
    if not prompt and args.prompt_file:
        prompt = Path(args.prompt_file).read_text().strip()
    if not prompt:
        prompt = preset_data.get("prompt")

    # Aspect
    aspect = args.aspect or preset_data.get("aspect_ratio", "16:9")

    # Output
    out = args.out or preset_data.get("output") or str(WORKSPACE_ROOT / f"nano_banana_{args.method}.jpg")

    # References
    refs = list(args.ref) if args.ref else []
    if not refs and preset_data.get("reference"):
        refs = [str(preset_data["reference"])]
    if not refs and preset_data.get("references"):
        refs = list(preset_data["references"])

    if not prompt:
        ap.error("Prompt required (use --prompt, --prompt-file, or --preset)")

    # Negative prompt: ignored by sync endpoint (per current schema); show a notice.
    # If we ever support passing negative_prompt, this is the place.
    if preset_data.get("negative") and args.method == "sync":
        print(f"[note] sync endpoint doesn't accept negative_prompt (omitting); "
              f"negative was: {preset_data['negative'][:80]}...",
              file=sys.stderr)

    # Run
    print(f"[gen.py] method={args.method} aspect={aspect} refs={refs} out={out}",
          file=sys.stderr)
    print(f"[gen.py] prompt[:200]: {prompt[:200]}...", file=sys.stderr)

    result = generate(
        prompt=prompt,
        reference_paths=refs if refs else None,
        aspect_ratio=aspect,
        output_path=out,
        method=args.method,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
