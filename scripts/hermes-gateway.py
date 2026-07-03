#!/usr/bin/env python3
"""
Start Hermes gateway with a workaround for the plugins/cron package shadowing bug.

Hermes 0.17.0 on Windows can crash with:
  ModuleNotFoundError: No module named 'cron.scheduler_provider'

Pre-importing the real cron modules before gateway loads plugins/ fixes sys.modules
ordering. See: https://github.com/NousResearch/hermes-agent/issues/50872
"""
from __future__ import annotations

import subprocess
import sys


def main() -> int:
    # Cache the real cron package before gateway inserts plugins/ on sys.path.
    import cron.scheduler_provider  # noqa: F401
    import cron.scheduler  # noqa: F401

    args = ["gateway", "run", "--replace", *sys.argv[1:]]
    return subprocess.call([sys.executable, "-m", "hermes_cli.main", *args])


if __name__ == "__main__":
    raise SystemExit(main())
