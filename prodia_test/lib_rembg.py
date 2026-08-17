#!/usr/bin/env python3
"""
lib_rembg.py — Prodia BiRefNet 2 background removal.

Locked-in per card aa737252:
  inference.birefnet.segment.v1   $0.0025/image
  (replaces inference.remove-background.v1 $0.02 — 8x cheaper)

Returns transparent PNG (RGBA, white background masked out).

Usage:
    from lib_rembg import rembg, rembg_sync, rembg_async

    result = rembg_sync("input.jpg", "output.png")
    result = rembg_async("input.jpg", "output.png")  # returns price
"""
from __future__ import annotations
import os, sys, json, uuid, time
import urllib.request, urllib.error
from pathlib import Path
from typing import Optional, Union

# ── Token ──────────────────────────────────────────────────────────────────

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


# ── Constants ──────────────────────────────────────────────────────────────

API_SYNC  = "https://inference.prodia.com/v2/job"
API_ASYNC = "https://inference.prodia.com/v2/job/async"

PRICE_USD = 0.0025  # BiRefNet 2
JOB_TYPE  = "inference.birefnet.segment.v1"

# Optional contour refinement (helps with fuzzy edges like hair, fabric)
# Per docs: {"contour": true, "contour_tolerance": <0-255>}
# Default: no contour (cheapest)


# ═══════════════════════════════════════════════════════════════════════════
# Multipart helpers
# ═══════════════════════════════════════════════════════════════════════════

def _make_boundary(tag: str = "RemBG") -> str:
    return f"----{tag}{uuid.uuid4().hex[:8]}"


def _part(boundary: str, name: str, filename: str, ctype: str, data) -> bytes:
    b = f"--{boundary}\r\n".encode()
    b += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
    b += f"Content-Type: {ctype}\r\n\r\n".encode()
    b += (data if isinstance(data, bytes) else data.encode()) + b"\r\n"
    return b


def _mime(ext: str) -> str:
    return {
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext.lower(), "application/octet-stream")


# ═══════════════════════════════════════════════════════════════════════════
# Sync entry — fastest, no price returned
# ═══════════════════════════════════════════════════════════════════════════

def rembg_sync(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    contour: bool = False,
    contour_tolerance: int = 0,
    timeout: int = 180,
) -> dict:
    """
    Sync BiRefNet 2 background removal. Returns PNG bytes directly.

    contour: edge refinement pass (helps hair/fabric edges; default off)
    contour_tolerance: 0-255 (used only when contour=True)
    """
    p = Path(input_path)
    if not p.exists():
        return {"ok": False, "error": f"input not found: {p}", "method": "sync"}

    config = {"image": p.name}
    if contour:
        config["contour"] = True
        if contour_tolerance:
            config["contour_tolerance"] = contour_tolerance

    job = {
        "type": JOB_TYPE,
        "config": config,
        "name": f"rembg_{p.stem}",
    }

    boundary = _make_boundary()
    body = b""
    body += _part(boundary, "job", "job.json", "application/json", json.dumps(job))
    body += _part(boundary, "input", p.name, _mime(p.suffix), p.read_bytes())
    body += f"--{boundary}--\r\n".encode()

    headers = {
        "Authorization": f"Bearer {PRODIA_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "multipart/form-data",
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
                "method": "sync"}

    out = _resolve_output(output_path)

    # Prodia returns multipart/form-data with foreground.png + mask.png
    if data[:2] == b'\r\n' or b'Content-Disposition' in data[:200] or b'multipart' in ct:
        fg_path, mask_path = _parse_multipart_foreground(data, out)
        if fg_path is None:
            # Not multipart — write raw as fallback
            out.write_bytes(data)
        else:
            out = fg_path
    else:
        out.write_bytes(data)

    return {
        "ok": True,
        "output_path": str(out),
        "bytes": len(data),
        "content_type": ct,
        "method": "sync",
        "price_usd": None,
        "price_note": f"sync endpoint doesn't return price (estimated ${PRICE_USD})",
        "mask_path": str(out.with_suffix('.mask.png')) if (out.with_suffix('.mask.png')).exists() else None,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Async entry — returns real price
# ═══════════════════════════════════════════════════════════════════════════

def rembg_async(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    contour: bool = False,
    contour_tolerance: int = 0,
    timeout: int = 180,
    poll_max_retries: int = 60,
    poll_delay: float = 2.0,
) -> dict:
    """Async BiRefNet 2 background removal. Returns real price."""
    p = Path(input_path)
    if not p.exists():
        return {"ok": False, "error": f"input not found: {p}", "method": "async"}

    config = {"image": p.name}
    if contour:
        config["contour"] = True
        if contour_tolerance:
            config["contour_tolerance"] = contour_tolerance

    job = {
        "type": JOB_TYPE,
        "config": config,
        "name": f"rembg_{p.stem}",
    }

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
                "method": "async"}

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
            out = _resolve_output(output_path)
            out.write_bytes(data)
            return {"ok": True, "output_path": str(out), "bytes": len(data),
                    "method": "async_image_inline", "price_usd": None}
        return {"ok": False, "error": "Async non-JSON response",
                "body": data[:200].decode("utf-8", errors="replace"),
                "method": "async"}

    if not job_id:
        return {"ok": False, "error": "No job_id", "method": "async"}

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
            print(f"[rembg_async poll] attempt={attempt} status={status}", file=sys.stderr)
            last_status = status
        if status == "processed":
            break
        if status == "failed":
            return {"ok": False, "error": "Job failed", "job_id": job_id,
                    "method": "async"}
    else:
        return {"ok": False, "error": "Poll timeout", "job_id": job_id,
                "method": "async"}

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
                "method": "async", "price_usd": price_usd}

    fname = filenames[0]
    download_url = fname if fname.startswith("http") else f"{API_ASYNC}/{job_id}/output/{fname}"
    try:
        with urllib.request.urlopen(download_url, timeout=120) as r:
            img_bytes = r.read()
    except Exception as e:
        return {"ok": False, "error": f"Download failed: {e}", "job_id": job_id,
                "method": "async", "price_usd": price_usd}

    out = _resolve_output(output_path)
    out.write_bytes(img_bytes)

    return {
        "ok": True,
        "output_path": str(out),
        "bytes": len(img_bytes),
        "method": "async",
        "price_usd": price_usd,
        "job_id": job_id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Dispatcher
# ═══════════════════════════════════════════════════════════════════════════

def rembg(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    contour: bool = False,
    contour_tolerance: int = 0,
    method: str = "sync",
) -> dict:
    """Convenience dispatcher (sync by default)."""
    if method == "async":
        return rembg_async(input_path, output_path, contour, contour_tolerance)
    return rembg_sync(input_path, output_path, contour, contour_tolerance)


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

def _resolve_output(output_path):
    if output_path:
        p = Path(output_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return Path(f"/home/openhands/.openclaw/workspace/rembg_{uuid.uuid4().hex[:8]}.png")


def _parse_multipart_foreground(raw: bytes, out_path: Path):
    """
    Parse Prodia BiRefNet multipart/form-data response.

    Response contains 3 parts:
      1. job.json (echo)
      2. foreground.png  ← the main output (RGBA with transparency)
      3. mask.png        ← alpha mask

    Returns (fg_path, mask_path) — both written. Returns (None, None) on parse fail.
    """
    import re as _re
    import email as _email
    from email.parser import BytesParser as _BP

    m = _re.match(rb'--([a-f0-9]+)\r\n', raw)
    if not m:
        return None, None
    boundary = m.group(1).decode()
    hdr = f'Content-Type: multipart/form-data; boundary={boundary}\r\nMIME-Version: 1.0\r\n\r\n'
    try:
        msg = _BP().parsebytes(hdr.encode() + raw)
    except Exception:
        return None, None
    if not msg.is_multipart():
        return None, None

    fg_path, mask_path = None, None
    for part in msg.get_payload():
        cd = part.get('Content-Disposition', '')
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            continue
        if 'name="output"' in cd and 'foreground' in cd and payload[:4] == b'\x89PNG':
            fg_path = out_path
            fg_path.write_bytes(payload)
        elif 'name="output"' in cd and 'mask' in cd and payload[:4] == b'\x89PNG':
            mask_path = out_path.with_suffix('.mask.png')
            mask_path.write_bytes(payload)
    return fg_path, mask_path


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="lib_rembg smoke test")
    ap.add_argument("input", help="input image path")
    ap.add_argument("--output", "-o", help="output path (PNG with transparency)")
    ap.add_argument("--contour", action="store_true",
                    help="enable edge refinement (hair/fabric)")
    ap.add_argument("--tolerance", type=int, default=0,
                    help="contour tolerance 0-255 (with --contour)")
    ap.add_argument("--method", choices=["sync", "async"], default="sync")
    args = ap.parse_args()

    res = rembg(args.input, args.output, args.contour, args.tolerance, args.method)
    print(json.dumps(res, indent=2))
    sys.exit(0 if res.get("ok") else 1)