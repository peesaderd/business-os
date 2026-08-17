# prodia_test/ — unified image-gen + upscale pipeline

## Structure

```
prodia_test/
├── gen.py               # CLI (gen + upscale + list subcommands)
├── lib_nano_banana.py   # sync/async wrapper for inference.nano-banana.img2img.v2
├── lib_upscale.py       # sync/async wrapper for HYPIR / R-ESRGAN upscale
├── prompts.json         # preset library
├── prompts/*.txt        # prompt text files
├── _archived/           # legacy scripts (do not use)
│   ├── gen_triptych.py
│   ├── gen_triptych_sync.py
│   └── nanobanana_i2i.py
└── README_NANO_BANANA.md
```

## Subcommands

### `gen.py gen` — image generation (Nano Banana)

```bash
python3 prodia_test/gen.py list                        # show presets
python3 prodia_test/gen.py gen --preset shot_yerpall_strawberry
python3 prodia_test/gen.py gen --preset triptych_dearny --method async   # get price
python3 prodia_test/gen.py gen --prompt "..." --ref product.png --out shot.jpg --aspect 16:9
python3 prodia_test/gen.py gen --prompt "..." --ref banner.jpg --ref product.jpg --out out.jpg
python3 prodia_test/gen.py --list                      # legacy top-level flag
```

Pricing: **$0.039/image** (Nano Banana - Gemini 2.5 Flash, 1K)
Endpoint: sync default (no price); pass `--method async` to track price.

### `gen.py upscale` — upscale (HYPIR / R-ESRGAN)

```bash
python3 prodia_test/gen.py upscale input.jpg                    # R-ESRGAN 2x default ($0.001)
python3 prodia_test/gen.py upscale input.jpg -o out.png         # same with explicit output
python3 prodia_test/gen.py upscale input.jpg --model hypir      # HYPIR 2x ($0.05)
python3 prodia_test/gen.py upscale input.jpg --scale 4          # R-ESRGAN 4x ($0.002)
python3 prodia_test/gen.py upscale input.jpg --model hypir --method async --scale 2
```

| Model    | 2x        | 4x        | 8x        |
|----------|-----------|-----------|-----------|
| `resrgan` | $0.001    | $0.002    | $0.003    |
| `hypir`   | **$0.05** | —         | —         |

Default is `resrgan` 2x per card `aa737252` (cheapest path).

### `gen.py list` — show presets + cost table

## Pipeline integration (planned per workboard card `aa737252`)

```
Nano Banana (gen)     $0.039
   ↓
[optional] upscale  $0.001–0.05  (R-ESRGAN 2x default)
   ↓
cut 3 vertical thirds → Panel 1/2/3   (PIL, free)
   ↓
BiRefNet 2 (Panel 1)  $0.0025  → transparent frame layer
   ↓
Panel 2/3 → Wan2.7 first/last frames  (FL2V + Audio)
   ↓
FFmpeg compose cover  (free)
```

Total still-image phase: **$0.0425–$0.0915** per cover depending on upscale choice.

## What this replaces

| Old script | New behavior |
|---|---|
| `gen_triptych.py` (async) | `gen.py gen --method async` |
| `gen_triptych_sync.py` (sync) | `gen.py gen` (default sync) |
| `nanobanana_i2i.py` (banner + product reference) | `gen.py gen --ref banner.jpg --ref product.jpg` |
