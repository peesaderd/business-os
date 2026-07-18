#!/usr/bin/env python3
"""Upload a local file to a remote server via SSH+base64, with correct permissions."""
import base64
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssh_helper import SSHClient

if len(sys.argv) != 6:
    print("Usage: upload_b64.py <host> <user> <pass> <local_path> <remote_path>")
    sys.exit(1)

host, user, pw, local_path, remote_path = sys.argv[1:6]

with open(local_path, 'rb') as f:
    data = f.read()

b64 = base64.b64encode(data).decode()
print(f"[Upload] {local_path} → {remote_path} ({len(data)} bytes, b64={len(b64)} chars)", flush=True)

cli = SSHClient(host, 22, user, pw)
cli.connect()
try:
    # Write via SSH heredoc-style using echo + base64
    # Break into chunks to avoid shell arg limits
    chunk_size = 64000  # Stay well under ARG_MAX ~2MB
    parts = [b64[i:i+chunk_size] for i in range(0, len(b64), chunk_size)]
    
    # Start fresh file
    cli.exec_ok("rm -f /tmp/upb64.tmp")
    
    for i, chunk in enumerate(parts):
        # Use a quoted heredoc to preserve the data exactly
        cmd = f"printf '%s' '{chunk}' >> /tmp/upb64.tmp"
        cli.exec_ok(cmd)
        print(f"  chunk {i+1}/{len(parts)} ({len(chunk)} chars)", flush=True)
    
    # Decode and move
    cli.exec_ok(f"base64 -d < /tmp/upb64.tmp > '{remote_path}' && chmod 644 '{remote_path}' && rm /tmp/upb64.tmp")
    
    out, _, _ = cli.exec(f"wc -c '{remote_path}'")
    print(f"  ✅ Remote file: {out.strip()}", flush=True)
finally:
    cli.close()
