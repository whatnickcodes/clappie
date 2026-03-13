# Sensibo Troubleshooting Guide

## API Issues

### 401 Unauthorized

**Cause**: Invalid or expired API key.

**Fix**:
1. Verify your API key at <https://home.sensibo.com/me/api>
2. Generate a new key if needed
3. Ensure `SENSIBO_API_KEY` env var has no trailing whitespace:
   ```bash
   echo "'$SENSIBO_API_KEY'"  # Check for spaces
   ```

### 403 Forbidden

**Cause**: API key lacks permissions for the requested operation.

**Fix**: Generate a new API key with full access at the Sensibo dashboard.

### 404 Not Found

**Cause**: Invalid device ID.

**Fix**:
1. List all devices: `python3 scripts/fetch_device_state.py`
2. Device IDs are 8-character alphanumeric strings (e.g., `aBcD1234`)
3. Device IDs are case-sensitive

### 429 Rate Limited

**Cause**: Too many API requests in a short period.

**Fix**:
- Space requests at least 1 second apart
- Reduce polling frequency
- If using with HA, the integration already polls every 60s

### Connection Timeout

**Cause**: Network issue or Sensibo cloud outage.

**Fix**:
1. Check internet connectivity
2. Check Sensibo service status (try the Sensibo app)
3. Retry after a delay
4. If persistent, check DNS resolution for `home.sensibo.com`

## Home Assistant Integration Issues

### Entities Show "Unavailable"

**Possible causes**:
1. **API key invalid**: Re-configure the integration with a valid key
2. **Sensibo cloud outage**: Check Sensibo app; wait for service to recover
3. **Device offline**: Check device WiFi connection (see below)
4. **HA network issue**: Verify HA can reach `home.sensibo.com`

**Diagnostic**:
```yaml
# Check entity state in Developer Tools > States
# Look for: sensor.bedroom_temperature -> unavailable
```

### Changes Not Reflecting in HA

**Cause**: 60-second polling interval.

**Fix**:
- Wait up to 60 seconds for changes made via the Sensibo app or API to appear in HA
- To force an update, reload the integration: Settings > Integrations > Sensibo > Reload
- For real-time needs, consider using the Sensibo API directly via `rest_command`

### Climate React Entities Missing

**Cause**: Device may not support Climate React, or integration version may be outdated.

**Fix**:
1. Verify Climate React is available in the Sensibo app for your device
2. Update Home Assistant to the latest version
3. Remove and re-add the Sensibo integration

### HA Automation Not Triggering

**Check these in order**:

1. **Automation enabled?**: Check the automation toggle in HA UI
2. **Sensor entity valid?**: Verify the sensor entity exists and has a numeric state
3. **Threshold correct?**: `above:` and `below:` values are exclusive (not >=, <=)
4. **`for:` duration not met?**: The condition must be sustained for the entire duration
5. **`mode: single` blocking?**: If the automation is already running, new triggers are ignored
6. **Check automation trace**: Settings > Automations > (automation) > Traces

### HA Automation Triggers Too Often

**Cause**: Sensor fluctuation near threshold.

**Fix**:
1. Increase `for:` duration (e.g., from 5 to 10 minutes)
2. Widen the dead zone between high and low thresholds
3. Add a rate-limiting condition (see `climate_react_replication.md`)
4. Use `mode: single` to prevent concurrent runs

## Device Connectivity Issues

### Device Offline / Not Responding

**Symptoms**: LED blinking, no response in app, HA entities unavailable.

**Fix**:
1. **Power cycle**: Unplug the Sensibo device for 10 seconds, plug back in
2. **Check WiFi**: Ensure the WiFi network is up and the device is in range
3. **Router check**: Verify the device's IP lease hasn't expired; check router's DHCP client list
4. **WiFi band**: Sensibo devices use 2.4 GHz only; ensure your router broadcasts 2.4 GHz
5. **WiFi interference**: Move the device away from other electronics if signal is weak

### Device Connects but AC Doesn't Respond

**Cause**: IR signal not reaching the AC unit.

**Fix**:
1. Ensure clear line-of-sight between Sensibo and AC's IR receiver
2. Try repositioning the Sensibo device
3. Verify the correct AC remote profile is selected in the Sensibo app
4. Test with the Sensibo app first before using the API

### Incorrect Sensor Readings

**Symptoms**: Temperature/humidity readings significantly different from actual room conditions.

**Causes and fixes**:
1. **Mounting location**: Don't mount directly on the AC unit or in direct sunlight
2. **AC airflow**: The sensor reads AC output air if mounted on the unit. Mount it away from the AC for room temperature.
3. **Calibration**: Sensibo sensors have ~1C accuracy. Compare with a reference thermometer.
4. **Sensor warm-up**: After power cycling, readings may take a few minutes to stabilize.

## Rapid Toggling / AC Cycling

### Symptoms

AC turns on and off repeatedly (every few minutes).

### Causes

1. **Both Climate React AND HA automation active**: They fight each other
2. **Thresholds too close together**: e.g., cool above 24, heat below 23
3. **No hysteresis / `for:` duration**: Automation triggers on every tiny fluctuation
4. **Sensor near threshold**: Normal sensor noise causes constant threshold crossing

### Resolution

1. **Disable one controller**: Either disable native Climate React OR remove the HA automation. Never run both.
2. **Widen dead zone**: Set thresholds at least 2-4 degrees apart
3. **Add `for:` duration**: Require 5+ minutes of sustained threshold crossing
4. **Add rate limiting**: Prevent re-triggering within 10 minutes of last trigger
5. **Check sensor placement**: Ensure sensor reads actual room temperature, not AC output

## WiFi / Cloud Connectivity

### Sensibo Cloud Down

**Impact**: HA integration stops working, API calls fail. Device continues to run its last state.

**What to do**:
- Climate React (native) continues to work even without cloud -- it runs on-device
- HA automations that use Sensibo sensors stop receiving updates
- Wait for Sensibo to restore service
- Consider using local temperature sensors as fallback triggers

### Intermittent Connectivity

**Symptoms**: Device goes online/offline repeatedly in the Sensibo app.

**Fix**:
1. Check WiFi signal strength (RSSI) via the API: `measurements.rssi`
   - Good: > -50 dBm
   - Acceptable: -50 to -70 dBm
   - Poor: < -70 dBm
2. Move the device closer to the WiFi access point or add a repeater
3. Check for WiFi channel congestion on 2.4 GHz
4. Ensure router firmware is up to date

## Common Configuration Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Running Climate React + HA automation simultaneously | Rapid toggling, conflicting commands | Disable one |
| Using `fan_only` in Sensibo API calls | 400 error | Use `fan` for the API, `fan_only` for HA |
| Hardcoding API key in scripts | Security risk | Use `SENSIBO_API_KEY` env var |
| Setting `for: 0` in triggers | Triggers on every sensor update | Use at least `for: minutes: 1` |
| Wrong device ID (case-sensitive) | 404 errors | Copy ID from `fetch_device_state.py` output |
| Using Fahrenheit thresholds with Celsius setting | Unexpected behavior | Match units to your Sensibo account setting |
