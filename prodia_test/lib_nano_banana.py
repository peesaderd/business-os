#!/usr/bin/env python3
"""
lib_nano_banana.py — Single entry for all Prodia Nano Banana img2img calls.

Replaces 3 separate scripts:
  - prodia_test/gen_triptych.py       (async variant)
  - prodia_test/gen_triptych_sync.py  (sync variant)
  - prodia_test/nanobanana_i2i.py     (banner + product reference)

One API for every "gen an image via Nano Banana" task.
Pricing: $0.039 / image (Nano Banana — Gemini 2.5 Flash, 1K) (verified 2026-08-17 Prodia docs)

Usage:
    from lib_nano_banana import generate, generate_sync, generate_async

    # simple (sync, default — fastest path to image bytes)
    result = generate(
        prompt="...",
        reference_paths=["product.png"],          # optional
        aspect_ratio="16:9",
        output_path="out.jpg",
    )
    # → {"ok": True, "output_path": "out.jpg", "bytes": 12345, "method": "sync",
    #    "price_usd": None}

    # with 2 references (banner + product)
    result = generate(
        prompt="...",
        reference_paths=["banner.jpg", "product.jpg"],
        aspect_ratio="16:9",
        output_path="out.jpg",
    )

    # async (returns price)
    result = generate_async(
        prompt="...",
        reference_paths=["product.png"],
        aspect_ratio="16:9",
        output_path="out.jpg",
    )

CLI: see ../gen.py — wraps this lib.
"""
from __future__ import annotations
import os, sys, json, uuid, re, time
import urllib.request, urllib.error
from pathlib import Path
from typing import Optional, List, Union

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

# ── API endpoints ──────────────────────────────────────────────────────────

API_SYNC  = "https://inference.prodia.com/v2/job"        # returns image bytes
API_ASYNC = "https://inference.prodia.com/v2/job/async"  # returns job_id, polling

PRICE_USD = 0.039  # Nano Banana — Gemini 2.5 Flash, 1K

JOB_TYPE = "inference.nano-banana.img2img.v2"


# ═══════════════════════════════════════════════════════════════════════════
# Multipart helpers (sync variant pattern, copied from gen_triptych_sync.py)
# ═══════════════════════════════════════════════════════════════════════════

def _make_boundary(tag: str = "NanoBanana") -> str:
    return f"----{tag}{uuid.uuid4().hex[:8]}"


def _part(boundary: str, name: str, filename: str, ctype: str, data: bytes) -> bytes:
    b = f"--{boundary}\r\n".encode()
    b += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
    b += f"Content-Type: {ctype}\r\n\r\n".encode()
    b += data + b"\r\n"
    return b


def _build_multipart(job: dict, references: List[tuple]) -> tuple[bytes, str]:
    """
    Build multipart/form-data body for Nano Banana.

    references: list of (filename, content_bytes, content_type)
                e.g. [("product.png", png_bytes, "image/png"),
                      ("banner.jpg",  jpg_bytes, "image/jpeg")]

    The references appear as multipart "input" fields; config.images lists
    their filenames in the same order. (See nanobanana_i2i.py — same shape.)
    """
    boundary = _make_boundary()
    body = b""
    body += _part(boundary, "job", "job.json", "application/json", json.dumps(job).encode())
    for i, (fname, data, ctype) in enumerate(references):
        # Nano Banana accepts up to 2 inputs: input_0.png / input_1.png
        body += _part(boundary, "input", fname, ctype, data)
    body += f"--{boundary}--\r\n".encode()
    return body, boundary


# ═══════════════════════════════════════════════════════════════════════════
# Sync variant — fastest, returns image bytes directly (no polling)
# ═══════════════════════════════════════════════════════════════════════════

def generate_sync(
    prompt: str,
    reference_paths: Optional[List[Union[str, Path]]] = None,
    reference_bytes_list: Optional[List[tuple]] = None,  # [(filename, bytes, mime)]
    aspect_ratio: str = "16:9",
    output_path: Optional[Union[str, Path]] = None,
    timeout: int = 300,
) -> dict:
    """
    Call Nano Banana via sync endpoint. No price returned.

    Provide references EITHER by paths OR by bytes list.
    Returns: {ok, output_path, bytes, method='sync', price_usd=None}
    """
    refs = _resolve_references(reference_paths, reference_bytes_list)

    config: dict = {"prompt": prompt, "aspect_ratio": aspect_ratio}
    if refs:
        config["images"] = [fname for fname, _, _ in refs]

    job = {"type": JOB_TYPE, "config": config, "name": "lib_nano_banana_sync"}

    body, boundary = _build_multipart(job, refs)

    headers = {
        "Authorization": f"Bearer {PRODIA_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "image/jpeg",
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
        return {"ok": False, "error": f"HTTP {e.code}", "body": err_body, "method": "sync"}

    out_path = _resolve_output_path(output_path, "sync")
    out_path.write_bytes(data)

    return {
        "ok": True,
        "output_path": str(out_path),
        "bytes": len(data),
        "content_type": ct,
        "method": "sync",
        "price_usd": None,  # sync endpoint doesn't return price
        "price_note": "Sync endpoint doesn't return price; estimate $0.039/image",
    }


# ═══════════════════════════════════════════════════════════════════════════
# Async variant — returns price (ProdiaV2Client pattern)
# ═══════════════════════════════════════════════════════════════════════════

def generate_async(
    prompt: str,
    reference_paths: Optional[List[Union[str, Path]]] = None,
    reference_bytes_list: Optional[List[tuple]] = None,
    aspect_ratio: str = "16:9",
    output_path: Optional[Union[str, Path]] = None,
    timeout: int = 300,
    poll_max_retries: int = 60,
    poll_delay: float = 2.0,
) -> dict:
    """
    Call Nano Banana via async endpoint. Returns price.

    Returns: {ok, output_path, bytes, method='async', price_usd, job_id}
    """
    refs = _resolve_references(reference_paths, reference_bytes_list)

    config: dict = {"prompt": prompt, "aspect_ratio": aspect_ratio}
    if refs:
        config["images"] = [fname for fname, _, _ in refs]

    job = {"type": JOB_TYPE, "config": config, "name": "lib_nano_banana_async"}

    body, boundary = _build_multipart(job, refs)
    headers = {
        "Authorization": f"Bearer {PRODIA_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",  # async returns JSON, not image
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
        return {"ok": False, "error": f"HTTP {e.code}", "body": err_body, "method": "async"}

    job_id = None
    price_usd = None
    try:
        j = json.loads(data)
        job_id = j.get("id") or j.get("job")
        price_obj = j.get("price") or {}
        if isinstance(price_obj, dict):
            price_usd = price_obj.get("dollars")
    except json.JSONDecodeError:
        # Sometimes async also streams the image (multipart). Try to find it.
        if data[:2] == b"\xff\xd8" or data[:4] == b"\x89PNG":
            out_path = _resolve_output_path(output_path, "async")
            out_path.write_bytes(data)
            return {"ok": True, "output_path": str(out_path), "bytes": len(data),
                    "method": "async_image_inline", "price_usd": None, "job_id": None}
        return {"ok": False, "error": "Async non-JSON response",
                "body": data[:200].decode("utf-8", errors="replace"),
                "method": "async"}

    if not job_id:
        return {"ok": False, "error": "No job_id", "body": data[:200].decode("utf-8", errors="replace"),
                "method": "async"}

    # ── Poll for result ─────────────────────────────────────────────────────
    state_url = f"{API_ASYNC}/{job_id}/job.state.current"
    job_json_url = f"{API_ASYNC}/{job_id}/job.json?price=true"
    output_url_endpoint = f"{API_ASYNC}/{job_id}/output"

    last_status = ""
    for attempt in range(poll_max_retries):
        time.sleep(poll_delay)
        try:
            with urllib.request.urlopen(state_url, timeout=30) as r:
                status = r.read().decode("utf-8", errors="replace").strip()
        except Exception:
            continue
        if status != last_status:
            print(f"[poll] attempt={attempt} status={status}", file=sys.stderr)
            last_status = status
        if status == "processed":
            break
        if status == "failed":
            return {"ok": False, "error": "Job failed", "job_id": job_id, "method": "async"}
    else:
        return {"ok": False, "error": "Poll timeout", "job_id": job_id, "method": "async"}

    # ── Fetch result (price etc.) ──────────────────────────────────────────
    try:
        with urllib.request.urlopen(job_json_url, timeout=30) as r:
            result_json = json.loads(r.read())
            price_obj = result_json.get("price") or {}
            if isinstance(price_obj, dict) and price_obj.get("dollars"):
                price_usd = price_obj.get("dollars")
    except Exception:
        pass

    # ── Download output ────────────────────────────────────────────────────
    try:
        with urllib.request.urlopen(output_url_endpoint, timeout=30) as r:
            filenames = json.loads(r.read())
    except Exception:
        filenames = []

    if not (isinstance(filenames, list) and filenames):
        return {"ok": False, "error": "No output file", "job_id": job_id, "method": "async",
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
        return {"ok": False, "error": f"Download failed: {e}", "job_id": job_id, "method": "async",
                "price_usd": price_usd}

    out_path = _resolve_output_path(output_path, "async")
    out_path.write_bytes(img_bytes)

    return {
        "ok": True,
        "output_path": str(out_path),
        "bytes": len(img_bytes),
        "method": "async",
        "price_usd": price_usd,
        "job_id": job_id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Default entry — sync (fastest, simplest)
# ═══════════════════════════════════════════════════════════════════════════

def generate(
    prompt: str,
    reference_paths: Optional[List[Union[str, Path]]] = None,
    reference_bytes_list: Optional[List[tuple]] = None,
    aspect_ratio: str = "16:9",
    output_path: Optional[Union[str, Path]] = None,
    method: str = "sync",  # "sync" | "async"
    **kwargs,
) -> dict:
    """Convenience dispatch (sync by default)."""
    if method == "async":
        return generate_async(
            prompt=prompt,
            reference_paths=reference_paths,
            reference_bytes_list=reference_bytes_list,
            aspect_ratio=aspect_ratio,
            output_path=output_path,
            **kwargs,
        )
    return generate_sync(
        prompt=prompt,
        reference_paths=reference_paths,
        reference_bytes_list=reference_bytes_list,
        aspect_ratio=aspect_ratio,
        output_path=output_path,
        **kwargs,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _resolve_references(paths, bytes_list):
    if bytes_list is not None:
        return list(bytes_list)
    if not paths:
        return []
    out = []
    for p in paths:
        p = Path(p)
        if not p.exists():
            raise FileNotFoundError(p)
        ext = p.suffix.lower()
        ctype = _MIME_BY_EXT.get(ext, "application/octet-stream")
        out.append((p.name, p.read_bytes(), ctype))
    return out


def _resolve_output_path(output_path, tag):
    if output_path:
        p = Path(output_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    default_dir = Path("/home/openhands/.openclaw/workspace")
    return default_dir / f"nano_banana_{tag}_{uuid.uuid4().hex[:8]}.jpg"


# ═══════════════════════════════════════════════════════════════════════════
# CLI smoke test
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="lib_nano_banana smoke test")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--ref", action="append", help="reference image path (repeatable)")
    ap.add_argument("--aspect", default="16:9")
    ap.add_argument("--out", required=True)
    ap.add_argument("--method", choices=["sync", "async"], default="sync")
    args = ap.parse_args()

    res = generate(
        prompt=args.prompt,
        reference_paths=args.ref,
        aspect_ratio=args.aspect,
        output_path=args.out,
        method=args.method,
    )
    print(json.dumps(res, indent=2))
