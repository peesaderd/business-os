#!/usr/bin/env python3
"""
lib_upscale.py — Prodia upscale wrappers (HYPIR / R-ESRGAN).

Pricing (verified 2026-08-17):
  - R-ESRGAN 2x       = $0.0010
  - R-ESRGAN 4x       = $0.0020
  - R-ESRGAN 8x       = $0.0030
  - HYPIR 2x          = $0.0500  (HYPIR stands behind 'hypir.upscale.v1')

Per card aa737252: default = R-ESRGAN 2x ($0.001) for cost.
HYPIR is selectable for quality-critical jobs (faces, products).

Usage:
    from lib_upscale import upscale, MODELS

    result = upscale("input.jpg", "output.png", model="resrgan", scale=2)
    result = upscale("input.jpg", "output.png", model="hypir", scale=2)

Returns dict with: ok, output_path, bytes, model, scale, price_usd, method
"""
from __future__ import annotations
import os, sys, json, uuid, time
import urllib.request, urllib.error
from pathlib import Path
from typing import Optional, Union

# ── Token (reuse from lib_nano_banana pattern) ─────────────────────────────

PRODIA_TOKEN = ""
_ENV_PATH = "/home/openhands/erp-stack/.env"
if os.path.exists(_ENV_PATH):
    with open(_ENV_PATH) as f:
        for line in f:
            if line.startswith("PRODIA_TOKEN="):
                PRODIA_TOKEN = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
if not PRODIA_TOKEN:
    PRODIA_TOKEN = os.environ.get("PRODIA_TOKEN", "")
if not PRODIA_TOKEN:
    print("❌ PRODIA_TOKEN not found (check /home/openhands/erp-stack/.env)", file=sys.stderr)
    sys.exit(1)


# ── Models (job_type, scale, $price) ───────────────────────────────────────
# Scale = which power of 2: 2/4/8

MODELS = {
    "hypir":   {"job_type": "inference.hypir.upscale.v1",   "scales": [2],       "price": 0.0500},
    "resrgan": {"job_type": "inference.resrgan.upscale.v1",  "scales": [2, 4, 8], "price": {2: 0.0010, 4: 0.0020, 8: 0.0030}},
}

DEFAULT_MODEL = "resrgan"
DEFAULT_SCALE = 2

API_SYNC  = "https://inference.prodia.com/v2/job"
API_ASYNC = "https://inference.prodia.com/v2/job/async"


# ═══════════════════════════════════════════════════════════════════════════
# Multipart helpers
# ═══════════════════════════════════════════════════════════════════════════

def _make_boundary(tag: str = "Upscale") -> str:
    return f"----{tag}{uuid.uuid4().hex[:8]}"


def _part(boundary: str, name: str, filename: str, ctype: str, data) -> bytes:
    b = f"--{boundary}\r\n".encode()
    b += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
    b += f"Content-Type: {ctype}\r\n\r\n".encode()
    b += (data if isinstance(data, bytes) else data.encode()) + b"\r\n"
    return b


# ═══════════════════════════════════════════════════════════════════════════
# Sync entry — fastest, no price (use for default R-ESRGAN)
# ═══════════════════════════════════════════════════════════════════════════

def upscale_sync(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    model: str = DEFAULT_MODEL,
    scale: int = DEFAULT_SCALE,
    timeout: int = 180,
) -> dict:
    """
    Sync upscale. Returns image bytes directly. No price returned.

    model: 'hypir' | 'resrgan'
    scale: 2 (HYPIR only);  2/4/8 (R-ESRGAN)
    """
    mp = _validate_model(model, scale)
    job_type = mp["job_type"]
    price = mp["price"] if isinstance(mp["price"], (int, float)) else mp["price"][scale]

    p = Path(input_path)
    if not p.exists():
        return {"ok": False, "error": f"input not found: {p}", "method": "sync"}

    config = {"image": p.name, "scale": scale}
    job = {"type": job_type, "config": config, "name": f"upscale_{model}_{scale}x"}

    boundary = _make_boundary()
    body = b""
    body += _part(boundary, "job", "job.json", "application/json", json.dumps(job))
    body += _part(boundary, "input", p.name, _mime(p.suffix), p.read_bytes())
    body += f"--{boundary}--\r\n".encode()

    headers = {
        "Authorization": f"Bearer {PRODIA_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "image/png",
    }

    req = urllib.request.Request(API_SYNC, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            ct = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:600]
        except Exception:
            err_body = "<no body>"
        return {"ok": False, "error": f"HTTP {e.code}", "body": err_body,
                "method": "sync", "model": model, "scale": scale}

    out = _resolve_output(output_path, model, scale, "sync")
    out.write_bytes(data)

    return {
        "ok": True,
        "output_path": str(out),
        "bytes": len(data),
        "content_type": ct,
        "method": "sync",
        "model": model,
        "scale": scale,
        "price_usd": None,
        "price_note": f"sync endpoint doesn't return price (estimated ${price})",
    }


# ═══════════════════════════════════════════════════════════════════════════
# Async entry — returns price (HYPIR = pricier, worth tracking)
# ═══════════════════════════════════════════════════════════════════════════

def upscale_async(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    model: str = DEFAULT_MODEL,
    scale: int = DEFAULT_SCALE,
    timeout: int = 180,
    poll_max_retries: int = 60,
    poll_delay: float = 2.0,
) -> dict:
    """Async upscale. Returns real price."""
    mp = _validate_model(model, scale)
    job_type = mp["job_type"]

    p = Path(input_path)
    if not p.exists():
        return {"ok": False, "error": f"input not found: {p}", "method": "async"}

    config = {"image": p.name, "scale": scale}
    job = {"type": job_type, "config": config, "name": f"upscale_{model}_{scale}x"}

    boundary = _make_boundary()
    body = b""
    body += _part(boundary, "job", "job.json", "application/json", json.dumps(job))
    body += _part(boundary, "input", p.name, _mime(p.suffix), p.read_bytes())
    body += f"--{boundary}--\r\n".encode()

    headers = {
        "Authorization": f"Bearer {PRODIA_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",
    }

    endpoint = f"{API_ASYNC}?price=true"
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:600]
        except Exception:
            err_body = "<no body>"
        return {"ok": False, "error": f"HTTP {e.code}", "body": err_body,
                "method": "async", "model": model, "scale": scale}

    job_id = None
    price_usd = None
    try:
        j = json.loads(data)
        job_id = j.get("id") or j.get("job")
        po = j.get("price") or {}
        if isinstance(po, dict):
            price_usd = po.get("dollars")
    except json.JSONDecodeError:
        # Inline image — save and return
        if data[:2] == b"\xff\xd8" or data[:4] == b"\x89PNG":
            out = _resolve_output(output_path, model, scale, "async")
            out.write_bytes(data)
            return {"ok": True, "output_path": str(out), "bytes": len(data),
                    "model": model, "scale": scale, "method": "async_image_inline",
                    "price_usd": None}
        return {"ok": False, "error": "Async non-JSON response",
                "body": data[:200].decode("utf-8", errors="replace"),
                "method": "async", "model": model, "scale": scale}

    if not job_id:
        return {"ok": False, "error": "No job_id", "method": "async",
                "model": model, "scale": scale}

    # Poll
    state_url = f"{API_ASYNC}/{job_id}/job.state.current"
    last_status = ""
    for attempt in range(poll_max_retries):
        time.sleep(poll_delay)
        try:
            with urllib.request.urlopen(state_url, timeout=30) as r:
                status = r.read().decode("utf-8", errors="replace").strip()
        except Exception:
            continue
        if status != last_status:
            print(f"[upscale_async poll] attempt={attempt} status={status}", file=sys.stderr)
            last_status = status
        if status == "processed":
            break
        if status == "failed":
            return {"ok": False, "error": "Job failed", "job_id": job_id,
                    "method": "async", "model": model, "scale": scale}
    else:
        return {"ok": False, "error": "Poll timeout", "job_id": job_id,
                "method": "async", "model": model, "scale": scale}

    # Fetch price
    try:
        job_json_url = f"{API_ASYNC}/{job_id}/job.json?price=true"
        with urllib.request.urlopen(job_json_url, timeout=30) as r:
            rj = json.loads(r.read())
            po = rj.get("price") or {}
            if isinstance(po, dict) and po.get("dollars"):
                price_usd = po.get("dollars")
    except Exception:
        pass

    # Download
    try:
        out_url = f"{API_ASYNC}/{job_id}/output"
        with urllib.request.urlopen(out_url, timeout=30) as r:
            filenames = json.loads(r.read())
    except Exception:
        filenames = []

    if not (isinstance(filenames, list) and filenames):
        return {"ok": False, "error": "No output file", "job_id": job_id,
                "method": "async", "model": model, "scale": scale,
                "price_usd": price_usd}

    fname = filenames[0]
    if not fname.startswith("http"):
        download_url = f"{API_ASYNC}/{job_id}/output/{fname}"
    else:
        download_url = fname
    try:
        with urllib.request.urlopen(download_url, timeout=120) as r:
            img_bytes = r.read()
    except Exception as e:
        return {"ok": False, "error": f"Download failed: {e}", "job_id": job_id,
                "method": "async", "model": model, "scale": scale,
                "price_usd": price_usd}

    out = _resolve_output(output_path, model, scale, "async")
    out.write_bytes(img_bytes)

    return {
        "ok": True,
        "output_path": str(out),
        "bytes": len(img_bytes),
        "method": "async",
        "model": model,
        "scale": scale,
        "price_usd": price_usd,
        "job_id": job_id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Default entry
# ═══════════════════════════════════════════════════════════════════════════

def upscale(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    model: str = DEFAULT_MODEL,
    scale: int = DEFAULT_SCALE,
    method: str = "sync",
) -> dict:
    """Convenience dispatcher (sync by default)."""
    if method == "async":
        return upscale_async(input_path, output_path, model, scale)
    return upscale_sync(input_path, output_path, model, scale)


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

def _validate_model(model: str, scale: int):
    if model not in MODELS:
        raise ValueError(f"unknown model '{model}'; choose from {list(MODELS.keys())}")
    mp = MODELS[model]
    if scale not in mp["scales"]:
        raise ValueError(f"scale {scale}x not supported by '{model}'; allowed: {mp['scales']}")
    return mp


_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _mime(ext):
    return _MIME_BY_EXT.get(ext.lower(), "application/octet-stream")


def _resolve_output(output_path, model, scale, tag):
    if output_path:
        p = Path(output_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return Path(f"/home/openhands/.openclaw/workspace/upscale_{model}_{scale}x_{tag}_{uuid.uuid4().hex[:8]}.png")


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="lib_upscale smoke test")
    ap.add_argument("input", help="input image path")
    ap.add_argument("--output", "-o", help="output path")
    ap.add_argument("--model", choices=list(MODELS.keys()), default=DEFAULT_MODEL)
    ap.add_argument("--scale", type=int, default=DEFAULT_SCALE,
                    help=f"per model: { {k: v['scales'] for k,v in MODELS.items()} }")
    ap.add_argument("--method", choices=["sync", "async"], default="sync")
    args = ap.parse_args()

    res = upscale(args.input, args.output, args.model, args.scale, args.method)
    print(json.dumps(res, indent=2))
    sys.exit(0 if res.get("ok") else 1)
