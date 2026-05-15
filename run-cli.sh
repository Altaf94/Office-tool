#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rm -rf __pycache__
if [[ ! -d .venv ]]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r requirements.txt
exec .venv/bin/python didar_household_tool.py --cli
