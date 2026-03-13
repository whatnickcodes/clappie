# Sensibo API v2 Reference

## Authentication

- **API Key**: Obtain at <https://home.sensibo.com/me/api>
- **Method**: Query parameter `apiKey` on every request
- **Base URL**: `https://home.sensibo.com/api/v2`

```
GET /api/v2/users/me/pods?apiKey=YOUR_KEY
```

## Rate Limits

- No officially published numeric rate limit, but the API will return `429 Too Many Requests` if abused.
- Using `Accept-Encoding: gzip` header increases your available rate limit.
- Recommended: max 1 request per second, burst of 10.
- The HA integration polls every 60 seconds.
- Sensibo devices report sensor data to the cloud every ~90 seconds.

## Common Response Format

All responses follow this structure:

```json
{
  "status": "success",
  "result": { ... }
}
```

On error:

```json
{
  "status": "error",
  "reason": "Description of what went wrong"
}
```

## Error Codes

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| 200 | Success | - |
| 400 | Bad request / invalid parameters | Check request body/params |
| 401 | Invalid or missing API key | Verify API key |
| 403 | Forbidden (key lacks permission) | Generate new key with correct scope |
| 404 | Device/resource not found | Verify device ID |
| 429 | Rate limited | Back off and retry after delay |
| 500 | Server error | Retry after delay |

## Endpoints

### List All Devices

```
GET /users/me/pods?fields=*
```

**Query Parameters:**
- `fields` (optional): Comma-separated list of fields to return, or `*` for all.
  Common fields: `id`, `room`, `acState`, `measurements`, `connectionStatus`, `smartMode`

**Response** (`result` is an array):
```json
[
  {
    "id": "abcd1234",
    "room": {
      "name": "Bedroom",
      "icon": "bedroom"
    },
    "acState": { ... },
    "measurements": { ... },
    "connectionStatus": { "isAlive": true, "lastSeen": { ... } },
    "smartMode": { ... },
    "productModel": "skyv2",
    "firmwareVersion": "SKY30059",
    "firmwareType": "esp8266ex",
    "temperatureUnit": "C",
    "features": ["showPlus", "timer", "smartMode", ...]
  }
]
```

### Get Single Device

```
GET /pods/{device_id}?fields=*
```

Same response as above, but `result` is a single object.

### Get AC State

```
GET /pods/{device_id}?fields=acState
```

**AC State Object:**
```json
{
  "acState": {
    "on": true,
    "mode": "cool",
    "targetTemperature": 24,
    "temperatureUnit": "C",
    "fanLevel": "auto",
    "swing": "stopped",
    "horizontalSwing": "stopped",
    "light": "on"
  }
}
```

**AC State Fields:**

| Field | Type | Values |
|-------|------|--------|
| `on` | bool | `true`, `false` |
| `mode` | string | `cool`, `heat`, `fan`, `dry`, `auto` |
| `targetTemperature` | int | Depends on AC model (typically 16-30 C) |
| `temperatureUnit` | string | `C` or `F` |
| `fanLevel` | string | `quiet`, `low`, `medium`, `medium_high`, `high`, `strong`, `auto` |
| `swing` | string | `stopped`, `fixedTop`, `fixedMiddleTop`, `fixedMiddle`, `fixedMiddleBottom`, `fixedBottom`, `rangeFull` |
| `horizontalSwing` | string | Same pattern as `swing` |
| `light` | string | `on`, `off` (not all models) |

### Set Full AC State

```
POST /pods/{device_id}/acStates
Content-Type: application/json

{
  "acState": {
    "on": true,
    "mode": "cool",
    "targetTemperature": 24,
    "temperatureUnit": "C",
    "fanLevel": "auto",
    "swing": "stopped"
  }
}
```

### Set Single AC Property

```
PATCH /pods/{device_id}/acStates/{property}
Content-Type: application/json

{
  "newValue": 22
}
```

Where `{property}` is one of: `on`, `mode`, `targetTemperature`, `fanLevel`, `swing`, `horizontalSwing`, `light`.

### Get Current Measurements

```
GET /pods/{device_id}?fields=measurements
```

**Response:**
```json
{
  "measurements": {
    "temperature": 25.3,
    "humidity": 48.2,
    "feelsLike": 25.1,
    "rssi": -55,
    "time": {
      "time": "2025-01-15T10:30:00Z",
      "secondsAgo": 45
    }
  }
}
```

### Get Historical Measurements

```
GET /pods/{device_id}/historicalMeasurements?days=1
```

**Query Parameters:**
- `days` (optional): Number of days, max 7. Default 1.

**Response:**
```json
{
  "temperature": [
    { "time": "2025-01-15T10:00:00Z", "value": 24.5 },
    { "time": "2025-01-15T10:05:00Z", "value": 24.6 }
  ],
  "humidity": [
    { "time": "2025-01-15T10:00:00Z", "value": 48.0 },
    { "time": "2025-01-15T10:05:00Z", "value": 47.8 }
  ]
}
```

Measurement intervals are approximately every 90 seconds.

## Climate React (Smart Mode) Endpoints

### Get Climate React Configuration

```
GET /pods/{device_id}?fields=smartMode
```

**Response:**
```json
{
  "smartMode": {
    "enabled": true,
    "type": "temperature",
    "lowTemperatureThreshold": 22.0,
    "highTemperatureThreshold": 26.0,
    "lowTemperatureState": {
      "on": true,
      "mode": "heat",
      "targetTemperature": 24,
      "temperatureUnit": "C",
      "fanLevel": "auto",
      "swing": "stopped"
    },
    "highTemperatureState": {
      "on": true,
      "mode": "cool",
      "targetTemperature": 24,
      "temperatureUnit": "C",
      "fanLevel": "auto",
      "swing": "stopped"
    },
    "deviceUid": "abcd1234"
  }
}
```

**Climate React Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | bool | Whether Climate React is active |
| `type` | string | `temperature`, `humidity`, or `feelsLike` |
| `lowTemperatureThreshold` | float | Below this value, apply `lowTemperatureState` |
| `highTemperatureThreshold` | float | Above this value, apply `highTemperatureState` |
| `lowTemperatureState` | object | AC state to apply when below low threshold |
| `highTemperatureState` | object | AC state to apply when above high threshold |
| `deviceUid` | string | Device ID this config belongs to |

**Notes:**
- Despite the field names containing "Temperature", the thresholds apply to whichever `type` is set (temperature, humidity, or feelsLike).
- The `lowTemperatureState` and `highTemperatureState` are full AC state objects (same schema as `acState`).
- When the sensor value is between the two thresholds, Climate React takes no action (dead zone).
- Setting `on: false` in a state object means "turn off the AC" at that threshold.

### Set Full Climate React Configuration

```
POST /pods/{device_id}/smartmode
Content-Type: application/json

{
  "enabled": true,
  "type": "temperature",
  "lowTemperatureThreshold": 22.0,
  "highTemperatureThreshold": 26.0,
  "lowTemperatureState": { ... },
  "highTemperatureState": { ... },
  "deviceUid": "abcd1234"
}
```

### Enable/Disable Climate React

```
PUT /pods/{device_id}/smartmode
Content-Type: application/json

{
  "enabled": false
}
```

**Note**: The endpoint path is `/smartmode` (lowercase, no hyphen). Use `POST` to set the full configuration, `PUT` to enable/disable.

## Timer Endpoints

### Get Timer

```
GET /pods/{device_id}/timer
```

### Set Timer

```
PUT /pods/{device_id}/timer
Content-Type: application/json

{
  "minutesFromNow": 60,
  "acState": {
    "on": false
  }
}
```

### Delete Timer

```
DELETE /pods/{device_id}/timer
```

## Schedule Endpoints

### List Schedules

```
GET /pods/{device_id}/schedules/
```

### Create Schedule

```
POST /pods/{device_id}/schedules/
Content-Type: application/json

{
  "targetTimeLocal": "22:15",
  "timezone": "Europe/Rome",
  "recurOnDaysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "isEnabled": true,
  "acState": {
    "on": true,
    "mode": "cool",
    "targetTemperature": 24,
    "fanLevel": "auto"
  }
}
```

### Enable/Disable Schedule

```
PUT /pods/{device_id}/schedules/{schedule_id}/
Content-Type: application/json

{
  "isEnabled": false
}
```

### Delete Schedule

```
DELETE /pods/{device_id}/schedules/{schedule_id}/
```

## Device Fields Reference

When using the `fields` parameter, these are the available top-level fields:

| Field | Description |
|-------|-------------|
| `id` | 8-character device UID |
| `room` | Room name and icon |
| `acState` | Current AC state |
| `measurements` | Latest sensor readings |
| `connectionStatus` | WiFi/cloud connectivity |
| `smartMode` | Climate React configuration |
| `productModel` | Hardware model (e.g., `skyv2`) |
| `firmwareVersion` | Current firmware version |
| `firmwareType` | Firmware platform |
| `temperatureUnit` | Account temperature unit preference |
| `features` | List of supported features |
| `remoteCapabilities` | What the paired AC remote supports (valid modes, fan levels, swing states, temp ranges) |
| `timer` | Active timer, if any |
| `schedules` | Configured schedules |
| `tags` | Device tags |

**Important**: Always check `remoteCapabilities` to discover what modes, fan levels, swing positions, and temperature ranges are valid for a specific device before sending AC state commands.
