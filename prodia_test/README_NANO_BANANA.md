# prodia_test/ — unified image-gen + upscale + rembg pipeline

## Structure

```
prodia_test/
├── gen.py               # CLI (gen + upscale + rembg + list subcommands)
├── cover_pipeline.py    # end-to-end orchestrator (4 stages)
├── lib_nano_banana.py   # sync/async wrapper for inference.nano-banana.img2img.v2
├── lib_upscale.py       # sync/async wrapper for R-ESRGAN upscale
├── lib_rembg.py         # sync/async wrapper for BiRefNet 2
├── prompts.json         # preset library
├── prompts/*.txt        # prompt text files
├── _archived/           # legacy scripts (do not use)
└── README_NANO_BANANA.md
```

## Subcommands

### `gen.py gen` — image generation (Nano Banana)

```bash
python3 prodia_test/gen.py list                                 # show presets + costs
python3 prodia_test/gen.py gen --preset shot_yerpall_strawberry
python3 prodia_test/gen.py gen --preset triptych_dearny --method async   # get price
python3 prodia_test/gen.py gen --prompt "..." --ref product.png --out shot.jpg --aspect 16:9
python3 prodia_test/gen.py gen --prompt "..." --ref banner.jpg --ref product.jpg --out out.jpg
```

Pricing: **$0.039/image** (Nano Banana - Gemini 2.5 Flash, 1K)
Endpoint: sync default (no price); pass `--method async` to track price.

### `gen.py upscale` — upscale (R-ESRGAN only)

```bash
python3 prodia_test/gen.py upscale input.jpg                    # R-ESRGAN 2x ($0.001)
python3 prodia_test/gen.py upscale input.jpg -o out.png         # explicit output
python3 prodia_test/gen.py upscale input.jpg --scale 4          # R-ESRGAN 4x ($0.002)
python3 prodia_test/gen.py upscale input.jpg --scale 8          # R-ESRGAN 8x ($0.003)
python3 prodia_test/gen.py upscale input.jpg --method async     # track real price
```

| Scale | Cost |
|------:|-----:|
| 2x    | $0.001 |
| 4x    | $0.002 |
| 8x    | $0.003 |

⚠️ **HYPIR removed 2026-08-17** — was $0.05 (50x more expensive), kept seductive option confused usage.

### `gen.py rembg` — background removal (BiRefNet 2)

```bash
python3 prodia_test/gen.py rembg input.jpg -o out.png             # default
python3 prodia_test/gen.py rembg input.jpg -o out.png --contour   # edge refinement (hair/fabric)
python3 prodia_test/gen.py rembg input.jpg --method async         # track real price
```

Pricing: **$0.0025/image** (BiRefNet 2). Replaces remove-background.v1 ($0.02).

### `gen.py list` — show presets + cost table

## End-to-end pipeline (per workboard card `aa737252`)

```bash
# Full pipeline (~$0.0425/cover)
python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry

# Skip upscale (~$0.0415)
python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry --no-upscale

# 4x upscale (~$0.0435)
python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry --upscale-scale 4

# Dry run (no API calls)
python3 prodia_test/cover_pipeline.py --preset shot_yerpall_strawberry --dry-run
```

**Pipeline stages:**

```
Nano Banana (gen)         $0.039
   ↓
[optional] R-ESRGAN upscale 2x  $0.001  (or 4x=$0.002, 8x=$0.003; default 2x)
   ↓
cut 3 vertical thirds → Panel 1/2/3   (PIL, free)
   ↓
BiRefNet 2 (Panel 1)  $0.0025  → transparent frame layer
   ↓
Panel 2/3 → Wan2.7 first/last frames  (FL2V + Audio)
   ↓
FFmpeg compose cover  (free)
```

**Total still-image phase: $0.0425–$0.0435 per cover** (R-ESRGAN only).

## What this replaces

| Old script | New behavior |
|---|---|
| `gen_triptych.py` (async) | `gen.py gen --method async` |
| `gen_triptych_sync.py` (sync) | `gen.py gen` (default sync) |
| `nanobanana_i2i.py` (banner + product reference) | `gen.py gen --ref banner.jpg --ref product.jpg` |
| manual upscale via separate util | `gen.py upscale input.jpg` |
| manual rembg via separate util | `gen.py rembg input.jpg` |
| 4-stage manual pipeline | `cover_pipeline.py --preset ...` |
