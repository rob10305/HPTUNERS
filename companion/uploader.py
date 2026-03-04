"""
Sprint 7 — Upload tune data to /api/ingest and open browser.
VIN is always anonymised before sending.
"""

import copy
import webbrowser
from typing import Callable

import requests

TIMEOUT_SECONDS = 30


def anonymise_vin(data: dict) -> dict:
    """Return a deep copy with VIN replaced by X's."""
    d = copy.deepcopy(data)
    vehicle = d.get("vehicle")
    if isinstance(vehicle, dict) and vehicle.get("vin"):
        vehicle["vin"] = "XXXXXXXXXXXXXXXXX"
    return d


def upload_and_launch(
    tune_data: dict,
    web_app_url: str,
    on_progress: Callable[[float, str], None],
    auto_open: bool = True,
) -> tuple[bool, str]:
    """
    POST tune_data to /api/ingest. Opens the browser if successful.

    Returns (success: bool, message: str).
    """
    safe_data = anonymise_vin(tune_data)
    url = web_app_url.rstrip("/") + "/api/ingest"

    on_progress(65, "Connecting to AI Tune Advisor…")

    try:
        response = requests.post(
            url,
            json=safe_data,
            timeout=TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"},
        )
    except requests.exceptions.Timeout:
        return False, "Connection timed out. Check your internet connection."
    except requests.exceptions.ConnectionError:
        return False, (
            "Could not connect to AI Tune Advisor.\n"
            f"URL: {url}\n"
            "Check your internet connection or update the URL in Settings."
        )
    except Exception as exc:
        return False, f"Network error: {exc}"

    if not response.ok:
        try:
            body = response.json()
            detail = body.get("error") or body.get("message") or response.text[:200]
        except Exception:
            detail = response.text[:200]
        return False, f"Server error {response.status_code}: {detail}"

    on_progress(85, "Upload complete — opening analysis…")

    try:
        result = response.json()
    except Exception:
        return False, "Server returned invalid JSON."

    redirect_url = result.get("redirectUrl")
    if not redirect_url:
        return False, "Server did not return a redirect URL."

    if auto_open:
        try:
            webbrowser.open(redirect_url)
        except Exception:
            pass  # Non-critical — URL can be copied manually

    on_progress(100, f"✅  Done! Session: {result.get('sessionId', '')}")
    return True, redirect_url
