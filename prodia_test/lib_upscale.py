#!/usr/bin/env python3
"""
lib_upscale.py — Prodia upscale wrapper (R-ESRGAN backend).

Pricing (verified 2026-08-17):
  - 2x       = $0.0010
  - 4x       = $0.0020
  - 8x       = $0.0030

Backend: `inference.upscale.v1` with R-ESRGAN model.
  - Config: {"image": "...", "upscale": 2|4|8}
  - Note: `inference.resrgan.upscale.v1` and `inference.hypir.upscale.v1`
    both rejected with "unknown job type" (2026-08-17 test).
  - Working job_type: `inference.upscale.v1` (R-ESRGAN inside)

HYPIR (diffusion-based, $0.05) was removed 2026-08-17 per user:
  - 50x more expensive than R-ESRGAN
  - Not worth it for cover pipeline frames
  - Removed to avoid accidental expensive calls

Per card aa737252: R-ESRGAN 2x is the sole upscale option.

Usage:
    from lib_upscale import upscale, MODEL

    result = upscale("input.jpg", "output.png", scale=2)

Returns dict with: ok, output_path, bytes, scale, price_usd, method
"""
from __future__ import annotations
import os, sys, json, uuid, time
import urllib.request, urllib.error
from pathlib import Path
from typing import Optional, Union

# ── Token ──────────────────────────────────────────────────────────────────

PRODIA_TOKEN = "X"
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
    print("PRODIA_TOKEN not found (check /home/openhands/erp-stack/.env)", file=sys.stderr)
    sys.exit(1)


# ── Model (R-ESRGAN only — HYPIR removed 2026-08-17) ──────────────────────

MODEL = {
    "job_type": "inference.upscale.v1",   # R-ESRGAN backend (2026-08-17 verified)
    "scales":   [2, 4, 8],
    "price":    {2: 0.0010, 4: 0.0020, 8: 0.0030},
}

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
# Sync entry — fastest, no price (default for R-ESRGAN)
# ═══════════════════════════════════════════════════════════════════════════

def upscale_sync(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    scale: int = DEFAULT_SCALE,
    timeout: int = 180,
) -> dict:
    """
    Sync R-ESRGAN upscale. Returns image bytes directly.
    scale: 2, 4, or 8
    """
    job_type, price = _validate_scale(scale)

    p = Path(input_path)
    if not p.exists():
        return {"ok": False, "error": f"input not found: {p}", "method": "sync"}

    config = {"image": p.name, "upscale": scale}
    job = {"type": job_type, "config": config, "name": f"upscale_{scale}x"}

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
                "method": "sync", "scale": scale}

    out = _resolve_output(output_path, scale)
    out.write_bytes(data)

    return {
        "ok": True,
        "output_path": str(out),
        "bytes": len(data),
        "content_type": ct,
        "method": "sync",
        "scale": scale,
        "price_usd": None,
        "price_note": f"sync endpoint doesn't return price (estimated ${price})",
    }


# ═══════════════════════════════════════════════════════════════════════════
# Async entry — returns real price
# ═══════════════════════════════════════════════════════════════════════════

def upscale_async(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    scale: int = DEFAULT_SCALE,
    timeout: int = 180,
    poll_max_retries: int = 60,
    poll_delay: float = 2.0,
) -> dict:
    """Async R-ESRGAN upscale. Returns real price."""
    job_type, _ = _validate_scale(scale)

    p = Path(input_path)
    if not p.exists():
        return {"ok": False, "error": f"input not found: {p}", "method": "async"}

    config = {"image": p.name, "upscale": scale}
    job = {"type": job_type, "config": config, "name": f"upscale_{scale}x"}

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
                "method": "async", "scale": scale}

    job_id = None
    price_usd = None
    try:
        j = json.loads(data)
        job_id = j.get("id") or j.get("job")
        po = j.get("price") or {}
        if isinstance(po, dict):
            price_usd = po.get("dollars")
    except json.JSONDecodeError:
        if data[:2] == b"\xff\xd8" or data[:4] == b"\x89PNG":
            out = _resolve_output(output_path, scale)
            out.write_bytes(data)
            return {"ok": True, "output_path": str(out), "bytes": len(data),
                    "scale": scale, "method": "async_image_inline", "price_usd": None}
        return {"ok": False, "error": "Async non-JSON response",
                "body": data[:200].decode("utf-8", errors="replace"),
                "method": "async", "scale": scale}

    if not job_id:
        return {"ok": False, "error": "No job_id", "method": "async", "scale": scale}

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
                    "method": "async", "scale": scale}
    else:
        return {"ok": False, "error": "Poll timeout", "job_id": job_id,
                "method": "async", "scale": scale}

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
                "method": "async", "scale": scale, "price_usd": price_usd}

    fname = filenames[0]
    download_url = fname if fname.startswith("http") else f"{API_ASYNC}/{job_id}/output/{fname}"
    try:
        with urllib.request.urlopen(download_url, timeout=120) as r:
            img_bytes = r.read()
    except Exception as e:
        return {"ok": False, "error": f"Download failed: {e}", "job_id": job_id,
                "method": "async", "scale": scale, "price_usd": price_usd}

    out = _resolve_output(output_path, scale)
    out.write_bytes(img_bytes)

    return {
        "ok": True,
        "output_path": str(out),
        "bytes": len(img_bytes),
        "method": "async",
        "scale": scale,
        "price_usd": price_usd,
        "job_id": job_id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Dispatcher
# ═══════════════════════════════════════════════════════════════════════════

def upscale(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    scale: int = DEFAULT_SCALE,
    method: str = "sync",
) -> dict:
    """Convenience dispatcher (sync by default)."""
    if method == "async":
        return upscale_async(input_path, output_path, scale)
    return upscale_sync(input_path, output_path, scale)


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

def _validate_scale(scale: int):
    if scale not in MODEL["scales"]:
        raise ValueError(f"scale {scale}x not supported; allowed: {MODEL['scales']}")
    return MODEL["job_type"], MODEL["price"][scale]


_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _mime(ext):
    return _MIME_BY_EXT.get(ext.lower(), "application/octet-stream")


def _resolve_output(output_path, scale):
    if output_path:
        p = Path(output_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return Path(f"/home/openhands/.openclaw/workspace/upscale_resrgan_{scale}x_{uuid.uuid4().hex[:8]}.png")


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="lib_upscale smoke test (R-ESRGAN only)")
    ap.add_argument("input", help="input image path")
    ap.add_argument("--output", "-o", help="output path")
    ap.add_argument("--scale", type=int, default=DEFAULT_SCALE,
                    help="2, 4, or 8 (default 2)")
    ap.add_argument("--method", choices=["sync", "async"], default="sync")
    args = ap.parse_args()

    res = upscale(args.input, args.output, args.scale, args.method)
    print(json.dumps(res, indent=2))
    sys.exit(0 if res.get("ok") else 1)