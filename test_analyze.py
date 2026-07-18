#!/usr/bin/env python3
"""Test analyze-scraped endpoint on live server."""
import httpx
import json

resp = httpx.post("http://89.167.82.205:8105/products/analyze-scraped", timeout=300.0)
print(f"Status: {resp.status_code}")
data = resp.json()
print(json.dumps(data, indent=2, ensure_ascii=False))
