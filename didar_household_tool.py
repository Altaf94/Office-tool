#!/usr/bin/env python3
"""
Local utility: Didar event registrations by household + approve.

React web UI (`web/`): Vite dev server opens http://127.0.0.1:8765 — the browser calls the registration
API directly (same URLs as the portal). Tokens are in sessionStorage. Set `VITE_API_BASE` in
`web/.env.local` if you need a non-production host (mirrors `DIDAR_API_BASE` for the CLI).

  POST https://api.registration-pakistan.com/login  (application/x-www-form-urlencoded: username, password)
  GET  .../event-registrations/?FamilyId=<HOUSEHOLD_ID>
  POST .../event-registrations/status  body: {"familyId", "familyMemberId", "status": "Approved"}

CLI: tokens in config.json (see config.example.json) or DIDAR_* env vars.

Run: ./run.sh                      → npm run dev in web/ (needs Node.js)
     python ... --cli             → terminal UI (needs requests only)
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("Install requests: pip install requests", file=sys.stderr)
    sys.exit(1)

TOOL_DIR = Path(__file__).resolve().parent
CONFIG_FILE = TOOL_DIR / "config.json"
LEGACY_SETTINGS = Path.home() / ".didar_household_tool.json"
DEFAULT_API_BASE = "https://api.registration-pakistan.com".rstrip("/")
# Approve: POST JSON must match upstream exactly — keys camelCase only.
EVENT_REGISTRATIONS_STATUS_PATH = "/event-registrations/status"


def api_base_url() -> str:
    """Production API; set DIDAR_API_BASE only for local/staging testing."""
    return ((os.environ.get("DIDAR_API_BASE") or "").strip().rstrip("/") or DEFAULT_API_BASE)


def _read_json_file(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def load_merged_config() -> dict[str, str]:
    """api_base is fixed (see api_base_url). Tokens: env, then config.json, then legacy file."""
    file_cfg = _read_json_file(CONFIG_FILE)
    legacy = _read_json_file(LEGACY_SETTINGS)

    access_token = (
        (os.environ.get("DIDAR_ACCESS_TOKEN") or "").strip()
        or str(file_cfg.get("access_token") or "").strip()
        or str(legacy.get("access_token") or "").strip()
    )

    refresh_token = (
        (os.environ.get("DIDAR_REFRESH_TOKEN") or "").strip()
        or str(file_cfg.get("refresh_token") or "").strip()
        or str(legacy.get("refresh_token") or "").strip()
    )

    return {
        "api_base": api_base_url(),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


def persist_refreshed_token(new_access: str) -> None:
    """Write updated access_token into config.json if that file exists; else legacy home file."""
    if os.environ.get("DIDAR_ACCESS_TOKEN"):
        return
    if CONFIG_FILE.is_file():
        data = _read_json_file(CONFIG_FILE)
        data["access_token"] = new_access
        CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        try:
            CONFIG_FILE.chmod(0o600)
        except OSError:
            pass
        return
    if LEGACY_SETTINGS.is_file():
        data = _read_json_file(LEGACY_SETTINGS)
        data["access_token"] = new_access
        LEGACY_SETTINGS.write_text(json.dumps(data, indent=2), encoding="utf-8")
        try:
            LEGACY_SETTINGS.chmod(0o600)
        except OSError:
            pass


class DidarClient:
    """HTTP client for event-registrations (same contract as portal Didar Intent Inquiry)."""

    def __init__(
        self,
        api_base: str,
        access_token: str,
        refresh_token: str = "",
    ) -> None:
        self.api_base = (api_base or DEFAULT_API_BASE).strip().rstrip("/")
        self.access_token = access_token.strip()
        self.refresh_token = (refresh_token or "").strip()
        self._token_at_start = self.access_token

    def _auth_headers(self) -> dict[str, str]:
        if not self.access_token:
            return {"Accept": "application/json"}
        return {"Authorization": f"Bearer {self.access_token}", "Accept": "application/json"}

    def try_refresh(self) -> bool:
        if not self.refresh_token:
            return False
        try:
            r = requests.post(
                f"{self.api_base}/refresh",
                json={"refresh_token": self.refresh_token},
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=30,
            )
            if not r.ok:
                return False
            data = r.json()
            at = data.get("access_token")
            if not at:
                return False
            self.access_token = at
            return True
        except requests.RequestException:
            return False

    def request(
        self,
        method: str,
        url: str,
        *,
        json_body: Any | None = None,
        retry_on_401: bool = True,
    ) -> requests.Response:
        headers = {**self._auth_headers(), "Content-Type": "application/json"}
        kw: dict[str, Any] = {"timeout": 60, "headers": headers}
        if json_body is not None:
            kw["json"] = json_body
        r = requests.request(method, url, **kw)
        if r.status_code == 401 and retry_on_401 and self.try_refresh():
            headers = {**self._auth_headers(), "Content-Type": "application/json"}
            kw["headers"] = headers
            r = requests.request(method, url, **kw)
        return r

    def fetch_registrations(self, family_id: str) -> tuple[int, Any]:
        """GET /event-registrations/?FamilyId=... → JSON list (e.g. GL9999-85439037)."""
        if not self.access_token:
            return 400, {"error": "Missing access token in config (see config.example.json)."}
        q = urllib.parse.urlencode({"FamilyId": family_id.strip()})
        url = f"{self.api_base}/event-registrations/?{q}"
        try:
            r = self.request("GET", url)
        except requests.RequestException as e:
            return 502, {"error": str(e)}
        try:
            body = r.json() if r.text else []
        except json.JSONDecodeError:
            return r.status_code, {"error": "Response was not JSON", "raw": r.text[:500]}
        if not r.ok:
            return r.status_code, {"error": body if isinstance(body, dict) else r.text[:500]}
        if not isinstance(body, list):
            return 500, {"error": "Expected a list from API"}
        if self.access_token != self._token_at_start:
            persist_refreshed_token(self.access_token)
        return 200, body

    def post_event_registration_status(self, payload: dict[str, Any]) -> tuple[int, Any]:
        """POST .../event-registrations/status with **only** the upstream JSON shape, e.g.:
        {\"familyId\": \"CE9999-02033123\", \"familyMemberId\": 617143, \"status\": \"Approved\"}
        """
        if not self.access_token:
            return 400, {"error": "Missing access token in config."}
        need = frozenset({"familyId", "familyMemberId", "status"})
        if frozenset(payload.keys()) != need:
            return 400, {
                "error": f"Payload must contain exactly keys {sorted(need)} — same as registration API."
            }
        outbound = {
            "familyId": str(payload["familyId"]).strip(),
            "familyMemberId": int(payload["familyMemberId"]),
            "status": str(payload["status"]).strip(),
        }
        url = f"{self.api_base.rstrip('/')}{EVENT_REGISTRATIONS_STATUS_PATH}"
        try:
            r = self.request("POST", url, json_body=outbound)
        except requests.RequestException as e:
            return 502, {"error": str(e)}
        try:
            body = r.json() if r.text else {}
        except json.JSONDecodeError:
            body = {"raw": r.text[:500]}
        if not r.ok:
            return r.status_code, {"error": body}
        if self.access_token != self._token_at_start:
            persist_refreshed_token(self.access_token)
        return 200, body


def make_client() -> DidarClient:
    cfg = load_merged_config()
    return DidarClient(cfg["api_base"], cfg["access_token"], cfg["refresh_token"])


def run_cli() -> None:
    cfg = load_merged_config()
    if not cfg["access_token"]:
        print(
            "No access token found.\n"
            f"  Copy config.example.json to {CONFIG_FILE.name} and set access_token,\n"
            "  or set DIDAR_ACCESS_TOKEN in the environment.",
            file=sys.stderr,
        )
        sys.exit(1)

    client = make_client()

    print("Household lookup (CLI). Ctrl+C to exit.\n")

    while True:
        hid = input("Household ID (Form ID), or q to quit: ").strip()
        if hid.lower() in ("q", "quit", "exit"):
            break
        if not hid:
            continue

        code, data = client.fetch_registrations(hid)
        if code != 200:
            print(f"Error ({code}):", data)
            continue

        rows = data
        if not rows:
            print("No registrations returned.")
            continue

        print(f"\n{'RegId':<8} {'MemberId':<10} {'Name':<26} {'CNIC':<18} {'Status'}")
        print("-" * 90)
        for row in rows:
            rid = row.get("Id") or row.get("id")
            mid = row.get("FamilyMemberId") or row.get("familyMemberId")
            name = (row.get("FullName") or "")[:24]
            cnic = row.get("CNIC") or ""
            stat = row.get("ApprovalStatus") or ""
            print(f"{str(rid):<8} {str(mid):<10} {name:<26} {str(cnic):<18} {stat}")

        raw = input("\nFamily member Id (FamilyMemberId) to approve (empty = skip): ").strip()
        if not raw:
            continue
        try:
            member_id = int(raw)
        except ValueError:
            print("Invalid family member id.")
            continue

        match = next(
            (row for row in rows if (row.get("FamilyMemberId") or row.get("familyMemberId")) == member_id),
            None,
        )
        if not match:
            print("No row with that FamilyMemberId.")
            continue

        stat = match.get("ApprovalStatus") or ""
        if str(stat).lower() == "approved":
            print("Already approved.")
            continue

        if input(f"Approve family member {member_id} for household {hid!r}? [y/N]: ").strip().lower() != "y":
            continue

        outbound = {"familyId": hid, "familyMemberId": member_id, "status": "Approved"}
        ac, res = client.post_event_registration_status(outbound)
        if ac == 200:
            print("Approved OK.")
        else:
            print(f"Approve failed ({ac}):", res)


def run_web() -> None:
    """Starts the React (Vite) dev server via npm."""
    npm = shutil.which("npm")
    web_dir = TOOL_DIR / "web"
    pkg = web_dir / "package.json"
    if not npm or not pkg.is_file():
        print(
            "Install Node.js (npm), then run from the project directory:\n"
            f"  cd {web_dir}\n"
            "  npm install\n"
            "  npm run dev\n",
            file=sys.stderr,
        )
        raise SystemExit(1)
    print("Didar household tool (React):", web_dir, flush=True)
    subprocess.run(["npm", "install"], cwd=web_dir, check=False)
    r = subprocess.run(["npm", "run", "dev"], cwd=web_dir)
    raise SystemExit(r.returncode)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--cli", action="store_true", help="Terminal UI (no browser)")
    args = p.parse_args()
    if args.cli:
        run_cli()
    else:
        run_web()


if __name__ == "__main__":
    main()
