#!/usr/bin/env python3
"""
cover_pipeline.py — End-to-end cover generator.

Pipeline (per card aa737252, board wan-lipsync-4beat):

  Stage 1: Nano Banana → 16:9 composite shot ($0.039)
  Stage 2: [optional] R-ESRGAN Upscale 2x ($0.001)
  Stage 3: Cut 3 vertical thirds → Panel 1/2/3 (free, PIL)
  Stage 4: BiRefNet 2 → transparent PNG for Panel 1 ($0.0025)
           (Panels 2/3 stay as static source/last frames for Wan2.7)

Outputs (default workdir = /home/openhands/.openclaw/workspace):
  <name>_shot.jpg        (16:9)
  <name>_shot_2x.jpg     (if upscale)
  <name>_panel_1.png     (transparent, with frame-layer text/logo)
  <name>_panel_2.jpg     (middle, for Wan2.7 source frame)
  <name>_panel_3.jpg     (end, for Wan2.7 last frame)
  <name>_summary.json    (job_id, costs, paths)

Total cost: $0.0425/cover (R-ESRGAN only; HYPIR removed 2026-08-17).

Usage:

  # full auto-pipeline (cost ~$0.0425)
  python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry

  # 4x upscale (R-ESRGAN only; $0.0415)
  python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry --upscale-scale 4

  # skip upscale (only Nano Banana + cut + BiRefNet Panel 1)
  python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry --no-upscale

  # dry run (no API calls — just describe what would happen + estimate cost)
  python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry --dry-run

  # raw prompt (no preset)
  python3 prodia_test/cover_pipeline.py --prompt "..." --ref product.png --name my_cover
"""
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
from typing import Optional, Dict, List

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lib_nano_banana import generate as nb_generate, PRICE_USD as NB_PRICE  # noqa: E402
from lib_upscale import upscale, MODEL as UPSCALE_MODEL                      # noqa: E402
from lib_rembg import rembg, PRICE_USD as REMBG_PRICE                      # noqa: E402

WORKSPACE = Path("/home/openhands/.openclaw/workspace")
PRESETS_PATH = HERE / "prompts.json"


# ═══════════════════════════════════════════════════════════════════════════
# Panel cutter (PIL, free)
# ═══════════════════════════════════════════════════════════════════════════

def cut_panels(shot_path: Path, out_dir: Path, prefix: str) -> Dict:
    """
    Cut a 16:9 image into 3 vertical thirds.

    Returns dict with:
      panel_1.jpg  (left third — frame layer w/ text/logo)
      panel_2.jpg  (middle third — Wan2.7 first frame source)
      panel_3.jpg  (right third — Wan2.7 last frame)
    """
    try:
        from PIL import Image
    except ImportError:
        return {"ok": False, "error": "Pillow not installed"}

    img = Image.open(shot_path).convert("RGB")
    w, h = img.size
    if abs(w / h - 16 / 9) > 0.05:
        print(f"[cut_panels] aspect {w/h:.3f} != 16:9 ({w}x{h}); continuing anyway",
              file=sys.stderr)

    third = w // 3
    panels = {}
    for i, name in enumerate(["panel_1", "panel_2", "panel_3"]):
        x0 = i * third
        x1 = (i + 1) * third if i < 2 else w
        crop = img.crop((x0, 0, x1, h))
        out = out_dir / f"{prefix}_{name}.jpg"
        crop.save(out, "JPEG", quality=92)
        panels[name] = out
        print(f"[cut_panels] {name} → {out}  ({crop.size[0]}×{crop.size[1]})",
              file=sys.stderr)
    return panels


# ═══════════════════════════════════════════════════════════════════════════
# Pipeline runner
# ═══════════════════════════════════════════════════════════════════════════

def run_pipeline(
    name: str,
    prompt: str,
    reference_paths: Optional[List[str]] = None,
    aspect_ratio: str = "16:9",
    out_dir: Optional[Path] = None,
    do_upscale: bool = True,
    upscale_scale: int = 2,
    nb_method: str = "sync",
    up_method: str = "sync",
    rb_method: str = "sync",
    dry_run: bool = False,
) -> dict:
    """Run end-to-end cover pipeline (R-ESRGAN only)."""

    out_dir = Path(out_dir) if out_dir else WORKSPACE
    out_dir.mkdir(parents=True, exist_ok=True)

    shot_path = out_dir / f"{name}_shot.jpg"
    upscaled_path = out_dir / f"{name}_shot_{upscale_scale}x.jpg"
    panel_1_path = out_dir / f"{name}_panel_1.png"
    panel_2_path = out_dir / f"{name}_panel_2.jpg"
    panel_3_path = out_dir / f"{name}_panel_3.jpg"
    summary_path = out_dir / f"{name}_summary.json"

    # Cost
    if do_upscale:
        if upscale_scale not in UPSCALE_MODEL["scales"]:
            raise ValueError(f"scale {upscale_scale}x not supported; "
                             f"allowed: {UPSCALE_MODEL['scales']}")
        up_cost = UPSCALE_MODEL["price"][upscale_scale]
    else:
        up_cost = 0.0
    total_cost = NB_PRICE + up_cost + REMBG_PRICE

    plan = {
        "name": name,
        "shot": str(shot_path),
        "prompt": prompt[:200],
        "aspect_ratio": aspect_ratio,
        "references": reference_paths or [],
        "dry_run": dry_run,
        "stages": [
            {"stage": "1_nano_banana", "status": "pending",
             "tool": "lib_nano_banana", "params": {"method": nb_method,
                                                    "output": str(shot_path)},
             "cost_usd": NB_PRICE},
            {"stage": "2_upscale", "status": "skipped" if not do_upscale else "pending",
             "tool": "lib_upscale", "params": {"model": "resrgan",
                                               "scale": upscale_scale,
                                               "method": up_method,
                                               "input": str(shot_path),
                                               "output": str(upscaled_path)},
             "cost_usd": up_cost if do_upscale else 0.0},
            {"stage": "3_cut_panels", "status": "pending",
             "tool": "cover_pipeline.cut_panels",
             "params": {"input": str(upscaled_path if do_upscale else shot_path)},
             "cost_usd": 0.0},
            {"stage": "4_rembg_panel1", "status": "pending",
             "tool": "lib_rembg", "params": {"method": rb_method,
                                             "input": str(panel_1_path.with_suffix('.jpg')),
                                             "output": str(panel_1_path)},
             "cost_usd": REMBG_PRICE},
        ],
        "estimated_total_usd": round(total_cost, 4),
        "outputs": {
            "shot": str(shot_path),
            "shot_2x": str(upscaled_path) if do_upscale else None,
            "panel_1_transparent": str(panel_1_path),
            "panel_2_wan_source": str(panel_2_path),
            "panel_3_wan_lastframe": str(panel_3_path),
            "summary": str(summary_path),
        },
    }

    if dry_run:
        plan["note"] = "DRY RUN — no API calls made"
        return plan

    # ── Stage 1: Nano Banana ────────────────────────────────────────────────
    print(f"\n[1/4] Nano Banana ({nb_method}) → {shot_path}", file=sys.stderr)
    s1 = nb_generate(
        prompt=prompt,
        reference_paths=reference_paths,
        aspect_ratio=aspect_ratio,
        output_path=str(shot_path),
        method=nb_method,
    )
    plan["stages"][0]["status"] = "ok" if s1.get("ok") else "failed"
    plan["stages"][0]["result"] = {k: s1.get(k) for k in ("ok", "bytes", "method", "price_usd")}
    if not s1.get("ok"):
        plan["error"] = "stage 1 failed"
        return plan
    shot_to_use = Path(s1["output_path"])

    # ── Stage 2: Upscale ────────────────────────────────────────────────────
    if do_upscale:
        print(f"\n[2/4] Upscale (R-ESRGAN {upscale_scale}x, {up_method}) "
              f"→ {upscaled_path}", file=sys.stderr)
        s2 = upscale(
            input_path=shot_to_use,
            output_path=str(upscaled_path),
            scale=upscale_scale,
            method=up_method,
        )
        plan["stages"][1]["status"] = "ok" if s2.get("ok") else "failed"
        plan["stages"][1]["result"] = {k: s2.get(k) for k in ("ok", "bytes", "method", "scale", "price_usd")}
        if not s2.get("ok"):
            plan["error"] = "stage 2 failed"
            return plan
        shot_to_use = Path(s2["output_path"])

    # ── Stage 3: Cut panels ─────────────────────────────────────────────────
    print(f"\n[3/4] Cut 3 vertical panels from {shot_to_use}", file=sys.stderr)
    panels = cut_panels(shot_to_use, out_dir, name)
    plan["stages"][2]["status"] = "ok" if panels.get("panel_1") else "failed"
    plan["stages"][2]["result"] = {k: str(v) for k, v in panels.items()}
    if not panels.get("panel_1"):
        plan["error"] = "stage 3 failed"
        return plan

    # ── Stage 4: BiRefNet on Panel 1 ────────────────────────────────────────
    panel_1_jpg = panels["panel_1"]
    print(f"\n[4/4] BiRefNet 2 on Panel 1 ({rb_method}) → {panel_1_path}", file=sys.stderr)
    s4 = rembg(
        input_path=panel_1_jpg,
        output_path=str(panel_1_path),
        method=rb_method,
    )
    plan["stages"][3]["status"] = "ok" if s4.get("ok") else "failed"
    plan["stages"][3]["result"] = {k: s4.get(k) for k in ("ok", "bytes", "method", "price_usd")}
    if not s4.get("ok"):
        plan["error"] = "stage 4 failed"
        return plan

    plan["ok"] = True
    plan["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())

    summary_path.write_text(json.dumps(plan, indent=2))
    print(f"\nPipeline complete → {summary_path}", file=sys.stderr)
    print(f"   Total cost: ${total_cost:.4f}", file=sys.stderr)
    return plan


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

def load_preset(name: str) -> dict:
    presets = json.loads(PRESETS_PATH.read_text())
    presets.pop("comment", None)
    if name not in presets:
        raise KeyError(f"preset not found: {name}\navailable: {list(presets.keys())}")
    p = dict(presets[name])
    if p.get("prompt_file"):
        pf = HERE / p["prompt_file"]
        p["prompt"] = pf.read_text().strip()
    if p.get("reference"):
        ref = Path(p["reference"])
        if not ref.is_absolute():
            ref = WORKSPACE / ref
        p["reference"] = ref
    return p


def main():
    ap = argparse.ArgumentParser(
        description="Cover pipeline orchestrator (R-ESRGAN only)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--preset", help="preset name from prompts.json")
    ap.add_argument("--prompt", help="raw prompt (overrides preset)")
    ap.add_argument("--ref", action="append", help="reference image (repeatable)")
    ap.add_argument("--name", help="output prefix (default = preset name)")
    ap.add_argument("--out", help="output directory (default = workspace root)")
    ap.add_argument("--aspect", default="16:9")

    # Stages
    ap.add_argument("--no-upscale", action="store_true",
                    help="skip stage 2 (default R-ESRGAN 2x)")
    ap.add_argument("--upscale-scale", type=int, default=2,
                    help="R-ESRGAN scale: 2 (default), 4, or 8")

    # Methods
    ap.add_argument("--nb-method", choices=["sync", "async"], default="sync")
    ap.add_argument("--up-method", choices=["sync", "async"], default="sync")
    ap.add_argument("--rb-method", choices=["sync", "async"], default="sync")

    ap.add_argument("--dry-run", action="store_true",
                    help="describe plan + estimate cost without calling API")

    args = ap.parse_args()

    # Resolve prompt + refs
    preset_data: dict = {}
    if args.preset:
        preset_data = load_preset(args.preset)

    prompt = args.prompt or preset_data.get("prompt")
    if not prompt:
        ap.error("prompt required (--preset or --prompt)")

    refs = list(args.ref) if args.ref else []
    if not refs and preset_data.get("reference"):
        refs = [str(preset_data["reference"])]

    name = args.name or args.preset or "cover"

    plan = run_pipeline(
        name=name,
        prompt=prompt,
        reference_paths=refs if refs else None,
        aspect_ratio=args.aspect,
        out_dir=Path(args.out) if args.out else None,
        do_upscale=not args.no_upscale,
        upscale_scale=args.upscale_scale,
        nb_method=args.nb_method,
        up_method=args.up_method,
        rb_method=args.rb_method,
        dry_run=args.dry_run,
    )

    print(json.dumps(plan, indent=2))
    sys.exit(0 if plan.get("ok") or plan.get("dry_run") or plan.get("stages") else 1)


if __name__ == "__main__":
    sys.exit(main())