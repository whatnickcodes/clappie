#!/usr/bin/env python3
"""Reusable Python client for the Sensibo API v2."""

import os
import sys
import time
from urllib.parse import urlencode

import requests

API_BASE = "https://home.sensibo.com/api/v2"
DEFAULT_TIMEOUT = 15


class SensiboAPIError(Exception):
    """Raised when the Sensibo API returns an error."""

    def __init__(self, status_code, message, response=None):
        self.status_code = status_code
        self.message = message
        self.response = response
        super().__init__(f"HTTP {status_code}: {message}")


class SensiboClient:
    """Client for Sensibo REST API v2.

    Authentication is via API key passed as a query parameter.
    Get your key at https://home.sensibo.com/me/api
    """

    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("SENSIBO_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key required. Set SENSIBO_API_KEY env var or pass api_key."
            )
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def _request(self, method, path, params=None, json_body=None):
        """Make an authenticated API request."""
        url = f"{API_BASE}{path}"
        params = params or {}
        params["apiKey"] = self.api_key

        try:
            resp = self.session.request(
                method, url, params=params, json=json_body, timeout=DEFAULT_TIMEOUT
            )
        except requests.ConnectionError:
            raise SensiboAPIError(0, "Connection failed. Check network connectivity.")
        except requests.Timeout:
            raise SensiboAPIError(0, f"Request timed out after {DEFAULT_TIMEOUT}s.")

        if resp.status_code == 401:
            raise SensiboAPIError(401, "Invalid API key.", resp)
        if resp.status_code == 403:
            raise SensiboAPIError(403, "Forbidden. Check API key permissions.", resp)
        if resp.status_code == 404:
            raise SensiboAPIError(404, f"Resource not found: {path}", resp)
        if resp.status_code == 429:
            raise SensiboAPIError(429, "Rate limited. Wait before retrying.", resp)
        if resp.status_code >= 400:
            msg = resp.text[:200] if resp.text else f"HTTP {resp.status_code}"
            raise SensiboAPIError(resp.status_code, msg, resp)

        data = resp.json()
        if data.get("status") == "error":
            raise SensiboAPIError(
                resp.status_code,
                data.get("reason", "Unknown API error"),
                resp,
            )
        return data.get("result", data)

    # ── Device endpoints ──────────────────────────────────────────

    def get_devices(self, fields="*"):
        """List all devices on the account.

        Args:
            fields: Comma-separated field list or '*' for all.
        """
        return self._request("GET", "/users/me/pods", params={"fields": fields})

    def get_device(self, device_id, fields="*"):
        """Get a single device by ID.

        Args:
            device_id: 8-character device UID (e.g. 'abcd1234').
            fields: Comma-separated field list or '*' for all.
        """
        return self._request(
            "GET", f"/pods/{device_id}", params={"fields": fields}
        )

    # ── AC state endpoints ────────────────────────────────────────

    def get_ac_state(self, device_id):
        """Get the current AC state (mode, targetTemperature, on, fanLevel, swing, etc.)."""
        result = self._request(
            "GET",
            f"/pods/{device_id}",
            params={"fields": "acState"},
        )
        return result.get("acState", result)

    def set_ac_state(self, device_id, ac_state):
        """Set the full AC state.

        Args:
            ac_state: Dict with keys like on, mode, targetTemperature,
                      fanLevel, swing, horizontalSwing, light.
        """
        return self._request(
            "POST",
            f"/pods/{device_id}/acStates",
            json_body={"acState": ac_state},
        )

    def set_ac_state_property(self, device_id, property_name, value):
        """Set a single AC state property (e.g. 'on', 'targetTemperature').

        Args:
            property_name: One of: on, mode, targetTemperature, fanLevel,
                          swing, horizontalSwing, light.
            value: The new value for the property.
        """
        return self._request(
            "PATCH",
            f"/pods/{device_id}/acStates/{property_name}",
            json_body={"newValue": value},
        )

    # ── Climate React (Smart Mode) endpoints ──────────────────────

    def get_climate_react(self, device_id):
        """Get the Climate React (smart mode) configuration."""
        result = self._request(
            "GET",
            f"/pods/{device_id}",
            params={"fields": "smartMode"},
        )
        return result.get("smartMode", result)

    def set_climate_react(self, device_id, smart_mode):
        """Set the full Climate React configuration.

        Args:
            smart_mode: Dict with keys:
                - enabled (bool)
                - type (str): 'temperature', 'humidity', or 'feelsLike'
                - lowTemperatureThreshold (float)
                - highTemperatureThreshold (float)
                - lowTemperatureState (dict): AC state when below low threshold
                - highTemperatureState (dict): AC state when above high threshold
                - deviceUid (str): device ID
        """
        return self._request(
            "POST",
            f"/pods/{device_id}/smartmode",
            json_body=smart_mode,
        )

    def enable_climate_react(self, device_id, enabled=True):
        """Enable or disable Climate React without changing its config."""
        return self._request(
            "PUT",
            f"/pods/{device_id}/smartmode",
            json_body={"enabled": enabled},
        )

    # ── Sensor / measurement endpoints ────────────────────────────

    def get_measurements(self, device_id):
        """Get current sensor measurements (temperature, humidity, etc.)."""
        result = self._request(
            "GET",
            f"/pods/{device_id}",
            params={"fields": "measurements"},
        )
        return result.get("measurements", result)

    def get_historical_measurements(self, device_id, days=1):
        """Get historical sensor measurements.

        Args:
            device_id: Device UID.
            days: Number of days of history (max 7).

        Returns:
            List of measurement dicts with 'time', 'temperature',
            'humidity', and optionally 'feelsLike'.
        """
        return self._request(
            "GET",
            f"/pods/{device_id}/historicalMeasurements",
            params={"days": min(days, 7)},
        )

    # ── Timer endpoints ───────────────────────────────────────────

    def get_timer(self, device_id):
        """Get the current timer configuration."""
        return self._request("GET", f"/pods/{device_id}/timer")

    def set_timer(self, device_id, minutes_from_now, ac_state):
        """Set a timer to change AC state after a delay.

        Args:
            minutes_from_now: Minutes until the state change.
            ac_state: The AC state to set when the timer fires.
        """
        return self._request(
            "PUT",
            f"/pods/{device_id}/timer",
            json_body={
                "minutesFromNow": minutes_from_now,
                "acState": ac_state,
            },
        )

    def delete_timer(self, device_id):
        """Delete (cancel) the current timer."""
        return self._request("DELETE", f"/pods/{device_id}/timer")


def get_client(api_key=None):
    """Convenience function to create a SensiboClient."""
    return SensiboClient(api_key=api_key)
