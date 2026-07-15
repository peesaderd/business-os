#!/usr/bin/env python3
"""Test Prodia async API with audio support (price probe only)."""
import os
import sys
import json
import struct
import wave
import io

# Add erp-stack to path
sys.path.insert(0, "/home/openhands/erp-stack")

from prodia_client import ProdiaV2Client, ProdiaValidationError, ProdiaV2Error

# ── Create minimal test WAV ──
def make_silent_wav(duration_sec=1, sample_rate=24000):
    """Create a silent WAV in memory."""
    buf = io.BytesIO()
    n_samples = int(sample_rate * duration_sec)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * n_samples)
    return buf.getvalue()

# ── Create minimal test PNG (1x1 gray pixel, 9:16 ratio) ──
def make_minimal_png():
    """Create a minimal valid PNG (1x1 pixel, gray)."""
    import zlib
    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'
    # IHDR chunk (1x1, 8-bit grayscale)
    ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 0, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc & 0xffffffff)
    # IDAT chunk (1 pixel black)
    raw = zlib.compress(b'\x00\x80\x00\x00')  # filter byte + pixel
    idat_crc = zlib.crc32(b'IDAT' + raw)
    idat = struct.pack('>I', len(raw)) + b'IDAT' + raw + struct.pack('>I', idat_crc & 0xffffffff)
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND')
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc & 0xffffffff)
    return sig + ihdr + idat + iend

# ── Test ──
token = os.environ.get("PRODIA_TOKEN", "")
# Also try from shared_config
try:
    from shared_config import PRODIA_TOKEN as get_token
    token = get_token()
except:
    pass

if not token:
    print("❌ No PRODIA_TOKEN found")
    sys.exit(1)

print(f"✅ Token found: {token[:8]}...{token[-4:]}")

client = ProdiaV2Client(token)

# Test 1: img2vid WITHOUT audio (should succeed)
print("\n─── Test 1: img2vid without audio ───")
try:
    config_1 = {
        "prompt": "product showcase, smooth motion, modern lifestyle",
        "duration": 8,
        "resolution": "720P",
        "negative_prompt": "low resolution, error, worst quality",
    }
    job_id = client.create_job(
        "inference.wan2-7.img2vid.v1",
        config_1,
        inputs=[make_minimal_png()],
        accept="video/mp4",
    )
    print(f"✅ Job created: {job_id}")
except (ProdiaValidationError, ProdiaV2Error) as e:
    print(f"❌ {e}")

# Test 2: img2vid WITH audio (the original failing case)
print("\n─── Test 2: img2vid WITH audio ───")
try:
    config_2 = {
        "prompt": "product showcase, smooth motion, modern lifestyle",
        "duration": 8,
        "resolution": "720P",
        "negative_prompt": "low resolution, error, worst quality",
    }
    audio_data = make_silent_wav()
    print(f"  Audio: {len(audio_data)} bytes WAV")
    job_id_2 = client.create_job(
        "inference.wan2-7.img2vid.v1",
        config_2,
        inputs=[make_minimal_png()],
        accept="video/mp4",
        audio=audio_data,
    )
    print(f"✅ Job created with audio: {job_id_2}")
except (ProdiaValidationError, ProdiaV2Error) as e:
    print(f"❌ {e}")
except Exception as e:
    print(f"❌ Unexpected: {e}")

print("\n✅ Tests complete (jobs NOT polled — no cost incurred)")
