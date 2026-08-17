# prodia_test/ — unified image-gen pipeline (Nano Banana)

## What's here

```
prodia_test/
├── gen.py               # CLI entry (single command for everything)
├── lib_nano_banana.py   # sync/async wrapper around `inference.nano-banana.img2img.v2`
├── prompts.json         # preset library (triptych_dearny, shot_yerpall_strawberry)
├── prompts/             # prompt text files
├── _archived/           # legacy scripts (do not use)
│   ├── gen_triptych.py
│   ├── gen_triptych_sync.py
│   └── nanobanana_i2i.py
└── ... (other unrelated scripts/dirs unchanged)
```

## Quick start

List presets:
```bash
python3 prodia_test/gen.py --list
```

Run a preset:
```bash
python3 prodia_test/gen.py --preset shot_yerpall_strawberry              # sync (default)
python3 prodia_test/gen.py --preset shot_yerpall_strawberry --method async   # async (returns price)
```

Raw command:
```bash
python3 prodia_test/gen.py --prompt "..." --ref product.png --out shot.jpg --aspect 16:9
python3 prodia_test/gen.py --prompt "..." --ref banner.jpg --ref product.jpg --out out.jpg
```

## Endpoint choice

- **sync** (default): `/v2/job` — direct image bytes, fastest, NO price returned
- **async**: `/v2/job/async?price=true` — job_id + poll + price (`$0.039/image`)

## Pricing

Nano Banana (Gemini 2.5 Flash, 1K) = **$0.039/image** (verified Prodia docs 2026-08-17).

## Adding a new preset

Edit `prodia_test/prompts.json`:
```json
{
  "comment": "...",
  "my_new_preset": {
    "description": "What this preset is for",
    "prompt_file": "prompts/my_new.txt",
    "negative_file": "prompts/my_new_neg.txt",
    "aspect_ratio": "16:9",
    "reference": "../media/inbound/some_product.png",
    "output": "my_output.jpg"
  }
}
```

Path rules: paths in `prompts.json` resolve relative to `prodia_test/` for `prompt_file`/`negative_file`, and relative to `/home/openhands/.openclaw/workspace/` for `reference`/`output`.

## What this replaces

| Old script | New behavior |
|---|---|
| `gen_triptych.py` (async) | `gen.py --method async` |
| `gen_triptych_sync.py` (sync) | `gen.py --method sync` |
| `nanobanana_i2i.py` (banner + product reference) | `gen.py --ref banner.jpg --ref product.jpg` |

## Next pipeline stages (TODO)

1. `lib_hypir_upscale.py` — `inference.hypir.upscale.v1` ($0.001)
2. `lib_birefnet_rembg.py` — `inference.birefnet.segment.v1` ($0.0025)
3. Panel cutter (PIL/cv2, no cost)
4. Orchestrator `cover_pipeline.py` that chains all 4 stages per `aa737252` card.
