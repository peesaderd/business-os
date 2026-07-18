#!/usr/bin/env python3
"""
SSH/SCP helper using libssh2 via ctypes (libssh2 v1.10).
No external dependencies.
"""

import ctypes
import ctypes.util
import os
import socket
import sys

_lib = ctypes.util.find_library('ssh2')
if not _lib:
    raise RuntimeError("libssh2 not found")

LIBSH2 = ctypes.CDLL(_lib)

# ── Set all return types first ────────────────────────────────────────

LIBSH2.libssh2_session_init_ex.restype = ctypes.c_void_p
LIBSH2.libssh2_session_set_blocking.restype = None  # void
LIBSH2.libssh2_session_handshake.restype = ctypes.c_int
LIBSH2.libssh2_userauth_password_ex.restype = ctypes.c_int
LIBSH2.libssh2_channel_open_ex.restype = ctypes.c_void_p
LIBSH2.libssh2_channel_process_startup.restype = ctypes.c_int
LIBSH2.libssh2_channel_read_ex.restype = ctypes.c_int
LIBSH2.libssh2_channel_write_ex.restype = ctypes.c_int
LIBSH2.libssh2_channel_send_eof.restype = ctypes.c_int
LIBSH2.libssh2_channel_wait_eof.restype = ctypes.c_int
LIBSH2.libssh2_channel_wait_closed.restype = ctypes.c_int
LIBSH2.libssh2_channel_close.restype = ctypes.c_int
LIBSH2.libssh2_channel_free.restype = ctypes.c_int
LIBSH2.libssh2_session_disconnect_ex.restype = ctypes.c_int
LIBSH2.libssh2_session_free.restype = ctypes.c_int
LIBSH2.libssh2_scp_send64.restype = ctypes.c_void_p
LIBSH2.libssh2_channel_get_exit_status.restype = ctypes.c_int

# ── Init libssh2 ──────────────────────────────────────────────────────

LIBSH2.libssh2_init(0)

EOF = -1
AGAIN = -37


class SSHClient:

    def __init__(self, host, port=22, username=None, password=None):
        self.host = host
        self.port = port
        self.username = username or ""
        self.password = password or ""
        self._sock = None
        self._session = None

    def connect(self):
        """TCP connect + SSH handshake + password auth."""
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.settimeout(15)
        self._sock.connect((self.host, self.port))

        self._session = LIBSH2.libssh2_session_init_ex(None, None, None, ctypes.c_void_p(0))
        if not self._session:
            raise RuntimeError("session_init_ex failed")

        # Blocking mode BEFORE handshake (critical!)
        LIBSH2.libssh2_session_set_blocking(self._session, 1)

        rc = LIBSH2.libssh2_session_handshake(self._session, self._sock.fileno())
        if rc != 0:
            raise RuntimeError(f"handshake failed: {rc}")

        u_b = self.username.encode() + b"\x00"
        p_b = self.password.encode() + b"\x00"
        rc = LIBSH2.libssh2_userauth_password_ex(
            self._session, u_b, len(u_b) - 1, p_b, len(p_b) - 1, None
        )
        if rc != 0:
            raise RuntimeError(f"password auth failed: {rc}")

        print(f"[SSH] ✅ {self.username}@{self.host}:{self.port}", flush=True)

    def exec(self, command, timeout=30):
        """Execute a command via SSH and return (stdout, stderr, exit_code)."""
        self._sock.settimeout(timeout)

        chan = LIBSH2.libssh2_channel_open_ex(
            self._session, b"session", 7, 262144, 32768, None, 0
        )
        if not chan:
            raise RuntimeError("channel_open_ex failed (NULL)")

        c_b = command.encode()
        rc = LIBSH2.libssh2_channel_process_startup(chan, b"exec", 4, c_b, len(c_b))
        if rc != 0:
            LIBSH2.libssh2_channel_free(chan)
            raise RuntimeError(f"process_startup(exec) failed: {rc}")

        # Read stdout (stream_id=0)
        stdout = b""
        buf = ctypes.create_string_buffer(8192)
        while True:
            rc = LIBSH2.libssh2_channel_read_ex(chan, 0, buf, 8192)
            if rc > 0:
                stdout += buf[:rc]
            elif rc <= 0:
                break

        # Read stderr (stream_id=1)
        stderr = b""
        LIBSH2.libssh2_channel_set_blocking(chan, 1)
        while True:
            rc = LIBSH2.libssh2_channel_read_ex(chan, 1, buf, 8192)
            if rc > 0:
                stderr += buf[:rc]
            elif rc <= 0:
                break

        exit_code = LIBSH2.libssh2_channel_get_exit_status(chan)

        LIBSH2.libssh2_channel_send_eof(chan)
        LIBSH2.libssh2_channel_wait_eof(chan)
        LIBSH2.libssh2_channel_close(chan)
        LIBSH2.libssh2_channel_free(chan)

        return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), exit_code

    def exec_ok(self, command, timeout=30):
        out, err, code = self.exec(command, timeout)
        if code != 0:
            raise RuntimeError(f"exit={code}: {command}\nStderr: {err[:500]}\nStdout: {out[:500]}")
        return out, err

    def close(self):
        if self._session:
            LIBSH2.libssh2_session_disconnect_ex(self._session, 0, b"done", b"done")
            LIBSH2.libssh2_session_free(self._session)
            self._session = None
        if self._sock:
            self._sock.close()
            self._sock = None

    # ── SCP ───────────────────────────────────────────────────────────

    def scp_upload(self, local_path, remote_path):
        with open(local_path, "rb") as f:
            data = f.read()
        self.scp_upload_bytes(data, remote_path)
        print(f"  ⬆️  {os.path.basename(local_path)} → {remote_path} ({len(data)} bytes)", flush=True)

    def scp_upload_bytes(self, data, remote_path, mode=0o644):
        self._sock.settimeout(120)
        r_b = remote_path.encode()
        chan = LIBSH2.libssh2_scp_send64(
            self._session, r_b, len(r_b), mode, ctypes.c_longlong(len(data)), 0, 0
        )
        if not chan:
            raise RuntimeError(f"scp_send64 failed for {remote_path}")

        written = 0
        buf = ctypes.create_string_buffer(len(data))
        buf.value = data
        while written < len(data):
            rc = LIBSH2.libssh2_channel_write_ex(
                chan, 0, ctypes.addressof(buf) + written, len(data) - written
            )
            if rc > 0:
                written += rc
            elif rc == AGAIN:
                continue
            else:
                raise RuntimeError(f"scp write failed at byte {written}: {rc}")

        LIBSH2.libssh2_channel_send_eof(chan)
        LIBSH2.libssh2_channel_wait_eof(chan)
        LIBSH2.libssh2_channel_close(chan)
        LIBSH2.libssh2_channel_free(chan)
        print(f"  ⬆️  {len(data)} bytes written via SCP", flush=True)
        # Fix permissions (SCP mode may not be honored correctly)
        self.exec(f"chmod 644 '{remote_path}'", timeout=5)

    def upload_dir(self, local_dir, remote_base, exclude={"node_modules", ".git", "__pycache__", ".gitignore"}):
        local_dir = os.path.normpath(local_dir)
        for root, dirs, files in os.walk(local_dir):
            dirs[:] = [d for d in dirs if d not in exclude]
            rel = os.path.relpath(root, local_dir)
            target = os.path.join(remote_base, rel).replace("\\", "/") if rel != "." else remote_base
            self.exec_ok(f"mkdir -p '{target}'")
            for fname in files:
                if fname in exclude or fname.endswith(".pyc") or fname == "package-lock.json":
                    continue
                self.scp_upload(os.path.join(root, fname), os.path.join(target, fname).replace("\\", "/"))


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: ssh_helper.py <host> <user> <pass> <exec|upload> [cmd|local_path remote_path]")
        sys.exit(1)

    host, user, pw = sys.argv[1], sys.argv[2], sys.argv[3]
    action = sys.argv[4]

    cli = SSHClient(host, 22, user, pw)
    cli.connect()

    try:
        if action == "exec":
            cmd = " ".join(sys.argv[5:])
            out, err, code = cli.exec(cmd)
            print(out, end="")
            if err:
                print(f"[STDERR] {err}", file=sys.stderr, end="")
            sys.exit(code)
        elif action == "upload":
            local_path = sys.argv[5] if len(sys.argv) > 5 else "."
            remote_path = sys.argv[6] if len(sys.argv) > 6 else "~"
            if os.path.isfile(local_path):
                cli.scp_upload(local_path, remote_path)
            elif os.path.isdir(local_path):
                cli.upload_dir(local_path, remote_path)
            else:
                print(f"Not found: {local_path}")
                sys.exit(1)
    finally:
        cli.close()
