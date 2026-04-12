#!/usr/bin/env python3
"""
Build short hover-preview MP3s in ../genre-clips/ from YouTube using yt-dlp.

Requires: yt-dlp (https://github.com/yt-dlp/yt-dlp) and ffmpeg on PATH.
Some systems install the binary as ``yt-dlp``; if you use another name, set
the YT_DLP environment variable to the full command (e.g. ``export YT_DLP=ytdl``).

Usage:
  cp genre-clips/sources.example.json genre-clips/sources.json
  # Edit sources.json: per clipSlug, set ``url`` (YouTube watch URL) and optional
  # ``section`` as \"MM:SS-MM:SS\" (default 0:00-0:18).

  python3 scripts/fetch-genre-clips.py

Only entries with a non-empty \"url\" are downloaded. Respect copyright and
YouTube’s terms when choosing sources.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "genre-clips"
MANIFEST = OUT_DIR / "sources.json"
DEFAULT_SECTION = "0:00-0:18"


def resolve_ytdlp() -> str:
    env = os.environ.get("YT_DLP", "").strip()
    if env:
        return env
    for name in ("yt-dlp", "ytdl"):
        p = shutil.which(name)
        if p:
            return p
    print(
        "Could not find yt-dlp (or ytdl). Install yt-dlp and ffmpeg, or set YT_DLP.",
        file=sys.stderr,
    )
    sys.exit(1)


def main() -> None:
    if not MANIFEST.is_file():
        ex = OUT_DIR / "sources.example.json"
        print(
            f"Missing {MANIFEST.relative_to(ROOT)}. Copy {ex.name} and add YouTube URLs.",
            file=sys.stderr,
        )
        sys.exit(1)

    raw = json.loads(MANIFEST.read_text(encoding="utf-8"))
    ytdlp = resolve_ytdlp()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for slug, cfg in sorted(raw.items()):
        if slug.startswith("_") or not isinstance(cfg, dict):
            continue
        url = (cfg.get("url") or "").strip()
        if not url:
            continue
        section = (cfg.get("section") or DEFAULT_SECTION).strip()
        outtmpl = str(OUT_DIR / f"{slug}.%(ext)s")
        # yt-dlp: --download-sections "*START-END" (see yt-dlp readme)
        cmd = [
            ytdlp,
            "-x",
            "--audio-format",
            "mp3",
            "--download-sections",
            f"*{section}",
            "--force-overwrites",
            "--no-playlist",
            "-o",
            outtmpl,
            url,
        ]
        print(f"[{slug}] {' '.join(cmd)}", flush=True)
        subprocess.run(cmd, check=True, cwd=str(ROOT))


if __name__ == "__main__":
    main()
